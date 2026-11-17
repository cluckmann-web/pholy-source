import { asMutation, queryClient } from '#lib/queries/client.ts';
import { queryOptions } from '@tanstack/svelte-query';

export type PholyAccount = {
  email: string;
  isAdmin: boolean;
  hasPassword: boolean;
  closeRequestedAt: string | null;
  closeAfter: string | null;
  exportExpiresAt: string | null;
};
export type PholyExportPart = {
  count: number;
  size: number;
  nextCursor: string | null;
  files: Array<{ id: string; filename: string }>;
};
export const PHOLY_ACCOUNT_KEY = ['pholy-account'] as const;

async function request<T>(path = '', method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/pholy/account' + path, {
    method,
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
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getPholyAccountQuery = () =>
  queryOptions({
    queryKey: PHOLY_ACCOUNT_KEY,
    queryFn: ({ signal }) => request<PholyAccount>('', 'GET', undefined, signal),
    staleTime: 0,
    refetchInterval: 60_000,
  });
const invalidate = () => queryClient.invalidateQueries({ queryKey: PHOLY_ACCOUNT_KEY });
export const startPholyExportMutation = () =>
  asMutation(
    (password: string) => request<{ exportExpiresAt: string; exportBefore: string }>('/export', 'POST', { password }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const closePholyAccountMutation = () =>
  asMutation((body: { email: string; password: string; confirm: true }) => request('/closure', 'POST', body), {
    onSuccess: invalidate,
    meta: { error: { toast: false } },
  });
export const cancelPholyClosureMutation = () =>
  asMutation(() => request<void>('/closure', 'DELETE'), { onSuccess: invalidate, meta: { error: { toast: false } } });
export const getPholyExportPartQuery = (cursor?: string) =>
  queryOptions({
    queryKey: [...PHOLY_ACCOUNT_KEY, 'part', cursor ?? 'start'],
    queryFn: ({ signal }) =>
      request<PholyExportPart>(
        '/export/part' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
        'GET',
        undefined,
        signal,
      ),
    staleTime: 0,
  });
export const pholyArchiveUrl = (cursor?: string) =>
  '/api/pholy/account/export/archive' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : '');
export const pholyMetadataUrl = '/api/pholy/account/export/metadata';
