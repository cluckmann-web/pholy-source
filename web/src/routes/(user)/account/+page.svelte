<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import { createPreloadedQuery, queryClient } from '#lib/queries/client.ts';
  import {
    cancelPholyClosureMutation,
    closePholyAccountMutation,
    getPholyAccountQuery,
    getPholyExportPartQuery,
    pholyArchiveUrl,
    pholyMetadataUrl,
    startPholyExportMutation,
  } from '#lib/queries/pholy-account.query.ts';
  import { createMutation } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const account = createPreloadedQuery(getPholyAccountQuery);
  const startExport = createMutation(startPholyExportMutation);
  const closeAccount = createMutation(closePholyAccountMutation);
  const cancelClosure = createMutation(cancelPholyClosureMutation);
  let exportPassword = $state('');
  let closurePassword = $state('');
  let email = $state('');
  let confirmed = $state(false);
  let error = $state('');
  let exportError = $state('');
  let loadingPart = $state(false);
  let exportReady = $state(false);
  let parts = $state<Array<{ cursor?: string; count: number; size: number }>>([]);
  let nextCursor = $state<string | null>(null);
  const formatDate = (value: string) => new Date(value).toLocaleString();
  const formatSize = (value: number) =>
    (value / 1024 ** 3).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' GiB';

  async function loadPart(cursor?: string) {
    loadingPart = true;
    exportError = '';
    try {
      const part = await queryClient.fetchQuery(getPholyExportPartQuery(cursor));
      if (part.count) parts = [...parts, { cursor, count: part.count, size: part.size }];
      nextCursor = part.nextCursor;
      exportReady = true;
    } catch (error_) {
      exportError = error_ instanceof Error ? error_.message : $t('pholy_account.error');
    } finally {
      loadingPart = false;
    }
  }
  async function beginExport(event: SubmitEvent) {
    event.preventDefault();
    exportError = '';
    try {
      await startExport.mutateAsync([exportPassword]);
      exportPassword = '';
      parts = [];
      nextCursor = null;
      exportReady = true;
      await loadPart();
    } catch (error_) {
      exportError = error_ instanceof Error ? error_.message : $t('pholy_account.error');
    } finally {
      exportPassword = '';
    }
  }
  async function requestClosure(event: SubmitEvent) {
    event.preventDefault();
    error = '';
    try {
      await closeAccount.mutateAsync([{ email, password: closurePassword, confirm: true }]);
      confirmed = false;
      email = '';
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_account.error');
    } finally {
      closurePassword = '';
    }
  }
  async function cancel() {
    error = '';
    try {
      await cancelClosure.mutateAsync([]);
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_account.error');
    }
  }
</script>

