<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import {
    communityImageUrl,
    followCommunityProfileMutation,
    getCommunityProfileQuery,
    getCommunityRelationQuery,
    reportCommunityMutation,
    type CommunityReportReason,
  } from '#lib/queries/pholy-community.query.ts';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-community.css';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const profile = createQuery(() => ({ ...getCommunityProfileQuery(data.slug), enabled: data.available }));
  const relation = createQuery(() => ({
    ...getCommunityRelationQuery(data.slug),
    enabled: data.available && authManager.authenticated,
  }));
  const follow = createMutation(followCommunityProfileMutation);
  const report = createMutation(reportCommunityMutation);
  let target = $state<string | null | undefined>();
  let reason = $state<CommunityReportReason>('privacy');
  let details = $state('');
  let error = $state('');
  let success = $state('');
  let reportForm = $state<HTMLFormElement>();
  const openReport = async (assetId: string | null) => {
    target = assetId;
    error = '';
    success = '';
    await tick();
    reportForm?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    reportForm?.querySelector('select')?.focus();
  };
  const toggleFollow = async () => {
    error = '';
    try {
      await follow.mutateAsync([{ slug: data.slug, enabled: !relation.data?.following }]);
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    }
  };
  const sendReport = async (event: SubmitEvent) => {
    event.preventDefault();
    if (target === undefined) return;
    error = '';
    success = '';
    try {
      await report.mutateAsync([{ slug: data.slug, assetId: target, reason, details }]);
      target = undefined;
      details = '';
      success = $t('pholy_community.report_sent');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    }
  };
</script>

<div class="pholy-community public-page">
  <header class="public-header">
    <a class="brand" href={authManager.authenticated ? Route.community() : Route.login()}>PHOLY</a>
    <a href={authManager.authenticated ? Route.community() : Route.login()}
      >{authManager.authenticated ? $t('pholy_community.back') : $t('pholy_community.login')}</a
    >
  </header>
  <main>
    {#if !data.available || profile.isError}
      <section class="community-card"><h1>{$t('pholy_community.unavailable')}</h1></section>
    {:else if profile.data}
      <section class="public-intro">
        <span class="muted">@{profile.data.slug}</span>
        <h1>{profile.data.displayName}</h1>
        <p class="bio">{profile.data.bio}</p>
        <p class="muted">{$t('pholy_community.followers', { values: { count: profile.data.followers } })}</p>
        {#if authManager.authenticated && relation.data && !relation.data.ownProfile}
          <div class="community-actions">
            <button type="button" disabled={follow.isPending} onclick={toggleFollow}
              >{relation.data.following ? $t('pholy_community.unfollow') : $t('pholy_community.follow')}</button
            >
            <button type="button" class="secondary" onclick={() => openReport(null)}
              >{$t('pholy_community.report_profile')}</button
            >
          </div>
        {:else if !authManager.authenticated}<p class="muted">{$t('pholy_community.login_actions')}</p>{/if}
      </section>
      {#if error}<p class="notice error" role="alert">{error}</p>{/if}
      {#if success}<p class="notice success" role="status">{success}</p>{/if}
      {#if target !== undefined}
        <form class="community-card report-form" onsubmit={sendReport} bind:this={reportForm}>
          <h2>{$t('pholy_community.report_title')}</h2>
          <p class="muted">{$t('pholy_community.report_hint')}</p>
          <label for="report-reason">{$t('pholy_community.reason')}</label>
          <select id="report-reason" bind:value={reason}>
            <option value="privacy">{$t('pholy_community.reason_privacy')}</option><option value="copyright"
              >{$t('pholy_community.reason_copyright')}</option
            ><option value="abuse">{$t('pholy_community.reason_abuse')}</option><option value="other"
              >{$t('pholy_community.reason_other')}</option
            >
          </select>
          <label for="report-details">{$t('pholy_community.details')}</label><textarea
            id="report-details"
            required
            minlength="10"
            maxlength="2000"
            rows="4"
            bind:value={details}></textarea>
          <div class="community-actions">
            <button type="submit" disabled={report.isPending}>{$t('pholy_community.send_report')}</button><button
              type="button"
              class="secondary"
              disabled={report.isPending}
              onclick={() => (target = undefined)}>{$t('pholy_community.cancel')}</button
            >
          </div>
        </form>
      {/if}
      {#if profile.data.assets.length === 0}<p class="community-card">{$t('pholy_community.empty_gallery')}</p>{/if}
      <div class="public-gallery">
        {#each profile.data.assets as asset (asset.id)}
          <figure>
            <img
              src={communityImageUrl(data.slug, asset.id)}
              alt={$t('pholy_community.photo_alt', { values: { name: profile.data.displayName } })}
              loading="lazy"
            />
            {#if authManager.authenticated && relation.data && !relation.data.ownProfile}<figcaption>
                <button type="button" class="secondary" onclick={() => openReport(asset.id)}
                  >{$t('pholy_community.report_photo')}</button
                >
              </figcaption>{/if}
          </figure>
        {/each}
      </div>
    {/if}
  </main>
</div>
