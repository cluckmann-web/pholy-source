interface Options {
  concurrency: number;
}

type Task = { run: () => Promise<void>; cancel: () => void };

/** A bounded, pausable queue. Cancelling a waiting task always settles its promise. */
export class ExecutorQueue {
  private queue: Task[] = [];
  private running = 0;
  private _concurrency: number;
  private paused = false;

  constructor(options?: Options) {
    this._concurrency = Math.min(6, Math.max(1, Math.floor(options?.concurrency || 2)));
  }

  get concurrency() {
    return this._concurrency;
  }

  set concurrency(value: number) {
    if (!Number.isFinite(value)) {
      return;
    }
    this._concurrency = Math.min(6, Math.max(1, Math.floor(value)));
    this.tryRun();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.tryRun();
  }

  addTask<T>(task: () => Promise<T>, options: { signal?: AbortSignal } = {}): Promise<T> {
    const { signal } = options;
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Cancelled', 'AbortError'));
        return;
      }
      const entry: Task = {
        cancel: () => {
          const index = this.queue.indexOf(entry);
          if (index !== -1) {
            this.queue.splice(index, 1);
            signal?.removeEventListener('abort', entry.cancel);
            reject(new DOMException('Cancelled', 'AbortError'));
          }
        },
        run: async () => {
          signal?.removeEventListener('abort', entry.cancel);
          this.running++;
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          } finally {
            this.running--;
            this.tryRun();
          }
        },
      };
      signal?.addEventListener('abort', entry.cancel, { once: true });
      this.queue.push(entry);
      this.tryRun();
    });
  }

  private tryRun() {
    while (!this.paused && this.running < this.concurrency) {
      const task = this.queue.shift();
      if (!task) {
        return;
      }
      void task.run();
    }
  }
}
