import { BadRequestException, ForbiddenException, HttpException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { JobName } from 'src/enum.js';
import { CronRepository } from 'src/repositories/cron.repository.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { JobRepository } from 'src/repositories/job.repository.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholyAccountRepository } from 'src/repositories/pholy-account.repository.js';
import { StorageRepository } from 'src/repositories/storage.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { PholyAccountService } from 'src/services/pholy-account.service.js';

function* exportRows() {
  yield { id: 'asset-owner', originalFileName: 'photo.jpg' };
}

describe(PholyAccountService.name, () => {
  const auth = {
    user: { id: 'owner', email: 'owner@example.test', isAdmin: false },
    session: { id: 'browser' },
  } as AuthDto;
  const accounts = {
    state: vi.fn(),
    profile: vi.fn(),
    profileImage: vi.fn(),
    grantExport: vi.fn(),
    revokeExport: vi.fn(),
    exportPart: vi.fn(),
    exportSections: vi.fn(),
    requestClosure: vi.fn(),
    cancelClosure: vi.fn(),
    closeDue: vi.fn(),
  };
  const users = { getForChangePassword: vi.fn() };
  const crypto = { compareBcrypt: vi.fn() };
  const storage = { stat: vi.fn(), createPlainReadStream: vi.fn() };
  const events = { emit: vi.fn() };
  const jobs = { queue: vi.fn() };
  const cron = { create: vi.fn() };
  const logger = { error: vi.fn() };
  let service: PholyAccountService;
  beforeEach(() => {
    vi.resetAllMocks();
    accounts.state.mockResolvedValue({
      userId: 'owner',
      exportSessionId: 'browser',
      exportBefore: new Date(),
      exportExpiresAt: new Date(Date.now() + 60_000),
    });
    users.getForChangePassword.mockResolvedValue({ password: 'synthetic-hash' });
    crypto.compareBcrypt.mockReturnValue(true);
    accounts.grantExport.mockResolvedValue({
      exportExpiresAt: new Date(Date.now() + 60_000),
      exportBefore: new Date(),
    });
    accounts.profile.mockResolvedValue({ id: 'owner', email: auth.user.email });
    storage.stat.mockResolvedValue({ isFile: () => true, size: 10 });
    service = new PholyAccountService(
      accounts as unknown as PholyAccountRepository,
      users as unknown as UserRepository,
      crypto as unknown as CryptoRepository,
      storage as unknown as StorageRepository,
      events as unknown as EventRepository,
      jobs as unknown as JobRepository,
      cron as unknown as CronRepository,
      logger as unknown as LoggingRepository,
    );
  });
  it('rejects API keys and shared links even when they have full permissions', async () => {
    for (const restricted of [
      { ...auth, apiKey: {} },
      { ...auth, sharedLink: {} },
      { ...auth, session: undefined },
    ]) {
      await expect(service.startExport(restricted as AuthDto, 'password')).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.cancelClosure(restricted as AuthDto)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(accounts.grantExport).not.toHaveBeenCalled();
  });
  it('does not grant exports on incorrect or absent passwords and rate limits retries', async () => {
    crypto.compareBcrypt.mockReturnValue(false);
    for (let i = 0; i < 5; i++)
      await expect(service.startExport(auth, 'wrong')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.startExport(auth, 'wrong')).rejects.toBeInstanceOf(HttpException);
    expect(crypto.compareBcrypt).toHaveBeenCalledTimes(5);
    expect(accounts.grantExport).not.toHaveBeenCalled();
  });
  it('grants export only to the verified user and the current browser session', async () => {
    await service.startExport(auth, 'password');
    expect(accounts.grantExport).toHaveBeenCalledWith('owner', 'browser', expect.any(Date), 'synthetic-hash');
    expect(crypto.compareBcrypt).toHaveBeenCalledWith('password', 'synthetic-hash');
  });
  it('blocks unverified, expired and other-session export access', async () => {
    for (const state of [
      undefined,
      { exportBefore: new Date(), exportSessionId: 'different', exportExpiresAt: new Date(Date.now() + 60_000) },
      { exportBefore: new Date(), exportSessionId: 'browser', exportExpiresAt: new Date(Date.now() - 1) },
    ]) {
      accounts.state.mockResolvedValue(state);
      await expect(service.part(auth)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.metadata(auth)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.archive(auth)).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(accounts.exportPart).not.toHaveBeenCalled();
  });
  it('uses actual file sizes to bound ZIP parts when EXIF is absent and never returns storage paths', async () => {
    accounts.exportPart.mockResolvedValue({
      items: [
        { id: 'first', originalPath: '/private/first', originalFileName: 'first.jpg' },
        { id: 'second', originalPath: '/private/second', originalFileName: 'second.jpg' },
      ],
      size: 0,
      nextCursor: null,
    });
    storage.stat.mockResolvedValue({ isFile: () => true, size: 800 * 1024 ** 2 });
    const part = await service.part(auth);
    expect(part).toEqual({
      count: 1,
      size: 800 * 1024 ** 2,
      nextCursor: 'first',
      files: [{ id: 'first', filename: 'first.jpg' }],
    });
    expect(accounts.exportPart).toHaveBeenCalledWith('owner', expect.any(Date), undefined);
    expect(JSON.stringify(part)).not.toContain('/private');
  });
  it('fails explicitly instead of producing an incomplete archive when an original is missing', async () => {
    accounts.exportPart.mockResolvedValue({
      items: [{ id: 'first', originalPath: '/private/missing', originalFileName: 'first.jpg' }],
      size: 0,
      nextCursor: null,
    });
    storage.stat.mockRejectedValue(new Error('ENOENT /private/missing'));
    await expect(service.archive(auth)).rejects.toThrow('first.jpg');
    await expect(service.archive(auth)).rejects.not.toThrow('/private');
  });
  it('streams original bytes plus a stable-ID manifest without leaking filesystem paths', async () => {
    const folder = await mkdtemp(path.join(os.tmpdir(), 'pholy-account-test-'));
    try {
      const original = path.join(folder, 'original');
      const bytes = Buffer.from('synthetic-PHOLY-original\0exact-bytes');
      await writeFile(original, bytes);
      const avatarPath = path.join(folder, 'avatar.webp');
      const avatarBytes = Buffer.from('synthetic-avatar-original-bytes');
      await writeFile(avatarPath, avatarBytes);
      accounts.profileImage.mockResolvedValue({ profileImagePath: avatarPath });
      const hash = createHash('sha1').update(bytes).digest();
      accounts.exportPart.mockResolvedValue({
        items: [
          {
            id: 'asset-owner',
            originalPath: original,
            originalFileName: '../../photo.jpg',
            checksum: hash,
            checksumAlgorithm: 'sha1',
          },
        ],
        size: bytes.length,
        nextCursor: null,
      });
      const archive = await service.archive(auth);
      const chunks: Buffer[] = [];
      for await (const chunk of archive.stream) chunks.push(Buffer.from(chunk));
      const buffer = Buffer.concat(chunks);
      expect(buffer.subarray(0, 2).toString()).toBe('PK');
      expect(buffer.includes(bytes)).toBe(true);
      expect(buffer.includes(avatarBytes)).toBe(true);
      expect(buffer.includes(Buffer.from('profile/profile-picture.webp'))).toBe(true);
      expect(buffer.includes(Buffer.from(avatarPath))).toBe(false);
      expect(buffer.includes(Buffer.from(hash.toString('hex')))).toBe(true);
      expect(buffer.includes(Buffer.from('originals/asset-owner/'))).toBe(true);
      expect(buffer.includes(Buffer.from(original))).toBe(false);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
  it('streams valid JSON with account sections and no authentication material', async () => {
    accounts.exportSections.mockReturnValue([{ name: 'assets', rows: exportRows() }]);
    const result = await service.metadata(auth);
    let text = '';
    for await (const chunk of result.stream) text += chunk;
    expect(JSON.parse(text)).toMatchObject({
      format: 'pholy-account-v1',
      profile: { id: 'owner' },
      assets: [{ id: 'asset-owner' }],
    });
    expect(text).not.toContain('synthetic-hash');
    expect(accounts.exportSections).toHaveBeenCalledWith('owner', expect.any(Date));
  });
  it('includes an exact streaming avatar in JSON even when there are no original media', async () => {
    const bytes = Buffer.from('synthetic-avatar-uneven-chunks-\0');
    accounts.exportSections.mockReturnValue([]);
    accounts.profileImage.mockResolvedValue({ profileImagePath: '/private/owner/avatar.webp' });
    storage.createPlainReadStream.mockReturnValue(
      Readable.from([bytes.subarray(0, 1), bytes.subarray(1, 8), bytes.subarray(8, 13), bytes.subarray(13)]),
    );
    const result = await service.metadata(auth);
    let text = '';
    for await (const chunk of result.stream) text += chunk;
    const data = JSON.parse(text);
    expect(data.profileImage).toMatchObject({
      filename: 'profile-picture.webp',
      contentType: 'image/webp',
      encoding: 'base64',
    });
    expect(Buffer.from(data.profileImage.data, 'base64')).toEqual(bytes);
    expect(text).not.toContain('/private');
    expect(accounts.profileImage).toHaveBeenCalledWith('owner');
  });
  it('reports unavailable avatars before streaming rather than omitting account data', async () => {
    accounts.exportSections.mockReturnValue([]);
    accounts.profileImage.mockResolvedValue({ profileImagePath: '/private/owner/missing.webp' });
    storage.stat.mockRejectedValue(new Error('missing /private/owner/missing.webp'));
    await expect(service.metadata(auth)).rejects.toThrow('Profilbild');
    await expect(service.metadata(auth)).rejects.not.toThrow('/private');
    expect(storage.createPlainReadStream).not.toHaveBeenCalled();
  });
  it('blocks all administrator self-closure before password checks or writes', async () => {
    await expect(
      service.requestClosure(
        { ...auth, user: { ...auth.user, isAdmin: true } },
        { email: auth.user.email, password: 'password', confirm: true },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounts.requestClosure).not.toHaveBeenCalled();
    expect(crypto.compareBcrypt).not.toHaveBeenCalled();
  });
  it('requires the own email, explicit confirmation and verified current password for closure', async () => {
    await expect(
      service.requestClosure(auth, { email: 'other@example.test', password: 'password', confirm: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.requestClosure(auth, { email: auth.user.email, password: 'password', confirm: false as true }),
    ).rejects.toBeInstanceOf(BadRequestException);
    crypto.compareBcrypt.mockReturnValue(false);
    await expect(
      service.requestClosure(auth, { email: auth.user.email, password: 'wrong', confirm: true }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(accounts.requestClosure).not.toHaveBeenCalled();
  });
  it('schedules closure without deleting originals or invalidating the cancellation session', async () => {
    accounts.requestClosure.mockResolvedValue({
      closeRequestedAt: new Date(),
      closeAfter: new Date(Date.now() + 7 * 86_400_000),
    });
    await service.requestClosure(auth, { email: auth.user.email, password: 'password', confirm: true });
    expect(accounts.requestClosure).toHaveBeenCalledWith('owner', expect.any(Date), 'synthetic-hash', 'browser');
    expect(jobs.queue).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
    await service.cancelClosure(auth);
    expect(accounts.cancelClosure).toHaveBeenCalledWith('owner', expect.any(Date));
  });
  it('uses upstream deletion checks without bypassing its delay after grace expires', async () => {
    const closed = { id: 'synthetic-closed' };
    accounts.closeDue.mockResolvedValue([{ ...closed, closedSessionIds: ['closed-session'] }]);
    await service.processClosures();
    expect(events.emit).toHaveBeenCalledWith('UserTrash', closed);
    expect(events.emit).toHaveBeenCalledWith('SessionDelete', { sessionId: 'closed-session' });
    expect(jobs.queue).toHaveBeenCalledWith({ name: JobName.UserDeleteCheck });
  });
  it('revokes account export authorization after password changes', async () => {
    await service.onPasswordChange({ userId: 'owner' });
    expect(accounts.revokeExport).toHaveBeenCalledWith('owner');
  });
});
