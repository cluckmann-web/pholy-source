import { getBaseUrl } from '@immich/sdk';
import { queryOptions } from '@tanstack/svelte-query';

export const PHOLY_HISTORY_KEY = ['pholy-history'] as const;
export type PholyHistoryStatus = 'processing' | 'ready' | 'processing-error' | 'duplicate' | 'cancelled' | 'failed';
export type PholyHistoryItem = {
  id: string;
  fileName: string;
  fileSize: number;
  status: PholyHistoryStatus;
  processingStep: 'metadata' | 'storage' | 'preview' | 'video' | null;
  createdAt: string;
  updatedAt: string;
  assetId: string | null;
  previewReady: boolean;
  thumbnailReady: boolean;
};
export type PholyHistory = { items: PholyHistoryItem[]; hasMore: boolean; page: number; retentionDays: number };
export type PholyQuota = {
  usage: number;
  limit: number | null;
  remaining: number | null;
  level: 'normal' | 'warning' | 'critical' | 'full';
};
export type PholyHistoryAttempt = {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'duplicate' | 'cancelled' | 'failed' | 'accepted';
  assetId?: string;
};

async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(getBaseUrl() + '/pholy/history' + path, {
    method: body ? 'POST' : 'GET',
    cache: 'no-store',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error('PHOLY history request failed');
  return response.status === 204 ? (undefined as T) : response.json();
}
export const getPholyHistoryQuery = (page = 0) =>
  queryOptions({
    queryKey: [...PHOLY_HISTORY_KEY, 'entries', page],
    queryFn: ({ signal }) => request<PholyHistory>(`?page=${page}`, signal),
    staleTime: 0,
    refetchInterval: 15_000,
  });
export const getPholyQuotaQuery = () =>
  queryOptions({
    queryKey: [...PHOLY_HISTORY_KEY, 'quota'],
    queryFn: ({ signal }) => request<PholyQuota>('/quota', signal),
    staleTime: 0,
    refetchInterval: 30_000,
  });
export const recordPholyUploadAttempt = (body: PholyHistoryAttempt, signal: AbortSignal) =>
  request<void>('/attempts', signal, body);
