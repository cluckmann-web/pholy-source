import { UploadCleanupTracker } from '#lib/utils/upload-cleanup.ts';
import { describe, expect, it, vi } from 'vitest';

describe('upload cancellation cleanup', () => {
  it('holds an immediate resume until a delayed deletion finishes', async () => {
    const cleanup = new UploadCleanupTracker();
    let finish!: () => void;
    const remove = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const deletion = cleanup.run('session', remove);
    const resume = vi.fn();
    const resumed = cleanup.wait('session').then(resume);
    await Promise.resolve();
    expect(resume).not.toHaveBeenCalled();
    expect(cleanup.run('session', remove)).toBe(deletion);
    expect(remove).toHaveBeenCalledOnce();
    finish();
    await resumed;
    expect(resume).toHaveBeenCalledOnce();
  });

  it('does not resume while failed deletion is still being retried', async () => {
    const cleanup = new UploadCleanupTracker();
    let fail!: (reason: Error) => void;
    const deletion = cleanup.run(
      'session',
      () =>
        new Promise<void>((_, reject) => {
          fail = reject;
        }),
    );
    const deleted = expect(deletion).rejects.toThrow('offline');
    const waiting = expect(cleanup.wait('session')).rejects.toThrow('offline');
    fail(new Error('offline'));
    await Promise.all([deleted, waiting]);
    // Once deletion has settled there cannot be a delayed DELETE affecting a subsequent resume.
    await expect(cleanup.wait('session')).resolves.toBeUndefined();
  });
});
