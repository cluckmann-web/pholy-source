import { asMutation, queryClient } from '#lib/queries/client.ts';
import { infiniteQueryOptions } from '@tanstack/svelte-query';

export type PhotoCommentContext =
  { kind: 'private' } | { kind: 'album'; albumId: string } | { kind: 'community'; profileSlug: string };
export type PhotoComment = {
  id: string;
  assetId: string;
  parentId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
  author: { id: string; name: string; avatarColor: string; hasProfileImage: boolean } | null;
  likeCount: number;
  liked: boolean;
  canEdit: boolean;
  canDelete: boolean;
  replies: PhotoComment[];
};
export type PhotoCommentsPage = {
  comments: PhotoComment[];
  nextOffset: number | null;
  total: number;
  canComment: boolean;
};
export const PHOLY_COMMENTS_KEY = ['pholy-comments'] as const;
const contextQuery = (context: PhotoCommentContext) => new URLSearchParams(context).toString();
const base = (assetId: string) => `/api/pholy/comments/${encodeURIComponent(assetId)}`;
const commentPath = (assetId: string, commentId: string) => `${base(assetId)}/${encodeURIComponent(commentId)}`;
async function request<T>(url: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method,
    signal,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => undefined);
    throw new Error(
      typeof error?.message === 'string' ? error.message : 'Die Anfrage konnte nicht verarbeitet werden.',
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const photoCommentAvatarUrl = (assetId: string, context: PhotoCommentContext, userId: string) =>
  `${base(assetId)}/authors/${encodeURIComponent(userId)}/avatar?${contextQuery(context)}`;
export const getPhotoCommentsQuery = (assetId: string, context: PhotoCommentContext, userId: string) =>
  infiniteQueryOptions({
    queryKey: [...PHOLY_COMMENTS_KEY, assetId, context, userId],
    initialPageParam: 0,
    queryFn: ({ signal, pageParam }) =>
      request<PhotoCommentsPage>(
        `${base(assetId)}?${contextQuery(context)}&offset=${pageParam}`,
        'GET',
        undefined,
        signal,
      ),
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    staleTime: 0,
    refetchInterval: 30_000,
  });
const invalidate = () => queryClient.invalidateQueries({ queryKey: PHOLY_COMMENTS_KEY });
export const createPhotoCommentMutation = () =>
  asMutation(
    (assetId: string, context: PhotoCommentContext, body: string, parentId?: string) =>
      request<PhotoComment>(base(assetId), 'POST', { ...context, body, ...(parentId && { parentId }) }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const editPhotoCommentMutation = () =>
  asMutation(
    (assetId: string, context: PhotoCommentContext, commentId: string, body: string) =>
      request<PhotoComment>(commentPath(assetId, commentId), 'PATCH', { ...context, body }),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const deletePhotoCommentMutation = () =>
  asMutation(
    (assetId: string, context: PhotoCommentContext, commentId: string) =>
      request<void>(`${commentPath(assetId, commentId)}?${contextQuery(context)}`, 'DELETE'),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
export const likePhotoCommentMutation = () =>
  asMutation(
    (assetId: string, context: PhotoCommentContext, commentId: string, enabled: boolean) =>
      request<{ liked: boolean; likeCount: number }>(
        `${commentPath(assetId, commentId)}/like${enabled ? '' : '?' + contextQuery(context)}`,
        enabled ? 'PUT' : 'DELETE',
        enabled ? context : undefined,
      ),
    { onSuccess: invalidate, meta: { error: { toast: false } } },
  );
