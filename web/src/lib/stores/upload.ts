import { UploadState, type UploadAsset } from '#lib/types.ts';
import { derived, writable } from 'svelte/store';

const pendingStates = new Set([
  UploadState.PENDING,
  UploadState.HASHING,
  UploadState.STARTED,
  UploadState.RETRYING,
  UploadState.PAUSED,
]);
const dismissibleStates = new Set([
  UploadState.ERROR,
  UploadState.DUPLICATED,
  UploadState.DONE,
  UploadState.CANCELLED,
  UploadState.UPLOADED,
]);
type Outcome = 'success' | 'duplicate' | 'error';

function createUploadStore() {
  const uploadAssets = writable<UploadAsset[]>([]);
  const stats = writable({ errors: 0, duplicates: 0, success: 0, total: 0 });
  const outcomes = new Map<string, Outcome>();
  const samples = new Map<string, { loaded: number; time: number }>();
  let total = 0;
  let onRemove: ((id: string) => void) | undefined;

  const publishStats = () => {
    const values = [...outcomes.values()];
    stats.set({
      errors: values.filter((value) => value === 'error').length,
      duplicates: values.filter((value) => value === 'duplicate').length,
      success: values.filter((value) => value === 'success').length,
      total,
    });
  };
  const setOutcome = (id: string, outcome?: Outcome) => {
    if (outcome) {
      outcomes.set(id, outcome);
    } else {
      outcomes.delete(id);
    }
    publishStats();
  };
  const updateItem = (id: string, update: Partial<UploadAsset>) =>
    uploadAssets.update((items) => items.map((item) => (item.id === id ? { ...item, ...update } : item)));

  const remainingUploads = derived(
    uploadAssets,
    (items) => items.filter((item) => pendingStates.has(item.state!)).length,
  );
  const aggregate = derived(uploadAssets, (items) => {
    const total = items.reduce((sum, item) => sum + item.file.size, 0);
    const loaded = items.reduce((sum, item) => sum + Math.min(item.file.size, item.loaded ?? 0), 0);
    const speed = items.reduce((sum, item) => sum + (item.state === UploadState.STARTED ? (item.speed ?? 0) : 0), 0);
    return {
      total,
      loaded,
      progress: total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0,
      speed,
      eta: speed > 0 ? Math.ceil((total - loaded) / speed) : 0,
      queued: items.filter((item) => item.state === UploadState.PENDING || item.state === UploadState.PAUSED).length,
      active: items.filter((item) =>
        [UploadState.STARTED, UploadState.HASHING, UploadState.RETRYING].includes(item.state!),
      ).length,
      processing: items.filter((item) => item.state === UploadState.PROCESSING).length,
      completed: items.filter((item) =>
        [UploadState.DONE, UploadState.DUPLICATED, UploadState.UPLOADED].includes(item.state!),
      ).length,
      cancelled: items.filter((item) => item.state === UploadState.CANCELLED).length,
    };
  });

  return {
    subscribe: uploadAssets.subscribe,
    stats,
    aggregate,
    remainingUploads,
    isUploading: derived(uploadAssets, (items) => items.length > 0),
    isDismissible: derived(uploadAssets, (items) => items.some((item) => dismissibleStates.has(item.state!))),
    setOutcome,
    setRemoveHandler: (handler: (id: string) => void) => {
      onRemove = handler;
    },
    updateItem,
    addItem: (asset: UploadAsset) => {
      uploadAssets.update((items) => {
        if (items.some((item) => item.id === asset.id)) {
          return items;
        }
        if (items.length === 0) {
          total = 0;
          outcomes.clear();
        }
        total++;
        publishStats();
        return [...items, { ...asset, state: UploadState.PENDING, loaded: 0, progress: 0, speed: 0, eta: 0 }];
      });
    },
    markStarted: (id: string) => {
      samples.delete(id);
      updateItem(id, { state: UploadState.STARTED, startDate: Date.now(), speed: 0, eta: 0 });
    },
    updateProgress: (id: string, loaded: number, total: number) => {
      const now = Date.now();
      const previous = samples.get(id);
      const elapsed = previous ? (now - previous.time) / 1000 : 0;
      const speed = previous && elapsed > 0 ? Math.max(0, (loaded - previous.loaded) / elapsed) : 0;
      if (!previous || elapsed >= 0.25) {
        samples.set(id, { loaded, time: now });
        updateItem(id, {
          loaded: Math.min(total, loaded),
          progress: total > 0 ? Math.min(100, Math.floor((loaded / total) * 100)) : 0,
          speed,
          eta: speed > 0 ? Math.ceil(Math.max(0, total - loaded) / speed) : 0,
        });
      }
    },
    removeItem: (id: string) => {
      onRemove?.(id);
      samples.delete(id);
      uploadAssets.update((items) => items.filter((item) => item.id !== id));
    },
    dismissErrors: () =>
      uploadAssets.update((items) =>
        items.filter((item) => {
          if (dismissibleStates.has(item.state!)) {
            onRemove?.(item.id);
            return false;
          }
          return true;
        }),
      ),
    reset: () => {
      total = 0;
      samples.clear();
      outcomes.clear();
      uploadAssets.set([]);
      publishStats();
    },
  };
}

export const uploadAssetsStore = createUploadStore();
