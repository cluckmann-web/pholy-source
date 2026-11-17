import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { SALT_ROUNDS } from 'src/constants.js';
import { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PHOLY_TERMS_VERSION,
  PholyInvitationAcceptDto,
  PholyInvitationCreateDto,
} from 'src/dtos/pholy-invitation.dto.js';
import { CryptoRepository } from 'src/repositories/crypto.repository.js';
import { EventRepository } from 'src/repositories/event.repository.js';
import { PHOLY_INVITATION_INVALID, PholyInvitationRepository } from 'src/repositories/pholy-invitation.repository.js';
import { UserRepository } from 'src/repositories/user.repository.js';
import { PholyMailService } from 'src/services/pholy-mail.service.js';

@Injectable()
export class PholyInvitationService {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private invitations: PholyInvitationRepository,
    private crypto: CryptoRepository,
    private users: UserRepository,
    private events: EventRepository,
    private mail: PholyMailService,
  ) {}

  private requireAdmin(auth: AuthDto) {
    if (!auth.user.isAdmin || auth.sharedLink) throw new ForbiddenException('Administrator access required');
  }

  private throttle(ip: string) {
    const now = Date.now();
    for (const [key, value] of this.attempts) if (value.until <= now) this.attempts.delete(key);
    const key = this.crypto.hashSha256(ip).toString('hex');
    const attempt = this.attempts.get(key) ?? { count: 0, until: now + 60_000 };
    if (attempt.count >= 30 || (!this.attempts.has(key) && this.attempts.size >= 10_000)) {
      throw new HttpException('Zu viele Versuche. Bitte warte eine Minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    attempt.count++;
    this.attempts.set(key, attempt);
  }

  async list(auth: AuthDto) {
    this.requireAdmin(auth);
    return this.invitations.list();
  }

  async create(auth: AuthDto, dto: PholyInvitationCreateDto) {
    this.requireAdmin(auth);
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.create({
      email: dto.email,
      createdBy: auth.user.id,
      tokenHash: this.crypto.hashSha256(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      mailStatus: dto.sendEmail ? 'sending' : 'not_sent',
      mailAttemptedAt: dto.sendEmail ? new Date() : null,
      quotaSizeInBytes: dto.quotaGiB === null ? null : dto.quotaGiB * 1024 ** 3,
    });
    if (dto.sendEmail) return this.deliver(invitation, token);
    return { ...invitation, url: 'https://pholy.de/auth/register#invitation=' + token };
  }

  async send(auth: AuthDto, id: string) {
    this.requireAdmin(auth);
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.invitations.rotateForMail(id, this.crypto.hashSha256(token));
    return this.deliver(invitation, token);
  }

  private async deliver(invitation: { id: string; email: string }, token: string) {
    const url = 'https://pholy.de/auth/register#invitation=' + token;
    const result = await this.mail.send({
      to: invitation.email,
      subject: 'Deine Einladung zu PHOLY',
      title: 'Dein Platz für Erinnerungen',
      message:
        'Du bist zu PHOLY eingeladen. Erstelle dein kostenloses Konto über den folgenden Link. Die Einladung ist sieben Tage gültig und nur für diese E-Mail-Adresse bestimmt.\n\nNach der Registrierung kannst du auch die Immich-App für iOS oder Android nutzen. Die Serveradresse lautet https://pholy.de.',
      actionLabel: 'Einladung annehmen',
      actionUrl: url,
    });
    const updated = await this.invitations.finishMail(invitation.id, this.crypto.hashSha256(token), result.status);
    return { ...updated, url };
  }

  async revoke(auth: AuthDto, id: string) {
    this.requireAdmin(auth);
    if (!(await this.invitations.revoke(id)))
      throw new NotFoundException('Einladung nicht gefunden oder bereits verwendet.');
  }

  async preview(token: string, ip: string) {
    this.throttle(ip);
    const invitation = await this.invitations.findValid(this.crypto.hashSha256(token));
    if (!invitation) throw new BadRequestException(PHOLY_INVITATION_INVALID);
    return {
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      quotaSizeInBytes: invitation.quotaSizeInBytes,
      termsVersion: PHOLY_TERMS_VERSION,
    };
  }

  async accept(dto: PholyInvitationAcceptDto, ip: string) {
    this.throttle(ip);
    const tokenHash = this.crypto.hashSha256(dto.token);
    if (!(await this.invitations.findValid(tokenHash))) throw new BadRequestException(PHOLY_INVITATION_INVALID);
    const passwordHash = await this.crypto.hashBcrypt(dto.password, SALT_ROUNDS);
    const { id } = await this.invitations.accept({
      tokenHash,
      passwordHash,
      name: dto.name,
      termsVersion: PHOLY_TERMS_VERSION,
    });
    const user = await this.users.get(id, {});
    if (user) await this.events.emit('UserCreate', user);
    return { registered: true };
  }
}