<UserPageLayout title={data.meta.title}>
  <div class="pholy-account mx-auto w-full max-w-4xl space-y-8 px-4 py-6">
    <p class="text-immich-fg/70 dark:text-immich-dark-fg/70">{$t('pholy_account.intro')}</p>
    {#if !account.data.hasPassword}
      <div class="notice" role="status">{$t('pholy_account.password_required')}</div>
    {/if}
    <section class="panel" aria-labelledby="export-title">
      <h2 id="export-title">{$t('pholy_account.export_title')}</h2>
      <p>{$t('pholy_account.export_description')}</p>
      <p class="hint">{$t('pholy_account.export_live_note')}</p>
      <form onsubmit={beginExport} class="mt-5 flex flex-wrap items-end gap-3">
        <label class="grow"
          >{$t('pholy_account.current_password')}
          <input
            type="password"
            autocomplete="current-password"
            bind:value={exportPassword}
            required
            maxlength="256"
            disabled={!account.data.hasPassword}
          />
        </label>
        <button
          class="primary"
          type="submit"
          disabled={!account.data.hasPassword || startExport.isPending || loadingPart}
        >
          {startExport.isPending ? $t('pholy_account.preparing') : $t('pholy_account.prepare_export')}
        </button>
      </form>
      {#if exportError}<p role="alert" class="error">{exportError}</p>{/if}
      {#if exportReady && account.data.exportExpiresAt}
        <div class="mt-6 space-y-4">
          <p class="hint">
            {$t('pholy_account.export_until', { values: { date: formatDate(account.data.exportExpiresAt) } })}
          </p>
          <a class="download" href={pholyMetadataUrl} download>{$t('pholy_account.download_metadata')}</a>
          {#each parts as part, i (part.cursor ?? 'start')}
            <a class="download flex flex-wrap justify-between gap-2" href={pholyArchiveUrl(part.cursor)} download>
              <span>{$t('pholy_account.download_part', { values: { number: i + 1 } })}</span>
              <span class="hint"
                >{$t('pholy_account.part_count', { values: { count: part.count, size: formatSize(part.size) } })}</span
              >
            </a>
          {/each}
          {#if nextCursor}
            <button type="button" class="secondary" disabled={loadingPart} onclick={() => loadPart(nextCursor!)}
              >{$t('pholy_account.next_part')}</button
            >
          {:else if !loadingPart && parts.length > 0}
            <p class="hint">{$t('pholy_account.all_parts')}</p>
          {:else if !loadingPart && !exportError}
            <p class="hint">{$t('pholy_account.no_originals')}</p>
          {/if}
          {#if loadingPart}<p role="status">{$t('pholy_account.preparing')}</p>{/if}
          {#if exportError}<button
              type="button"
              class="secondary"
              disabled={loadingPart}
              onclick={() => loadPart(nextCursor ?? undefined)}>{$t('pholy_account.retry')}</button
            >{/if}
        </div>
      {/if}
    </section>
    <section class="panel" aria-labelledby="close-title">
      <h2 id="close-title">{$t('pholy_account.close_title')}</h2>
      {#if account.data.closeAfter}
        <div class="notice" role="status">
          <p>{$t('pholy_account.pending', { values: { date: formatDate(account.data.closeAfter) } })}</p>
          <button type="button" class="secondary mt-4" disabled={cancelClosure.isPending} onclick={cancel}
            >{$t('pholy_account.cancel_closure')}</button
          >
        </div>
      {:else if account.data.isAdmin}
        <p>{$t('pholy_account.admin_protected')}</p>
      {:else}
        <p>{$t('pholy_account.close_description')}</p>
        <p class="hint">{$t('pholy_account.close_warning')}</p>
        <form onsubmit={requestClosure} class="mt-5 space-y-4">
          <label
            >{$t('pholy_account.confirm_email')}<input
              type="email"
              autocomplete="email"
              bind:value={email}
              required
              maxlength="254"
              placeholder={account.data.email}
            /></label
          >
          <label
            >{$t('pholy_account.current_password')}<input
              type="password"
              autocomplete="current-password"
              bind:value={closurePassword}
              required
              maxlength="256"
              disabled={!account.data.hasPassword}
            /></label
          >
          <label class="flex items-start gap-3"
            ><input class="mt-1" type="checkbox" bind:checked={confirmed} required /><span
              >{$t('pholy_account.confirm_closure')}</span
            ></label
          >
          <button
            class="danger"
            type="submit"
            disabled={!account.data.hasPassword || !confirmed || closeAccount.isPending}
            >{$t('pholy_account.schedule_closure')}</button
          >
        </form>
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </section>
  </div>
</UserPageLayout>

<style>
  .panel {
    border: 1px solid var(--color-immich-primary, #3f665a);
    padding: 1.5rem;
  }
  h2 {
    font-size: 1.25rem;
    font-weight: 600;
    margin-bottom: 0.8rem;
  }
  p {
    line-height: 1.6;
  }
  .hint {
    opacity: 0.72;
    font-size: 0.875rem;
    margin-top: 0.4rem;
  }
  label {
    display: block;
    font-size: 0.9rem;
  }
  input:not([type='checkbox']) {
    display: block;
    width: 100%;
    padding: 0.7rem;
    border: 1px solid #8c9992;
    margin-top: 0.35rem;
    background: transparent;
    border-radius: 0;
  }
  button,
  .download {
    padding: 0.75rem 1rem;
    border-radius: 0;
    font-weight: 500;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .primary {
    background: #285649;
    color: white;
  }
  .secondary,
  .download {
    border: 1px solid #8c9992;
  }
  .download {
    display: block;
  }
  .danger {
    background: #9f3535;
    color: white;
  }
  .notice {
    border-left: 3px solid #a77c23;
    padding: 1rem;
    background: #a77c2310;
  }
  .error {
    color: #b34b4b;
    margin-top: 1rem;
  }
</style>
