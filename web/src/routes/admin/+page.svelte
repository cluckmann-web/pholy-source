<script lang="ts">
  import AdminPageLayout from '#lib/components/layouts/AdminPageLayout.svelte';
  import { getPholyInvitationsQuery } from '#lib/queries/pholy-invitation.query.ts';
  import { getQueuesQuery } from '#lib/queries/queue.query.ts';
  import { getStorageQuery } from '#lib/queries/server-info.query.ts';
  import { searchUsersAdminQuery } from '#lib/queries/user-admin.query.ts';
  import { Route } from '#lib/route.ts';
  import { asQueueItem } from '#lib/services/queue.service.ts';
  import { getByteUnitString } from '#lib/utils/byte-units.ts';
  import { createQuery } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { locale, t } from 'svelte-i18n';
  import type { PageData } from './$types';

  const { data }: { data: PageData } = $props();
  const users = createQuery(searchUsersAdminQuery);
  const invitations = createQuery(getPholyInvitationsQuery);
  const storage = createQuery(getStorageQuery);
  const queues = createQuery(() => ({ ...getQueuesQuery(), refetchInterval: 15_000 }));
  let now = $state(Date.now());
  onMount(() => {
    const interval = setInterval(() => (now = Date.now()), 30_000);
    return () => clearInterval(interval);
  });
  const bytes = (value: number) => getByteUnitString(value, $locale ?? 'en');
  const userList = $derived(
    [...(users.data ?? [])].sort((a, b) => (b.quotaUsageInBytes ?? 0) - (a.quotaUsageInBytes ?? 0)),
  );
  const openInvitations = $derived(
    invitations.data?.filter((item) => !item.usedAt && !item.revokedAt && Date.parse(item.expiresAt) > now).length,
  );
  const usedInvitations = $derived(invitations.data?.filter((item) => item.usedAt).length);
  const expiredInvitations = $derived(
    invitations.data?.filter((item) => !item.usedAt && !item.revokedAt && Date.parse(item.expiresAt) <= now).length,
  );
  const totals = $derived.by(() => {
    const totals = { active: 0, waiting: 0, failed: 0, paused: 0 };
    for (const queue of queues.data ?? []) {
      totals.active += queue.statistics.active;
      totals.waiting += queue.statistics.waiting + queue.statistics.delayed + queue.statistics.paused;
      totals.failed += queue.statistics.failed;
      totals.paused += Number(queue.isPaused);
    }
    return totals;
  });
  const busy = $derived(users.isFetching || invitations.isFetching || queues.isFetching || storage.isFetching);
  const refresh = async () => {
    now = Date.now();
    await Promise.all([users.refetch(), invitations.refetch(), queues.refetch(), storage.refetch()]);
  };
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="pholy-dashboard">
    <header class="dashboard-intro">
      <div>
        <p class="eyebrow">PHOLY</p>
        <h1>{$t('pholy_admin_title')}</h1>
        <p>{$t('pholy_admin_description')}</p>
      </div>
      <button type="button" class="button" onclick={refresh} disabled={busy}>{$t('refresh')}</button>
    </header>

    <div class="summary-grid">
      <a class="summary-card" href={Route.users()}>
        <span>{$t('users')}</span><strong>{users.data ? userList.length.toLocaleString($locale ?? 'en') : '—'}</strong>
        <span>{$t('pholy_admin_accounts')}</span>
      </a>
      <a class="summary-card" href={Route.invitations()}>
        <span>{$t('pholy_admin_open_invitations')}</span><strong>{openInvitations ?? '—'}</strong>
        <span>{$t('pholy_admin_invitation_only')}</span>
      </a>
      <a class="summary-card" href={Route.queues()}>
        <span>{$t('pholy_admin_processing')}</span><strong>{queues.data ? totals.active : '—'}</strong>
        <span
          >{queues.data
            ? $t('pholy_admin_waiting_count', { values: { count: totals.waiting } })
            : $t('pholy_admin_loading')}</span
        >
      </a>
      <a class="summary-card" class:attention={totals.failed > 0} href={Route.queues()}>
        <span>{$t('pholy_admin_failed')}</span><strong>{queues.data ? totals.failed : '—'}</strong>
        <span>{$t('pholy_admin_failed_help')}</span>
      </a>
    </div>

    <div class="dashboard-grid">
      <section aria-labelledby="storage-title">
        <div class="section-heading">
          <h2 id="storage-title">{$t('pholy_admin_storage')}</h2>
          <a href={Route.systemStatistics()}>{$t('pholy_admin_details')} ↗</a>
        </div>
        {#if storage.isError}<p class="error" role="alert">{$t('pholy_admin_load_failed')}</p>{/if}
        {#if storage.data}
          <p class="storage-value">{bytes(storage.data.diskUseRaw)} <span>/ {bytes(storage.data.diskSizeRaw)}</span></p>
          <progress max="100" value={storage.data.diskUsagePercentage} aria-label={$t('pholy_admin_storage')}
          ></progress>
          <p>{$t('pholy_admin_storage_free', { values: { size: bytes(storage.data.diskAvailableRaw) } })}</p>
          <p class="help">{$t('pholy_admin_storage_help')}</p>
        {/if}
      </section>
      <section aria-labelledby="invitations-title">
        <div class="section-heading">
          <h2 id="invitations-title">{$t('pholy_invitation.admin_title')}</h2>
          <a href={Route.invitations()}>{$t('pholy_admin_manage')} ↗</a>
        </div>
        {#if invitations.isError}<p class="error" role="alert">{$t('pholy_admin_load_failed')}</p>{/if}
        {#if invitations.data}
          <dl class="invitation-counts">
            <div>
              <dt>{$t('pholy_invitation.status_open')}</dt>
              <dd>{openInvitations}</dd>
            </div>
            <div>
              <dt>{$t('pholy_invitation.status_used')}</dt>
              <dd>{usedInvitations}</dd>
            </div>
            <div>
              <dt>{$t('pholy_invitation.status_expired')}</dt>
              <dd>{expiredInvitations}</dd>
            </div>
          </dl>
          <p class="help">{$t('pholy_admin_invitation_help')}</p>
          <a class="button primary" href={Route.invitations()}>{$t('pholy_invitation.create_link')}</a>
        {/if}
      </section>
    </div>

    <section aria-labelledby="users-title">
      <div class="section-heading">
        <div>
          <h2 id="users-title">{$t('pholy_admin_user_storage')}</h2>
          <p class="help">{$t('pholy_admin_user_storage_help')}</p>
        </div>
        <a href={Route.users()}>{$t('pholy_admin_manage')} ↗</a>
      </div>
      {#if users.isError}<p class="error" role="alert">{$t('pholy_admin_load_failed')}</p>{/if}
      {#if users.data}
        <ul class="users">
          {#each userList as user (user.id)}
            {const usage = user.quotaUsageInBytes ?? 0}
            {const quota = user.quotaSizeInBytes}
            {const percentage = quota !== null && quota > 0 ? (usage / quota) * 100 : undefined}
            <li>
              <div class="user-name">
                <a href={Route.viewUser(user)}>{user.name || user.email}</a><span>{user.email}</span>
              </div>
              <div class="user-storage">
                <span>{bytes(usage)} / {quota === null ? $t('pholy_admin_unlimited') : bytes(quota)}</span>
                {#if percentage !== undefined}<progress
                    max="100"
                    value={percentage}
                    aria-label={$t('pholy_admin_user_quota', { values: { name: user.name || user.email } })}
                  ></progress>{/if}
              </div>
              {#if percentage !== undefined && percentage >= 90}<span class="quota-warning"
                  >{$t('pholy_admin_quota_warning')}</span
                >{/if}
              <a href={Route.editUser(user)}>{$t('pholy_admin_adjust')}</a>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section aria-labelledby="queues-title">
      <div class="section-heading">
        <div>
          <h2 id="queues-title">{$t('pholy_admin_queues')}</h2>
          <p class="help">{$t('pholy_admin_queue_help')}</p>
        </div>
        <a href={Route.queues()}>{$t('pholy_admin_manage')} ↗</a>
      </div>
      {#if queues.isError}<p class="error" role="alert">{$t('pholy_admin_load_failed')}</p>{/if}
      {#if totals.paused > 0}<p class="notice">
          {$t('pholy_admin_paused_count', { values: { count: totals.paused } })}
        </p>{/if}
      {#if queues.data}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (Keyboard users need to scroll the wide jobs table.) -->
        <div class="table-scroll" tabindex="0" role="region" aria-label={$t('pholy_admin_queues')}>
          <table>
            <thead
              ><tr
                ><th scope="col">{$t('pholy_admin_queue')}</th><th scope="col">{$t('active')}</th><th scope="col"
                  >{$t('waiting')}</th
                ><th scope="col">{$t('pholy_admin_failed')}</th><th scope="col">{$t('status')}</th></tr
              ></thead
            ><tbody>
              {#each queues.data as queue (queue.name)}<tr>
                  <th scope="row"><a href={Route.viewQueue(queue)}>{asQueueItem($t, queue).title}</a></th>
                  <td>{queue.statistics.active}</td><td
                    >{queue.statistics.waiting + queue.statistics.delayed + queue.statistics.paused}</td
                  ><td class:failed={queue.statistics.failed > 0}>{queue.statistics.failed}</td>
                  <td
                    >{queue.isPaused
                      ? $t('paused')
                      : queue.statistics.active > 0
                        ? $t('active')
                        : $t('pholy_admin_ready')}</td
                  >
                </tr>{/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
</AdminPageLayout>

<style>
  .pholy-dashboard {
    max-width: 1320px;
    margin: 24px auto;
    padding: 0 24px 48px;
    color: var(--immich-ui-dark);
  }
  .dashboard-intro,
  .section-heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .dashboard-intro {
    margin-bottom: 28px;
  }
  h1 {
    font-size: clamp(26px, 3vw, 36px);
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: -0.035em;
    margin: 5px 0 10px;
  }
  h2 {
    font-size: 19px;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  p,
  .help {
    color: var(--immich-ui-muted);
    font-size: 13px;
    line-height: 1.65;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.14em;
    font-weight: 650;
    color: var(--immich-ui-primary);
  }
  a {
    color: var(--immich-ui-primary);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 42px;
    border: 1px solid var(--immich-ui-default-border);
    padding: 10px 16px;
    font-size: 13px;
    cursor: pointer;
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    border-radius: 0;
  }
  .button:disabled {
    opacity: 0.5;
    cursor: wait;
  }
  .primary {
    background: var(--immich-ui-primary);
    color: var(--immich-ui-light);
    margin-top: 16px;
  }
  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 14px;
    margin-bottom: 24px;
  }
  .summary-card,
  section {
    padding: 24px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    min-width: 0;
  }
  .summary-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: inherit;
  }
  .summary-card:hover {
    text-decoration: none;
    border-color: var(--immich-ui-primary);
  }
  .summary-card span {
    font-size: 12px;
    color: var(--immich-ui-muted);
  }
  .summary-card strong {
    font-size: 35px;
    font-weight: 550;
    line-height: 1;
  }
  .attention {
    border-left: 3px solid #b95d27;
  }
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
  section {
    margin-bottom: 24px;
  }
  .section-heading {
    margin-bottom: 20px;
  }
  .section-heading > a,
  li > a {
    font-size: 12px;
  }
  .storage-value {
    font-size: 26px;
    font-weight: 550;
    color: inherit;
    margin-bottom: 12px;
  }
  .storage-value span {
    font-size: 15px;
    font-weight: 400;
    color: var(--immich-ui-muted);
  }
  progress {
    display: block;
    width: 100%;
    height: 6px;
    border: 0;
    accent-color: var(--immich-ui-primary);
    background: var(--immich-ui-default-border);
    margin: 8px 0;
  }
  progress::-webkit-progress-bar {
    background: var(--immich-ui-default-border);
  }
  progress::-webkit-progress-value {
    background: var(--immich-ui-primary);
  }
  progress::-moz-progress-bar {
    background: var(--immich-ui-primary);
  }
  .invitation-counts {
    display: flex;
    gap: 28px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  dt {
    font-size: 12px;
    color: var(--immich-ui-muted);
  }
  dd {
    font-size: 26px;
  }
  .users {
    list-style: none;
    padding: 0;
  }
  .users li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px;
    padding: 16px 0;
    border-top: 1px solid var(--immich-ui-default-border);
  }
  .user-name {
    flex: 1;
    min-width: 150px;
    overflow-wrap: anywhere;
  }
  .user-name a {
    font-size: 14px;
    font-weight: 550;
  }
  .user-name span {
    display: block;
    color: var(--immich-ui-muted);
    font-size: 12px;
  }
  .user-storage {
    width: 220px;
    max-width: 100%;
    font-size: 12px;
  }
  .quota-warning,
  .notice {
    color: #a66018;
    font-size: 12px;
  }
  .notice {
    margin-bottom: 12px;
  }
  .error,
  .failed {
    color: #bd493d;
  }
  .error {
    margin-bottom: 16px;
  }
  .table-scroll {
    overflow-x: auto;
  }
  table {
    width: 100%;
    text-align: start;
    font-size: 13px;
    border-collapse: collapse;
  }
  th {
    font-weight: 500;
    text-align: start;
  }
  td,
  th {
    padding: 14px 16px;
    border-bottom: 1px solid var(--immich-ui-default-border);
  }
  th:first-child {
    padding-left: 0;
    min-width: 170px;
  }
  thead th {
    font-size: 11px;
    color: var(--immich-ui-muted);
  }
  :is(a, button, .table-scroll):focus-visible {
    outline: 2px solid var(--immich-ui-primary);
    outline-offset: 3px;
  }
  @media (max-width: 850px) {
    .summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .dashboard-grid {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
  @media (max-width: 639px) {
    .pholy-dashboard {
      padding-inline: 12px;
    }
    section,
    .summary-card {
      padding: 16px;
    }
    .users li {
      gap: 12px;
    }
    .user-storage {
      width: 100%;
    }
    .summary-card strong {
      font-size: 30px;
    }
  }
</style>
