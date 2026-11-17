<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import { createPreloadedQuery, queryClient } from '#lib/queries/client.ts';
  import { getPholyHistoryQuery, getPholyQuotaQuery, type PholyHistoryItem } from '#lib/queries/pholy-history.query.ts';
  import { Route } from '#lib/route.ts';
  import { locale } from '#lib/stores/preferences.store.ts';
  import { getByteUnitString } from '#lib/utils/byte-units.ts';
  import { t } from 'svelte-i18n';

  let pageNumber = $state(0);
  let changingPage = $state(false);
  let pageError = $state(false);
  const changePage = async (next: number) => {
    changingPage = true;
    pageError = false;
    try {
      await queryClient.query(getPholyHistoryQuery(next));
      pageNumber = next;
    } catch {
      pageError = true;
    } finally {
      changingPage = false;
    }
  };
  const history = createPreloadedQuery(() => getPholyHistoryQuery(pageNumber));
  const quota = createPreloadedQuery(() => getPholyQuotaQuery());
  const labels = $derived({
    processing: $t('pholy_history_status_processing'),
    ready: $t('pholy_history_status_ready'),
    'processing-error': $t('pholy_history_status_processing_error'),
    duplicate: $t('pholy_history_status_duplicate'),
    cancelled: $t('pholy_history_status_cancelled'),
    failed: $t('pholy_history_status_failed'),
  });
  const steps = $derived({
    metadata: $t('pholy_history_step_metadata'),
    storage: $t('pholy_history_step_storage'),
    preview: $t('pholy_history_step_preview'),
    video: $t('pholy_history_step_video'),
  });
  const percentage = $derived(
    quota.data.limit === null
      ? 0
      : quota.data.limit <= 0
        ? 100
        : Math.min(100, Math.floor((quota.data.usage / quota.data.limit) * 100)),
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat($locale === 'dev' ? 'en' : $locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  const detail = (item: PholyHistoryItem) => {
    if (item.status === 'processing-error')
      return $t('pholy_history_processing_error_detail', {
        values: { step: item.processingStep ? steps[item.processingStep] : steps.preview },
      });
    if (item.status === 'failed') return $t('pholy_history_failed_detail');
    if (item.status === 'cancelled') return $t('pholy_history_cancelled_detail');
    if (item.status === 'processing') return $t('pholy_history_processing_detail');
    return '';
  };
</script>

<UserPageLayout title={$t('pholy_history_title')} description={$t('pholy_history_description')}>
  <div class="history-shell">
    <section class="storage-card" aria-label={$t('pholy_history_storage')}>
      <div class="section-heading">
        <h2>{$t('pholy_history_storage')}</h2>
        <a href={Route.userSettings()}>{$t('pholy_history_account_settings')}</a>
      </div>
      <p class="storage-total">
        {getByteUnitString(quota.data.usage)}
        <span>/ {quota.data.limit === null ? $t('pholy_history_unlimited') : getByteUnitString(quota.data.limit)}</span>
      </p>
      {#if quota.data.limit !== null}
        <progress max="100" value={percentage} aria-label={$t('pholy_history_storage')}></progress>
        <p class:storage-alert={quota.data.level !== 'normal'}>
          {quota.data.level === 'full'
            ? $t('pholy_history_quota_full_detail')
            : $t('pholy_history_quota_remaining', { values: { size: getByteUnitString(quota.data.remaining ?? 0) } })}
        </p>
      {/if}
      <div class="storage-actions">
        <a href={Route.trash()}>{$t('pholy_history_open_trash')}</a><a href={Route.help()}
          >{$t('pholy_history_get_help')}</a
        >
      </div>
    </section>

    <section aria-label={$t('pholy_history_title')}>
      <div class="section-heading">
        <p>{$t('pholy_history_retention', { values: { days: history.data.retentionDays } })}</p>
        <button
          type="button"
          onclick={() => {
            void history.refetch();
            void quota.refetch();
          }}
          disabled={history.isFetching}>{$t('pholy_history_refresh')}</button
        >
      </div>
      {#if history.isError || quota.isError || pageError}<p role="status" class="notice">
          {$t('pholy_history_refresh_failed')}
        </p>{/if}
      {#if history.data.items.length === 0}
        <div class="empty-state">
          <h2>{$t('pholy_history_empty')}</h2>
          <p>{$t('pholy_history_empty_detail')}</p>
          <a href={Route.photos()}>{$t('pholy_history_open_photos')}</a>
        </div>
      {:else}
        <ol class="history-list">
          {#each history.data.items as item (item.id)}
            <li>
              <div class="file-info">
                <strong>{item.fileName}</strong><span>{getByteUnitString(item.fileSize)} · {date(item.createdAt)}</span
                >{#if detail(item)}<p>{detail(item)}</p>{/if}
              </div>
              <div class="file-result">
                <span class="status" class:attention={item.status === 'processing-error' || item.status === 'failed'}
                  >{labels[item.status]}</span
                >
                {#if item.assetId}<a href={Route.viewAsset({ id: item.assetId })}>{$t('pholy_history_view_asset')}</a
                  >{/if}
                {#if item.status === 'processing-error'}<a href={Route.help()}>{$t('pholy_history_get_help')}</a>{/if}
              </div>
            </li>
          {/each}
        </ol>
      {/if}
      <nav class="pagination" aria-label={$t('pholy_history_pages')}>
        <button
          type="button"
          disabled={pageNumber === 0 || history.isFetching || changingPage}
          onclick={() => void changePage(pageNumber - 1)}>{$t('pholy_history_previous')}</button
        >
        <span>{$t('pholy_history_page', { values: { page: pageNumber + 1 } })}</span>
        <button
          type="button"
          disabled={!history.data.hasMore || history.isFetching || changingPage}
          onclick={() => void changePage(pageNumber + 1)}>{$t('pholy_history_next')}</button
        >
      </nav>
    </section>
  </div>
</UserPageLayout>

<style>
  .history-shell {
    max-width: 1120px;
    padding: 1.5rem;
    margin: 0 auto;
    display: grid;
    gap: 2rem;
  }
  .storage-card {
    padding: 1.4rem;
    border: 1px solid var(--color-gray-300);
    background: var(--color-immich-bg);
  }
  .section-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    margin-bottom: 1rem;
  }
  h2 {
    font-size: 1.1rem;
    font-weight: 650;
  }
  .storage-total {
    font-size: 1.9rem;
    font-weight: 600;
    margin: 1rem 0;
  }
  .storage-total span {
    font-size: 1rem;
    font-weight: 400;
    opacity: 0.7;
  }
  progress {
    width: 100%;
    height: 0.55rem;
    margin-bottom: 0.7rem;
    accent-color: #35644f;
  }
  a {
    color: var(--color-immich-primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .storage-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1.3rem;
    margin-top: 1rem;
  }
  .history-list {
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--color-gray-300);
  }
  li {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1.2rem;
    padding: 1.15rem 0;
    border-bottom: 1px solid var(--color-gray-300);
  }
  .file-info {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }
  .file-info strong {
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .file-info span {
    font-size: 0.8rem;
    opacity: 0.7;
  }
  .file-info p {
    font-size: 0.88rem;
    max-width: 43rem;
  }
  .file-result {
    display: flex;
    align-items: flex-end;
    flex-direction: column;
    flex-shrink: 0;
    gap: 0.5rem;
    font-size: 0.82rem;
  }
  .status {
    background: #e6efe9;
    color: #274e3b;
    padding: 0.3rem 0.5rem;
  }
  .status.attention {
    background: #fff0d3;
    color: #714611;
  }
  .storage-alert {
    font-weight: 600;
  }
  .notice {
    padding: 0.8rem;
    background: #fff0d3;
    color: #714611;
  }
  button {
    border: 1px solid currentColor;
    padding: 0.45rem 0.8rem;
    font-size: 0.85rem;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1rem;
    gap: 0.7rem;
    font-size: 0.85rem;
  }
  .empty-state {
    padding: 2rem 1rem;
    border: 1px solid var(--color-gray-300);
    display: grid;
    gap: 0.7rem;
  }
  :global(.dark) .storage-card {
    background: #18231e;
    border-color: #3a4941;
  }
  :global(.dark) .history-list,
  :global(.dark) li,
  :global(.dark) .empty-state {
    border-color: #3a4941;
  }
  @media (max-width: 640px) {
    .history-shell {
      padding: 1rem;
    }
    li {
      flex-direction: column;
      gap: 0.8rem;
    }
    .file-result {
      flex-direction: row;
      align-items: center;
      flex-wrap: wrap;
    }
  }
</style>
