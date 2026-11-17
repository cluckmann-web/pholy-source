import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PHOLY_TERMS_VERSION,
  PholyInvitationAcceptDto,
  PholyInvitationCreateDto,
} from 'src/dtos/pholy-invitation.dto.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { PholyInvitationRepository } from 'src/repositories/pholy-invitation.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { PholyInvitationService } from 'src/services/pholy-invitation.service.js';

describe(PholyInvitationService.name, () => {
  const admin = { user: { id: '00000000-0000-4000-8000-000000000001', isAdmin: true } } as AuthDto;
  const member = { user: { ...admin.user, isAdmin: false } } as AuthDto;
  const token = 'a'.repeat(43);
  const dto: PholyInvitationAcceptDto = {
    token,
    name: 'Test Person',
    password: 'synthetic-test-password',
    termsAccepted: true as const,
    termsVersion: PHOLY_TERMS_VERSION,
  };
  const repo = { create: vi.fn(), list: vi.fn(), revoke: vi.fn(), findValid: vi.fn(), accept: vi.fn() };
  const crypto = { hashSha256: (value: string) => createHash('sha256').update(value).digest(), hashBcrypt: vi.fn() };
  const users = { get: vi.fn() };
  const events = { emit: vi.fn() };
  let service: PholyInvitationService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new PholyInvitationService(
      repo as unknown as PholyInvitationRepository,
      crypto as unknown as CryptoRepository,
      users as unknown as UserRepository,
      events as unknown as EventRepository,
    );
  });
  it('blocks non-admin invitation management', async () => {
    await expect(service.list(member)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create(member, { email: 'person@example.test', quotaGiB: 100 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.revoke(member, admin.user.id)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.list).not.toHaveBeenCalled();
    expect(repo.revoke).not.toHaveBeenCalled();
  });
  it('issues a seven-day email-bound link and stores only its hash', async () => {
    repo.create.mockResolvedValue({ id: 'invitation' });
    const start = Date.now();
    const result = await service.create(admin, { email: 'person@example.test', quotaGiB: 100 });
    const raw = new URLSearchParams(new URL(result.url).hash.slice(1)).get('invitation')!;
    expect(raw).toMatch(/^[\w-]{43}$/);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'person@example.test',
        createdBy: admin.user.id,
        tokenHash: crypto.hashSha256(raw),
        quotaSizeInBytes: 100 * 1024 ** 3,
      }),
    );
    const saved = repo.create.mock.calls[0][0];
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(start + 7 * 86_400_000);
    expect(saved).not.toHaveProperty('token');
  });
  it('does not hash a password for an invalid invitation', async () => {
    repo.findValid.mockResolvedValue(undefined);
    await expect(service.accept(dto, '127.0.0.1')).rejects.toBeInstanceOf(BadRequestException);
    expect(crypto.hashBcrypt).not.toHaveBeenCalled();
    expect(repo.accept).not.toHaveBeenCalled();
  });
  it('hashes passwords and records the accepted terms version', async () => {
    repo.findValid.mockResolvedValue({ email: 'person@example.test' });
    crypto.hashBcrypt.mockResolvedValue('hash');
    repo.accept.mockResolvedValue({ id: 'user' });
    users.get.mockResolvedValue({ id: 'user' });
    expect(await service.accept(dto, '127.0.0.1')).toEqual({ registered: true });
    expect(repo.accept).toHaveBeenCalledWith({
      tokenHash: crypto.hashSha256(token),
      passwordHash: 'hash',
      name: dto.name,
      termsVersion: PHOLY_TERMS_VERSION,
    });
    expect(events.emit).toHaveBeenCalledWith('UserCreate', { id: 'user' });
  });
  it('rate-limits public attempts without querying storage again', async () => {
    repo.findValid.mockResolvedValue(undefined);
    for (let i = 0; i < 30; i++)
      await expect(service.preview(token, '127.0.0.2')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.preview(token, '127.0.0.2')).rejects.toMatchObject({ status: 429 });
    expect(repo.findValid).toHaveBeenCalledTimes(30);
  });
  it('rejects role/email injection and missing agreement', () => {
    for (const extra of [
      { isAdmin: true },
      { email: 'other@example.test' },
      { termsAccepted: false },
      { termsVersion: 'old' },
      { password: 'short' },
      { password: 'ü'.repeat(40) },
    ]) {
      expect(PholyInvitationAcceptDto.schema.safeParse({ ...dto, ...extra }).success).toBe(false);
    }
    expect(PholyInvitationAcceptDto.schema.safeParse(dto).success).toBe(true);
    expect(PholyInvitationCreateDto.schema.parse({ email: 'Person@EXAMPLE.test' })).toEqual({
      email: 'person@example.test',
      quotaGiB: null,
    });
  });
});
