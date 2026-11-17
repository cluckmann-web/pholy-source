import { asMutation, queryClient } from '#lib/queries/client.ts';
import { queryOptions } from '@tanstack/svelte-query';

export type PholyInvitation = {
  id: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  quotaSizeInBytes: number | null;
  mailStatus: 'not_sent' | 'sending' | 'accepted' | 'failed' | 'disabled';
  mailAttemptedAt: string | null;
  mailAcceptedAt: string | null;
};
export type PholyInvitationPreview = Pick<PholyInvitation, 'email' | 'expiresAt' | 'quotaSizeInBytes'> & {
  termsVersion: string;
};
const KEY = ['pholy-invitations'] as const;

async function request<T>(path = '', method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/pholy/invitations' + path, {
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

export const getPholyInvitationsQuery = () =>
  queryOptions({
    queryKey: KEY,
    queryFn: ({ signal }) => request<PholyInvitation[]>('', 'GET', undefined, signal),
    staleTime: 0,
  });
const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
export const createPholyInvitationMutation = () =>
  asMutation(
    (body: { email: string; quotaGiB: number | null; sendEmail?: boolean }) =>
      request<PholyInvitation & { url: string }>('', 'POST', body),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const sendPholyInvitationMutation = () =>
  asMutation(
    (id: string) => request<PholyInvitation & { url: string }>('/' + encodeURIComponent(id) + '/send', 'POST'),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const revokePholyInvitationMutation = () =>
  asMutation((id: string) => request<void>('/' + encodeURIComponent(id), 'DELETE'), {
    onSuccess: invalidate,
    meta: { error: { toast: false } },
  });
export const previewPholyInvitation = (token: string, signal?: AbortSignal) =>
  request<PholyInvitationPreview>('/preview', 'POST', { token }, signal);
export const acceptPholyInvitationMutation = () =>
  asMutation(
    (body: { token: string; name: string; password: string; termsAccepted: true; termsVersion: string }) =>
      request<{ registered: true }>('/accept', 'POST', body),
    { meta: { error: { toast: false } } },
  );
