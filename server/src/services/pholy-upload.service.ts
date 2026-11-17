import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { StorageCore } from 'src/cores/storage.core.js';
import { OnEvent } from 'src/decorators.js';
import { UploadFieldName } from 'src/dtos/asset-media.dto.js';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PHOLY_UPLOAD_CHUNK_SIZE, PHOLY_UPLOAD_LIFETIME, PholyUploadCreateDto } from 'src/dtos/pholy-upload.dto.js';
import { AssetFileType, ImmichWorker, JobName, StorageFolder } from 'src/enum.js';
import { AssetRepository } from 'src/repositories/asset.repository.js';
import { JobRepository } from 'src/repositories/job.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholyUploadRepository, type PholyUploadSession } from 'src/repositories/pholy-upload.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { AssetMediaService } from 'src/services/asset-media.service.js';
import { fromChecksum } from 'src/utils/request.js';

@Injectable()
export class PholyUploadService {
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private uploads: PholyUploadRepository,
    private media: AssetMediaService,
    private users: UserRepository,
    private assets: AssetRepository,
    private logger: LoggingRepository,
    private jobs: JobRepository,
  ) {
    this.logger.setContext(PholyUploadService.name);
  }

  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Api] })
  onBootstrap() {
    this.cleanupInterval = setInterval(() => void this.cleanup(), 60 * 60 * 1000);
    this.cleanupInterval.unref();
    void this.cleanup();
  }

  @OnEvent({ name: 'AppShutdown', workers: [ImmichWorker.Api] })
  onShutdown() {
    clearInterval(this.cleanupInterval);
  }

  private owner(auth: AuthDto) {
    if (auth.sharedLink) throw new ForbiddenException('Resumable uploads require an account.');
    return auth.user.id;
  }

  private view(session: PholyUploadSession) {
    return {
      id: session.id,
      offset: session.offset,
      fileSize: session.fileSize,
      chunkSize: PHOLY_UPLOAD_CHUNK_SIZE,
      expiresAt: session.expiresAt,
      status: session.status,
      ...(session.result && { result: session.result }),
    };
  }

  private async freshAuth(auth: AuthDto, size: number) {
    const user = await this.users.get(this.owner(auth), {});
    if (!user) throw new ForbiddenException('Account is unavailable.');
    if (user.quotaSizeInBytes !== null && user.quotaUsageInBytes + size > user.quotaSizeInBytes) {
      throw new BadRequestException('Quota has been exceeded!');
    }
    return {
      ...auth,
      user: { ...auth.user, quotaSizeInBytes: user.quotaSizeInBytes, quotaUsageInBytes: user.quotaUsageInBytes },
    };
  }

  async create(auth: AuthDto, dto: PholyUploadCreateDto) {
    const ownerId = this.owner(auth);
    return this.uploads.withLock(`owner:${ownerId}`, async () => {
      // Revalidate here too: callers other than HTTP must not bypass path/size validation.
      dto = PholyUploadCreateDto.schema.parse(dto);
      const id = randomUUID();
      const file = {
        uuid: id,
        checksum: fromChecksum(dto.checksum),
        originalPath: '',
        originalName: dto.fileName,
        size: dto.fileSize,
      };
      this.media.canUploadFile({ auth, fieldName: UploadFieldName.ASSET_DATA, file, body: {} });
      const allSessions = await this.uploads.list(ownerId);
      const sessions = allSessions.filter(
        (session) => session.status === 'uploading' && Date.parse(session.expiresAt) > Date.now(),
      );
      const resumed = sessions.find(
        (session) =>
          session.checksum === file.checksum.toString('hex') &&
          session.fileName === dto.fileName &&
          session.fileSize === dto.fileSize &&
          session.fileModifiedAt === dto.fileModifiedAt &&
          session.fileCreatedAt === dto.fileCreatedAt &&
          session.visibility === dto.visibility,
      );
      if (resumed) return this.view(resumed);
      if (allSessions.length >= 1000)
        throw new BadRequestException('Too many upload sessions. Cancel old sessions first.');
      if (sessions.length >= 100)
        throw new BadRequestException('Too many unfinished uploads. Cancel or finish existing uploads.');
      const result = await this.media.getUploadAssetIdByChecksum(auth, dto.checksum);
      if (!result) {
        await this.freshAuth(auth, dto.fileSize + sessions.reduce((size, session) => size + session.fileSize, 0));
        await this.uploads.requireStorage(dto.fileSize * 2);
      }
      const session: PholyUploadSession = {
        ...dto,
        checksum: file.checksum.toString('hex'),
        id,
        ownerId,
        offset: result ? dto.fileSize : 0,
        expiresAt: new Date(Date.now() + PHOLY_UPLOAD_LIFETIME).toISOString(),
        status: result ? 'complete' : 'uploading',
        ...(result && { result }),
      };
      await this.uploads.save(session);
      return this.view(session);
    });
  }

  private async session(auth: AuthDto, id: string) {
    const session = await this.uploads.read(this.owner(auth), id);
    if (Date.parse(session.expiresAt) <= Date.now()) {
      await this.uploads.remove(session);
      throw new NotFoundException('Upload has expired.');
    }
    return session;
  }

  async get(auth: AuthDto, id: string) {
    return this.uploads.withLock(`session:${id}`, async () => this.view(await this.session(auth, id)));
  }

  async append(auth: AuthDto, id: string, offset: number, size: number, stream: Readable) {
    this.owner(auth);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > PHOLY_UPLOAD_CHUNK_SIZE
    ) {
      throw new BadRequestException('Invalid upload offset or chunk size.');
    }
    return this.uploads.withLock(`session:${id}`, async () => {
      const session = await this.session(auth, id);
      const conflict = () =>
        new ConflictException({ message: 'Upload offset does not match.', expectedOffset: session.offset });
      if (session.status === 'complete') throw conflict();
      if (offset !== session.offset) {
        // A response may have been lost after a successful chunk. Accept only an
        // exact replay of the last committed bytes; never append a second copy.
        if (session.lastChunk?.offset !== offset || session.lastChunk.size !== size) throw conflict();
        if ((await this.uploads.append(session, stream, size, true)) !== session.lastChunk.checksum) throw conflict();
        return this.view(session);
      }
      if (offset + size > session.fileSize) throw new BadRequestException('Chunk exceeds declared file size.');
      const checksum = await this.uploads.append(session, stream, size);
      session.lastChunk = { offset, size, checksum };
      session.offset += size;
      session.expiresAt = new Date(Date.now() + PHOLY_UPLOAD_LIFETIME).toISOString();
      await this.uploads.save(session);
      return this.view(session);
    });
  }

  async complete(auth: AuthDto, id: string) {
    const ownerId = this.owner(auth);
    return this.uploads.withLock([`owner:${ownerId}`, `session:${id}`], async () => {
      const session = await this.session(auth, id);
      if (session.result) return session.result;
      if (session.offset !== session.fileSize)
        throw new ConflictException({ message: 'Upload is incomplete.', expectedOffset: session.offset });
      await this.uploads.verify(session);
      // Recovers an accepted upload after a lost response or process restart.
      let result = await this.media.getUploadAssetIdByChecksum(auth, session.checksum);
      if (result) {
        const existing = await this.assets.getById(result.id);
        if (existing && session.preparedPaths?.includes(existing.originalPath)) {
          // The process may have died between asset-row insertion and queue /
          // quota updates. Republish our verified bytes to a fresh path: an old
          // failure-cleanup job may still target the previous preparation path.
          const file = await this.prepareFile(auth, session);
          await this.assets.update({ id: existing.id, originalPath: file.originalPath });
          await this.assets.upsertExif({
            exif: { assetId: existing.id, fileSizeInByte: session.fileSize },
            lockedPropertiesBehavior: 'override',
          });
          await this.jobs.queue({ name: JobName.AssetExtractMetadata, data: { id: existing.id, source: 'upload' } });
          // Do not replay AssetCreate or recompute aggregate usage here: a
          // concurrent mobile upload may still be between EXIF and its quota
          // increment. Existing scheduled UserSyncUsage repairs rare crash
          // accounting after the ordinary pipeline has settled.
        }
      } else {
        const freshAuth = await this.freshAuth(auth, session.fileSize);
        const file = await this.prepareFile(freshAuth, session);
        result = await this.media.uploadAsset(
          freshAuth,
          {
            fileCreatedAt: new Date(session.fileCreatedAt ?? session.fileModifiedAt),
            fileModifiedAt: new Date(session.fileModifiedAt),
            filename: session.fileName,
            visibility: session.visibility,
            isFavorite: false,
          },
          file,
        );
      }
      session.result = result;
      session.status = 'complete';
      await this.uploads.save(session);
      // Commit the result before cleanup. A cleanup failure must not turn a
      // successfully accepted upload into an error or trigger a second import.
      await this.uploads.discardData(session).catch((error) => this.logger.warn(`Upload cleanup deferred: ${error}`));
      return result;
    });
  }

  private async prepareFile(auth: AuthDto, session: PholyUploadSession) {
    await this.uploads.cleanPrepared(session);
    await this.uploads.requireStorage(session.fileSize);
    const uploadId = randomUUID();
    const file = {
      uuid: uploadId,
      checksum: fromChecksum(session.checksum),
      originalPath: '',
      originalName: session.fileName,
      size: session.fileSize,
    };
    file.originalPath = join(
      StorageCore.getNestedFolder(StorageFolder.Upload, session.ownerId, uploadId),
      this.media.getUploadFilename({ auth, fieldName: UploadFieldName.ASSET_DATA, file, body: {} }),
    );
    session.preparedPaths = [...(session.preparedPaths ?? []), file.originalPath];
    await this.uploads.save(session);
    await this.uploads.prepare(session, file.originalPath);
    return file;
  }

  async cancel(auth: AuthDto, id: string) {
    this.owner(auth);
    return this.uploads.withLock(`session:${id}`, async () => {
      let session;
      try {
        session = await this.uploads.read(auth.user.id, id);
      } catch (error) {
        if (error instanceof NotFoundException) return;
        throw error;
      }
      // Never remove an accepted asset. Only its resumable session is cancelled.
      await this.uploads.remove(session);
    });
  }

  async status(auth: AuthDto, id: string) {
    const asset = await this.assets.getById(id, { files: true });
    if (!asset || asset.ownerId !== this.owner(auth)) throw new NotFoundException('Asset not found.');
    const previewReady = asset.files?.some((file) => file.type === AssetFileType.Preview) ?? false;
    const thumbnailReady = asset.files?.some((file) => file.type === AssetFileType.Thumbnail) ?? false;
    return { id, status: previewReady && thumbnailReady ? 'ready' : 'processing', previewReady, thumbnailReady };
  }

  async cleanup() {
    try {
      for (const owner of await this.uploads.owners()) {
        for (const session of await this.uploads.list(owner)) {
          if (Date.parse(session.expiresAt) > Date.now()) continue;
          try {
            await this.uploads.withLock(`session:${session.id}`, async () => {
              const fresh = await this.uploads.read(owner, session.id);
              if (Date.parse(fresh.expiresAt) <= Date.now()) await this.uploads.remove(fresh);
            });
          } catch (error) {
            this.logger.warn(`Upload expiration deferred: ${error}`);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`Upload cleanup unavailable: ${error}`);
    }
  }
}
