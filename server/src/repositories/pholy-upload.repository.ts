import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, open, readdir, realpath, rename, rm, statfs, unlink } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { StorageCore } from 'src/cores/storage.core.js';
import type { AssetMediaResponseDto } from 'src/dtos/asset-media-response.dto.js';
import { PHOLY_UPLOAD_CHUNK_SIZE, type PholyUploadCreateDto } from 'src/dtos/pholy-upload.dto.js';
import { ConfigRepository } from 'src/repositories/config.repository.js';
import type { DB } from 'src/schema/index.js';
import { getKyselyConfig } from 'src/utils/database.js';

const uuid = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export interface PholyUploadSession extends PholyUploadCreateDto {
  id: string;
  ownerId: string;
  offset: number;
  expiresAt: string;
  status: 'uploading' | 'complete';
  result?: AssetMediaResponseDto;
  lastChunk?: { offset: number; size: number; checksum: string };
  preparedPaths?: string[];
}

@Injectable()
export class PholyUploadRepository {
  private lockDb?: Kysely<DB>;
  private activeLocks = 0;

  constructor(
    @InjectKysely() private db: Kysely<DB>,
    private config: ConfigRepository,
  ) {}

  async onModuleDestroy() {
    await this.lockDb?.destroy();
  }

  // Dedicated connections keep long file transfers from exhausting Immich's
  // query pool. All keys for one operation share one connection. PostgreSQL
  // releases locks on process death; competing requests fail fast and retry.
  async withLock<T>(keys: string | string[], callback: () => Promise<T>): Promise<T> {
    if (this.activeLocks >= 4) throw new ServiceUnavailableException('Upload is busy. Retry shortly.');
    this.activeLocks++;
    try {
      this.lockDb ??= new Kysely<DB>(getKyselyConfig(this.config.getEnv().database.config));
      return await this.lockDb.connection().execute(async (connection) => {
        const acquired: string[] = [];
        try {
          for (const key of [...new Set(Array.isArray(keys) ? keys : [keys])].sort()) {
            const { rows } = await sql<{
              locked: boolean;
            }>`SELECT pg_try_advisory_lock(hashtextextended(${`pholy-upload:${key}`}, 0)) AS locked`.execute(
              connection,
            );
            if (!rows[0].locked) throw new ServiceUnavailableException('Upload is busy. Retry shortly.');
            acquired.push(key);
          }
          return await callback();
        } finally {
          for (const key of acquired.toReversed()) {
            await sql`SELECT pg_advisory_unlock(hashtextextended(${`pholy-upload:${key}`}, 0))`.execute(connection);
          }
        }
      });
    } finally {
      this.activeLocks--;
    }
  }

  async requireStorage(requiredBytes = 0, path = StorageCore.getMediaLocation()) {
    const root = resolve(StorageCore.getMediaLocation());
    const stats = await statfs(path);
    if (![0xff_53_4d_42, 0xfe_53_4d_42].includes(stats.type >>> 0) || (await realpath(root)) !== root) {
      throw new ServiceUnavailableException('Media storage is unavailable. Local fallback is disabled.');
    }
    if (requiredBytes > 0 && stats.bavail * stats.bsize < requiredBytes + 256 * 1024 ** 2) {
      throw new ServiceUnavailableException('Media storage has insufficient free space.');
    }
    return root;
  }

  private root() {
    return join(StorageCore.getMediaLocation(), '.pholy-uploads');
  }

  private folder(ownerId: string, id?: string) {
    if (!uuid.test(ownerId) || (id && !uuid.test(id))) throw new NotFoundException('Upload not found.');
    return id ? join(this.root(), ownerId, id) : join(this.root(), ownerId);
  }

