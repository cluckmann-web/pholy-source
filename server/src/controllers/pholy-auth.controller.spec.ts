import request from 'supertest';
import { PholyAuthController } from 'src/controllers/pholy-auth.controller.js';
import { PholyAuthService } from 'src/services/pholy-auth.service.js';
import { controllerSetup, type ControllerContext } from 'test/utils.js';

describe(PholyAuthController.name, () => {
  let ctx: ControllerContext;
  const service = { status: vi.fn(), forgot: vi.fn(), reset: vi.fn() };
  beforeAll(async () => {
    ctx = await controllerSetup(PholyAuthController, [{ provide: PholyAuthService, useValue: service }]);
    return () => ctx.close();
  });
  beforeEach(() => {
    ctx.reset();
    vi.clearAllMocks();
  });
  it('accepts public reset requests without revealing account state and disables caching', async () => {
    service.forgot.mockResolvedValue({ accepted: true });
    const result = await request(ctx.getHttpServer())
      .post('/pholy/auth/forgot-password')
      .send({ email: 'Person@EXAMPLE.test' });
    expect(result.status).toBe(202);
    expect(result.body).toEqual({ accepted: true });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(ctx.authenticate).not.toHaveBeenCalled();
    expect(service.forgot).toHaveBeenCalledWith({ email: 'person@example.test' }, expect.any(String));
  });
  it('reports only mail/password availability without authentication or caching', async () => {
    service.status.mockResolvedValue({ mailEnabled: true, passwordLoginEnabled: true });
    const result = await request(ctx.getHttpServer()).get('/pholy/auth/status');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ mailEnabled: true, passwordLoginEnabled: true });
    expect(result.headers['cache-control']).toBe('no-store');
    expect(ctx.authenticate).not.toHaveBeenCalled();
  });
  it('clears browser authentication cookies after consuming a valid reset link', async () => {
    service.reset.mockResolvedValue({ reset: true });
    const result = await request(ctx.getHttpServer())
      .post('/pholy/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'synthetic-password' });
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ reset: true });
    expect(result.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^immich_access_token=;/),
        expect.stringMatching(/^immich_is_authenticated=;/),
      ]),
    );
  });
  it('rejects identity injection and malformed tokens before consuming anything', async () => {
    const result = await request(ctx.getHttpServer())
      .post('/pholy/auth/reset-password')
      .send({ token: 'a'.repeat(43), password: 'synthetic-password', userId: 'another-account' });
    expect(result.status).toBe(400);
    expect(service.reset).not.toHaveBeenCalled();
  });
});
