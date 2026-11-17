<script lang="ts">
  import { Route } from '#lib/route.ts';
  import { locale } from '#lib/stores/preferences.store.ts';
  import { UploadState, type UploadAsset } from '#lib/types.ts';
  import { getByteUnitString } from '#lib/utils/byte-units.ts';
  import { cancelUpload, dismissUpload, retryUpload } from '#lib/utils/file-uploader.ts';
  import { Icon } from '@immich/ui';
  import {
    mdiAlertCircleOutline,
    mdiCheck,
    mdiCloudCheckOutline,
    mdiContentCopy,
    mdiFileImageOutline,
    mdiFilmstrip,
    mdiFolderOutline,
    mdiLockOutline,
    mdiOpenInNew,
    mdiPause,
    mdiTimerSand,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    uploadAsset: UploadAsset;
  }

  let { uploadAsset }: Props = $props();
  const file = $derived(uploadAsset.file);
  let previewUrl = $state<string>();
  let previewFailed = $state(false);

  const phase = $derived.by(() => {
    switch (uploadAsset.state) {
      case UploadState.HASHING: {
        return 'hashing';
      }
      case UploadState.STARTED: {
        return 'uploading';
      }
      case UploadState.PROCESSING: {
        return 'processing';
      }
      case UploadState.DONE: {
        return 'ready';
      }
      case UploadState.UPLOADED: {
        return 'uploaded';
      }
      case UploadState.DUPLICATED: {
        return 'duplicate';
      }
      case UploadState.ERROR: {
        return 'error';
      }
      case UploadState.RETRYING: {
        return 'retrying';
      }
      case UploadState.PAUSED: {
        return 'paused';
      }
      case UploadState.CANCELLED: {
        return 'cancelled';
      }
      default: {
        return 'waiting';
      }
    }
  });
  const progress = $derived(Math.min(100, Math.max(0, uploadAsset.progress ?? 0)));
  const canCancel = $derived(['waiting', 'hashing', 'uploading', 'retrying', 'paused'].includes(phase));
  const canRetry = $derived(phase === 'error' || phase === 'cancelled');
  const canDismiss = $derived(['ready', 'uploaded', 'duplicate', 'error', 'cancelled'].includes(phase));
  const statusIcon = $derived(
    phase === 'ready'
      ? mdiCheck
      : phase === 'uploaded'
        ? mdiCloudCheckOutline
        : phase === 'duplicate'
          ? mdiContentCopy
          : phase === 'error'
            ? mdiAlertCircleOutline
            : phase === 'paused'
              ? mdiPause
              : mdiTimerSand,
  );

  // Keep one object URL per File, rather than replacing it on each progress event.
  $effect(() => {
    const image = file.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|avif|bmp)$/i.test(file.name);
    const url = image ? URL.createObjectURL(file) : undefined;
    previewUrl = url;
    previewFailed = false;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  });
</script>

