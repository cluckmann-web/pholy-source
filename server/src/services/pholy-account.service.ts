import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import sanitize from 'sanitize-filename';
import { OnEvent } from 'src/decorators.js';
import { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyAccountCloseDto } from 'src/dtos/pholy-account.dto.js';
import { ImmichWorker, JobName } from 'src/enum.js';
import { CronRepository } from 'src/repositories/cron.repository.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository, type ArgOf } from 'src/repositories/event.repository.js';
import { JobRepository } from 'src/repositories/job.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PHOLY_EXPORT_PART_BYTES, PholyAccountRepository } from 'src/repositories/pholy-account.repository.js';
import { ImmichReadStream, StorageRepository } from 'src/repositories/storage.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { mimeTypes } from 'src/utils/mime-types.js';

async function* base64Chunks(stream: Readable) {
  let carry = Buffer.alloc(0);
  for await (const chunk of stream) {
    const buffer = Buffer.concat([carry, Buffer.from(chunk)]);
    const complete = buffer.length - (buffer.length % 3);
    if (complete > 0) yield buffer.subarray(0, complete).toString('base64');
    carry = buffer.subarray(complete);
  }
  if (carry.length > 0) yield carry.toString('base64');
}

@Injectable()
export class PholyAccountService {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private accounts: PholyAccountRepository,
    private users: UserRepository,
    private crypto: CryptoRepository,
    private storage: StorageRepository,
    private events: EventRepository,
    private jobs: JobRepository,
    private cron: CronRepository,
    private logger: LoggingRepository,
  ) {}

  private session(auth: AuthDto) {
    if (!auth.session || auth.apiKey || auth.sharedLink)
      throw new ForbiddenException('Bitte melde dich im Browser an.');
    return auth.session.id;
  }

  private async verify(auth: AuthDto, password: string) {
    this.session(auth);
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const value = this.attempts.get(auth.user.id) ?? { count: 0, until: now + 60_000 };
    if (value.count >= 5 || (!this.attempts.has(auth.user.id) && this.attempts.size >= 10_000)) {
      throw new HttpException('Zu viele Versuche. Bitte warte eine Minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    value.count++;
    this.attempts.set(auth.user.id, value);
    const user = await this.users.getForChangePassword(auth.user.id);
    if (!user.password || !this.crypto.compareBcrypt(password, user.password)) {
      throw new ForbiddenException(
        'Das aktuelle Passwort ist erforderlich. Falls dein Konto kein lokales Passwort hat, wende dich bitte an die Administration.',
      );
    }
    return user.password;
  }

  async status(auth: AuthDto) {
    const sessionId = this.session(auth);
    const [state, user, credentials] = await Promise.all([
      this.accounts.state(auth.user.id),
      this.accounts.profile(auth.user.id),
      this.users.getForChangePassword(auth.user.id),
    ]);
    return {
      email: user.email,
      isAdmin: auth.user.isAdmin,
      hasPassword: !!credentials.password,
      closeRequestedAt: state?.closeRequestedAt ?? null,
      closeAfter: state?.closeAfter ?? null,
      exportExpiresAt:
        state?.exportSessionId === sessionId && state.exportExpiresAt && state.exportExpiresAt.getTime() > Date.now()
          ? state.exportExpiresAt
          : null,
    };
  }

  async startExport(auth: AuthDto, password: string) {
    const verifiedPassword = await this.verify(auth, password);
    const state = await this.accounts.grantExport(auth.user.id, this.session(auth), new Date(), verifiedPassword);
    return { exportExpiresAt: state.exportExpiresAt, exportBefore: state.exportBefore };
  }

  private async exportGrant(auth: AuthDto) {
    const sessionId = this.session(auth);
    const state = await this.accounts.state(auth.user.id);
    if (
      !state?.exportBefore ||
      !state.exportExpiresAt ||
      state.exportSessionId !== sessionId ||
      state.exportExpiresAt.getTime() <= Date.now()
    ) {
      throw new ForbiddenException('Bitte bestätige dein Passwort erneut, um den Export zu starten.');
    }
    const profile = await this.accounts.profile(auth.user.id);
    if (profile.updatedAt && profile.updatedAt > state.exportBefore) {
      await this.accounts.revokeExport(auth.user.id);
      throw new ForbiddenException('Dein Konto wurde geändert. Bitte bestätige dein Passwort für den Export erneut.');
    }
    return state;
  }

  private async preparePart(userId: string, before: Date, cursor?: string) {
    const part = await this.accounts.exportPart(userId, before, cursor);
    let size = 0;
    let count = 0;
    for (const item of part.items) {
      let bytes: number;
      try {
        const stat = await this.storage.stat(item.originalPath);
        if (!stat.isFile()) throw new Error('not a file');
        bytes = stat.size;
      } catch {
        throw new BadRequestException(
          `Original derzeit nicht erreichbar: ${item.originalFileName}. Bitte später erneut versuchen oder den Support kontaktieren.`,
        );
      }
      if (count > 0 && size + bytes > PHOLY_EXPORT_PART_BYTES) break;
      size += bytes;
      count++;
    }
    return {
      items: part.items.slice(0, count),
      size,
      nextCursor: count < part.items.length ? part.items[count - 1].id : part.nextCursor,
    };
  }

  async part(auth: AuthDto, cursor?: string) {
    const grant = await this.exportGrant(auth);
    const { items, size, nextCursor } = await this.preparePart(auth.user.id, grant.exportBefore!, cursor);
    return {
      count: items.length,
      size,
      nextCursor,
      files: items.map(({ id, originalFileName }) => ({ id, filename: originalFileName })),
    };
  }

  private async profileImage(userId: string) {
    const user = await this.accounts.profileImage(userId);
    if (!user?.profileImagePath) return null;
    try {
      const stat = await this.storage.stat(user.profileImagePath);
      if (!stat.isFile()) throw new Error('not a file');
    } catch {
      throw new BadRequestException(
        'Das Profilbild ist derzeit nicht erreichbar. Bitte später erneut exportieren oder den Support kontaktieren.',
      );
    }
    return {
      path: user.profileImagePath,
      filename: 'profile-picture' + extname(user.profileImagePath),
      contentType: mimeTypes.lookup(user.profileImagePath),
    };
  }

  async archive(auth: AuthDto, cursor?: string): Promise<ImmichReadStream> {
    const grant = await this.exportGrant(auth);
    const { items, nextCursor } = await this.preparePart(auth.user.id, grant.exportBefore!, cursor);
    if (items.length === 0) throw new BadRequestException('Dieser Exportteil enthält keine Dateien.');
    const avatar = cursor ? null : await this.profileImage(auth.user.id);
    const zip = new ZipArchive({ store: true });
    if (avatar) zip.file(avatar.path, { name: 'profile/' + avatar.filename, mode: 0o644 });
    const manifest = items.map((item) => ({
      id: item.id,
      originalFileName: item.originalFileName,
      archivePath: `originals/${item.id}/${sanitize(item.originalFileName) || 'original'}`,
      checksum: item.checksum.toString('hex'),
      checksumAlgorithm: item.checksumAlgorithm,
    }));
    zip.append(
      JSON.stringify(
        {
          format: 'pholy-originals-v1',
          exportedBefore: grant.exportBefore,
          nextCursor,
          files: manifest,
          profileImage: avatar ? { archivePath: 'profile/' + avatar.filename, contentType: avatar.contentType } : null,
        },
        null,
        2,
      ),
      { name: 'manifest.json' },
    );
    for (let i = 0; i < items.length; i++)
      zip.file(items[i].originalPath, { name: manifest[i].archivePath, mode: 0o644 });
    zip.on('warning', (error) => zip.destroy(error));
    void zip.finalize().catch((error: Error) => zip.destroy(error));
    return {
      stream: zip,
      type: 'application/zip',
      disposition: `attachment; filename="pholy-originals-${cursor ?? 'start'}.zip"`,
    };
  }

  async metadata(auth: AuthDto): Promise<ImmichReadStream> {
    const grant = await this.exportGrant(auth);
    const profile = await this.accounts.profile(auth.user.id);
    const sections = this.accounts.exportSections(auth.user.id, grant.exportBefore!);
    const avatar = await this.profileImage(auth.user.id);
    const storage = this.storage;
    async function* json() {
      yield '{"format":"pholy-account-v1","exportedAt":' +
        JSON.stringify(new Date()) +
        ',"originalsBefore":' +
        JSON.stringify(grant.exportBefore) +
        ',"profile":' +
        JSON.stringify(profile);
      if (avatar) {
        yield ',"profileImage":{"filename":' +
          JSON.stringify(avatar.filename) +
          ',"contentType":' +
          JSON.stringify(avatar.contentType) +
          ',"encoding":"base64","data":"';
        yield* base64Chunks(storage.createPlainReadStream(avatar.path));
        yield '"}';
      } else {
        yield ',"profileImage":null';
      }
      for (const { name, rows } of sections) {
        yield ',' + JSON.stringify(name) + ':[';
        let first = true;
        for await (const row of rows) {
          yield (first ? '' : ',') + JSON.stringify(row);
          first = false;
        }
        yield ']';
      }
      yield '}';
    }
    return {
      stream: Readable.from(json()),
      type: 'application/json',
      disposition: 'attachment; filename="pholy-account.json"',
    };
  }

  async requestClosure(auth: AuthDto, dto: PholyAccountCloseDto) {
    this.session(auth);
    if (auth.user.isAdmin)
      throw new ForbiddenException('Administratoren müssen ihre Rolle zuerst an ein anderes Konto übertragen.');
    if (!dto.confirm || dto.email !== auth.user.email.toLowerCase())
      throw new BadRequestException('Bitte bestätige deine E-Mail-Adresse und die Kontoschließung.');
    const verifiedPassword = await this.verify(auth, dto.password);
    const state = await this.accounts.requestClosure(auth.user.id, new Date(), verifiedPassword, this.session(auth));
    return { closeRequestedAt: state.closeRequestedAt, closeAfter: state.closeAfter };
  }

  async cancelClosure(auth: AuthDto) {
    this.session(auth);
    await this.accounts.cancelClosure(auth.user.id, new Date());
  }

  @OnEvent({ name: 'AuthChangePassword' })
  async onPasswordChange({ userId }: ArgOf<'AuthChangePassword'>) {
    await this.accounts.revokeExport(userId);
  }

  @OnEvent({ name: 'AppBootstrap', workers: [ImmichWorker.Microservices] })
  onBootstrap() {
    this.cron.create({
      name: 'pholy-account-closure',
      expression: '*/5 * * * *',
      onTick: () => {
        void this.processClosures().catch(() =>
          this.logger.error('PHOLY account closure could not be processed; will retry.'),
        );
      },
    });
  }

  async processClosures() {
    const closed = await this.accounts.closeDue(new Date());
    for (const { closedSessionIds, ...user } of closed) {
      await this.events.emit('UserTrash', user);
      for (const sessionId of closedSessionIds) await this.events.emit('SessionDelete', { sessionId });
    }
    if (closed.length > 0) await this.jobs.queue({ name: JobName.UserDeleteCheck });
  }
}
