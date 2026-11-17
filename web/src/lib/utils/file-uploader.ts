import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { uploadManager } from '#lib/managers/upload-manager.svelte.ts';
import { addAssetsToAlbumsMutation } from '#lib/queries/album.query.ts';
import { executeMutation } from '#lib/queries/client.ts';
import {
  appendPholyUploadChunk,
  completePholyUploadSession,
  createPholyUploadSession,
  deletePholyUploadSession,
  getPholyUploadSession,
  getPholyUploadStatus,
  type PholyUploadSession,
} from '#lib/queries/pholy-upload.query.ts';
import { uploadAssetsStore } from '#lib/stores/upload.ts';
import { UploadState, type UploadAsset } from '#lib/types.ts';
import { uploadRequest } from '#lib/utils.ts';
import { ExecutorQueue } from '#lib/utils/executor-queue.ts';
import { handleError } from '#lib/utils/handle-error.ts';
import { asQueryString } from '#lib/utils/shared-links.ts';
import { UploadCleanupTracker } from '#lib/utils/upload-cleanup.ts';
import { matchesResumableFile, type ResumableUpload } from '#lib/utils/upload-resume.ts';
import { getUploadErrorStatus, isUploadAbort, retryUploadRequest, uploadDelay } from '#lib/utils/upload-retry.ts';
import {
  AlbumUserRole,
  AssetMediaStatus,
  AssetUploadAction,
  AssetVisibility,
  checkBulkUpload,
  getAlbumInfo,
  getBaseUrl,
  getMyUser,
  type AssetMediaResponseDto,
} from '@immich/sdk';
import { toastManager } from '@immich/ui';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';

export const uploadExecutionQueue = new ExecutorQueue({ concurrency: 2 });
const processingQueue = new ExecutorQueue({ concurrency: 2 });
const RESUMABLE_THRESHOLD = 32 * 1024 * 1024;
const jobs = new Map<string, UploadJob>();
const processing = new Map<string, AbortController>();
const resumeWaiters = new Set<() => void>();
const cleanup = new UploadCleanupTracker();
class UploadPreflightError extends Error {}

type FilePickerParam = { multiple?: boolean; extensions?: string[] };
type FileUploadParam = { multiple?: boolean; albumId?: string };
type FileUploadHandlerParams = { files: File[]; albumId?: string; isLockedAssets?: boolean };
type UploadJob = {
  asset: UploadAsset;
  ownerId?: string;
  shared: boolean;
  query: string;
  controller: AbortController;
  requestController?: AbortController;
  interruptedByPause?: boolean;
  checksum?: string;
  session?: ResumableUpload;
  response?: AssetMediaResponseDto & { isTrashed?: boolean };
  promise?: Promise<string | undefined>;
};

export const openFilePicker = async (options: FilePickerParam = {}) => {
  const { multiple = true, extensions } = options;
  return new Promise<File[]>((resolve, reject) => {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = multiple;
      if (extensions) {
        input.accept = extensions.join(',');
      }
      input.addEventListener(
        'change',
        () => {
          const files = Array.from(input.files ?? []);
          input.remove();
          resolve(files);
        },
        { once: true },
      );
      input.addEventListener(
        'cancel',
        () => {
          input.remove();
          resolve([]);
        },
        { once: true },
      );
      input.hidden = true;
      document.body.append(input);
      input.click();
    } catch (error) {
      reject(error);
    }
  });
};

export const openFileUploadDialog = async ({ albumId, multiple = true }: FileUploadParam = {}) =>
  fileUploadHandler({ files: await openFilePicker({ multiple, extensions: uploadManager.getExtensions() }), albumId });

