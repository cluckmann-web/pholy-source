import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { uploadManager } from '#lib/managers/upload-manager.svelte.ts';
import { getPholyUploadStatus } from '#lib/queries/pholy-upload.query.ts';
import { uploadAssetsStore } from '#lib/stores/upload.ts';
import { UploadState } from '#lib/types.ts';
import { uploadRequest } from '#lib/utils.ts';
import {
  cancelUpload,
  fileUploadHandler,
  pauseUploads,
  resumeUploads,
  retryUpload,
  uploadExecutionQueue,
} from '#lib/utils/file-uploader.ts';
import { factory } from '#test/unit/factories.ts';
import { test } from '#test/unit/fixtures.ts';
import { AssetMediaStatus, type AssetMediaResponseDto } from '@immich/sdk';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';

vi.mock('#lib/utils.ts', { spy: true });
vi.mock('#lib/queries/pholy-upload.query.ts', { spy: true });

describe('upload lifecycle', () => {
  const newFile = () => new File(['content'], `${crypto.randomUUID()}.jpg`, { type: 'image/jpeg' });
  const response = { id: 'mock-id', status: AssetMediaStatus.Created } as AssetMediaResponseDto;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(uploadRequest).mockReset();
    vi.spyOn(uploadManager, 'getExtensions').mockReturnValue(['.jpg']);
    uploadManager.reset();
    authManager.reset();
    uploadExecutionQueue.concurrency = 2;
  });
  afterEach(() => uploadManager.reset());

  test('marks shared/anonymous uploads saved without claiming preview processing is ready', async () => {
    vi.mocked(uploadRequest).mockResolvedValue({ status: 201, data: response });
    expect(await fileUploadHandler({ files: [newFile()] })).toEqual(['mock-id']);
    expect(get(uploadAssetsStore)[0].state).toBe(UploadState.UPLOADED);
    expect(get(uploadAssetsStore.stats)).toEqual({ errors: 0, duplicates: 0, success: 1, total: 1 });
    expect(getPholyUploadStatus).not.toHaveBeenCalled();
  });

  test('keeps accepted files processing until the server confirms ready', async ({ api }) => {
    authManager.setUser(factory.user());
    authManager.setPreferences(factory.preferences());
    let ready!: (value: Awaited<ReturnType<typeof getPholyUploadStatus>>) => void;
    vi.mocked(getPholyUploadStatus).mockReturnValue(
      new Promise((resolve) => {
        ready = resolve;
      }),
    );
    vi.mocked(uploadRequest).mockResolvedValue({ status: 201, data: response });
    await fileUploadHandler({ files: [newFile()] });
    expect(api.checkBulkUpload).toHaveBeenCalled();
    expect(api.checkBulkUpload.calls).toHaveLength(1);
    expect(get(uploadAssetsStore)[0].state).toBe(UploadState.PROCESSING);
    ready({ id: response.id, status: 'ready', thumbnailReady: true, previewReady: true });
    await vi.waitFor(() => expect(get(uploadAssetsStore)[0].state).toBe(UploadState.DONE));
  });

  test('preserves queued File objects through pause and resume', async () => {
    const file = newFile();
    vi.mocked(uploadRequest).mockResolvedValue({ status: 201, data: response });
    pauseUploads();
    const pending = fileUploadHandler({ files: [file] });
    expect(vi.mocked(uploadRequest)).not.toHaveBeenCalled();
    expect(get(uploadAssetsStore)[0]).toMatchObject({ file, state: UploadState.PAUSED });
    resumeUploads();
    await expect(pending).resolves.toEqual(['mock-id']);
  });

  test('cancels an active request, settles its promise and starts the next queued file', async () => {
    uploadExecutionQueue.concurrency = 1;
    vi.mocked(uploadRequest)
      .mockImplementationOnce(
        ({ signal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), {
              once: true,
            });
          }),
      )
      .mockResolvedValue({ status: 201, data: response });
    const pending = fileUploadHandler({ files: [newFile(), newFile()] });
    await vi.waitFor(() => expect(uploadRequest).toHaveBeenCalledOnce());
    cancelUpload(get(uploadAssetsStore)[0].id);
    await expect(pending).resolves.toEqual(['mock-id']);
    expect(get(uploadAssetsStore).map((item) => item.state)).toEqual([UploadState.CANCELLED, UploadState.UPLOADED]);
  });

  test('resumes an active request even when resume is clicked before the abort settles', async () => {
    vi.mocked(uploadRequest)
      .mockImplementationOnce(
        ({ signal }) =>
          new Promise((_, reject) => {
            signal?.addEventListener('abort', () => reject(new DOMException('Paused', 'AbortError')), { once: true });
          }),
      )
      .mockResolvedValue({ status: 201, data: response });
    const pending = fileUploadHandler({ files: [newFile()] });
    await vi.waitFor(() => expect(uploadRequest).toHaveBeenCalledOnce());
    pauseUploads();
    resumeUploads();
    await expect(pending).resolves.toEqual(['mock-id']);
    expect(uploadRequest).toHaveBeenCalledTimes(2);
  });

  test('manual retry replaces an error outcome without counting the file twice', async ({ logger }) => {
    vi.mocked(uploadRequest).mockRejectedValueOnce(new Error('Upload failed'));
    await fileUploadHandler({ files: [newFile()], isLockedAssets: true });
    expect(logger.error).toHaveBeenCalledWith(/Upload failed/);
    expect(get(uploadAssetsStore.stats)).toEqual({ errors: 1, duplicates: 0, success: 0, total: 1 });
    vi.mocked(uploadRequest).mockResolvedValue({ status: 201, data: response });
    await retryUpload(get(uploadAssetsStore)[0].id);
    expect(get(uploadAssetsStore.stats)).toEqual({ errors: 0, duplicates: 0, success: 1, total: 1 });
    expect((vi.mocked(uploadRequest).mock.calls[1][0].data as FormData).get('visibility')).toBe('locked');
  });

  test('clears active and queued files on logout without starting another upload', async ({ api }) => {
    authManager.setUser(factory.user());
    authManager.setPreferences(factory.preferences());
    uploadExecutionQueue.concurrency = 1;
    vi.mocked(uploadRequest).mockImplementationOnce(() => {
      authManager.reset();
      eventManager.emit('AuthLogout');
      return Promise.reject(new DOMException('Signed out', 'AbortError'));
    });
    await fileUploadHandler({ files: [newFile(), newFile()] });
    expect(api.checkBulkUpload).toHaveBeenCalled();
    expect(api.checkBulkUpload.calls).toHaveLength(1);
    expect(uploadRequest).toHaveBeenCalledOnce();
    expect(get(uploadAssetsStore)).toEqual([]);
  });
});
