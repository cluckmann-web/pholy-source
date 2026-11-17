import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { uploadAssetsStore } from '#lib/stores/upload.ts';
import { cancelUploadRequests } from '#lib/utils.ts';
import { readResumableUploads, writeResumableUploads, type ResumableUpload } from '#lib/utils/upload-resume.ts';
import { getSupportedMediaTypes, type ServerMediaTypesResponseDto } from '@immich/sdk';

class UploadManager {
  mediaTypes = $state<ServerMediaTypesResponseDto>({ image: [], sidecar: [], video: [] });
  isPaused = $state(false);
  resumableUploads = $state<ResumableUpload[]>([]);
  onReset?: () => void;

  constructor() {
    eventManager.on({
      AppInit: () => this.#loadExtensions(),
      AuthLogout: () => this.reset(),
      AuthUserLoaded: (user) => {
        this.resumableUploads = readResumableUploads(user.id);
        writeResumableUploads(this.resumableUploads);
      },
    });
  }

  reset() {
    this.onReset?.();
    cancelUploadRequests();
    uploadAssetsStore.reset();
    this.isPaused = false;
    this.resumableUploads = [];
    writeResumableUploads([]);
  }

  rememberUpload(record: ResumableUpload) {
    this.resumableUploads = [...this.resumableUploads.filter((item) => item.id !== record.id), record];
    writeResumableUploads(this.resumableUploads);
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