export async function fileUploadHandler({
  files,
  albumId,
  isLockedAssets = false,
}: FileUploadHandlerParams): Promise<string[]> {
  const extensions = uploadManager.getExtensions();
  const promises: Promise<string | undefined>[] = [];
  for (const file of files) {
    if (extensions.every((extension) => !file.name.toLowerCase().endsWith(extension.toLowerCase()))) {
      toastManager.warning(get(t)('unsupported_file_type', { values: { file: file.name, type: file.type } }), {
        timeout: 10_000,
      });
      continue;
    }
    const existing = get(uploadAssetsStore).some(
      (item) =>
        item.file.name === file.name &&
        item.file.size === file.size &&
        item.file.lastModified === file.lastModified &&
        item.albumId === albumId &&
        !!item.isLockedAssets === isLockedAssets &&
        ![
          UploadState.ERROR,
          UploadState.CANCELLED,
          UploadState.DONE,
          UploadState.DUPLICATED,
          UploadState.UPLOADED,
        ].includes(item.state!),
    );
    if (existing) {
      continue;
    }
    const asset: UploadAsset = { id: crypto.randomUUID(), file, albumId, isLockedAssets };
    uploadAssetsStore.addItem(asset);
    const job = createJob(asset);
    promises.push(enqueue(job));
  }
  const results = await Promise.all(promises);
  return results.filter((id): id is string => !!id);
}

function createJob(asset: UploadAsset): UploadJob {
  uploadAssetsStore.setRemoveHandler(releaseUpload);
  const shared = authManager.isSharedLink;
  const job: UploadJob = {
    asset,
    ownerId: !shared && authManager.authenticated ? authManager.user.id : undefined,
    shared,
    query: asQueryString(authManager.params),
    controller: new AbortController(),
  };
  jobs.set(asset.id, job);
  return job;
}

function assertOwner(job: UploadJob) {
  job.controller.signal.throwIfAborted();
  if (job.ownerId && (!authManager.authenticated || authManager.user.id !== job.ownerId)) {
    throw new DOMException('Signed out', 'AbortError');
  }
}

function enqueue(job: UploadJob) {
  if (uploadManager.isPaused) {
    uploadAssetsStore.updateItem(job.asset.id, { state: UploadState.PAUSED });
  }
  job.promise = uploadExecutionQueue
    .addTask(() => runUpload(job), { signal: job.controller.signal })
    .catch((error: unknown) => {
      if (!isUploadAbort(error)) {
        throw error;
      }
      return undefined;
    });
  return job.promise;
}

export function pauseUploads() {
  uploadManager.isPaused = true;
  uploadExecutionQueue.pause();
  for (const item of get(uploadAssetsStore)) {
    if (![UploadState.PENDING, UploadState.STARTED, UploadState.HASHING, UploadState.RETRYING].includes(item.state!)) {
      continue;
    }

    uploadAssetsStore.updateItem(item.id, { state: UploadState.PAUSED, speed: 0, eta: 0 });
    const job = jobs.get(item.id);
    if (!job?.requestController) {
      continue;
    }

    job.interruptedByPause = true;
    job.requestController.abort();
  }
}

export function resumeUploads() {
  uploadManager.isPaused = false;
  for (const item of get(uploadAssetsStore)) {
    if (item.state === UploadState.PAUSED) {
      uploadAssetsStore.updateItem(item.id, { state: UploadState.PENDING });
    }
  }
  for (const resolve of resumeWaiters) {
    resolve();
  }
  resumeWaiters.clear();
  uploadExecutionQueue.resume();
}

export function cancelUpload(id: string) {
  const job = jobs.get(id);
  if (!job || job.response) {
    return;
  }
  job.controller.abort();
  uploadAssetsStore.setOutcome(id);
  uploadAssetsStore.updateItem(id, { state: UploadState.CANCELLED, speed: 0, eta: 0 });
  if (job.session) {
    void dismissResumableUpload(job.session.id).catch(() => {
      uploadAssetsStore.updateItem(id, { message: get(t)('pholy_upload_cleanup_pending') });
    });
  }
  jobs.delete(id);
}

