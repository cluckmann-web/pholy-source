import { uploadRequest } from '#lib/utils.ts';
import { getBaseUrl, type AssetMediaResponseDto, type AssetVisibility } from '@immich/sdk';

export type PholyUploadSession = {
  id: string;
  offset: number;
  fileSize: number;
  chunkSize: number;
  expiresAt: string;
  status: 'uploading' | 'complete';
  result?: AssetMediaResponseDto;
};
export type PholyUploadMetadata = {
  fileName: string;
  fileSize: number;
  fileModifiedAt: string;
  fileCreatedAt: string;
  mimeType: string;
  checksum: string;
  visibility?: AssetVisibility;
};

const base = () => getBaseUrl() + '/pholy/uploads';

async function request<T>(path: string, method: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base() + path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    throw Object.assign(new Error('Network error'), { statusCode: 0 });
  }
  if (!response.ok) {
    const details = await response.json().catch(() => undefined);
    throw Object.assign(new Error(typeof details?.message === 'string' ? details.message : response.statusText), {
      statusCode: response.status,
    });
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export const createPholyUploadSession = (body: PholyUploadMetadata, signal: AbortSignal) =>
  request<PholyUploadSession>('/sessions', 'POST', signal, body);
export const getPholyUploadSession = (id: string, signal: AbortSignal) =>
  request<PholyUploadSession>(`/sessions/${encodeURIComponent(id)}`, 'GET', signal);
export const completePholyUploadSession = (id: string, signal: AbortSignal) =>
  request<AssetMediaResponseDto>(`/sessions/${encodeURIComponent(id)}/complete`, 'POST', signal);
export const deletePholyUploadSession = (id: string, signal?: AbortSignal) =>
  request<void>(`/sessions/${encodeURIComponent(id)}`, 'DELETE', signal);
export const getPholyUploadStatus = (id: string, signal: AbortSignal) =>
  request<{ id: string; status: 'processing' | 'ready'; previewReady: boolean; thumbnailReady: boolean }>(
    `/assets/${encodeURIComponent(id)}/status`,
    'GET',
    signal,
  );
export const appendPholyUploadChunk = async (
  id: string,
  offset: number,
  chunk: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
) => {
  const response = await uploadRequest<PholyUploadSession>({
    url: base() + `/sessions/${encodeURIComponent(id)}`,
    method: 'PATCH',
    headers: { 'Content-Type': 'application/octet-stream', 'Upload-Offset': String(offset) },
    data: chunk,
    signal,
    timeout: 120_000,
    onUploadProgress: ({ loaded }) => onProgress(loaded),
  });
  return response.data;
};
