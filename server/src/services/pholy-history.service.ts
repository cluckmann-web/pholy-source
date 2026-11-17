import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { OnEvent } from 'src/decorators.js';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { mapNotification } from 'src/dtos/notification.dto.js';
import {
  PHOLY_HISTORY_RETENTION_DAYS,
  PholyHistoryAttemptDto,
  PholyHistorySearchDto,
} from 'src/dtos/pholy-history.dto.js';
import { AssetVisibility, ImmichWorker, JobName, JobStatus, NotificationLevel } from 'src/enum.js';
import { AssetRepository } from 'src/repositories/asset.repository.js';
import type { ArgOf } from 'src/repositories/event.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholyHistoryRepository } from 'src/repositories/pholy-history.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { WebsocketRepository } from 'src/repositories/websocket.repository.js';

const processingSteps = new Map<JobName, string>([
  [JobName.SidecarCheck, 'metadata'],
  [JobName.AssetExtractMetadata, 'metadata'],
  [JobName.StorageTemplateMigrationSingle, 'storage'],
  [JobName.AssetGenerateThumbnails, 'preview'],
  [JobName.AssetEncodeVideo, 'video'],
]);
export const pholyQuotaLevel = (usage: number, limit: number | null) => {
  if (limit === null) return 'normal' as const;
  if (limit <= 0 || usage >= limit) return 'full' as const;
  if (usage / limit >= 0.95) return 'critical' as const;
  return usage / limit >= 0.8 ? ('warning' as const) : ('normal' as const);
};