export async function dismissResumableUpload(id: string) {
  return cleanup.run(id, () => deleteResumableUpload(id));
}

async function deleteResumableUpload(id: string) {
  const record = uploadManager.resumableUploads.find((item) => item.id === id);
  if (record && authManager.authenticated && record.ownerId === authManager.user.id) {
    try {
      await retryUploadRequest(
        async () => {
          if (!authManager.authenticated || record.ownerId !== authManager.user.id) {
            throw new DOMException('Signed out', 'AbortError');
          }
          return deletePholyUploadSession(id);
        },
        { signal: new AbortController().signal },
      );
    } catch (error) {
      if (getUploadErrorStatus(error) !== 404) {
        throw error;
      }
    }
    uploadManager.forgetUpload(id);
  }
}

export async function retryUpload(id: string): Promise<string | undefined> {
  const asset = get(uploadAssetsStore).find((item) => item.id === id);
  if (!asset || ![UploadState.ERROR, UploadState.CANCELLED].includes(asset.state!)) {
    return;
  }
  const previous = jobs.get(id);
  const job = previous ?? createJob(asset);
  job.controller = new AbortController();
  job.requestController = undefined;
  jobs.set(id, job);
  uploadAssetsStore.setOutcome(id);
  uploadAssetsStore.updateItem(id, { state: UploadState.PENDING, error: undefined, attempts: 0, speed: 0, eta: 0 });
  return enqueue(job);
}

export const retryFailedUploads = () =>
  Promise.all(
    get(uploadAssetsStore)
      .filter((item) => item.state === UploadState.ERROR)
      .map((item) => retryUpload(item.id)),
  );

export const dismissUpload = (id: string) => uploadAssetsStore.removeItem(id);

export async function reselectUpload(sessionId: string): Promise<string[]> {
  const record = uploadManager.resumableUploads.find((item) => item.id === sessionId);
  if (!record || !authManager.authenticated || authManager.user.id !== record.ownerId) {
    return [];
  }
  const [file] = await openFilePicker({ multiple: false, extensions: uploadManager.getExtensions() });
  if (!file) {
    return [];
  }
  if (!matchesResumableFile(record, file)) {
    toastManager.warning(get(t)('pholy_upload_reselect_mismatch'));
    return [];
  }
  return fileUploadHandler({ files: [file], albumId: record.albumId, isLockedAssets: record.isLockedAssets });
}

async function waitForResume(signal: AbortSignal) {
  if (!uploadManager.isPaused) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const resume = () => {
      signal.removeEventListener('abort', abort);
      resumeWaiters.delete(resume);
      resolve();
    };
    const abort = () => {
      resumeWaiters.delete(resume);
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    if (signal.aborted) {
      abort();
      return;
    }
    resumeWaiters.add(resume);
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function hashFile(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('../workers/hash-file.ts', import.meta.url), { type: 'module' });
    const cleanup = () => {
      worker.terminate();
      signal.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    worker.addEventListener('message', ({ data }: MessageEvent<{ result?: string; error?: string }>) => {
      cleanup();
      if (data.error || !data.result) {
        reject(new Error(data.error ?? 'Checksum unavailable'));
      } else {
        resolve(data.result);
      }
    });
    worker.addEventListener('error', (event) => {
      cleanup();
      reject(new Error(event.message));
    });
    worker.postMessage(file);
  });
}

