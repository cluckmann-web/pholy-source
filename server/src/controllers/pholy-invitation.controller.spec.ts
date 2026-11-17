import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { PholyInvitationController } from 'src/controllers/pholy-invitation.controller.js';
import { PHOLY_TERMS_VERSION } from 'src/dtos/pholy-invitation.dto.js';
import { PholyInvitationService } from 'src/services/pholy-invitation.service.js';
import { controllerSetup, type ControllerContext } from 'test/utils.js';

describe(PholyInvitationController.name, () => {
  let ctx: ControllerContext;
  const service = { list: vi.fn(), create: vi.fn(), revoke: vi.fn(), preview: vi.fn(), accept: vi.fn(), send: vi.fn() };
  beforeAll(async () => {
    ctx = await controllerSetup(PholyInvitationController, [{ provide: PholyInvitationService, useValue: service }]);
    return () => ctx.close();
  });
  beforeEach(() => {
    ctx.reset();
    vi.clearAllMocks();
  });
  it.each(['get', 'post', 'delete'] as const)('protects %s administration', async (method) => {
    ctx.authenticate.mockRejectedValue(new UnauthorizedException());
    const path = '/pholy/invitations' + (method === 'delete' ? '/00000000-0000-4000-8000-000000000001' : '');
    const result = await request(ctx.getHttpServer())[method](path).send({ email: 'test@example.test' });
    expect(result.status).toBe(401);
    expect(service.create).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(service.revoke).not.toHaveBeenCalled();
  });
  it('protects the resend endpoint with administrator authentication', async () => {
    ctx.authenticate.mockRejectedValue(new UnauthorizedException());
    const result = await request(ctx.getHttpServer()).post(
      '/pholy/invitations/00000000-0000-4000-8000-000000000001/send',
    );
    expect(result.status).toBe(401);
    expect(service.send).not.toHaveBeenCalled();
  });
  it('requires admin authentication policy', async () => {
    ctx.authenticate.mockRejectedValue(new ForbiddenException());
    const result = await request(ctx.getHttpServer()).get('/pholy/invitations');
    expect(result.status).toBe(403);
    expect(ctx.authenticate).toHaveBeenCalled();
  });
  it('rejects registration without a valid-shaped token', async () => {
    const result = await request(ctx.getHttpServer()).post('/pholy/invitations/accept').send({
      name: 'Person',
      password: 'long-enough-password',
      termsAccepted: true,
      termsVersion: PHOLY_TERMS_VERSION,
    });
    expect(result.status).toBe(400);
    expect(service.accept).not.toHaveBeenCalled();
  });
  it('makes public preview non-cacheable', async () => {
    service.preview.mockResolvedValue({ email: 'person@example.test' });
    const result = await request(ctx.getHttpServer())
      .post('/pholy/invitations/preview')
      .send({ token: 'a'.repeat(43) });
    expect(result.status).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(ctx.authenticate).not.toHaveBeenCalled();
  });
  it('rejects injected admin privilege at the HTTP boundary', async () => {
    const result = await request(ctx.getHttpServer())
      .post('/pholy/invitations/accept')
      .send({
        token: 'a'.repeat(43),
        name: 'Person',
        password: 'long-enough-password',
        termsAccepted: true,
        termsVersion: PHOLY_TERMS_VERSION,
        isAdmin: true,
      });
    expect(result.status).toBe(400);
    expect(service.accept).not.toHaveBeenCalled();
  });
});
