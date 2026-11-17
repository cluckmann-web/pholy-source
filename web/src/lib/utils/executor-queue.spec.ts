import { ExecutorQueue } from '#lib/utils/executor-queue.ts';

describe('ExecutorQueue', () => {
  it('runs every task and returns its result', async () => {
    const eq = new ExecutorQueue({ concurrency: 1 });
    const n1 = await eq.addTask(() => Promise.resolve(10));
    expect(n1).toBe(10);
    const n2 = await eq.addTask(() => Promise.resolve(11));
    expect(n2).toBe(11);
    const n3 = await eq.addTask(() => Promise.resolve(12));
    expect(n3).toBe(12);
  });

  it('starts the next task only when a running one finishes', async () => {
    vi.useFakeTimers();
    const eq = new ExecutorQueue({ concurrency: 3 });
    const started = vi.fn();
    const finished = vi.fn();
    const timed = (delay: number) =>
      new Promise<void>((resolve) => {
        started();
        setTimeout(() => {
          finished();
          resolve();
        }, delay);
      });

    void eq.addTask(() => timed(100));
    void eq.addTask(() => timed(200));
    void eq.addTask(() => timed(150));
    void eq.addTask(() => timed(200));

    expect(started).toHaveBeenCalledTimes(3);
    expect(finished).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(finished).toHaveBeenCalledTimes(1);
    expect(started).toHaveBeenCalledTimes(4);

    await vi.advanceTimersByTimeAsync(250);
    expect(finished).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });
});

describe('ExecutorQueue upload controls', () => {
  it('retains queued tasks during a pause and resumes them in order', async () => {
    const queue = new ExecutorQueue({ concurrency: 1 });
    queue.pause();
    const calls: number[] = [];
    const first = queue.addTask(() => {
      calls.push(1);
      return Promise.resolve(1);
    });
    const second = queue.addTask(() => {
      calls.push(2);
      return Promise.resolve(2);
    });
    expect(calls).toEqual([]);
    queue.resume();
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    expect(calls).toEqual([1, 2]);
  });

  it('settles a cancelled waiting task and continues with the next file', async () => {
    const queue = new ExecutorQueue({ concurrency: 1 });
    const cancelled = new AbortController();
    queue.pause();
    const task = vi.fn(() => Promise.resolve(1));
    const waiting = queue.addTask(task, { signal: cancelled.signal });
    const rejected = expect(waiting).rejects.toMatchObject({ name: 'AbortError' });
    const next = queue.addTask(() => Promise.resolve(2));
    cancelled.abort();
    await rejected;
    queue.resume();
    expect(await next).toBe(2);
    expect(task).not.toHaveBeenCalled();
  });

  it('does not strand the queue after an active task rejects', async () => {
    const queue = new ExecutorQueue({ concurrency: 1 });
    const failed = queue.addTask(() => Promise.reject(new DOMException('Cancelled', 'AbortError')));
    const next = queue.addTask(() => Promise.resolve(2));
    await expect(failed).rejects.toMatchObject({ name: 'AbortError' });
    await expect(next).resolves.toBe(2);
  });

  it('bounds concurrency to protect the server', () => {
    const queue = new ExecutorQueue({ concurrency: 50 });
    expect(queue.concurrency).toBe(6);
    queue.concurrency = 100;
    expect(queue.concurrency).toBe(6);
    queue.concurrency = 0;
    expect(queue.concurrency).toBe(1);
  });
});
