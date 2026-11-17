import { asMutation, queryClient } from '#lib/queries/client.ts';
import { queryOptions } from '@tanstack/svelte-query';

export type SupportCategory = 'upload' | 'account' | 'storage' | 'app' | 'privacy' | 'other';
export type SupportStatus = 'open' | 'waiting' | 'resolved';
export type SupportTicket = {
  id: string;
  category: SupportCategory;
  subject: string;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  userName: string;
  userEmail: string;
};
export type SupportThread = SupportTicket & {
  messages: { id: string; isStaff: boolean; message: string; createdAt: string }[];
};
export const PHOLY_SUPPORT_KEY = ['pholy-support'] as const;

async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/pholy/support' + path, {
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
  return response.json();
}
export const getPholySupportQuery = (admin = false, offset = 0, status?: SupportStatus) =>
  queryOptions({
    queryKey: [...PHOLY_SUPPORT_KEY, 'list', admin, offset, status],
    queryFn: ({ signal }) =>
      request<{ items: SupportTicket[]; hasMore: boolean }>(
        `${admin ? '/admin/list' : ''}?offset=${offset}${status ? '&status=' + status : ''}`,
        'GET',
        undefined,
        signal,
      ),
    staleTime: 0,
    refetchInterval: 30_000,
  });
export const getPholySupportThreadQuery = (id: string, admin = false) =>
  queryOptions({
    queryKey: [...PHOLY_SUPPORT_KEY, 'thread', admin, id],
    queryFn: ({ signal }) =>
      request<SupportThread>(`${admin ? '/admin' : ''}/${encodeURIComponent(id)}`, 'GET', undefined, signal),
    enabled: Boolean(id),
    staleTime: 0,
    refetchInterval: 30_000,
  });
const invalidate = () => queryClient.invalidateQueries({ queryKey: PHOLY_SUPPORT_KEY });
export const createPholySupportMutation = () =>
  asMutation(
    (body: { category: SupportCategory; subject: string; message: string }) =>
      request<{ id: string }>('', 'POST', body),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const replyPholySupportMutation = () =>
  asMutation(
    (id: string, message: string, admin = false) =>
      request<{ id: string }>(`${admin ? '/admin' : ''}/${encodeURIComponent(id)}/messages`, 'POST', { message }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const updatePholySupportMutation = () =>
  asMutation(
    (id: string, status: SupportStatus) =>
      request<{ id: string }>(`/admin/${encodeURIComponent(id)}`, 'PATCH', { status }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
