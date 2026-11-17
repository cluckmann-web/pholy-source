/** Serializes cancellation cleanup with any attempt to reuse a resumable session. */
export class UploadCleanupTracker {
  private pending = new Map<string, Promise<void>>();

  run(id: string, operation: () => Promise<void>) {
    const existing = this.pending.get(id);
    if (existing) {
      return existing;
    }
    const promise = operation().finally(() => this.pending.delete(id));
    this.pending.set(id, promise);
    return promise;
  }

  async wait(id: string) {
    await this.pending.get(id);
  }
}