  // Check each component, including existing directories. User-provided filenames
  // never become paths, and neither staging nor destination may traverse a symlink.
  async safePath(path: string, createParents = false) {
    const root = resolve(StorageCore.getMediaLocation());
    const suffix = relative(root, resolve(path));
    if (!suffix || suffix.startsWith(`..${sep}`) || suffix === '..' || resolve(path) === suffix) {
      throw new BadRequestException('Invalid upload path.');
    }
    let current = root;
    const components = suffix.split(sep);
    for (const [index, component] of components.entries()) {
      current = join(current, component);
      let stats;
      try {
        stats = await lstat(current);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        if (index === components.length - 1) return;
        if (!createParents) return;
        await mkdir(current).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error;
        });
        stats = await lstat(current);
      }
      if (stats.isSymbolicLink() || (index < components.length - 1 && !stats.isDirectory())) {
        throw new ServiceUnavailableException('Unsafe media storage path.');
      }
      await this.requireStorage(0, current);
    }
  }

  dataPath(session: PholyUploadSession) {
    return join(this.folder(session.ownerId, session.id), 'data');
  }

  async save(session: PholyUploadSession) {
    await this.requireStorage();
    const path = join(this.folder(session.ownerId, session.id), 'session.json');
    await this.safePath(path, true);
    const temporary = `${path}.${randomUUID()}.tmp`;
    const file = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      await file.writeFile(JSON.stringify(session));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  }

  async read(ownerId: string, id: string): Promise<PholyUploadSession> {
    await this.requireStorage();
    const path = join(this.folder(ownerId, id), 'session.json');
    try {
      await this.safePath(path);
      const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        // eslint-disable-next-line unicorn/consistent-json-file-read -- FileHandle.readFile has no path argument.
        const text = await file.readFile({ encoding: 'utf8' });
        const session = JSON.parse(text) as PholyUploadSession;
        if (session.id !== id || session.ownerId !== ownerId) throw new NotFoundException('Upload not found.');
        return session;
      } finally {
        await file.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new NotFoundException('Upload not found.');
      throw error;
    }
  }

  async list(ownerId: string) {
    await this.requireStorage();
    const folder = this.folder(ownerId);
    await this.safePath(folder);
    const entries = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const sessions: PholyUploadSession[] = [];
    for (const id of entries) {
      if (!uuid.test(id)) continue;
      try {
        sessions.push(await this.read(ownerId, id));
      } catch (error) {
        if (!(error instanceof NotFoundException)) throw error;
      }
    }
    return sessions;
  }

  async owners() {
    await this.requireStorage();
    await this.safePath(this.root());
    const entries = await readdir(this.root()).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return entries.filter((id) => uuid.test(id));
  }

  async append(session: PholyUploadSession, stream: Readable, size: number, retry = false) {
    await this.requireStorage(retry ? 0 : size);
    const path = this.dataPath(session);
    await this.safePath(path, true);
    const file = retry
      ? undefined
      : await open(path, constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
    const digest = createHash('sha256');
    let received = 0;
    try {
      if (file) {
        // A killed process may have written bytes without committing the offset.
        const stats = await file.stat();
        if (stats.size < session.offset) throw new BadRequestException('Upload data is incomplete.');
        await file.truncate(session.offset);
      }
      for await (const value of stream) {
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        received += chunk.length;
        if (received > size || received > PHOLY_UPLOAD_CHUNK_SIZE)
          throw new BadRequestException('Upload chunk is too large.');
        digest.update(chunk);
        if (!file) continue;
        let written = 0;
        while (written < chunk.length) {
          const result = await file.write(
            chunk,
            written,
            chunk.length - written,
            session.offset + received - chunk.length + written,
          );
          if (!result.bytesWritten) throw new Error('Upload storage did not accept data.');
          written += result.bytesWritten;
        }
      }
      if (received !== size) throw new BadRequestException('Upload chunk is incomplete.');
      await file?.sync();
      return digest.digest('hex');
    } catch (error) {
      await file?.truncate(session.offset);
      throw error;
    } finally {
      await file?.close();
    }
  }

  async verify(session: PholyUploadSession) {
    await this.requireStorage();
    const path = this.dataPath(session);
    await this.safePath(path);
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await file.stat();
      if (stats.size !== session.fileSize) throw new BadRequestException('Upload size does not match.');
      const digest = createHash('sha1');
      for await (const chunk of file.createReadStream({ autoClose: false })) digest.update(chunk);
      if (digest.digest('hex') !== session.checksum) throw new BadRequestException('Upload checksum does not match.');
    } finally {
      await file.close();
    }
  }

  async prepare(session: PholyUploadSession, destination: string) {
    await this.requireStorage(session.fileSize);
    await this.safePath(this.dataPath(session));
    await this.safePath(destination, true);
    // EXCL disallows replacement of an existing file or symlink. Keep staging
    // intact until Immich has accepted the file, so failures remain resumable.
    await copyFile(this.dataPath(session), destination, constants.COPYFILE_EXCL);
    const file = await open(destination, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      await file.sync();
    } finally {
      await file.close();
    }
  }

  async cleanPrepared(session: PholyUploadSession) {
    for (const path of session.preparedPaths ?? []) {
      await this.safePath(path);
      const referenced = await this.db
        .selectFrom('asset')
        .select('id')
        .where('originalPath', '=', path)
        .executeTakeFirst();
      if (!referenced)
        await unlink(path).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        });
    }
  }

  async discardData(session: PholyUploadSession) {
    await this.requireStorage();
    await this.safePath(this.dataPath(session));
    await unlink(this.dataPath(session)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    await this.cleanPrepared(session);
  }

  async remove(session: PholyUploadSession) {
    await this.discardData(session);
    const path = this.folder(session.ownerId, session.id);
    await this.safePath(path);
    await rm(path, { recursive: true, force: true });
  }
}
