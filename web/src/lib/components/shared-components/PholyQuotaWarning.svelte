<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { Route } from '#lib/route.ts';
  import { getByteUnitString } from '#lib/utils/byte-units.ts';
  import { t } from 'svelte-i18n';

  const quota = $derived(
    authManager.authenticated && !authManager.isSharedLink ? authManager.user.quotaSizeInBytes : null,
  );
  const usage = $derived(
    authManager.authenticated && !authManager.isSharedLink ? (authManager.user.quotaUsageInBytes ?? 0) : 0,
  );
  const percent = $derived(quota === null ? 0 : quota <= 0 ? 100 : Math.floor((usage / quota) * 100));
</script>

{#if quota !== null && percent >= 80}
  <aside class="pholy-quota-warning" aria-label={$t('pholy_history_storage_warning')}>
    <div>
      <strong>{percent >= 100 ? $t('pholy_history_quota_full') : $t('pholy_history_quota_warning')}</strong>
      <span
        >{$t('pholy_history_quota_remaining', {
          values: { size: getByteUnitString(Math.max(0, quota - usage)) },
        })}</span
      >
    </div>
    <a href={Route.uploadHistory()}>{$t('pholy_history_review_storage')}</a>
  </aside>
{/if}

<style>
  .pholy-quota-warning {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.8rem 1.2rem;
    border-bottom: 1px solid #d5b45e;
    background: #fff5d9;
    color: #614311;
    font-size: 0.86rem;
  }
  .pholy-quota-warning div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.2rem 0.8rem;
  }
  a {
    text-decoration: underline;
    font-weight: 600;
  }
  :global(.dark) .pholy-quota-warning {
    background: #30291a;
    color: #f8df9d;
    border-color: #736032;
  }
</style>
