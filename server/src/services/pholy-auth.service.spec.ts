import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PholyResetPasswordDto } from 'src/dtos/pholy-auth.dto.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { PholyAuthRepository } from 'src/repositories/pholy-auth.repository.js';
import { PholyAuthService } from 'src/services/pholy-auth.service.js';
import { PholyMailService } from 'src/services/pholy-mail.service.js';

describe(PholyAuthService.name, () => {
  const repository = { issue: vi.fn(), isValid: vi.fn(), consume: vi.fn() };
  const crypto = { hashSha256: (value: string) => createHash('sha256').update(value).digest(), hashBcrypt: vi.fn() };
  const mail = { available: vi.fn(), send: vi.fn() };
  const events = { emit: vi.fn() };
  let service: PholyAuthService;
  beforeEach(() => {
    vi.resetAllMocks();
    mail.available.mockResolvedValue({ mailEnabled: true, passwordLoginEnabled: true });
    service = new PholyAuthService(
      repository as unknown as PholyAuthRepository,
      crypto as unknown as CryptoRepository,
      mail as unknown as PholyMailService,
      events as unknown as EventRepository,
    );
  });
  it('returns the same response without waiting for account lookup or SMTP', async () => {
    const { promise, resolve: finish } = Promise.withResolvers<{ email: string }>();
    repository.issue.mockReturnValue(promise);
    expect(await service.forgot({ email: 'member@example.test' }, 'one')).toEqual({ accepted: true });
    expect(mail.send).not.toHaveBeenCalled();
    finish({ email: 'member@example.test' });
    await vi.waitFor(() => expect(mail.send).toHaveBeenCalledOnce());
    const message = mail.send.mock.calls[0][0];
    const token = new URLSearchParams(new URL(message.actionUrl).hash.slice(1)).get('token')!;
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(repository.issue).toHaveBeenCalledWith('member@example.test', crypto.hashSha256(token));
  });
  it('does not disclose unknown accounts or disabled SMTP', async () => {
    repository.issue.mockResolvedValue(undefined);
    expect(await service.forgot({ email: 'unknown@example.test' }, 'one')).toEqual({ accepted: true });
    await Promise.resolve();
    expect(mail.send).not.toHaveBeenCalled();
    mail.available.mockResolvedValue({ mailEnabled: false, passwordLoginEnabled: true });
    expect(await service.forgot({ email: 'known@example.test' }, 'two')).toEqual({ accepted: true });
    expect(repository.issue).toHaveBeenCalledTimes(1);
  });
  it('throttles requests without disclosing whether an email exists', async () => {
    for (let i = 0; i < 5; i++) await service.forgot({ email: 'unknown@example.test' }, 'same-ip');
    await expect(service.forgot({ email: 'another@example.test' }, 'same-ip')).rejects.toMatchObject({ status: 429 });
  });
  it('does not bcrypt invalid tokens and refuses password login when disabled', async () => {
    repository.isValid.mockResolvedValue(false);
    await expect(
      service.reset({ token: 'a'.repeat(43), password: 'synthetic-password' }, 'one'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(crypto.hashBcrypt).not.toHaveBeenCalled();
    mail.available.mockResolvedValue({ mailEnabled: true, passwordLoginEnabled: false });
    await expect(
      service.reset({ token: 'a'.repeat(43), password: 'synthetic-password' }, 'two'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.isValid).toHaveBeenCalledTimes(1);
  });
  it('consumes once and notifies each revoked session only after commit', async () => {
    repository.isValid.mockResolvedValue(true);
    crypto.hashBcrypt.mockResolvedValue('synthetic-hash');
    repository.consume.mockResolvedValue({ userId: 'member', sessionIds: ['session-a', 'session-b'] });
    expect(await service.reset({ token: 'a'.repeat(43), password: 'synthetic-password' }, 'one')).toEqual({
      reset: true,
    });
    expect(repository.consume).toHaveBeenCalledWith(crypto.hashSha256('a'.repeat(43)), 'synthetic-hash');
    expect(events.emit.mock.calls).toEqual([
      ['AuthChangePassword', { userId: 'member', invalidateSessions: true }],
      ['SessionDelete', { sessionId: 'session-a' }],
      ['SessionDelete', { sessionId: 'session-b' }],
    ]);
  });
  it('rejects weak passwords, oversized multibyte passwords and injected identity', () => {
    const valid = { token: 'a'.repeat(43), password: 'synthetic-password' };
    expect(PholyResetPasswordDto.schema.safeParse(valid).success).toBe(true);
    for (const extra of [
      { password: 'short' },
      { password: 'ü'.repeat(40) },
      { userId: 'other' },
      { token: 'invalid' },
    ])
      expect(PholyResetPasswordDto.schema.safeParse({ ...valid, ...extra }).success).toBe(false);
  });
});
