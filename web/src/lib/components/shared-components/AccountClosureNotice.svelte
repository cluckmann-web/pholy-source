<script lang="ts">
  import { getPholyAccountQuery } from '#lib/queries/pholy-account.query.ts';
  import { Route } from '#lib/route.ts';
  import { createQuery } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';

  const account = createQuery(getPholyAccountQuery);
</script>

{#if account.data?.closeAfter}
  <aside
    class="mx-4 my-3 border-l-4 border-amber-600 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100"
    role="status"
  >
    <p>{$t('pholy_account.pending', { values: { date: new Date(account.data.closeAfter).toLocaleString() } })}</p>
    <a class="mt-2 inline-block font-semibold underline" href={Route.account()}>{$t('pholy_account.notice_link')}</a>
  </aside>
{/if}
