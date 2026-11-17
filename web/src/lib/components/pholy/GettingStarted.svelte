<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { createAlbumMutation, getAllAlbumsQuery } from '#lib/queries/album.query.ts';
  import { Route } from '#lib/route.ts';
  import { uploadAssetsStore } from '#lib/stores/upload.ts';
  import { openFileUploadDialog } from '#lib/utils/file-uploader.ts';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';

  type Progress = { dismissed: boolean; app: boolean; album: boolean; upload: boolean };
  const { settings = false }: { settings?: boolean } = $props();
  const userId = authManager.user.id;
  const storageKey = `pholy:onboarding:v1:${userId}`;
  const hasUploads = (authManager.user.quotaUsageInBytes ?? 0) > 0;
  let progress = $state<Progress>({ dismissed: false, app: false, album: false, upload: hasUploads });
  let expanded = $state(false);
  let ready = $state(false);
  let copied = $state(false);
  let copyFailed = $state(false);
  const albums = createQuery(() => ({ ...getAllAlbumsQuery({ isOwned: true }), enabled: ready && expanded }));
  const create = createMutation(createAlbumMutation);
  const albumDone = $derived(progress.album || (albums.data?.length ?? 0) > 0);
  const complete = $derived(Number(progress.app) + Number(albumDone) + Number(progress.upload));

  const save = (change: Partial<Progress>) => {
    progress = { ...progress, ...change };
    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch {
      // The guide remains usable when browser storage is unavailable.
    }
  };

  onMount(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (stored && typeof stored === 'object') {
        const values = stored as Record<string, unknown>;
        for (const key of ['dismissed', 'app', 'album', 'upload'] as const) {
          if (typeof values[key] === 'boolean') progress[key] = values[key];
        }
      }
    } catch {
      // Invalid or unavailable storage starts a fresh guide for this account.
    }
    progress.upload ||= hasUploads;
    expanded = !settings && !hasUploads && !progress.dismissed;
    ready = true;
    // Only count uploads accepted during this account's mounted session.
    // Older successes in the upload panel can belong to a previous session.
    const initialSuccess = get(uploadAssetsStore.stats).success;
    return uploadAssetsStore.stats.subscribe(({ success }) => {
      if (success > initialSuccess && !progress.upload) save({ upload: true });
    });
  });

  const dismiss = () => {
    save({ dismissed: true });
    expanded = false;
  };
  const reopen = () => {
    save({ dismissed: false });
    expanded = true;
  };
  const createFirstAlbum = async () => {
    if (create.isPending) return;
    try {
      const album = await create.mutateAsync([{ createAlbumDto: { albumName: $t('pholy_onboarding_album_name') } }]);
      save({ album: true });
      await goto(Route.viewAlbum(album));
    } catch {
      // The shared mutation handler displays the translated failure toast.
    }
  };
  const copyServer = async () => {
    try {
      await navigator.clipboard.writeText('https://pholy.de');
      copied = true;
      copyFailed = false;
    } catch {
      copyFailed = true;
    }
  };
</script>

