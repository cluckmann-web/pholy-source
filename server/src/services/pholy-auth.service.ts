import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SALT_ROUNDS } from 'src/constants.js';
import { PholyForgotPasswordDto, PholyResetPasswordDto } from 'src/dtos/pholy-auth.dto.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { PHOLY_RESET_INVALID, PholyAuthRepository } from 'src/repositories/pholy-auth.repository.js';
import { PholyMailService } from 'src/services/pholy-mail.service.js';

@Injectable()
export class PholyAuthService {
  private attempts = new Map<string, { count: number; until: number }>();
  private pending = 0;
  constructor(
    private repository: PholyAuthRepository,
    private crypto: CryptoRepository,
    private mail: PholyMailService,
    private events: EventRepository,
  ) {}

  status() {
    return this.mail.available();
  }

  private throttle(ip: string, kind: 'request' | 'reset') {
    const now = Date.now();
    for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
    const key = kind + ':' + this.crypto.hashSha256(ip).toString('hex');
    const entry = this.attempts.get(key) ?? { count: 0, until: now + 15 * 60_000 };
    if (entry.count >= (kind === 'request' ? 5 : 20) || (!this.attempts.has(key) && this.attempts.size >= 10_000))
      throw new HttpException(
        'Zu viele Versuche. Bitte versuche es in 15 Minuten erneut.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    entry.count++;
    this.attempts.set(key, entry);
  }

  async forgot(dto: PholyForgotPasswordDto, ip: string) {
    this.throttle(ip, 'request');
    const availability = await this.mail.available();
    // Same response regardless of existence, OAuth-only accounts, SMTP state or delivery outcome.
    if (availability.mailEnabled && availability.passwordLoginEnabled && this.pending < 50) {
      this.pending++;
      // Schedule lookup and SMTP together after the response path, avoiding account-dependent response timing.
      void this.sendReset(dto.email)
        .catch(() => {})
        .finally(() => this.pending--);
    }
    return { accepted: true };
  }

  private async sendReset(email: string) {
    const token = randomBytes(32).toString('base64url');
    const account = await this.repository.issue(email, this.crypto.hashSha256(token));
    if (!account) return;
    await this.mail.send({
      to: account.email,
      subject: 'PHOLY – Passwort zurücksetzen',
      title: 'Dein neues Passwort',
      message:
        'Du hast einen Link zum Zurücksetzen deines PHOLY-Passworts angefordert. Der Link ist 30 Minuten gültig und kann einmal verwendet werden. Nach dem Zurücksetzen werden deine angemeldeten Geräte abgemeldet.\n\nFalls du dies nicht angefordert hast, ignoriere diese E-Mail. Dein Passwort bleibt unverändert.',
      actionLabel: 'Passwort zurücksetzen',
      actionUrl: 'https://pholy.de/auth/reset-password#token=' + token,
    });
  }

  async reset(dto: PholyResetPasswordDto, ip: string) {
    this.throttle(ip, 'reset');
    const availability = await this.mail.available();
    if (!availability.passwordLoginEnabled) throw new BadRequestException(PHOLY_RESET_INVALID);
    const tokenHash = this.crypto.hashSha256(dto.token);
    if (!(await this.repository.isValid(tokenHash))) throw new BadRequestException(PHOLY_RESET_INVALID);
    const password = await this.crypto.hashBcrypt(dto.password, SALT_ROUNDS);
    const result = await this.repository.consume(tokenHash, password);
    await this.events.emit('AuthChangePassword', { userId: result.userId, invalidateSessions: true });
    for (const sessionId of result.sessionIds) await this.events.emit('SessionDelete', { sessionId });
    return { reset: true };
  }
}
