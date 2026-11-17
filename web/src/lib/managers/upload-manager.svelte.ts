import { authManager } from '#lib/managers/auth-manager.svelte.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { recordPholyUploadAttempt, type PholyHistoryAttempt } from '#lib/queries/pholy-history.query.ts';
import { uploadAssetsStore } from '#lib/stores/upload.ts';
import { UploadState } from '#lib/types.ts';
import { cancelUploadRequests } from '#lib/utils.ts';
import { readResumableUploads, writeResumableUploads, type ResumableUpload } from '#lib/utils/upload-resume.ts';
import { getSupportedMediaTypes, type ServerMediaTypesResponseDto } from '@immich/sdk';
import { SvelteMap } from 'svelte/reactivity';

class UploadManager {
  mediaTypes = $state<ServerMediaTypesResponseDto>({ image: [], sidecar: [], video: [] });
  isPaused = $state(false);
  resumableUploads = $state<ResumableUpload[]>([]);
  onReset?: () => void;
  private historyOwner?: string;
  private historyStop?: () => void;
  private historyController?: AbortController;

  constructor() {
    eventManager.on({
      AppInit: () => this.#loadExtensions(),
      AuthLogout: () => this.reset(),
      AuthUserLoaded: (user) => {
        this.trackHistory(user.id);
        this.resumableUploads = readResumableUploads(user.id);
        writeResumableUploads(this.resumableUploads);
      },
    });
  }

  reset() {
    this.historyStop?.();
    this.historyController?.abort();
    this.historyOwner = undefined;
    this.onReset?.();
    cancelUploadRequests();
    uploadAssetsStore.reset();
    this.isPaused = false;
    this.resumableUploads = [];
    writeResumableUploads([]);
  }

  private trackHistory(ownerId: string) {
    if (this.historyOwner === ownerId) return;
    this.historyStop?.();
    this.historyController?.abort();
    this.historyOwner = ownerId;
    const controller = new AbortController();
    this.historyController = controller;
    const recorded = new SvelteMap<string, PholyHistoryAttempt['status']>();
    const pending = new SvelteMap<string, Promise<void>>();
    this.historyStop = uploadAssetsStore.subscribe((items) => {
      if (
        controller.signal.aborted ||
        !authManager.authenticated ||
        authManager.user.id !== ownerId ||
        authManager.isSharedLink
      )
        return;
      const ids = new Set(items.map(({ id }) => id));
      for (const id of recorded.keys()) if (!ids.has(id)) recorded.delete(id);
      for (const item of items) {
        if (item.isLockedAssets) continue;
        const status =
          item.state === UploadState.ERROR
            ? 'failed'
            : item.state === UploadState.CANCELLED
              ? 'cancelled'
              : item.state === UploadState.DUPLICATED
                ? 'duplicate'
                : item.assetId &&
                    [UploadState.PROCESSING, UploadState.UPLOADED, UploadState.DONE].includes(item.state!) &&
                    recorded.has(item.id)
                  ? 'accepted'
                  : undefined;
        if (!status || recorded.get(item.id) === status) continue;
        recorded.set(item.id, status);
        // The original upload must never fail because its optional attempt log is temporarily unavailable.
        const report: PholyHistoryAttempt = {
          id: item.id,
          fileName: item.file.name,
          fileSize: item.file.size,
          status,
          ...(item.assetId && { assetId: item.assetId }),
        };
        const previous = pending.get(item.id) ?? Promise.resolve();
        const task = previous
          .then(async () => {
            if (!controller.signal.aborted) await recordPholyUploadAttempt(report, controller.signal);
          })
          .catch(() => {})
          .finally(() => {
            if (pending.get(item.id) === task) pending.delete(item.id);
          });
        pending.set(item.id, task);
      }
    });
  }

  rememberUpload(record: ResumableUpload) {
    this.resumableUploads = [...this.resumableUploads.filter((item) => item.id !== record.id), record];
    writeResumableUploads(this.resumableUploads);
  }

  recordDiscardedUpload(record: ResumableUpload) {
    if (
      record.isLockedAssets ||
      record.ownerId !== this.historyOwner ||
      !this.historyController ||
      this.historyController.signal.aborted ||
      !authManager.authenticated ||
      authManager.user.id !== record.ownerId ||
      authManager.isSharedLink
    )
      return;
    void recordPholyUploadAttempt(
      { id: record.id, fileName: record.fileName, fileSize: record.fileSize, status: 'cancelled' },
      this.historyController.signal,
    ).catch(() => {});
  }

  forgetUpload(id: string) {
    this.resumableUploads = this.resumableUploads.filter((item) => item.id !== id);
    writeResumableUploads(this.resumableUploads);
  }

  async #loadExtensions() {
    try {
      this.mediaTypes = await getSupportedMediaTypes();
    } catch {
      console.error('Failed to load supported media types');
    }
  }

  getExtensions() {
    return [...this.mediaTypes.image, ...this.mediaTypes.video];
  }
}

export const uploadManager = new UploadManager();
