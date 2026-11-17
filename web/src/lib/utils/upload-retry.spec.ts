import { retryUploadRequest } from '#lib/utils/upload-retry.ts';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('upload retry', () => {
  afterEach(() => vi.useRealTimers());

  it('retries a lost connection with backoff and returns the result once', async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ statusCode: 0 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValue('saved');
    const onRetry = vi.fn();
    const pending = retryUploadRequest(operation, { signal: new AbortController().signal, onRetry });
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4000);
    await expect(pending).resolves.toBe('saved');
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 409, 413, 415])('never retries permanent HTTP %s failures', async (statusCode) => {
    const error = { statusCode };
    const operation = vi.fn().mockRejectedValue(error);
    await expect(retryUploadRequest(operation, { signal: new AbortController().signal })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('stops after three transient retries', async () => {
    vi.useFakeTimers();
    const error = { statusCode: 503 };
    const operation = vi.fn().mockRejectedValue(error);
    const pending = expect(retryUploadRequest(operation, { signal: new AbortController().signal })).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await pending;
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('cancels a backoff immediately without another request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const operation = vi.fn().mockRejectedValue({ statusCode: 503 });
    const pending = expect(retryUploadRequest(operation, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await pending;
    await vi.runAllTimersAsync();
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
