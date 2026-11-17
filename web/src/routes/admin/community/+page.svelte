<script lang="ts">
  import AdminPageLayout from '#lib/components/layouts/AdminPageLayout.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import {
    getCommunityModerationQuery,
    moderateCommunityMutation,
    type CommunityModerationAction,
  } from '#lib/queries/pholy-community.query.ts';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-community.css';
  import { createMutation } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const query = createPreloadedQuery(getCommunityModerationQuery);
  const mutation = createMutation(moderateCommunityMutation);
  let pending = $state<{ id: string; action: CommunityModerationAction }>();
  let error = $state('');
  let success = $state('');
  const labels = {
    dismiss: 'pholy_community.dismiss',
    hide_asset: 'pholy_community.hide_asset',
    disable_profile: 'pholy_community.disable_profile',
    restore_profile: 'pholy_community.restore_profile',
    restore_asset: 'pholy_community.restore_asset',
  } as const;
  const reasons = {
    privacy: 'pholy_community.reason_privacy',
    copyright: 'pholy_community.reason_copyright',
    abuse: 'pholy_community.reason_abuse',
    other: 'pholy_community.reason_other',
  } as const;
  const confirm = async () => {
    if (!pending) return;
    error = '';
    success = '';
    try {
      await mutation.mutateAsync([pending]);
      pending = undefined;
      success = $t('pholy_community.moderation_done');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    }
  };
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="pholy-community">
    <p class="lead">{$t('pholy_community.moderation_intro')}</p>
    {#if error}<p class="notice error" role="alert">{error}</p>{/if}
    {#if success}<p class="notice success" role="status">{success}</p>{/if}
    {#if query.data.length === 0}<p class="community-card">{$t('pholy_community.no_reports')}</p>{/if}
    {#each query.data as report (report.id)}
      <article class="community-card">
        <div class="section-heading">
          <h2>{report.displayName} · {$t(report.assetId ? 'pholy_community.photo' : 'pholy_community.profile')}</h2>
          <span class="report-status" class:open={!report.resolvedAt}
            >{$t(report.resolvedAt ? 'pholy_community.resolved' : 'pholy_community.open')}</span
          >
        </div>
        <p class="muted">
          <time datetime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time> · {$t(
            reasons[report.reason],
          )}
        </p>
        <p class="report-details">{report.details}</p>
        <a href={Route.communityProfile(report.slug)}>{$t('pholy_community.open_profile')}</a>
        {#if report.action}<p class="muted">{$t(labels[report.action])}</p>{/if}
        <div class="community-actions">
          {#if !report.resolvedAt}<button
              type="button"
              class="secondary"
              disabled={mutation.isPending}
              onclick={() => (pending = { id: report.id, action: 'dismiss' })}>{$t('pholy_community.dismiss')}</button
            >{/if}
          {#if report.assetId}<button
              type="button"
              class="secondary"
              disabled={mutation.isPending}
              onclick={() => (pending = { id: report.id, action: report.hidden ? 'restore_asset' : 'hide_asset' })}
              >{$t(report.hidden ? 'pholy_community.restore_asset' : 'pholy_community.hide_asset')}</button
            >{/if}
          <button
            type="button"
            class="secondary"
            disabled={mutation.isPending}
            onclick={() =>
              (pending = { id: report.id, action: report.blocked ? 'restore_profile' : 'disable_profile' })}
            >{$t(report.blocked ? 'pholy_community.restore_profile' : 'pholy_community.disable_profile')}</button
          >
        </div>
        {#if pending?.id === report.id}
          <div class="notice" role="alert">
            <p>{$t('pholy_community.confirm_moderation')} {$t(labels[pending.action])}</p>
            <div class="community-actions">
              <button type="button" disabled={mutation.isPending} onclick={confirm}
                >{$t('pholy_community.confirm_action')}</button
              ><button
                type="button"
                class="secondary"
                disabled={mutation.isPending}
                onclick={() => (pending = undefined)}>{$t('pholy_community.cancel')}</button
              >
            </div>
          </div>
        {/if}
      </article>
    {/each}
    {#if query.data.length >= 200}<p class="muted">{$t('pholy_community.limited_list')}</p>{/if}
  </div>
</AdminPageLayout>
