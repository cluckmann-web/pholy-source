import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Kysely } from 'kysely';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { StorageCore } from 'src/cores/storage.core.js';
import { AssetMediaStatus } from 'src/dtos/asset-media-response.dto.js';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PHOLY_UPLOAD_CHUNK_SIZE, type PholyUploadCreateDto } from 'src/dtos/pholy-upload.dto.js';
import { AssetFileType } from 'src/enum.js';
import { AssetRepository } from 'src/repositories/asset.repository.js';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import { JobRepository } from 'src/repositories/job.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholyUploadRepository } from 'src/repositories/pholy-upload.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import type { DB } from 'src/schema/index.js';
import { AssetMediaService } from 'src/services/asset-media.service.js';
import { PholyUploadService } from 'src/services/pholy-upload.service.js';

describe(PholyUploadService.name, () => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const other = '00000000-0000-4000-8000-000000000002';
  const assetId = '00000000-0000-4000-8000-000000000003';
  const auth = { user: { id: owner, quotaSizeInBytes: null, quotaUsageInBytes: 0 } } as AuthDto;
  const bytes = Buffer.from('synthetic upload bytes');
  const dto: PholyUploadCreateDto = {
    fileName: 'test.jpg',
    fileSize: bytes.length,
    mimeType: 'image/jpeg',
    fileModifiedAt: '2026-11-17T00:00:00Z',
    checksum: createHash('sha1').update(bytes).digest('hex'),
  };
  const media = {
    canUploadFile: vi.fn(),
    getUploadAssetIdByChecksum: vi.fn(),
    getUploadFilename: vi.fn(),
    uploadAsset: vi.fn(),
  };
  const users = { get: vi.fn(), syncUsage: vi.fn() };
  const assets = { getById: vi.fn(), update: vi.fn(), upsertExif: vi.fn() };
  const jobs = { queue: vi.fn() };
  const logger = { setContext: vi.fn(), warn: vi.fn() };
  let folder: string;
  let repo: PholyUploadRepository;
  let service: PholyUploadService;
  const referenced = new Set<string>();
  const locks = new Set<string>();

  beforeEach(async () => {
    vi.clearAllMocks();
    referenced.clear();
    locks.clear();
    folder = await mkdtemp(join(tmpdir(), 'pholy-upload-test-'));
    StorageCore.setMediaLocation(folder);
    const db = {
      selectFrom: () => ({
        select: () => ({
          where: (_column: string, _op: string, path: string) => ({
            executeTakeFirst: () => Promise.resolve(referenced.has(path) ? { id: assetId } : undefined),
          }),
        }),
      }),
    };
    repo = new PholyUploadRepository(db as unknown as Kysely<DB>, {} as ConfigRepository);
    // Production rejects every local filesystem. Only isolated filesystem tests
    // replace the mount check; all byte handling and manifests remain real.
    vi.spyOn(repo, 'requireStorage').mockResolvedValue(folder);
    vi.spyOn(repo, 'withLock').mockImplementation(async (key, callback) => {
      const keys = Array.isArray(key) ? key : [key];
      if (keys.some((item) => locks.has(item))) throw new ServiceUnavailableException('Upload is busy');
      for (const item of keys) locks.add(item);
      try {
        return await callback();
      } finally {
        for (const item of keys) locks.delete(item);
      }
    });
    users.get.mockResolvedValue(auth.user);
    assets.getById.mockResolvedValue(undefined);
    media.getUploadAssetIdByChecksum.mockResolvedValue(undefined);
    media.getUploadFilename.mockImplementation(({ file }) => `${file.uuid}.jpg`);
    media.uploadAsset.mockImplementation((_auth, _dto, file) => {
      referenced.add(file.originalPath);
      return Promise.resolve({ id: assetId, status: AssetMediaStatus.CREATED });
    });
    service = new PholyUploadService(
      repo,
      media as unknown as AssetMediaService,
      users as unknown as UserRepository,
      assets as unknown as AssetRepository,
      logger as unknown as LoggingRepository,
      jobs as unknown as JobRepository,
    );
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  async function ready() {
    const session = await service.create(auth, dto);
    await service.append(auth, session.id, 0, bytes.length, Readable.from(bytes));
    return session;
  }

  it('persists offsets across service/repository restarts and imports through the existing media pipeline', async () => {
    const session = await service.create(auth, dto);
    await service.append(auth, session.id, 0, 5, Readable.from(bytes.subarray(0, 5)));
    const restored = await repo.read(owner, session.id);
    expect(restored.offset).toBe(5);
    await service.append(auth, session.id, 5, bytes.length - 5, Readable.from(bytes.subarray(5)));
    const result = await service.complete(auth, session.id);
    expect(result).toEqual({ id: assetId, status: AssetMediaStatus.CREATED });
    const uploaded = media.uploadAsset.mock.calls[0][2];
    expect(await readFile(uploaded.originalPath)).toEqual(bytes);
    expect(uploaded.checksum).toEqual(Buffer.from(dto.checksum, 'hex'));
    await expect(stat(repo.dataPath(restored))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(service.get(auth, session.id)).resolves.toMatchObject({ result });
    expect(await service.complete(auth, session.id)).toEqual(result);
    expect(media.uploadAsset).toHaveBeenCalledTimes(1);
  });

  it('isolates sessions and assets by owner and rejects shared-link users', async () => {
    const session = await service.create(auth, dto);
    const foreign = { user: { ...auth.user, id: other } };
    await expect(service.get(foreign, session.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.append(foreign, session.id, 0, bytes.length, Readable.from(bytes))).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.complete(foreign, session.id)).rejects.toBeInstanceOf(NotFoundException);
    await service.cancel(foreign, session.id);
    await expect(service.get(auth, session.id)).resolves.toMatchObject({ offset: 0 });
    assets.getById.mockResolvedValue({ ownerId: owner, files: [] });
    await expect(service.status(foreign, assetId)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.create({ ...auth, sharedLink: {} } as AuthDto, dto)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('accepts only exact last-chunk replays and reports the committed offset', async () => {
    const session = await service.create(auth, dto);
    const part = bytes.subarray(0, 5);
    await service.append(auth, session.id, 0, part.length, Readable.from(part));
    await expect(service.append(auth, session.id, 0, part.length, Readable.from(part))).resolves.toMatchObject({
      offset: 5,
    });
    await expect(service.append(auth, session.id, 0, 5, Readable.from('other'))).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.append(auth, session.id, 10, 1, Readable.from('x'))).rejects.toMatchObject({
      response: { expectedOffset: 5 },
    });
    expect(await readFile(repo.dataPath(await repo.read(owner, session.id)))).toEqual(part);
  });

  it.each([Buffer.from('xx'), Buffer.from('xxxxxx')])('rolls back truncated and oversized bodies', async (body) => {
    const session = await service.create(auth, dto);
    await expect(service.append(auth, session.id, 0, 5, Readable.from(body))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.get(auth, session.id)).resolves.toMatchObject({ offset: 0 });
    await expect(stat(repo.dataPath(await repo.read(owner, session.id)))).resolves.toMatchObject({ size: 0 });
  });

  it('rejects chunks larger than the limit and chunks beyond the declared file', async () => {
    const session = await service.create(auth, dto);
    await expect(
      service.append(auth, session.id, 0, PHOLY_UPLOAD_CHUNK_SIZE + 1, Readable.from('x')),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.append(auth, session.id, 0, bytes.length + 1, Readable.from('x'))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects incorrect checksums and incomplete finalization without importing', async () => {
    const session = await service.create(auth, dto);
    await expect(service.complete(auth, session.id)).rejects.toBeInstanceOf(ConflictException);
    await service.append(auth, session.id, 0, bytes.length, Readable.from(Buffer.alloc(bytes.length)));
    await expect(service.complete(auth, session.id)).rejects.toBeInstanceOf(BadRequestException);
    expect(media.uploadAsset).not.toHaveBeenCalled();
  });

  it('recovers data written before an interrupted manifest commit', async () => {
    const session = await service.create(auth, dto);
    await service.append(auth, session.id, 0, 5, Readable.from(bytes.subarray(0, 5)));
    const stored = await repo.read(owner, session.id);
    await writeFile(repo.dataPath(stored), Buffer.concat([bytes.subarray(0, 5), Buffer.from('uncommitted garbage')]));
    await service.append(auth, session.id, 5, bytes.length - 5, Readable.from(bytes.subarray(5)));
    await service.complete(auth, session.id);
    expect(await readFile(media.uploadAsset.mock.calls[0][2].originalPath)).toEqual(bytes);
  });

  it('keeps staging data after a pipeline failure and retries with a new destination', async () => {
    const session = await ready();
    media.uploadAsset.mockRejectedValueOnce(new Error('queue unavailable'));
    await expect(service.complete(auth, session.id)).rejects.toThrow('queue unavailable');
    expect(await readFile(repo.dataPath(await repo.read(owner, session.id)))).toEqual(bytes);
    await service.complete(auth, session.id);
    expect(media.uploadAsset.mock.calls[0][2].originalPath).not.toBe(media.uploadAsset.mock.calls[1][2].originalPath);
    await expect(stat(media.uploadAsset.mock.calls[0][2].originalPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('recovers an accepted asset when the final response/manifest was lost', async () => {
    const session = await ready();
    media.getUploadAssetIdByChecksum.mockResolvedValue({ id: assetId, status: AssetMediaStatus.DUPLICATE });
    expect(await service.complete(auth, session.id)).toEqual({ id: assetId, status: AssetMediaStatus.DUPLICATE });
    expect(media.uploadAsset).not.toHaveBeenCalled();
    expect(assets.update).not.toHaveBeenCalled();
    expect(jobs.queue).not.toHaveBeenCalled();
  });

  it('repairs our own interrupted native pipeline without double-counting quota', async () => {
    const session = await ready();
    media.uploadAsset.mockRejectedValueOnce(new Error('process interrupted'));
    await expect(service.complete(auth, session.id)).rejects.toThrow('process interrupted');
    const firstPath = media.uploadAsset.mock.calls[0][2].originalPath;
    referenced.add(firstPath);
    media.getUploadAssetIdByChecksum.mockResolvedValue({ id: assetId, status: AssetMediaStatus.DUPLICATE });
    assets.getById.mockResolvedValue({ id: assetId, ownerId: owner, originalPath: firstPath });
    assets.update.mockImplementation(({ originalPath }) => {
      referenced.delete(firstPath);
      referenced.add(originalPath);
      return Promise.resolve();
    });
    await service.complete(auth, session.id);
    const updated = assets.update.mock.calls[0][0];
    expect(updated.originalPath).not.toBe(firstPath);
    expect(await readFile(updated.originalPath)).toEqual(bytes);
    expect(assets.upsertExif).toHaveBeenCalledWith(
      expect.objectContaining({ exif: { assetId, fileSizeInByte: bytes.length } }),
    );
    expect(jobs.queue).toHaveBeenCalledWith(expect.objectContaining({ data: { id: assetId, source: 'upload' } }));
    expect(users.syncUsage).not.toHaveBeenCalled();
    expect(media.uploadAsset).toHaveBeenCalledTimes(1);
  });

  it('preserves the referenced original and staging if crash recovery cannot publish the new path', async () => {
    const session = await ready();
    media.uploadAsset.mockRejectedValueOnce(new Error('process interrupted'));
    await expect(service.complete(auth, session.id)).rejects.toThrow('process interrupted');
    const firstPath = media.uploadAsset.mock.calls[0][2].originalPath;
    referenced.add(firstPath);
    media.getUploadAssetIdByChecksum.mockResolvedValue({ id: assetId, status: AssetMediaStatus.DUPLICATE });
    assets.getById.mockResolvedValue({ id: assetId, ownerId: owner, originalPath: firstPath });
    assets.update.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.complete(auth, session.id)).rejects.toThrow('database unavailable');
    expect(await readFile(firstPath)).toEqual(bytes);
    expect(await readFile(repo.dataPath(await repo.read(owner, session.id)))).toEqual(bytes);
    expect(jobs.queue).not.toHaveBeenCalled();
  });

  it('reuses the same active session after a lost create response', async () => {
    const first = await service.create(auth, dto);
    await service.append(auth, first.id, 0, 5, Readable.from(bytes.subarray(0, 5)));
    const retry = await service.create(auth, { ...dto, checksum: Buffer.from(dto.checksum, 'hex').toString('base64') });
    expect(retry.id).toBe(first.id);
    expect(retry.offset).toBe(5);
    expect(await repo.list(owner)).toHaveLength(1);
  });

  it('rolls back bytes when the incoming connection aborts', async () => {
    const session = await service.create(auth, dto);
    const body = Readable.from(
      (async function* () {
        yield bytes.subarray(0, 5);
        await Promise.resolve();
        throw new Error('connection aborted');
      })(),
    );
    await expect(service.append(auth, session.id, 0, bytes.length, body)).rejects.toThrow('connection aborted');
    const restored = await repo.read(owner, session.id);
    expect(restored.offset).toBe(0);
    const info = await stat(repo.dataPath(restored));
    expect(info.size).toBe(0);
  });

  it('rechecks current quota at start and finalization including pending reservations', async () => {
    users.get.mockResolvedValue({ ...auth.user, quotaSizeInBytes: bytes.length });
    const session = await ready();
    await expect(service.create(auth, { ...dto, fileName: 'other.jpg' })).rejects.toThrow('Quota has been exceeded!');
    users.get.mockResolvedValue({ ...auth.user, quotaSizeInBytes: bytes.length - 1 });
    await expect(service.complete(auth, session.id)).rejects.toThrow('Quota has been exceeded!');
    expect(media.uploadAsset).not.toHaveBeenCalled();
  });

  it('cancels staging idempotently while preserving completed original files', async () => {
    const session = await ready();
    await service.cancel(auth, session.id);
    await service.cancel(auth, session.id);
    await expect(service.get(auth, session.id)).rejects.toBeInstanceOf(NotFoundException);
    const completed = await ready();
    await service.complete(auth, completed.id);
    const path = media.uploadAsset.mock.calls[0][2].originalPath;
    await service.cancel(auth, completed.id);
    expect(await readFile(path)).toEqual(bytes);
  });

  it('removes expired staging sessions without touching accepted originals', async () => {
    const session = await ready();
    const persisted = await repo.read(owner, session.id);
    persisted.expiresAt = new Date(0).toISOString();
    await repo.save(persisted);
    await service.cleanup();
    await expect(repo.read(owner, session.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not interleave chunks, cancellation or finalization on an active session', async () => {
    const session = await service.create(auth, dto);
    const body = new PassThrough();
    const first = service.append(auth, session.id, 0, bytes.length, body);
    // Lock is acquired before any bytes arrive.
    await expect(service.append(auth, session.id, 0, bytes.length, Readable.from(bytes))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.cancel(auth, session.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.complete(auth, session.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
    body.end(bytes);
    await expect(first).resolves.toMatchObject({ offset: bytes.length });
  });

  it('rejects symlinks in staging paths and traversal-shaped identifiers', async () => {
    const session = await service.create(auth, dto);
    const stored = await repo.read(owner, session.id);
    const target = join(folder, 'protected');
    await writeFile(target, 'original');
    await symlink(target, repo.dataPath(stored));
    await expect(service.append(auth, session.id, 0, bytes.length, Readable.from(bytes))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(await readFile(target, 'utf8')).toBe('original');
    await expect(service.get(auth, '../escape')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses local media even when a directory exists', async () => {
    await expect(PholyUploadRepository.prototype.requireStorage.call(repo)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('reports processing separately from fully available previews', async () => {
    assets.getById.mockResolvedValue({ ownerId: owner, files: [{ type: AssetFileType.Thumbnail }] });
    expect(await service.status(auth, assetId)).toEqual({
      id: assetId,
      status: 'processing',
      previewReady: false,
      thumbnailReady: true,
    });
    assets.getById.mockResolvedValue({
      ownerId: owner,
      files: [{ type: AssetFileType.Thumbnail }, { type: AssetFileType.Preview }],
    });
    await expect(service.status(auth, assetId)).resolves.toMatchObject({ status: 'ready' });
  });
});