async function runUpload(job: UploadJob): Promise<string | undefined> {
  const { id } = job.asset;
  while (!job.controller.signal.aborted) {
    let abortRequest: (() => void) | undefined;
    try {
      await waitForResume(job.controller.signal);
      assertOwner(job);
      const request = new AbortController();
      job.requestController = request;
      abortRequest = () => request.abort();
      job.controller.signal.addEventListener('abort', abortRequest, { once: true });
      const result = await performUpload(job, request.signal);
      jobs.delete(id);
      return result;
    } catch (error) {
      if (isUploadAbort(error)) {
        if (job.interruptedByPause && !job.controller.signal.aborted) {
          job.interruptedByPause = false;
          continue;
        }
        return;
      }
      if (job.ownerId && (!authManager.authenticated || authManager.user.id !== job.ownerId)) {
        return;
      }
      const message = handleError(
        error,
        error instanceof UploadPreflightError ? error.message : get(t)('errors.unable_to_upload_file'),
      );
      uploadAssetsStore.setOutcome(id, 'error');
      uploadAssetsStore.updateItem(id, { state: UploadState.ERROR, error: message, speed: 0, eta: 0 });
      return;
    } finally {
      if (abortRequest) {
        job.controller.signal.removeEventListener('abort', abortRequest);
      }
      job.requestController = undefined;
    }
  }
}

async function performUpload(job: UploadJob, signal: AbortSignal) {
  const { id, file, albumId, isLockedAssets } = job.asset;
  const $t = get(t);
  const retry = <T>(operation: () => Promise<T>) =>
    retryUploadRequest(
      async () => {
        assertOwner(job);
        signal.throwIfAborted();
        return operation();
      },
      {
        signal,
        onRetry: (attempt) =>
          uploadAssetsStore.updateItem(id, {
            state: UploadState.RETRYING,
            attempts: attempt,
            speed: 0,
            eta: 0,
            message: $t('pholy_upload_retry_wait', { values: { attempt, max: 3 } }),
          }),
      },
    );

  uploadAssetsStore.markStarted(id);
  if (albumId && job.ownerId) {
    const album = await retry(() => getAlbumInfo({ id: albumId }, { signal }));
    if (
      album.albumUsers.every(
        ({ user, role }) => !(user.id === job.ownerId && [AlbumUserRole.Owner, AlbumUserRole.Editor].includes(role)),
      )
    ) {
      throw new UploadPreflightError($t('pholy_upload_album_read_only'));
    }
    uploadAssetsStore.updateItem(id, { albumName: album.albumName });
  }

  if (!job.response && job.ownerId) {
    uploadAssetsStore.updateItem(id, { state: UploadState.HASHING, message: $t('asset_hashing') });
    job.checksum ??= await hashFile(file, signal);
    const {
      results: [checked],
    } = await retry(() =>
      checkBulkUpload({ assetBulkUploadCheckDto: { assets: [{ id, checksum: job.checksum! }] } }, { signal }),
    );
    if (checked?.action === AssetUploadAction.Reject) {
      if (!checked.assetId) {
        throw new Error($t('errors.unable_to_upload_file'));
      }
      job.response = { id: checked.assetId, status: AssetMediaStatus.Duplicate, isTrashed: checked.isTrashed };
    }
  }

  if (!job.response && job.ownerId) {
    const user = await retry(() => getMyUser({ signal }));
    if (
      user.quotaSizeInBytes !== null &&
      user.quotaSizeInBytes !== undefined &&
      file.size > user.quotaSizeInBytes - (user.quotaUsageInBytes ?? 0)
    ) {
      throw new UploadPreflightError($t('pholy_upload_quota_exceeded'));
    }
  }

  if (!job.response) {
    uploadAssetsStore.updateItem(id, { state: UploadState.STARTED, message: $t('asset_uploading') });
    if (job.ownerId && file.size >= RESUMABLE_THRESHOLD) {
      job.response = await transferResumable(job, signal, retry);
    } else {
      const formData = new FormData();
      const date = new Date(file.lastModified).toISOString();
      for (const [key, value] of Object.entries({
        fileCreatedAt: date,
        fileModifiedAt: date,
        isFavorite: 'false',
        assetData: file,
      })) {
        formData.append(key, value);
      }
      if (isLockedAssets) {
        formData.append('visibility', AssetVisibility.Locked);
      }
      const response = await retry(() => {
        uploadAssetsStore.markStarted(id);
        return uploadRequest<AssetMediaResponseDto>({
          url: getBaseUrl() + '/assets' + (job.query ? `?${job.query}` : ''),
          data: formData,
          signal,
          onUploadProgress: (event) =>
            uploadAssetsStore.updateProgress(id, Math.min(file.size, event.loaded), file.size),
        });
      });
      job.response = response.data;
    }
  }
  assertOwner(job);
  const response = job.response;
  uploadAssetsStore.updateItem(id, {
    state: UploadState.PROCESSING,
    assetId: response.id,
    loaded: file.size,
    progress: 100,
    speed: 0,
    eta: 0,
  });
  if (albumId && job.ownerId) {
    uploadAssetsStore.updateItem(id, { message: $t('asset_adding_to_album') });
    await retry(() =>
      executeMutation(() => addAssetsToAlbumsMutation({ notify: false }), {
        albumIds: [albumId],
        assetIds: [response.id],
      }),
    );
  }
  const duplicate = response.status === AssetMediaStatus.Duplicate;
  uploadAssetsStore.setOutcome(id, duplicate ? 'duplicate' : 'success');
  uploadAssetsStore.updateItem(id, {
    state: duplicate ? UploadState.DUPLICATED : job.ownerId ? UploadState.PROCESSING : UploadState.UPLOADED,
    isTrashed: response.isTrashed,
    message: duplicate ? undefined : $t(job.ownerId ? 'pholy_upload_processing' : 'pholy_upload_processing_background'),
  });
  if (job.session) {
    uploadManager.forgetUpload(job.session.id);
  } else if (job.checksum && job.ownerId) {
    for (const record of uploadManager.resumableUploads) {
      if (record.ownerId === job.ownerId && matchesResumableFile(record, file, job.checksum)) {
        uploadManager.forgetUpload(record.id);
      }
    }
  }
  if (!duplicate && job.ownerId) {
    monitorProcessing(id, response.id, job.ownerId);
  }
  return response.id;
}

