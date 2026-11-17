export const getUploadErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) {
    return;
  }
  const value = error as { status?: number; statusCode?: number };
  return value.statusCode ?? value.status;
};

export const isUploadAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

export const isTransientUploadError = (error: unknown) => {
  // These are the browser fetch transport failures used by the SDK. Other TypeErrors may be programming errors.
  if (
    error instanceof TypeError &&
    ['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'].includes(error.message)
  ) {
    return true;
  }
  const status = getUploadErrorStatus(error);
  return status === 0 || status === 408 || status === 429 || (status !== undefined && status >= 500 && status < 600);
};

export const uploadDelay = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Cancelled', 'AbortError'));
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });

export async function retryUploadRequest<T>(
  operation: () => Promise<T>,
  options: { signal: AbortSignal; onRetry?: (attempt: number, delay: number) => void; retries?: number },
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    options.signal.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (!isTransientUploadError(error) || attempt >= (options.retries ?? 3)) {
        throw error;
      }
      const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 250);
      options.onRetry?.(attempt + 1, delay);
      await uploadDelay(delay, options.signal);
    }
  }
}
