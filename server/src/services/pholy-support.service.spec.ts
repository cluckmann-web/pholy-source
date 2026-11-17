import { ForbiddenException } from '@nestjs/common';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import {
  PholySupportCreateDto,
  PholySupportListDto,
  PholySupportReplyDto,
  PholySupportUpdateDto,
} from 'src/dtos/pholy-support.dto.js';
import { LoggingRepository } from 'src/repositories/logging.repository.js';
import { PholySupportRepository } from 'src/repositories/pholy-support.repository.js';
import { PholySupportService } from 'src/services/pholy-support.service.js';

describe(PholySupportService.name, () => {
  const member = { user: { id: '00000000-0000-4000-8000-000000000001', isAdmin: false } } as AuthDto;
  const admin = { user: { ...member.user, isAdmin: true } } as AuthDto;
  const shared = { ...admin, sharedLink: { id: 'shared' } } as AuthDto;
  const repository = {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    reply: vi.fn(),
    update: vi.fn(),
    cleanupResolved: vi.fn(),
  };
  const logger = { setContext: vi.fn(), warn: vi.fn() };
  let service: PholySupportService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new PholySupportService(
      repository as unknown as PholySupportRepository,
      logger as unknown as LoggingRepository,
    );
  });
  it('isolates retention failures and retries without logging private content', async () => {
    repository.cleanupResolved.mockRejectedValueOnce(new Error('private content')).mockResolvedValueOnce([]);
    await expect(service.cleanup()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('PHOLY support retention cleanup failed; it will retry on the next run.');
    await service.cleanup();
    expect(repository.cleanupResolved).toHaveBeenCalledTimes(2);
  });
  it('always scopes normal list and thread queries to their owner, including admins outside the admin route', async () => {
    await service.list(member, { offset: 0 });
    await service.get(admin, 'ticket');
    expect(repository.list).toHaveBeenCalledWith(member.user.id, { offset: 0 });
    expect(repository.get).toHaveBeenCalledWith('ticket', admin.user.id);
  });
  it('rejects every admin operation for members before storage access', () => {
    expect(() => service.list(member, { offset: 0 }, true)).toThrow(ForbiddenException);
    expect(() => service.get(member, 'ticket', true)).toThrow(ForbiddenException);
    expect(() => service.reply(member, 'ticket', { message: 'reply' }, true)).toThrow(ForbiddenException);
    expect(() => service.update(member, 'ticket', { status: 'resolved' })).toThrow(ForbiddenException);
    for (const method of Object.values(repository)) expect(method).not.toHaveBeenCalled();
  });
  it('rejects shared-link sessions even for an administrator', () => {
    expect(() => service.list(shared, { offset: 0 })).toThrow(ForbiddenException);
    expect(() => service.get(shared, 'ticket')).toThrow(ForbiddenException);
    expect(() => service.create(shared, { category: 'upload', subject: 'Test', message: 'Test details' })).toThrow(
      ForbiddenException,
    );
    expect(() => service.reply(shared, 'ticket', { message: 'reply' })).toThrow(ForbiddenException);
    expect(() => service.update(shared, 'ticket', { status: 'open' })).toThrow(ForbiddenException);
  });
  it('derives author and staff identity from authenticated context, never from input', async () => {
    await service.reply(member, 'ticket', { message: 'Member reply' });
    await service.reply(admin, 'ticket', { message: 'Staff reply' }, true);
    expect(repository.reply).toHaveBeenNthCalledWith(1, 'ticket', member.user.id, false, 'Member reply');
    expect(repository.reply).toHaveBeenNthCalledWith(2, 'ticket', admin.user.id, true, 'Staff reply');
  });
  it('lets authorized staff list all tickets and update status', async () => {
    await service.list(admin, { offset: 50, status: 'open' }, true);
    await service.update(admin, 'ticket', { status: 'resolved' });
    expect(repository.list).toHaveBeenCalledWith(undefined, { offset: 50, status: 'open' });
    expect(repository.update).toHaveBeenCalledWith('ticket', 'resolved');
  });
  it('rejects identity, status and staff injection at the DTO boundary', () => {
    const dto = { category: 'upload', subject: 'A problem', message: 'More details' };
    for (const extra of [{ userId: 'other' }, { status: 'resolved' }, { isStaff: true }]) {
      expect(PholySupportCreateDto.schema.safeParse({ ...dto, ...extra }).success).toBe(false);
    }
    expect(PholySupportReplyDto.schema.safeParse({ message: 'reply', isStaff: true }).success).toBe(false);
    expect(PholySupportUpdateDto.schema.safeParse({ status: 'deleted' }).success).toBe(false);
  });
  it('validates bounded content and pagination while trimming empty input', () => {
    const dto = { category: 'app', subject: '  Mobile issue ', message: '  Details here  ' };
    expect(PholySupportCreateDto.schema.parse(dto)).toEqual({
      category: 'app',
      subject: 'Mobile issue',
      message: 'Details here',
    });
    expect(PholySupportCreateDto.schema.safeParse({ ...dto, subject: 'x'.repeat(161) }).success).toBe(false);
    expect(PholySupportReplyDto.schema.safeParse({ message: 'x'.repeat(8001) }).success).toBe(false);
    expect(PholySupportReplyDto.schema.safeParse({ message: ' '.repeat(3) }).success).toBe(false);
    expect(PholySupportListDto.schema.safeParse({ offset: -1 }).success).toBe(false);
    expect(PholySupportListDto.schema.parse({ offset: '50' })).toEqual({ offset: 50 });
  });
});
