import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyHistoryAttemptDto, PholyHistorySearchDto } from 'src/dtos/pholy-history.dto.js';
import { AssetVisibility, JobName, JobStatus } from 'src/enum.js';
import type { AssetRepository } from 'src/repositories/asset.repository.js';
import type { ArgOf } from 'src/repositories/event.repository.js';
import type { LoggingRepository } from 'src/repositories/logging.repository.js';
import type { PholyHistoryRepository } from 'src/repositories/pholy-history.repository.js';
import type { UserRepository } from 'src/repositories/user.repository.js';
import type { WebsocketRepository } from 'src/repositories/websocket.repository.js';
import { PholyHistoryService, pholyQuotaLevel } from 'src/services/pholy-history.service.js';

const ownerId = randomUUID();
const assetId = randomUUID();
const auth = { user: { id: ownerId } } as AuthDto;
const visible = { id: assetId, ownerId, visibility: AssetVisibility.Timeline, deletedAt: null };
const attempt: PholyHistoryAttemptDto = { id: randomUUID(), fileName: 'synthetic.jpg', fileSize: 10, status: 'failed' };
const upload = {
  asset: { id: assetId, ownerId },
  file: { originalName: 'synthetic.jpg', size: 10 },
} as ArgOf<'AssetCreate'>;
const job = { name: JobName.AssetGenerateThumbnails, data: { id: assetId } } as ArgOf<'JobError'>['job'];

