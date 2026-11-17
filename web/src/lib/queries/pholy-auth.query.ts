import { asMutation } from '#lib/queries/client.ts';
import { queryOptions } from '@tanstack/svelte-query';

export const pholyAuthKey = ['pholy-auth-status'] as const;
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/pholy/auth/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new Error(
      typeof error?.message === 'string' ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.',
    );
  }
  return response.json();
}
export const getPholyAuthStatusQuery = () =>
  queryOptions({
    queryKey: pholyAuthKey,
    queryFn: ({ signal }) =>
      request<{ mailEnabled: boolean; passwordLoginEnabled: boolean }>('status', undefined, signal),
    staleTime: 0,
  });
export const forgotPholyPasswordMutation = () =>
  asMutation((email: string) => request<{ accepted: true }>('forgot-password', { email }), {
    meta: { error: { toast: false } },
  });
export const resetPholyPasswordMutation = () =>
  asMutation((body: { token: string; password: string }) => request<{ reset: true }>('reset-password', body), {
    meta: { error: { toast: false } },
  });