@Injectable()
export class PholyHistoryService {
  private cleanupInterval?: NodeJS.Timeout;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private history: PholyHistoryRepository,
    private users: UserRepository,
    private assets: AssetRepository,
    private websocket: WebsocketRepository,
    private logger: LoggingRepository,
  ) {
    this.logger.setContext(PholyHistoryService.name);
  }

  private owner(auth: AuthDto) {
    if (auth.sharedLink) throw new ForbiddenException('An account is required.');
    return auth.user.id;
  }

  private async bestEffort(work: () => Promise<unknown>) {
    try {
      await work();
    } catch {
      this.logger.warn('PHOLY upload history could not be updated; media was not changed.');
    }
  }

  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Api] })
  onBootstrap() {
    const clean = () => this.bestEffort(() => this.history.cleanup());
    this.cleanupInterval = setInterval(() => void clean(), 3_600_000);
    this.cleanupInterval.unref();
    void clean();
  }
  @OnEvent({ name: 'AppShutdown', workers: [ImmichWorker.Api] })
  onShutdown() {
    clearInterval(this.cleanupInterval);
  }

  @OnEvent({ name: 'AssetCreate', priority: 100 })
  async onAssetCreate({ asset, file }: ArgOf<'AssetCreate'>) {
    if (!file) return;
    await this.bestEffort(async () => {
      const stored = await this.assets.getById(asset.id);
      if (!stored) return;
      if (![AssetVisibility.Locked, AssetVisibility.Hidden].includes(stored.visibility)) {
        await this.history.accepted({
          userId: asset.ownerId,
          assetId: asset.id,
          fileName: file.originalName,
          fileSize: file.size,
        });
      }
      await this.quotaFor(asset.ownerId, true);
    });
  }

  @OnEvent({ name: 'JobError', priority: 100 })
  async onJobError({ job }: ArgOf<'JobError'>) {
    const step = processingSteps.get(job.name);
    if (!step || !job.data || !('id' in job.data)) return;
    const assetId = job.data.id as string;
    await this.bestEffort(async () => {
      const asset = await this.assets.getById(assetId);
      if (!asset || [AssetVisibility.Locked, AssetVisibility.Hidden].includes(asset.visibility)) return;
      const changed = await this.history.processingFailure(asset.id, step);
      if (!changed) return;
      const notification = await this.history.notifyOnce(changed.userId, `processing:${asset.id}`, {
        title: 'Upload gespeichert – Verarbeitung benötigt Aufmerksamkeit',
        description:
          'Das Original wurde angenommen. Vorschau oder Video konnte noch nicht verarbeitet werden. Details und Hilfe findest du im Uploadverlauf.',
        level: NotificationLevel.Warning,
      });
      if (notification) this.websocket.clientSend('on_notification', changed.userId, mapNotification(notification));
    });
  }

  @OnEvent({ name: 'JobSuccess', priority: 100 })
  async onJobSuccess({ job, response }: ArgOf<'JobSuccess'>) {
    if (response === JobStatus.Failed) {
      await this.onJobError({ job, error: undefined });
      return;
    }
    const step = processingSteps.get(job.name);
    if (!step || !job.data || !('id' in job.data) || response !== JobStatus.Success) return;
    const assetId = job.data.id as string;
    await this.bestEffort(() => this.history.processingRecovered(assetId, step));
  }

  async list(auth: AuthDto, dto: PholyHistorySearchDto) {
    const ownerId = this.owner(auth);
    dto = PholyHistorySearchDto.schema.parse(dto);
    const result = await this.history.list(ownerId, dto.page);
    return {
      ...result,
      page: dto.page,
      retentionDays: PHOLY_HISTORY_RETENTION_DAYS,
      items: result.items.map((item) => ({
        ...item,
        status: item.status === 'processing' && item.previewReady && item.thumbnailReady ? 'ready' : item.status,
      })),
    };
  }

  async quota(auth: AuthDto) {
    return this.quotaFor(this.owner(auth), false);
  }

  private async quotaFor(userId: string, notify: boolean) {
    const user = await this.users.get(userId, {});
    if (!user) throw new NotFoundException('Account is unavailable.');
    const limit = user.quotaSizeInBytes;
    const usage = user.quotaUsageInBytes;
    const level = pholyQuotaLevel(usage, limit);
    if (notify && level !== 'normal') {
      const notification = await this.history.notifyOnce(userId, `quota:${level}`, {
        title: level === 'full' ? 'Dein PHOLY-Speicher ist voll' : 'Dein PHOLY-Speicher wird knapp',
        description:
          level === 'full'
            ? 'Neue Uploads passen nicht mehr in dein Kontingent. Prüfe deinen Speicher und den Papierkorb oder kontaktiere den Support.'
            : `Mindestens ${level === 'critical' ? 95 : 80} % deines Speichers sind belegt. Prüfe dein Kontingent, bevor du weitere große Uploads startest.`,
        level: level === 'full' ? NotificationLevel.Error : NotificationLevel.Warning,
      });
      if (notification) this.websocket.clientSend('on_notification', userId, mapNotification(notification));
    }
    return { usage, limit, remaining: limit === null ? null : Math.max(0, limit - usage), level };
  }

  async attempt(auth: AuthDto, dto: PholyHistoryAttemptDto) {
    const ownerId = this.owner(auth);
    dto = PholyHistoryAttemptDto.schema.parse(dto);
    for (const [id, entry] of this.attempts) if (entry.until < Date.now()) this.attempts.delete(id);
    const count = this.attempts.get(ownerId) ?? { count: 0, until: Date.now() + 3_600_000 };
    if (count.count >= 10_000 || (!this.attempts.has(ownerId) && this.attempts.size >= 10_000)) {
      throw new HttpException('Upload history request limit reached.', HttpStatus.TOO_MANY_REQUESTS);
    }
    count.count++;
    this.attempts.set(ownerId, count);
    let assetId: string | null = null;
    if (dto.assetId) {
      const asset = await this.assets.getById(dto.assetId);
      if (
        !asset ||
        asset.ownerId !== ownerId ||
        asset.deletedAt ||
        [AssetVisibility.Locked, AssetVisibility.Hidden].includes(asset.visibility)
      ) {
        throw new NotFoundException('Asset is unavailable.');
      }
      assetId = asset.id;
    }
    if (dto.status === 'accepted') {
      if (!assetId) throw new NotFoundException('Asset is unavailable.');
      await this.history.removeAttempt(ownerId, dto.id);
      return;
    }
    await this.history.record({
      userId: ownerId,
      assetId,
      eventKey: `client:${dto.id}`,
      fileName: dto.fileName,
      fileSize: dto.fileSize,
      status: dto.status,
    });
  }
}