{#if ready}
  {#if expanded}
    <section class="getting-started" aria-labelledby="getting-started-title" data-testid="pholy-onboarding">
      <header>
        <div>
          <p class="eyebrow">{$t('pholy_onboarding_eyebrow')}</p>
          <h2 id="getting-started-title">{$t('pholy_onboarding_title')}</h2>
          <p>{$t('pholy_onboarding_description')}</p>
        </div>
        <button class="quiet" type="button" onclick={dismiss}>{$t('pholy_onboarding_dismiss')}</button>
      </header>
      <p class="completion" aria-live="polite">{$t('pholy_onboarding_progress', { values: { count: complete } })}</p>
      <ol>
        <li class:complete={progress.app}>
          <div class="step-title">
            <span class="number" aria-hidden="true">{progress.app ? '✓' : '01'}</span>
            <h3>{$t('pholy_onboarding_app_title')}</h3>
          </div>
          <p>{$t('pholy_onboarding_app_text')}</p>
          <div class="stores">
            <a href="https://apps.apple.com/us/app/immich/id1613945652" target="_blank" rel="noopener noreferrer"
              >App Store ↗</a
            ><a
              href="https://play.google.com/store/apps/details?id=app.alextran.immich"
              target="_blank"
              rel="noopener noreferrer">Google Play ↗</a
            >
          </div>
          <span class="server-label">{$t('pholy_invitation.server')}</span>
          <div class="server">
            <code>https://pholy.de</code><button class="quiet" type="button" onclick={copyServer}
              >{copied ? $t('pholy_invitation.copied') : $t('pholy_invitation.copy')}</button
            >
          </div>
          <p class="help">{$t('pholy_onboarding_app_login')}</p>
          {#if copyFailed}<p role="status">{$t('pholy_invitation.copy_manually')}</p>{/if}
          <label
            ><input
              type="checkbox"
              checked={progress.app}
              onchange={(event) => save({ app: event.currentTarget.checked })}
            />{$t('pholy_onboarding_app_connected')}</label
          >
        </li>
        <li class:complete={albumDone}>
          <div class="step-title">
            <span class="number" aria-hidden="true">{albumDone ? '✓' : '02'}</span>
            <h3>{$t('pholy_onboarding_album_title')}</h3>
          </div>
          <p>{$t('pholy_onboarding_album_text')}</p>
          {#if albums.isError}<p class="error" role="alert">{$t('pholy_onboarding_album_error')}</p>
            <button class="quiet" type="button" onclick={() => albums.refetch()}>{$t('retry')}</button>{/if}
          {#if albumDone}
            <p class="done">{$t('pholy_onboarding_album_done')}</p>
            <a class="button" href={Route.albums()}>{$t('pholy_onboarding_view_albums')}</a>
          {:else}
            <button
              class="button"
              type="button"
              onclick={createFirstAlbum}
              disabled={create.isPending || albums.isPending || albums.isError}
              >{$t('pholy_onboarding_create_album')}</button
            >
          {/if}
        </li>
        <li class:complete={progress.upload}>
          <div class="step-title">
            <span class="number" aria-hidden="true">{progress.upload ? '✓' : '03'}</span>
            <h3>{$t('pholy_onboarding_upload_title')}</h3>
          </div>
          <p>{$t('pholy_onboarding_upload_text')}</p>
          {#if progress.upload}<p class="done">{$t('pholy_onboarding_upload_done')}</p>{/if}
          <button class="button primary" type="button" onclick={() => openFileUploadDialog()}
            >{$t('pholy_onboarding_upload_action')}</button
          >
          <p class="help">{$t('pholy_onboarding_upload_help')}</p>
        </li>
      </ol>
      <p class="return-help">{$t('pholy_onboarding_return_help')}</p>
    </section>
  {:else}
    <div class="onboarding-reopen">
      <button type="button" onclick={reopen}>{$t('pholy_onboarding_reopen')} ↗</button>
    </div>
  {/if}
{/if}

<style>
  .getting-started {
    margin: 12px 0 24px;
    padding: 24px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
  }
  header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }
  h2 {
    font-size: clamp(21px, 2.5vw, 27px);
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1.3;
    margin: 4px 0 10px;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
  }
  p {
    font-size: 13px;
    line-height: 1.65;
    color: var(--immich-ui-muted);
  }
  .eyebrow,
  .server-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--immich-ui-primary);
  }
  .completion {
    margin: 16px 0;
    font-size: 12px;
    color: var(--immich-ui-primary);
  }
  ol {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0;
    list-style: none;
    padding: 0;
    border: 1px solid var(--immich-ui-default-border);
  }
  li {
    padding: 20px;
    min-width: 0;
    border-right: 1px solid var(--immich-ui-default-border);
  }
  li:last-child {
    border-right: 0;
  }
  .step-title {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .number {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border: 1px solid var(--immich-ui-default-border);
    font-size: 11px;
  }
  .complete .number {
    background: var(--immich-ui-primary);
    color: var(--immich-ui-light);
  }
  .stores {
    display: flex;
    flex-wrap: wrap;
    gap: 14px;
    margin: 12px 0 18px;
    font-size: 12px;
  }
  a {
    color: var(--immich-ui-primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .server {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 5px 0 8px;
  }
  code {
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .help {
    font-size: 11px;
    margin-top: 12px;
  }
  .done {
    color: var(--immich-ui-primary);
    font-size: 12px;
    margin-top: 14px;
  }
  .error {
    color: #bd493d;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    padding: 10px 14px;
    margin-top: 18px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    font-size: 12px;
    text-decoration: none;
    cursor: pointer;
    border-radius: 0;
  }
  .primary {
    background: var(--immich-ui-primary);
    color: var(--immich-ui-light);
    border-color: var(--immich-ui-primary);
  }
  .quiet {
    color: var(--immich-ui-primary);
    font-size: 12px;
    padding: 6px 0;
    cursor: pointer;
    text-align: start;
  }
  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    margin-top: 18px;
  }
  input {
    width: 16px;
    height: 16px;
    accent-color: var(--immich-ui-primary);
    flex-shrink: 0;
  }
  .return-help {
    margin-top: 16px;
    font-size: 11px;
  }
  .onboarding-reopen {
    margin: 12px 0;
  }
  .onboarding-reopen button {
    font-size: 12px;
    color: var(--immich-ui-primary);
    padding: 6px 0;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  :is(a, button, input):focus-visible {
    outline: 2px solid var(--immich-ui-primary);
    outline-offset: 3px;
  }
  @media (max-width: 1050px) {
    ol {
      grid-template-columns: 1fr;
    }
    li {
      border-right: 0;
      border-bottom: 1px solid var(--immich-ui-default-border);
    }
    li:last-child {
      border-bottom: 0;
    }
  }
  @media (max-width: 639px) {
    .getting-started {
      padding: 16px;
    }
    li {
      padding: 16px;
    }
  }
</style>
