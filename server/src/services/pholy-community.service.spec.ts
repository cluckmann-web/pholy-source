import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyCommunityProfileDto, PholyCommunityReportDto } from 'src/dtos/pholy-community.dto.js';
import { PholyCommunityRepository } from 'src/repositories/pholy-community.repository.js';
import { PholyCommunityService } from 'src/services/pholy-community.service.js';

describe(PholyCommunityService.name, () => {
  const user = { user: { id: '00000000-0000-4000-8000-000000000001', isAdmin: false } } as AuthDto;
  const admin = { user: { ...user.user, isAdmin: true } } as AuthDto;
  const shared = { ...user, sharedLink: { id: 'shared' } } as AuthDto;
  const profile = { slug: 'synthetic-gallery', displayName: 'Synthetic', bio: '', published: false, assetIds: [] };
  const repository = {
    getMine: vi.fn(),
    picker: vi.fn(),
    save: vi.fn(),
    unpublish: vi.fn(),
    follow: vi.fn(),
    report: vi.fn(),
    moderation: vi.fn(),
    moderate: vi.fn(),
    thumbnail: vi.fn(),
  };
  let service: PholyCommunityService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new PholyCommunityService(repository as unknown as PholyCommunityRepository);
  });
  it('does not allow shared-link sessions to publish, follow, report or manage a profile', () => {
    for (const action of [
      () => service.getMine(shared),
      () => service.picker(shared, 0),
      () => service.save(shared, profile),
      () => service.unpublish(shared),
      () => service.follow(shared, profile.slug, true),
      () =>
        service.report(shared, {
          slug: profile.slug,
          assetId: null,
          reason: 'privacy',
          details: 'Synthetic privacy report',
        }),
    ])
      expect(action).toThrow(ForbiddenException);
    expect(repository.save).not.toHaveBeenCalled();
    expect(repository.follow).not.toHaveBeenCalled();
    expect(repository.report).not.toHaveBeenCalled();
  });
  it('uses only the authenticated user for profile changes and immediate opt-out', async () => {
    await service.save(user, profile);
    await service.unpublish(user);
    expect(repository.save).toHaveBeenCalledWith(user.user.id, profile);
    expect(repository.unpublish).toHaveBeenCalledWith(user.user.id);
  });
  it('requires administrator rights for report access and moderation', () => {
    expect(() => service.moderation(user)).toThrow(ForbiddenException);
    expect(() => service.moderate(user, 'report', { action: 'disable_profile' })).toThrow(ForbiddenException);
    expect(repository.moderation).not.toHaveBeenCalled();
    expect(repository.moderate).not.toHaveBeenCalled();
  });
  it('attributes moderation to the authenticated administrator', async () => {
    await service.moderate(admin, 'report', { action: 'hide_asset' });
    expect(repository.moderate).toHaveBeenCalledWith(admin.user.id, 'report', { action: 'hide_asset' });
  });
  it('queues visible gallery photos fairly and releases a permit when a render fails', async () => {
    const renderers = new Map<string, { resolve: (value: Buffer) => void; reject: (error: Error) => void }>();
    repository.thumbnail.mockImplementation(
      (_, id: string) =>
        new Promise<Buffer>((resolve, reject) => {
          renderers.set(id, { resolve, reject });
        }),
    );
    const work = Array.from({ length: 6 }, (_, index) => service.thumbnail(profile.slug, String(index)));
    const firstResult = expect(work[0]).rejects.toThrow('synthetic render failure');
    await vi.waitFor(() => expect(repository.thumbnail).toHaveBeenCalledTimes(4));
    expect(renderers.keys().toArray()).toEqual(['0', '1', '2', '3']);
    renderers.get('0')!.reject(new Error('synthetic render failure'));
    await firstResult;
    await vi.waitFor(() => expect(repository.thumbnail).toHaveBeenCalledTimes(5));
    expect(renderers.keys().toArray()).toEqual(['0', '1', '2', '3', '4']);
    renderers.get('1')!.resolve(Buffer.from('synthetic'));
    await work[1];
    await vi.waitFor(() => expect(repository.thumbnail).toHaveBeenCalledTimes(6));
    expect(renderers.keys().toArray()).toEqual(['0', '1', '2', '3', '4', '5']);
    for (const id of ['2', '3', '4', '5']) renderers.get(id)!.resolve(Buffer.from('synthetic'));
    await Promise.all(work.slice(1));
  });
  it('bounds queued render work and becomes usable again after draining the queue', async () => {
    const finish: ((value: Buffer) => void)[] = [];
    repository.thumbnail.mockImplementation(
      () =>
        new Promise<Buffer>((resolve) => {
          finish.push(resolve);
        }),
    );
    const work = Array.from({ length: 68 }, (_, index) => service.thumbnail(profile.slug, String(index)));
    await vi.waitFor(() => expect(repository.thumbnail).toHaveBeenCalledTimes(4));
    await expect(service.thumbnail(profile.slug, 'overload')).rejects.toBeInstanceOf(ServiceUnavailableException);
    repository.thumbnail.mockResolvedValue(Buffer.from('queued'));
    for (const resolve of finish) resolve(Buffer.from('first'));
    await Promise.all(work);
    expect(repository.thumbnail).toHaveBeenCalledTimes(68);
    await expect(service.thumbnail(profile.slug, 'after-drain')).resolves.toEqual(Buffer.from('queued'));
  });
  it('rejects privilege and location injection and malformed public addresses', () => {
    for (const extra of [
      { blocked: false },
      { userId: user.user.id },
      { email: 'private@example.test' },
      { latitude: 12 },
    ]) {
      expect(PholyCommunityProfileDto.schema.safeParse({ ...profile, ...extra }).success).toBe(false);
    }
    for (const slug of ['../private', 'http://example.test', 'ab', 'MixedCase', 'with space']) {
      expect(PholyCommunityProfileDto.schema.safeParse({ ...profile, slug }).success).toBe(false);
    }
    expect(
      PholyCommunityProfileDto.schema.safeParse({
        ...profile,
        assetIds: Array.from({ length: 101 }, () => user.user.id),
      }).success,
    ).toBe(false);
    expect(
      PholyCommunityProfileDto.schema.safeParse({ ...profile, assetIds: [user.user.id, user.user.id] }).success,
    ).toBe(false);
  });
  it('requires meaningful bounded reports and prevents impersonating the reporter', () => {
    const report = { slug: profile.slug, assetId: null, reason: 'privacy', details: 'Synthetic privacy concern' };
    expect(PholyCommunityReportDto.schema.safeParse(report).success).toBe(true);
    expect(PholyCommunityReportDto.schema.safeParse({ ...report, reporterId: user.user.id }).success).toBe(false);
    expect(PholyCommunityReportDto.schema.safeParse({ ...report, details: '' }).success).toBe(false);
    expect(PholyCommunityReportDto.schema.safeParse({ ...report, details: 'x'.repeat(2001) }).success).toBe(false);
  });
});