<li class="upload-file" data-state={phase} data-testid="upload-file">
  <div class="file-preview" aria-hidden="true">
    {#if previewUrl && !previewFailed}
      <img src={previewUrl} alt="" loading="lazy" decoding="async" onerror={() => (previewFailed = true)} />
    {:else}
      <Icon icon={file.type.startsWith('video/') ? mdiFilmstrip : mdiFileImageOutline} size="26" />
    {/if}
  </div>
  <div class="file-content">
    <div class="file-heading">
      <p class="file-name" title={file.name}>{file.name}</p>
      <span class="file-size">{getByteUnitString(file.size, $locale)}</span>
    </div>

    <div class="file-meta">
      <span class="file-state">
        <Icon icon={statusIcon} size="14" />
        {$t(`pholy_upload_state_${phase}`)}
      </span>
      {#if uploadAsset.isLockedAssets}
        <span class="file-destination"><Icon icon={mdiLockOutline} size="13" />{$t('pholy_upload_locked')}</span>
      {:else if uploadAsset.albumName}
        <span class="file-destination"><Icon icon={mdiFolderOutline} size="13" />{uploadAsset.albumName}</span>
      {/if}
      {#if phase === 'uploading'}
        <span class="file-percent">{progress}%</span>
      {/if}
    </div>

    {#if phase === 'uploading' || phase === 'paused'}
      <progress
        max="100"
        value={progress}
        aria-label={$t('pholy_upload_file_progress', { values: { file: file.name } })}
      ></progress>
    {:else if ['hashing', 'processing', 'retrying'].includes(phase)}
      <progress aria-label={$t('pholy_upload_file_progress', { values: { file: file.name } })}></progress>
    {/if}

    {#if phase === 'error'}
      <p class="file-message error-message">
        {typeof uploadAsset.error === 'string' ? uploadAsset.error : $t('pholy_upload_error_help')}
      </p>
    {:else if phase === 'duplicate'}
      <p class="file-message">
        {$t(uploadAsset.isTrashed ? 'pholy_upload_duplicate_trash' : 'pholy_upload_duplicate_help')}
      </p>
    {:else if phase === 'processing'}
      <p class="file-message">{$t('pholy_upload_processing_help')}</p>
    {:else if phase === 'uploaded'}
      <p class="file-message">{$t('pholy_upload_uploaded_help')}</p>
    {:else if phase === 'cancelled' && uploadAsset.message}
      <p class="file-message">{uploadAsset.message}</p>
    {:else if phase === 'retrying'}
      <p class="file-message">
        {$t('pholy_upload_retry_help', { values: { attempt: uploadAsset.attempts ?? 1 } })}
      </p>
    {/if}

    {#if canCancel || canRetry || canDismiss || uploadAsset.assetId}
      <div class="file-actions">
        {#if uploadAsset.assetId && (phase === 'ready' || phase === 'duplicate')}
          <a
            href={uploadAsset.isTrashed
              ? Route.viewTrashedAsset({ id: uploadAsset.assetId })
              : Route.viewAsset({ id: uploadAsset.assetId })}
            aria-label={$t('pholy_upload_open_file', { values: { file: file.name } })}
          >
            {$t('pholy_upload_open')}<Icon icon={mdiOpenInNew} size="13" />
          </a>
        {/if}
        {#if canRetry}
          <button
            type="button"
            onclick={() => retryUpload(uploadAsset.id)}
            aria-label={$t('pholy_upload_retry_file', { values: { file: file.name } })}
            >{$t('pholy_upload_retry')}</button
          >
        {/if}
        {#if canCancel}
          <button
            type="button"
            onclick={() => cancelUpload(uploadAsset.id)}
            aria-label={$t('pholy_upload_cancel_file', { values: { file: file.name } })}
            >{$t('pholy_upload_cancel')}</button
          >
        {/if}
        {#if canDismiss}
          <button
            type="button"
            class="muted-action"
            onclick={() => dismissUpload(uploadAsset.id)}
            aria-label={$t('pholy_upload_dismiss_file', { values: { file: file.name } })}
            >{$t('pholy_upload_dismiss')}</button
          >
        {/if}
      </div>
    {/if}
  </div>
</li>

<style>
  .upload-file {
    display: flex;
    gap: 14px;
    padding: 17px 20px;
    border-bottom: 1px solid var(--immich-ui-default-border);
  }

  .file-preview {
    display: grid;
    flex-shrink: 0;
    width: 58px;
    height: 66px;
    place-items: center;
    overflow: hidden;
    background: var(--immich-ui-gray);
    color: var(--immich-ui-muted);
  }

  .file-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .file-content {
    flex: 1;
    min-width: 0;
  }

  .file-heading,
  .file-meta,
  .file-actions,
  .file-state,
  .file-destination {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .file-heading {
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }

  .file-name {
    overflow: hidden;
    font-size: 13px;
    font-weight: 550;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-size,
  .file-percent {
    flex-shrink: 0;
    color: var(--immich-ui-muted);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .file-meta {
    flex-wrap: wrap;
    gap: 6px 12px;
    margin-top: 5px;
    color: var(--immich-ui-muted);
    font-size: 11px;
  }

  .file-destination {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .file-percent {
    margin-inline-start: auto;
  }

  [data-state='ready'] .file-state,
  [data-state='uploading'] .file-state {
    color: var(--immich-ui-primary-600);
  }

  [data-state='error'] .file-state,
  .error-message {
    color: var(--immich-ui-danger-600, #b13b39);
  }

  progress {
    display: block;
    width: 100%;
    height: 3px;
    margin-top: 10px;
    overflow: hidden;
    appearance: none;
    border: 0;
    background: var(--immich-ui-gray);
    accent-color: var(--immich-ui-primary-500);
  }

  progress::-webkit-progress-bar {
    background: var(--immich-ui-gray);
  }

  progress::-webkit-progress-value {
    background: var(--immich-ui-primary-500);
    transition: width 150ms;
  }

  progress::-moz-progress-bar {
    background: var(--immich-ui-primary-500);
  }

  progress:indeterminate {
    background: linear-gradient(
      90deg,
      var(--immich-ui-gray) 0% 30%,
      var(--immich-ui-primary-300) 30% 70%,
      var(--immich-ui-gray) 70% 100%
    );
    background-size: 200% 100%;
    animation: transfer 1.6s linear infinite;
  }

  .file-message {
    margin-top: 7px;
    font-size: 11px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .file-actions {
    flex-wrap: wrap;
    gap: 4px 14px;
    margin-top: 6px;
  }

  .file-actions button,
  .file-actions a {
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    color: var(--immich-ui-primary-600);
    font-size: 11px;
    font-weight: 550;
  }

  .file-actions .muted-action {
    color: var(--immich-ui-muted);
  }

  .file-actions :is(button, a):hover {
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .file-actions :is(button, a):focus-visible {
    outline: 2px solid var(--immich-ui-primary-500);
    outline-offset: 3px;
  }

  @keyframes transfer {
    to {
      background-position: -200% 0;
    }
  }

  @media (max-width: 400px) {
    .upload-file {
      gap: 10px;
      padding: 14px;
    }

    .file-preview {
      width: 44px;
      height: 54px;
    }

    .file-heading {
      flex-wrap: wrap;
      gap: 2px;
    }

    .file-name {
      width: 100%;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    progress:indeterminate {
      animation: none;
    }

    progress::-webkit-progress-value {
      transition: none;
    }
  }
</style>
