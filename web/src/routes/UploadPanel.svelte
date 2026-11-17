<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { uploadManager } from '#lib/managers/upload-manager.svelte.ts';
  import { locale } from '#lib/stores/preferences.store.ts';
  import { uploadAssetsStore } from '#lib/stores/upload.ts';
  import { UploadState } from '#lib/types.ts';
  import { getByteUnitString } from '#lib/utils/byte-units.ts';
  import {
    dismissResumableUpload,
    dismissUpload,
    fileUploadHandler,
    openFilePicker,
    pauseUploads,
    reselectUpload,
    resumeUploads,
    retryFailedUploads,
    uploadExecutionQueue,
  } from '#lib/utils/file-uploader.ts';
  import { acquireWakeLock, releaseWakeLock } from '#lib/utils/wakelock.svelte.ts';
  import { Icon } from '@immich/ui';
  import {
    mdiArrowExpand,
    mdiChevronDown,
    mdiCloudUploadOutline,
    mdiFolderOutline,
    mdiInformationOutline,
    mdiLockOutline,
    mdiPause,
    mdiPlay,
    mdiPlus,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import UploadAssetPreview from './UploadAssetPreview.svelte';

  let showDetail = $state(false);
  let filter = $state<'all' | 'active' | 'attention'>('all');
  let visibleLimit = $state(100);
  let concurrency = $state(uploadExecutionQueue.concurrency);
  let discardError = $state(false);
  let discarding = $state<string>();
  const { aggregate } = uploadAssetsStore;
  const transferStates = new Set([
    UploadState.PENDING,
    UploadState.HASHING,
    UploadState.STARTED,
    UploadState.RETRYING,
    UploadState.PAUSED,
  ]);
  const finishedStates = new Set([
    UploadState.DONE,
    UploadState.UPLOADED,
    UploadState.DUPLICATED,
    UploadState.CANCELLED,
  ]);
  const successfulStates = new Set([UploadState.DONE, UploadState.UPLOADED, UploadState.DUPLICATED]);
  const transferring = $derived(
    $uploadAssetsStore.filter((item) => item.state !== undefined && transferStates.has(item.state)),
  );
  const finished = $derived(
    $uploadAssetsStore.filter((item) => item.state !== undefined && finishedStates.has(item.state)),
  );
  const attention = $derived($uploadAssetsStore.filter((item) => item.state === UploadState.ERROR));
  const active = $derived(
    $uploadAssetsStore.filter(
      (item) => item.state === UploadState.PROCESSING || (item.state !== undefined && transferStates.has(item.state)),
    ),
  );
  const ready = $derived($uploadAssetsStore.filter((item) => item.state === UploadState.DONE).length);
  const uploaded = $derived($uploadAssetsStore.filter((item) => item.state === UploadState.UPLOADED).length);
  const duplicates = $derived($uploadAssetsStore.filter((item) => item.state === UploadState.DUPLICATED).length);
  const pendingResumables = $derived(
    uploadManager.resumableUploads.filter((session) =>
      $uploadAssetsStore.every(
        ({ file, state }) =>
          state === UploadState.CANCELLED ||
          file.name !== session.fileName ||
          file.size !== session.fileSize ||
          file.lastModified !== session.lastModified,
      ),
    ),
  );
  const visible = $derived($uploadAssetsStore.length > 0 || pendingResumables.length > 0);
  const filtered = $derived(filter === 'active' ? active : filter === 'attention' ? attention : $uploadAssetsStore);
  const progress = $derived(Math.min(100, Math.max(0, $aggregate.progress)));
  const status = $derived(
    transferring.length > 0
      ? uploadManager.isPaused
        ? 'paused'
        : 'uploading'
      : $aggregate.processing > 0
        ? 'processing'
        : attention.length > 0
          ? 'attention'
          : pendingResumables.length > 0
            ? 'resume'
            : 'complete',
  );
  const targets = $derived(
    new Set($uploadAssetsStore.map((item) => `${item.albumId ?? ''}:${item.isLockedAssets ? 'locked' : 'timeline'}`)),
  );
  const commonTarget = $derived(targets.size === 1 ? $uploadAssetsStore[0] : undefined);
  const quotaRemaining = $derived(
    authManager.authenticated && !authManager.isSharedLink && authManager.user.quotaSizeInBytes !== null
      ? Math.max(0, authManager.user.quotaSizeInBytes - (authManager.user.quotaUsageInBytes ?? 0))
      : undefined,
  );
  const duration = $derived.by(() => {
    const seconds = $aggregate.eta;
    if (!Number.isFinite(seconds) || seconds <= 0 || uploadManager.isPaused) {
      return $t('pholy_upload_estimating');
    }
    if (seconds < 60) {
      return $t('pholy_upload_seconds', { values: { count: Math.ceil(seconds) } });
    }
    if (seconds < 3600) {
      return $t('pholy_upload_minutes', { values: { count: Math.ceil(seconds / 60) } });
    }
    return $t('pholy_upload_hours', { values: { count: Math.ceil(seconds / 3600) } });
  });

  // Opening once per batch preserves the user's minimized view while uploads advance.
  $effect(() => {
    if (visible) {
      showDetail = true;
    }
  });

  // Leave the final result briefly visible, then dismiss only successful rows.
  // New files or unresolved entries cancel the timer, including reload recovery.
  $effect(() => {
    const items = $uploadAssetsStore;
    if (
      items.length === 0 ||
      items.some((item) => !successfulStates.has(item.state!)) ||
      uploadManager.resumableUploads.length > 0
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const current = get(uploadAssetsStore);
      if (current.some((item) => !successfulStates.has(item.state!)) || uploadManager.resumableUploads.length > 0) {
        return;
      }
      for (const item of current) {
        dismissUpload(item.id);
      }
    }, 2000);

    return () => clearTimeout(timer);
  });

  $effect(() => {
    if (transferring.length > 0 && !uploadManager.isPaused) {
      void acquireWakeLock();
    } else {
      void releaseWakeLock();
    }
  });

  const addFiles = async () => {
    const target = commonTarget;
    const files = await openFilePicker({ extensions: uploadManager.getExtensions(), multiple: true });
    if (files.length > 0) {
      void fileUploadHandler({ files, albumId: target?.albumId, isLockedAssets: target?.isLockedAssets });
    }
  };

  const clearFinished = () => {
    for (const item of finished) {
      dismissUpload(item.id);
    }
  };

  const setFilter = (value: typeof filter) => {
    filter = value;
    visibleLimit = 100;
  };

  const setConcurrency = () => {
    concurrency = Math.max(1, Math.min(6, Math.trunc(concurrency || 2)));
    uploadExecutionQueue.concurrency = concurrency;
  };

  const discardSession = async (id: string) => {
    discardError = false;
    discarding = id;
    try {
      await dismissResumableUpload(id);
    } catch {
      discardError = true;
    } finally {
      discarding = undefined;
    }
  };
