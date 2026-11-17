import { UnauthorizedException } from '@nestjs/common';
import request from 'supertest';
import { PholyUploadController } from 'src/controllers/pholy-upload.controller.js';
import type { AuthDto } from 'src/dtos/auth.dto.js';
import { PholyUploadService } from 'src/services/pholy-upload.service.js';
import { controllerSetup, type ControllerContext } from 'test/utils.js';

describe(PholyUploadController.name, () => {
  let ctx: ControllerContext;
  const id = '00000000-0000-4000-8000-000000000001';
  const auth = { user: { id } } as AuthDto;
  const service = {
    create: vi.fn(),
    get: vi.fn(),
    append: vi.fn(),
    complete: vi.fn(),
    cancel: vi.fn(),
    status: vi.fn(),
  };
  const dto = {
    fileName: 'test.jpg',
    fileSize: 5,
    fileModifiedAt: '2026-11-17T00:00:00Z',
    mimeType: 'image/jpeg',
    checksum: 'a'.repeat(40),
  };
  beforeAll(async () => {
    ctx = await controllerSetup(PholyUploadController, [{ provide: PholyUploadService, useValue: service }]);
    return () => ctx.close();
  });
  beforeEach(() => {
    ctx.reset();
    vi.clearAllMocks();
    ctx.authenticate.mockResolvedValue(auth);
  });

  it.each([
    ['post', '/sessions'],
    ['get', `/sessions/${id}`],
    ['patch', `/sessions/${id}`],
    ['post', `/sessions/${id}/complete`],
    ['delete', `/sessions/${id}`],
    ['get', `/assets/${id}/status`],
  ] as const)('requires authentication for %s %s', async (method, path) => {
    ctx.authenticate.mockRejectedValue(new UnauthorizedException());
    const response = await request(ctx.getHttpServer())[method](`/pholy/uploads${path}`).send(dto);
    expect(response.status).toBe(401);
  });

  it.each([
    { fileName: '../test.jpg' },
    { fileName: String.raw`folder\test.jpg` },
    { fileSize: -1 },
    { fileSize: 1.5 },
    { fileSize: Number.MAX_SAFE_INTEGER },
    { checksum: 'invalid' },
    { ownerId: id },
    { originalPath: '/etc/example' },
    { fileModifiedAt: 'invalid' },
  ])('validates untrusted upload metadata: %j', async (invalid) => {
    const response = await request(ctx.getHttpServer())
      .post('/pholy/uploads/sessions')
      .send({ ...dto, ...invalid });
    expect(response.status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('streams octet-stream bytes to the service without JSON parsing', async () => {
    service.append.mockImplementation(async (_auth, _id, offset, length, stream) => {
      const buffers = await Array.fromAsync(stream as AsyncIterable<Buffer>);
      expect(Buffer.concat(buffers)).toEqual(Buffer.from([0, 1, 2, 255]));
      return { offset: offset + length };
    });
    const response = await request(ctx.getHttpServer())
      .patch(`/pholy/uploads/sessions/${id}`)
      .set('Content-Type', 'application/octet-stream')
      .set('Upload-Offset', '8')
      .send(Buffer.from([0, 1, 2, 255]));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ offset: 12 });
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it.each(['-1', '1.5', '0junk', ''])('rejects invalid offset %j before consuming a chunk', async (offset) => {
    const response = await request(ctx.getHttpServer())
      .patch(`/pholy/uploads/sessions/${id}`)
      .set('Content-Type', 'application/octet-stream')
      .set('Upload-Offset', offset)
      .send(Buffer.from('test'));
    expect(response.status).toBe(400);
    expect(service.append).not.toHaveBeenCalled();
  });

  it('rejects compressed and non-binary bodies', async () => {
    const response = await request(ctx.getHttpServer())
      .patch(`/pholy/uploads/sessions/${id}`)
      .set('Upload-Offset', '0')
      .send({ bytes: 'test' });
    expect(response.status).toBe(400);
    const compressed = await request(ctx.getHttpServer())
      .patch(`/pholy/uploads/sessions/${id}`)
      .set('Upload-Offset', '0')
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Encoding', 'gzip')
      .send(Buffer.from('test'));
    expect(compressed.status).toBe(400);
    expect(service.append).not.toHaveBeenCalled();
  });

  it('returns native completion JSON and cancellation without a response body', async () => {
    service.complete.mockResolvedValue({ id, status: 'created' });
    const completed = await request(ctx.getHttpServer()).post(`/pholy/uploads/sessions/${id}/complete`);
    expect(completed.status).toBe(200);
    expect(completed.body).toEqual({ id, status: 'created' });
    const cancelled = await request(ctx.getHttpServer()).delete(`/pholy/uploads/sessions/${id}`);
    expect(cancelled.status).toBe(204);
    expect(cancelled.text).toBe('');
  });
});
