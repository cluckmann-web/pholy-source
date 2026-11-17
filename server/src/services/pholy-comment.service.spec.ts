import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyCommentContextDto, PholyCommentCreateDto, PholyCommentListDto } from 'src/dtos/pholy-comment.dto.js';
import { PholyCommentRepository } from 'src/repositories/pholy-comment.repository.js';
import { PholyCommentService } from 'src/services/pholy-comment.service.js';

describe(PholyCommentService.name, () => {
  const auth = { user: { id: 'member', isAdmin: false }, session: { id: 'session' } } as AuthDto;
  const repository = { list: vi.fn(), create: vi.fn(), edit: vi.fn(), remove: vi.fn(), like: vi.fn(), avatar: vi.fn() };
  let service: PholyCommentService;
  beforeEach(() => {
    vi.resetAllMocks();
    service = new PholyCommentService(repository as unknown as PholyCommentRepository);
  });
  it('rejects shared links, API keys and absent sessions for every operation', async () => {
    for (const blocked of [
      { ...auth, session: undefined },
      { ...auth, apiKey: { id: 'key' } },
      { ...auth, sharedLink: { id: 'shared' } },
    ] as AuthDto[]) {
      expect(() => service.list(blocked, 'asset', { kind: 'private', offset: 0 })).toThrow(ForbiddenException);
      expect(() => service.create(blocked, 'asset', { kind: 'private', body: 'Hello' })).toThrow(ForbiddenException);
      expect(() => service.edit(blocked, 'asset', 'comment', { kind: 'private', body: 'Hello' })).toThrow(
        ForbiddenException,
      );
      expect(() => service.remove(blocked, 'asset', 'comment', { kind: 'private' })).toThrow(ForbiddenException);
      expect(() => service.like(blocked, 'asset', 'comment', { kind: 'private' }, true)).toThrow(ForbiddenException);
      await expect(service.avatar(blocked, 'asset', 'author', { kind: 'private' })).rejects.toThrow(ForbiddenException);
    }
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.avatar).not.toHaveBeenCalled();
  });
  it('derives the actor solely from the authenticated session', async () => {
    await service.create(auth, 'asset', { kind: 'community', profileSlug: 'public-gallery', body: 'Hello' });
    expect(repository.create).toHaveBeenCalledWith({ id: 'member', isAdmin: false }, 'asset', {
      kind: 'community',
      profileSlug: 'public-gallery',
      body: 'Hello',
    });
  });
  it('validates explicit context boundaries and rejects identity injection', () => {
    expect(PholyCommentCreateDto.schema.parse({ kind: 'private', body: '  Hello  ' }).body).toBe('Hello');
    for (const input of [
      { kind: 'private', body: ' ' },
      { kind: 'private', body: 'x'.repeat(2001) },
      { kind: 'private', body: 'Hello', authorId: 'member' },
      { kind: 'community', body: 'Hello' },
      { kind: 'album', body: 'Hello' },
      {
        kind: 'community',
        profileSlug: 'public-gallery',
        albumId: '00000000-0000-4000-8000-000000000001',
        body: 'Hello',
      },
    ])
      expect(PholyCommentCreateDto.schema.safeParse(input).success).toBe(false);
    expect(PholyCommentContextDto.schema.safeParse({ kind: 'private', profileSlug: 'public-gallery' }).success).toBe(
      false,
    );
    expect(PholyCommentListDto.schema.safeParse({ kind: 'private', offset: 501 }).success).toBe(false);
    expect(PholyCommentListDto.schema.safeParse({ kind: 'community', slug: 'public-gallery' }).success).toBe(false);
    expect(PholyCommentListDto.schema.parse({ kind: 'community', profileSlug: 'public-gallery' })).toEqual({
      kind: 'community',
      profileSlug: 'public-gallery',
      offset: 0,
    });
  });
  it('bounds avatar rendering and releases capacity after rendering failures', async () => {
    const work: { resolve: (buffer: Buffer) => void; reject: (error: Error) => void }[] = [];
    repository.avatar.mockImplementation(
      () =>
        new Promise<Buffer>((resolve, reject) => {
          work.push({ resolve, reject });
        }),
    );
    const results = Array.from({ length: 68 }, () => service.avatar(auth, 'asset', 'author', { kind: 'private' }));
    const first = expect(results[0]).rejects.toThrow('render failed');
    await vi.waitFor(() => expect(repository.avatar).toHaveBeenCalledTimes(4));
    await expect(service.avatar(auth, 'asset', 'author', { kind: 'private' })).rejects.toThrow(
      ServiceUnavailableException,
    );
    repository.avatar.mockResolvedValue(Buffer.from('avatar'));
    work[0].reject(new Error('render failed'));
    for (const task of work.slice(1)) task.resolve(Buffer.from('avatar'));
    await first;
    await Promise.all(results.slice(1));
    await expect(service.avatar(auth, 'asset', 'author', { kind: 'private' })).resolves.toEqual(Buffer.from('avatar'));
  });
});