async function transferResumable(
  job: UploadJob,
  signal: AbortSignal,
  retry: <T>(operation: () => Promise<T>) => Promise<T>,
): Promise<AssetMediaResponseDto> {
  const { id, file, albumId, isLockedAssets } = job.asset;
  let session: PholyUploadSession | undefined;
  const candidates = uploadManager.resumableUploads.filter(
    (record) =>
      record.ownerId === job.ownerId &&
      record.albumId === albumId &&
      !!record.isLockedAssets === !!isLockedAssets &&
      matchesResumableFile(record, file),
  );
  const record = job.session ?? candidates.find((record) => matchesResumableFile(record, file, job.checksum));
  if (!record && candidates.length > 0) {
    throw new UploadPreflightError(get(t)('pholy_upload_reselect_mismatch'));
  }
  if (record) {
    // Cancellation can still be retrying DELETE; never reuse a session until that operation has settled.
    await cleanup.wait(record.id);
    assertOwner(job);
    signal.throwIfAborted();
    try {
      session = await retry(() => getPholyUploadSession(record.id, signal));
    } catch (error) {
      if (![404, 410].includes(getUploadErrorStatus(error) ?? 0)) {
        throw error;
      }
      uploadManager.forgetUpload(record.id);
      job.session = undefined;
    }
  }
  if (!session) {
    const date = new Date(file.lastModified).toISOString();
    session = await retry(() =>
      createPholyUploadSession(
        {
          fileName: file.name,
          fileSize: file.size,
          fileModifiedAt: date,
          fileCreatedAt: date,
          mimeType: file.type || 'application/octet-stream',
          checksum: job.checksum!,
          ...(isLockedAssets && { visibility: AssetVisibility.Locked }),
        },
        signal,
      ),
    );
  }
  const remember = (session: PholyUploadSession) => {
    if (
      session.fileSize !== file.size ||
      !Number.isSafeInteger(session.offset) ||
      session.offset < 0 ||
      session.offset > file.size ||
      !Number.isSafeInteger(session.chunkSize) ||
      session.chunkSize <= 0 ||
      session.chunkSize > 16 * 1024 * 1024
    ) {
      throw new Error('Invalid upload session');
    }
    job.session = {
      id: session.id,
      ownerId: job.ownerId!,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      checksum: job.checksum!,
      albumId,
      isLockedAssets,
      expiresAt: session.expiresAt,
      offset: session.offset,
    };
    uploadManager.rememberUpload(job.session);
    uploadAssetsStore.updateItem(id, {
      resumable: true,
      loaded: session.offset,
      progress: Math.floor((session.offset / file.size) * 100),
    });
  };
  remember(session);
  if (session.status === 'complete' && session.result) {
    return session.result;
  }
  while (session.offset < file.size) {
    signal.throwIfAborted();
    const sessionId = session.id;
    // Always ask the server before a retry: the previous response may have been lost after a successful write.
    session = await retry(async () => {
      const current = await getPholyUploadSession(sessionId, signal);
      remember(current);
      if (current.status === 'complete' || current.offset === file.size) {
        return current;
      }
      uploadAssetsStore.markStarted(id);
      try {
        return await appendPholyUploadChunk(
          current.id,
          current.offset,
          file.slice(current.offset, Math.min(file.size, current.offset + current.chunkSize)),
          signal,
          (loaded) => uploadAssetsStore.updateProgress(id, current.offset + loaded, file.size),
        );
      } catch (error) {
        if (getUploadErrorStatus(error) === 409) {
          // Re-read the authoritative offset on a bounded retry, including cross-tab conflicts.
          throw Object.assign(new Error('Upload offset changed'), { statusCode: 503 });
        }
        throw error;
      }
    });
    remember(session);
    if (session.status === 'complete' && session.result) {
      return session.result;
    }
  }
  uploadAssetsStore.updateItem(id, { message: get(t)('pholy_upload_verifying') });
  return retry(() => completePholyUploadSession(session!.id, signal));
}

