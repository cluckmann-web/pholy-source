import { asMutation, queryClient } from '#lib/queries/client.ts';
import { queryOptions } from '@tanstack/svelte-query';

export type CommunityProfile = { slug: string; displayName: string; bio: string };
export type CommunityMine = {
  profile: (CommunityProfile & { published: boolean; blocked: boolean }) | null;
  assets: { assetId: string; hidden: boolean; originalFileName: string }[];
};
export type CommunityGallery = CommunityProfile & { assets: { id: string }[]; followers: number };
export type CommunityDirectory = { profiles: CommunityProfile[]; nextOffset: number | null };
export type CommunityPicker = { assets: { id: string; originalFileName: string }[]; nextOffset: number | null };
export type CommunityRelation = { following: boolean; ownProfile: boolean };
export type CommunityReportReason = 'privacy' | 'copyright' | 'abuse' | 'other';
export type CommunityModerationAction =
  'dismiss' | 'hide_asset' | 'disable_profile' | 'restore_profile' | 'restore_asset';
export type CommunityReport = {
  id: string;
  assetId: string | null;
  reason: CommunityReportReason;
  details: string;
  createdAt: string;
  resolvedAt: string | null;
  action: CommunityModerationAction | null;
  slug: string;
  displayName: string;
  blocked: boolean;
  hidden: boolean | null;
};
export const PHOLY_COMMUNITY_KEY = ['pholy-community'] as const;

export class CommunityRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch('/api/pholy/community' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new CommunityRequestError(
      typeof error?.message === 'string' ? error.message : 'Community request failed.',
      response.status,
    );
  }
  return response.json();
}
const invalidate = () => queryClient.invalidateQueries({ queryKey: PHOLY_COMMUNITY_KEY });
export const getCommunityMineQuery = () =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'me'],
    queryFn: ({ signal }) => request<CommunityMine>('/me', 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityPickerQuery = (offset = 0) =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'picker', offset],
    queryFn: ({ signal }) => request<CommunityPicker>(`/me/assets?offset=${offset}`, 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityDirectoryQuery = (offset = 0) =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'profiles', offset],
    queryFn: ({ signal }) => request<CommunityDirectory>(`/profiles?offset=${offset}`, 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityFollowingQuery = () =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'following'],
    queryFn: ({ signal }) => request<{ profiles: CommunityProfile[] }>('/me/following', 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityProfileQuery = (slug: string) =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'profile', slug],
    queryFn: ({ signal }) =>
      request<CommunityGallery>('/profiles/' + encodeURIComponent(slug), 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityRelationQuery = (slug: string) =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'relation', slug],
    queryFn: ({ signal }) =>
      request<CommunityRelation>('/profiles/' + encodeURIComponent(slug) + '/relation', 'GET', undefined, signal),
    staleTime: 0,
  });
export const getCommunityModerationQuery = () =>
  queryOptions({
    queryKey: [...PHOLY_COMMUNITY_KEY, 'moderation'],
    queryFn: ({ signal }) => request<CommunityReport[]>('/moderation', 'GET', undefined, signal),
    staleTime: 0,
    refetchInterval: 30_000,
  });
export const saveCommunityProfileMutation = () =>
  asMutation(
    (body: CommunityProfile & { published: boolean; assetIds: string[] }) => request<CommunityMine>('/me', 'PUT', body),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const unpublishCommunityMutation = () =>
  asMutation(() => request<CommunityMine>('/me/publication', 'DELETE'), {
    onSuccess: invalidate,
    meta: { error: { toast: false } },
  });
export const followCommunityProfileMutation = () =>
  asMutation(
    (body: { slug: string; enabled: boolean }) =>
      request<CommunityRelation>(
        '/profiles/' + encodeURIComponent(body.slug) + '/follow',
        body.enabled ? 'PUT' : 'DELETE',
      ),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const reportCommunityMutation = () =>
  asMutation(
    (body: { slug: string; assetId: string | null; reason: CommunityReportReason; details: string }) =>
      request<{ received: true }>('/reports', 'POST', body),
    { meta: { error: { toast: false } } },
  );
export const moderateCommunityMutation = () =>
  asMutation(
    (body: { id: string; action: CommunityModerationAction }) =>
      request<{ resolved: true }>('/moderation/' + encodeURIComponent(body.id), 'PATCH', { action: body.action }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const communityImageUrl = (slug: string, id: string) =>
  '/api/pholy/community/profiles/' + encodeURIComponent(slug) + '/assets/' + encodeURIComponent(id);