</script>

{#if visible}
  <section class="upload-dock" aria-label={$t('pholy_upload_title')} data-testid="upload-panel">
    {#if showDetail}
      <div class="upload-panel">
        <header class="panel-header">
          <span class="header-icon" aria-hidden="true"><Icon icon={mdiCloudUploadOutline} size="25" /></span>
          <div class="header-copy">
            <h2>{$t('pholy_upload_title')}</h2>
            <p aria-live="polite">{$t(`pholy_upload_summary_${status}`)}</p>
          </div>
          <button
            type="button"
            class="icon-button"
            aria-label={$t('pholy_upload_minimize')}
            onclick={() => (showDetail = false)}
          >
            <Icon icon={mdiChevronDown} size="22" />
          </button>
        </header>

        {#if $uploadAssetsStore.length > 0}
          <div class="upload-summary">
            <div class="progress-heading">
              <span>{$t('pholy_upload_files', { values: { count: $uploadAssetsStore.length } })}</span>
              <strong>{progress.toLocaleString($locale)}<span>%</span></strong>
            </div>
            <progress max="100" value={progress} aria-label={$t('pholy_upload_total_progress')}></progress>
            <div class="transfer-metrics">
              <div>
                <span>{$t('pholy_upload_transferred')}</span>
                <strong
                  >{getByteUnitString($aggregate.loaded, $locale)}
                  <small>/ {getByteUnitString($aggregate.total, $locale)}</small></strong
                >
              </div>
              {#if transferring.length > 0}
                <div>
                  <span>{$t('pholy_upload_speed')}</span>
                  <strong
                    >{getByteUnitString(uploadManager.isPaused ? 0 : $aggregate.speed, $locale)}<small>/s</small
                    ></strong
                  >
                </div>
                <div>
                  <span>{$t('pholy_upload_time_remaining')}</span>
                  <strong>{duration}</strong>
                </div>
              {/if}
            </div>
            <div class="queue-counts">
              <span>{$t('pholy_upload_count_ready', { values: { count: ready } })}</span>
              {#if uploaded > 0}<span>{$t('pholy_upload_count_uploaded', { values: { count: uploaded } })}</span>{/if}
              {#if $aggregate.processing > 0}<span
                  >{$t('pholy_upload_count_processing', { values: { count: $aggregate.processing } })}</span
                >{/if}
              {#if duplicates > 0}<span>{$t('pholy_upload_count_duplicates', { values: { count: duplicates } })}</span
                >{/if}
              {#if attention.length > 0}<span class="error-count"
                  >{$t('pholy_upload_count_errors', { values: { count: attention.length } })}</span
                >{/if}
            </div>
          </div>
          <div class="queue-actions">
            {#if transferring.length > 0}
              <button
                type="button"
                class="primary-button"
                onclick={uploadManager.isPaused ? resumeUploads : pauseUploads}
              >
                <Icon icon={uploadManager.isPaused ? mdiPlay : mdiPause} size="17" />
                {$t(uploadManager.isPaused ? 'pholy_upload_resume' : 'pholy_upload_pause')}
              </button>
            {/if}
            {#if attention.length > 0}
              <button type="button" class="secondary-button" onclick={() => retryFailedUploads()}
                >{$t('pholy_upload_retry_failed')}</button
              >
            {/if}
            {#if commonTarget}
              <button type="button" class="secondary-button" onclick={addFiles}>
                <Icon icon={mdiPlus} size="16" />{$t('pholy_upload_add_files')}
              </button>
            {/if}
          </div>
          <div class="list-tools">
            <div class="list-filters" role="group" aria-label={$t('pholy_upload_filter_label')}>
              <button type="button" aria-pressed={filter === 'all'} onclick={() => setFilter('all')}>
                {$t('pholy_upload_filter_all')} <span>{$uploadAssetsStore.length}</span>
              </button>
              <button type="button" aria-pressed={filter === 'active'} onclick={() => setFilter('active')}>
                {$t('pholy_upload_filter_active')} <span>{active.length}</span>
              </button>
              <button type="button" aria-pressed={filter === 'attention'} onclick={() => setFilter('attention')}>
                {$t('pholy_upload_filter_errors')} <span>{attention.length}</span>
              </button>
            </div>
            {#if finished.length > 0}
              <button type="button" class="text-button" onclick={clearFinished}
                >{$t('pholy_upload_clear_finished')}</button
              >
            {/if}
          </div>
        {/if}

        <div class="file-list immich-scrollbar">
          {#if pendingResumables.length > 0}
            <div class="resumable-section">
              <h3>{$t('pholy_upload_resume_title')}</h3>
              <p>{$t('pholy_upload_reselect_help')}</p>
              {#if discardError}<p role="alert">{$t('pholy_upload_discard_error')}</p>{/if}
              <ul>
                {#each pendingResumables as session (session.id)}
                  <li class="resumable-file">
                    <p>{session.fileName}</p>
                    <span
                      >{getByteUnitString(session.offset, $locale)} / {getByteUnitString(
                        session.fileSize,
                        $locale,
                      )}</span
                    >
                    <div>
                      <button
                        type="button"
                        class="text-button"
                        onclick={() => reselectUpload(session.id)}
                        aria-label={$t('pholy_upload_reselect_file', { values: { file: session.fileName } })}
                        >{$t('pholy_upload_reselect')}</button
                      >
                      <button
                        type="button"
                        class="text-button muted"
                        onclick={() => discardSession(session.id)}
                        disabled={discarding === session.id}
                        aria-label={$t('pholy_upload_discard_file', { values: { file: session.fileName } })}
                        >{$t('pholy_upload_discard')}</button
                      >
                    </div>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
          {#if $uploadAssetsStore.length > 0}
            <ul aria-label={$t('pholy_upload_file_list')}>
              {#each filtered.slice(0, visibleLimit) as uploadAsset (uploadAsset.id)}
                <UploadAssetPreview {uploadAsset} />
              {/each}
            </ul>
            {#if filtered.length === 0}
              <p class="empty-filter">{$t('pholy_upload_filter_empty')}</p>
            {:else if filtered.length > visibleLimit}
              <button type="button" class="load-more" onclick={() => (visibleLimit += 100)}>
                {$t('pholy_upload_show_more', { values: { count: Math.min(100, filtered.length - visibleLimit) } })}
              </button>
            {/if}
          {/if}
        </div>

        <footer class="panel-footer">
          {#if $uploadAssetsStore.length > 0}
            <div class="destination">
              <Icon icon={commonTarget?.isLockedAssets ? mdiLockOutline : mdiFolderOutline} size="15" />
              <span
                >{$t('pholy_upload_destination')}:
                <strong
                  >{targets.size > 1
                    ? $t('pholy_upload_multiple_destinations')
                    : commonTarget?.isLockedAssets
                      ? $t('pholy_upload_locked')
                      : (commonTarget?.albumName ?? $t('pholy_upload_library'))}</strong
                ></span
              >
            </div>
          {/if}
          <details>
            <summary><Icon icon={mdiInformationOutline} size="15" />{$t('pholy_upload_details')}</summary>
            <div class="upload-details">
              <p>{$t('pholy_upload_keep_open')}</p>
              <p>{$t('pholy_upload_resume_explanation')}</p>
              {#if quotaRemaining !== undefined}
                <p>
                  {$t('pholy_upload_quota_available', { values: { size: getByteUnitString(quotaRemaining, $locale) } })}
                </p>
              {/if}
              <label for="upload-concurrency"
                >{$t('pholy_upload_concurrency')}
                <input
                  id="upload-concurrency"
                  type="number"
                  min="1"
                  max="6"
                  step="1"
                  bind:value={concurrency}
                  onchange={setConcurrency}
                />
              </label>
              <p class="supported-types">
                {$t('pholy_upload_supported_formats')}: {uploadManager.getExtensions().join(', ')}
              </p>
            </div>
          </details>
        </footer>
      </div>
    {:else}
      <div class="compact-upload">
        <button
          type="button"
          class="compact-main"
          onclick={() => (showDetail = true)}
          aria-label={$t('pholy_upload_expand')}
        >
          <Icon icon={mdiCloudUploadOutline} size="23" />
          <span><strong>{$t('pholy_upload_title')}</strong><span>{$t(`pholy_upload_summary_${status}`)}</span></span>
          {#if $uploadAssetsStore.length > 0}<strong class="compact-progress"
              >{progress.toLocaleString($locale)}%</strong
            >{/if}
          <Icon icon={mdiArrowExpand} size="17" />
        </button>
        {#if transferring.length > 0}
          <button
            type="button"
            class="compact-pause"
            onclick={uploadManager.isPaused ? resumeUploads : pauseUploads}
            aria-label={$t(uploadManager.isPaused ? 'pholy_upload_resume' : 'pholy_upload_pause')}
          >
            <Icon icon={uploadManager.isPaused ? mdiPlay : mdiPause} size="19" />
          </button>
        {/if}
        <progress max="100" value={progress} aria-label={$t('pholy_upload_total_progress')}></progress>
      </div>
    {/if}
  </section>
{/if}

<style>
  .upload-dock {
    position: fixed;
    z-index: 60;
    inset-inline-end: 24px;
    bottom: 24px;
    max-width: calc(100vw - 48px);
    color: var(--immich-ui-dark);
    font-family: inherit;
  }

  .upload-panel {
    display: flex;
    width: 560px;
    max-width: 100%;
    max-height: calc(100dvh - 112px);
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    box-shadow: 0 16px 64px #102f332b;
  }

  .panel-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 12px;
    padding: 20px;
    border-bottom: 1px solid var(--immich-ui-default-border);
  }

  .header-icon {
    display: grid;
    width: 42px;
    height: 42px;
    flex-shrink: 0;
    place-items: center;
    background: var(--immich-ui-primary-50);
    color: var(--immich-ui-primary-600);
  }

  .header-copy {
    flex: 1;
    min-width: 0;
  }

  h2 {
    font-size: 18px;
    font-weight: 650;
    letter-spacing: -0.025em;
    line-height: 1.3;
  }

  .header-copy p {
    margin-top: 3px;
    color: var(--immich-ui-muted);
    font-size: 12px;
  }

  button,
  summary {
    cursor: pointer;
  }

  button:focus-visible,
  summary:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--immich-ui-primary-500);
    outline-offset: 3px;
  }

  .icon-button {
    display: grid;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    place-items: center;
    color: var(--immich-ui-muted);
  }

  .icon-button:hover {
    background: var(--immich-ui-gray);
  }

  .upload-summary {
    flex-shrink: 0;
    padding: 18px 20px 14px;
    background: color-mix(in srgb, var(--immich-ui-primary-500) 3%, var(--immich-ui-light));
  }

  .progress-heading {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 14px;
    font-size: 13px;
  }

  .progress-heading > strong {
    font-size: 27px;
    font-weight: 550;
    letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .progress-heading strong span {
    margin-inline-start: 2px;
    color: var(--immich-ui-muted);
    font-size: 13px;
  }

  progress {
    display: block;
    width: 100%;
    height: 4px;
    margin-top: 13px;
    appearance: none;
    border: 0;
    background: var(--immich-ui-default-border);
    accent-color: var(--immich-ui-primary-500);
  }

  progress::-webkit-progress-bar {
    background: var(--immich-ui-default-border);
  }

  progress::-webkit-progress-value {
    background: var(--immich-ui-primary-500);
  }

  progress::-moz-progress-bar {
    background: var(--immich-ui-primary-500);
  }

  .transfer-metrics {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 22px;
    margin-top: 13px;
  }

  .transfer-metrics > div {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .transfer-metrics span {
    color: var(--immich-ui-muted);
    font-size: 10px;
  }

  .transfer-metrics strong {
    font-size: 12px;
    font-weight: 550;
    font-variant-numeric: tabular-nums;
  }

  .transfer-metrics small {
    color: var(--immich-ui-muted);
    font-size: 11px;
    font-weight: 400;
  }

  .queue-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 14px;
    margin-top: 13px;
    color: var(--immich-ui-muted);
    font-size: 11px;
  }

  .queue-counts .error-count {
    color: var(--immich-ui-danger-600, #b13b39);
  }

  .queue-actions {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px 20px;
  }

  .primary-button,
  .secondary-button {
    display: inline-flex;
    min-height: 38px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 11px;
    border: 1px solid var(--immich-ui-default-border);
    font-size: 12px;
    font-weight: 550;
  }

  .primary-button {
    border-color: var(--immich-ui-primary-500);
    background: var(--immich-ui-primary-500);
    color: var(--immich-ui-light);
  }

  .secondary-button {
    color: var(--immich-ui-primary-600);
  }

  .secondary-button:hover {
    background: var(--immich-ui-gray);
  }

  .primary-button:hover {
    background: var(--immich-ui-primary-600);
  }

  .list-tools {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 0 10px;
    padding: 0 20px;
    border-bottom: 1px solid var(--immich-ui-default-border);
  }

  .list-filters {
    display: flex;
    gap: 14px;
  }

  .list-filters button {
    min-height: 42px;
    border-bottom: 2px solid transparent;
    color: var(--immich-ui-muted);
    font-size: 11px;
  }

  .list-filters button[aria-pressed='true'] {
    border-color: var(--immich-ui-primary-500);
    color: var(--immich-ui-primary-600);
    font-weight: 600;
  }

  .list-filters button span {
    margin-inline-start: 3px;
    font-variant-numeric: tabular-nums;
  }

  .text-button {
    min-height: 36px;
    color: var(--immich-ui-primary-600);
    font-size: 11px;
    font-weight: 550;
  }

  .text-button:hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .text-button.muted {
    color: var(--immich-ui-muted);
  }

  .file-list {
    min-height: 80px;
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .empty-filter {
    padding: 24px 20px;
    color: var(--immich-ui-muted);
    font-size: 12px;
    text-align: center;
  }

  .load-more {
    width: 100%;
    min-height: 44px;
    color: var(--immich-ui-primary-600);
    font-size: 12px;
  }

  .resumable-section {
    padding: 18px 20px;
    border-bottom: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-gray);
  }

  .resumable-section h3 {
    font-size: 13px;
    font-weight: 600;
  }

  .resumable-section > p {
    margin-top: 6px;
    color: var(--immich-ui-muted);
    font-size: 12px;
    line-height: 1.6;
  }

  .resumable-file {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--immich-ui-default-border);
  }

  .resumable-file p {
    overflow-wrap: anywhere;
    font-size: 12px;
    font-weight: 550;
  }

  .resumable-file > span {
    color: var(--immich-ui-muted);
    font-size: 11px;
  }

  .resumable-file > div {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }

  .panel-footer {
    flex-shrink: 0;
    max-height: 220px;
    overflow-y: auto;
    padding: 12px 20px;
    border-top: 1px solid var(--immich-ui-default-border);
    color: var(--immich-ui-muted);
    font-size: 11px;
  }

  .destination,
  summary {
    display: flex;
    align-items: center;
    gap: 7px;
  }

  .destination {
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }

  .destination strong {
    font-weight: 500;
  }

  summary {
    min-height: 30px;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .upload-details p {
    margin-top: 8px;
    line-height: 1.6;
  }

  .upload-details label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 12px;
  }

  .upload-details input {
    width: 64px;
    padding: 6px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    font-size: 12px;
  }

  .supported-types {
    overflow-wrap: anywhere;
  }

  .compact-upload {
    position: relative;
    display: flex;
    width: 400px;
    max-width: 100%;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    box-shadow: 0 8px 30px #102f3326;
  }

  .compact-main {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: 12px;
    padding: 16px;
    text-align: start;
  }

  .compact-main > span {
    display: flex;
    min-width: 0;
    flex: 1;
    flex-direction: column;
    gap: 3px;
  }

  .compact-main strong {
    font-size: 13px;
    font-weight: 600;
  }

  .compact-main > span > span {
    overflow: hidden;
    color: var(--immich-ui-muted);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .compact-progress {
    color: var(--immich-ui-primary-600);
    font-variant-numeric: tabular-nums;
  }

  .compact-pause {
    display: grid;
    width: 48px;
    flex-shrink: 0;
    place-items: center;
    border-inline-start: 1px solid var(--immich-ui-default-border);
    color: var(--immich-ui-primary-600);
  }

  .compact-upload progress {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    height: 3px;
    margin: 0;
  }

  @media (max-width: 600px) {
    .upload-dock {
      inset-inline: 12px;
      bottom: max(12px, env(safe-area-inset-bottom));
      max-width: none;
    }

    .upload-panel,
    .compact-upload {
      width: 100%;
    }

    .upload-panel {
      max-height: calc(100dvh - 96px);
    }

    .panel-header {
      padding: 14px;
    }

    .upload-summary {
      padding: 14px;
    }

    .queue-actions {
      padding: 10px 14px;
    }

    .list-tools {
      padding: 0 14px;
    }

    .transfer-metrics {
      gap: 10px 14px;
    }

    .panel-footer {
      padding: 10px 14px;
    }

    .compact-main {
      gap: 9px;
      padding: 14px 12px;
    }
  }
</style>