function monitorProcessing(uploadId: string, assetId: string, ownerId: string) {
  const controller = new AbortController();
  processing.set(uploadId, controller);
  void (async () => {
    try {
      for (let attempt = 0; attempt < 180; attempt++) {
        if (
          !authManager.authenticated ||
          authManager.user.id !== ownerId ||
          get(uploadAssetsStore).every((item) => item.id !== uploadId)
        ) {
          return;
        }
        try {
          const result = await processingQueue.addTask(() => getPholyUploadStatus(assetId, controller.signal), {
            signal: controller.signal,
          });
          if (result.status === 'ready') {
            uploadAssetsStore.updateItem(uploadId, { state: UploadState.DONE, message: get(t)('pholy_upload_ready') });
            return;
          }
        } catch (error) {
          if (isUploadAbort(error)) {
            return;
          }
          if ([401, 403, 404].includes(getUploadErrorStatus(error) ?? 0)) {
            break;
          }
        }
        await uploadDelay(Math.min(30_000, 3000 + attempt * 1000), controller.signal);
      }
      uploadAssetsStore.updateItem(uploadId, {
        state: UploadState.UPLOADED,
        message: get(t)('pholy_upload_processing_background'),
      });
    } catch (error) {
      if (!isUploadAbort(error)) {
        console.error('Unable to check upload processing', error);
      }
    } finally {
      processing.delete(uploadId);
    }
  })();
}

uploadManager.onReset = () => {
  for (const job of jobs.values()) {
    job.controller.abort();
  }
  for (const controller of processing.values()) {
    controller.abort();
  }
  jobs.clear();
  processing.clear();
  resumeWaiters.clear();
  uploadExecutionQueue.resume();
};

function releaseUpload(id: string) {
  jobs.get(id)?.controller.abort();
  processing.get(id)?.abort();
  jobs.delete(id);
  processing.delete(id);
}
