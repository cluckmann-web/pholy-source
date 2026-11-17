import { ForbiddenException, Injectable } from '@nestjs/common';
import { OnEvent } from 'src/decorators.js';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import type {
  PholySupportCreateDto,
  PholySupportListDto,
  PholySupportReplyDto,
  PholySupportUpdateDto,
} from 'src/dtos/pholy-support.dto.js';
import { ImmichWorker } from 'src/enum.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholySupportRepository } from 'src/repositories/pholy-support.repository.js';

@Injectable()
export class PholySupportService {
  private cleanupInterval?: NodeJS.Timeout;
  private cleaning = false;
  constructor(
    private repository: PholySupportRepository,
    private logger: LoggingRepository,
  ) {
    this.logger.setContext(PholySupportService.name);
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

  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      await this.repository.cleanupResolved();
    } catch {
      // Never include ticket content or SQL parameters in operational logs.
      this.logger.warn('PHOLY support retention cleanup failed; it will retry on the next run.');
    } finally {
      this.cleaning = false;
    }
  }
  private requireUser(auth: AuthDto, admin: boolean) {
    if (auth.sharedLink || !auth.user?.id || (admin && !auth.user.isAdmin)) throw new ForbiddenException();
  }
  list(auth: AuthDto, dto: PholySupportListDto, admin = false) {
    this.requireUser(auth, admin);
    return this.repository.list(admin ? undefined : auth.user.id, dto);
  }
  get(auth: AuthDto, id: string, admin = false) {
    this.requireUser(auth, admin);
    return this.repository.get(id, admin ? undefined : auth.user.id);
  }
  create(auth: AuthDto, dto: PholySupportCreateDto) {
    this.requireUser(auth, false);
    return this.repository.create(auth.user.id, dto);
  }
  reply(auth: AuthDto, id: string, dto: PholySupportReplyDto, admin = false) {
    this.requireUser(auth, admin);
    return this.repository.reply(id, auth.user.id, admin, dto.message);
  }
  update(auth: AuthDto, id: string, dto: PholySupportUpdateDto) {
    this.requireUser(auth, true);
    return this.repository.update(id, dto.status);
  }
}