describe(PholyHistoryService.name, () => {
  const history = {
    accepted: vi.fn(),
    record: vi.fn(),
    removeAttempt: vi.fn(),
    list: vi.fn(),
    notifyOnce: vi.fn(),
    processingFailure: vi.fn(),
    processingRecovered: vi.fn(),
    cleanup: vi.fn(),
  };
  const users = { get: vi.fn() };
  const assets = { getById: vi.fn() };
  const websocket = { clientSend: vi.fn() };
  const logger = { setContext: vi.fn(), warn: vi.fn() };
  let service: PholyHistoryService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new PholyHistoryService(
      history as unknown as PholyHistoryRepository,
      users as unknown as UserRepository,
      assets as unknown as AssetRepository,
      websocket as unknown as WebsocketRepository,
      logger as unknown as LoggingRepository,
    );
    assets.getById.mockResolvedValue(visible);
    users.get.mockResolvedValue({ quotaSizeInBytes: 100, quotaUsageInBytes: 30 });
    history.list.mockResolvedValue({ items: [], hasMore: false });
  });

  it('rejects shared-link history, quota and attempt access', async () => {
    const shared = { ...auth, sharedLink: {} } as AuthDto;
    await expect(service.list(shared, { page: 0 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.quota(shared)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.attempt(shared, attempt)).rejects.toBeInstanceOf(ForbiddenException);
    expect(history.list).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it('records accepted app and browser uploads from the trusted server event', async () => {
    await service.onAssetCreate(upload);
    expect(history.accepted).toHaveBeenCalledWith({
      userId: ownerId,
      assetId,
      fileName: 'synthetic.jpg',
      fileSize: 10,
    });
    expect(history.notifyOnce).not.toHaveBeenCalled();
  });

  it('does not expose locked or hidden uploads in history or notifications', async () => {
    for (const visibility of [AssetVisibility.Locked, AssetVisibility.Hidden]) {
      assets.getById.mockResolvedValue({ ...visible, visibility });
      await service.onAssetCreate(upload);
      await service.onJobError({ job, error: new Error('private data') });
      await expect(service.attempt(auth, { ...attempt, assetId })).rejects.toBeInstanceOf(NotFoundException);
    }
    expect(history.accepted).not.toHaveBeenCalled();
    expect(history.processingFailure).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it('does not turn a history outage into an upload failure', async () => {
    history.accepted.mockRejectedValue(new Error('synthetic database outage'));
    await expect(service.onAssetCreate(upload)).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('keeps client reports account scoped and forbids references to another account', async () => {
    assets.getById.mockResolvedValue({ ...visible, ownerId: randomUUID() });
    await expect(service.attempt(auth, { ...attempt, assetId })).rejects.toBeInstanceOf(NotFoundException);
    expect(history.record).not.toHaveBeenCalled();
    await service.attempt(auth, attempt);
    expect(history.record).toHaveBeenCalledWith({
      userId: ownerId,
      assetId: null,
      eventKey: `client:${attempt.id}`,
      fileName: attempt.fileName,
      fileSize: attempt.fileSize,
      status: 'failed',
    });
  });

  it('cannot forge an accepted upload and successful retry only removes its own prior attempt', async () => {
    await expect(service.attempt(auth, { ...attempt, status: 'accepted' })).rejects.toThrow();
    await service.attempt(auth, { ...attempt, status: 'accepted', assetId });
    expect(history.removeAttempt).toHaveBeenCalledWith(ownerId, attempt.id);
    expect(history.accepted).not.toHaveBeenCalled();
    expect(history.record).not.toHaveBeenCalled();
  });

  it('reports preview readiness without hiding unresolved processing failures', async () => {
    history.list.mockResolvedValue({
      items: [
        { id: 'one', status: 'processing', previewReady: true, thumbnailReady: true },
        { id: 'two', status: 'processing', previewReady: true, thumbnailReady: false },
        { id: 'three', status: 'processing-error', previewReady: true, thumbnailReady: true },
      ],
      hasMore: true,
    });
    const result = await service.list(auth, { page: 2 });
    expect(history.list).toHaveBeenCalledWith(ownerId, 2);
    expect(result.items.map(({ status }) => status)).toEqual(['ready', 'processing', 'processing-error']);
    expect(result.retentionDays).toBe(90);
    expect(result.hasMore).toBe(true);
  });

  it('deduplicates processing alerts through durable state without exposing raw errors', async () => {
    history.processingFailure.mockResolvedValue({ userId: ownerId, fileName: 'synthetic.jpg' });
    history.notifyOnce.mockResolvedValue(undefined);
    await service.onJobError({ job, error: new Error('password=do-not-show /secret/path') });
    expect(history.processingFailure).toHaveBeenCalledWith(assetId, 'preview');
    expect(history.notifyOnce).toHaveBeenCalledWith(
      ownerId,
      `processing:${assetId}`,
      expect.objectContaining({ level: 'warning' }),
    );
    expect(JSON.stringify(history.notifyOnce.mock.calls)).not.toContain('do-not-show');
    expect(websocket.clientSend).not.toHaveBeenCalled();
  });

  it('handles failed return statuses as well as exceptions and clears only the recovered step', async () => {
    history.processingFailure.mockResolvedValue(undefined);
    await service.onJobSuccess({ job, response: JobStatus.Failed });
    expect(history.processingFailure).toHaveBeenCalledWith(assetId, 'preview');
    expect(history.processingRecovered).not.toHaveBeenCalled();
    await service.onJobSuccess({ job, response: JobStatus.Success });
    expect(history.processingRecovered).toHaveBeenCalledWith(assetId, 'preview');
  });

  it('does not report background recognition jobs as failed uploads', async () => {
    await service.onJobError({
      job: { name: JobName.SmartSearch, data: { id: assetId } },
      error: new Error('search offline'),
    });
    expect(history.processingFailure).not.toHaveBeenCalled();
    expect(history.notifyOnce).not.toHaveBeenCalled();
  });

  it('reads current quota and emits a durable threshold alert on an upload', async () => {
    users.get.mockResolvedValue({ quotaUsageInBytes: 96, quotaSizeInBytes: 100 });
    expect(await service.quota(auth)).toEqual({ usage: 96, limit: 100, remaining: 4, level: 'critical' });
    expect(history.notifyOnce).not.toHaveBeenCalled();
    await service.onAssetCreate(upload);
    expect(history.notifyOnce).toHaveBeenCalledWith(
      ownerId,
      'quota:critical',
      expect.objectContaining({ level: 'warning' }),
    );
  });
});

describe('PHOLY history boundaries', () => {
  it.each([
    [79, 100, 'normal'],
    [80, 100, 'warning'],
    [94, 100, 'warning'],
    [95, 100, 'critical'],
    [100, 100, 'full'],
    [110, 100, 'full'],
    [0, 0, 'full'],
    [100, null, 'normal'],
  ] as const)('maps quota %s/%s to %s', (usage, limit, expected) => {
    expect(pholyQuotaLevel(usage, limit)).toBe(expected);
  });
  it('rejects unsafe names, arbitrary terminal states and unbounded pagination', () => {
    for (const fileName of ['../image.jpg', 'folder/image.jpg', String.raw`folder\image.jpg`, 'bad\nname']) {
      expect(PholyHistoryAttemptDto.schema.safeParse({ ...attempt, fileName }).success).toBe(false);
    }
    expect(PholyHistoryAttemptDto.schema.safeParse({ ...attempt, status: 'ready' }).success).toBe(false);
    expect(PholyHistorySearchDto.schema.safeParse({ page: -1 }).success).toBe(false);
    expect(PholyHistorySearchDto.schema.safeParse({ page: 10_001 }).success).toBe(false);
  });
});
