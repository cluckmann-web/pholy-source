<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import { createPreloadedQuery, queryClient } from '#lib/queries/client.ts';
  import {
    getCommunityDirectoryQuery,
    getCommunityFollowingQuery,
    getCommunityMineQuery,
    getCommunityPickerQuery,
    saveCommunityProfileMutation,
    unpublishCommunityMutation,
    type CommunityMine,
  } from '#lib/queries/pholy-community.query.ts';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-community.css';
  import { getAssetMediaUrl } from '#lib/utils.ts';
  import { AssetMediaSize } from '@immich/sdk';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const mine = createPreloadedQuery(getCommunityMineQuery);
  const picker = createPreloadedQuery(getCommunityPickerQuery);
  const following = createPreloadedQuery(getCommunityFollowingQuery);
  let offset = $state(0);
  const directory = createQuery(() => getCommunityDirectoryQuery(offset));
  const save = createMutation(saveCommunityProfileMutation);
  const withdraw = createMutation(unpublishCommunityMutation);
  const initial = untrack(() => mine.data);
  let slug = $state(initial.profile?.slug ?? '');
  let displayName = $state(initial.profile?.displayName ?? '');
  let bio = $state(initial.profile?.bio ?? '');
  let published = $state(initial.profile?.published ?? false);
  let selected = $state(initial.assets.map((asset) => asset.assetId));
  let photos = $state(untrack(() => picker.data.assets));
  let nextOffset = $state(untrack(() => picker.data.nextOffset));
  let tab = $state<'mine' | 'discover' | 'following'>('mine');
  let error = $state('');
  let success = $state('');
  let loading = $state(false);
  $effect(() => {
    if (mine.data.profile?.blocked) published = false;
  });
  const apply = (result: CommunityMine) => {
    published = result.profile?.published ?? false;
    selected = result.assets.map((asset) => asset.assetId);
  };
  const toggle = (id: string) => {
    if (selected.includes(id)) selected = selected.filter((value) => value !== id);
    else if (selected.length < 100) selected = [...selected, id];
    success = '';
  };
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    error = '';
    success = '';
    try {
      apply(await save.mutateAsync([{ slug, displayName, bio, published, assetIds: selected }]));
      success = $t('pholy_community.saved');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    }
  };
  const makePrivate = async () => {
    error = '';
    success = '';
    try {
      apply(await withdraw.mutateAsync([]));
      success = $t('pholy_community.withdrawn');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    }
  };
  const more = async () => {
    if (nextOffset === null || loading) return;
    loading = true;
    error = '';
    try {
      const result = await queryClient.fetchQuery(getCommunityPickerQuery(nextOffset));
      photos = [...photos, ...result.assets.filter((asset) => photos.every((known) => known.id !== asset.id))];
      nextOffset = result.nextOffset;
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_community.error');
    } finally {
      loading = false;
    }
  };
</script>

<UserPageLayout title={data.meta.title}>
  <div class="pholy-community">
    <p class="lead">{$t('pholy_community.intro')}</p>
    <nav class="community-tabs" aria-label={$t('pholy_community.title')}>
      <button type="button" aria-pressed={tab === 'mine'} onclick={() => (tab = 'mine')}
        >{$t('pholy_community.my_gallery')}</button
      >
      <button type="button" aria-pressed={tab === 'discover'} onclick={() => (tab = 'discover')}
        >{$t('pholy_community.discover')}</button
      >
      <button type="button" aria-pressed={tab === 'following'} onclick={() => (tab = 'following')}
        >{$t('pholy_community.following')}</button
      >
    </nav>
    {#if error}<p class="notice error" role="alert">{error}</p>{/if}
    {#if success}<p class="notice success" role="status">{success}</p>{/if}
    {#if tab === 'mine'}
      <div class="community-status">
        <p>{mine.data.profile?.published ? $t('pholy_community.public') : $t('pholy_community.private')}</p>
        {#if mine.data.profile?.published}
          <a href={Route.communityProfile(mine.data.profile.slug)}>{$t('pholy_community.open_profile')}</a>
          <button type="button" class="secondary" disabled={withdraw.isPending || save.isPending} onclick={makePrivate}
            >{$t('pholy_community.withdraw')}</button
          >
        {/if}
      </div>
      {#if mine.data.profile?.blocked}<p class="notice error">{$t('pholy_community.blocked')}</p>{/if}
      <form onsubmit={submit}>
        <section class="community-card profile-fields">
          <h2>{$t('pholy_community.my_gallery')}</h2>
          <label for="community-display">{$t('pholy_community.display_name')}</label>
          <input
            id="community-display"
            required
            minlength="2"
            maxlength="60"
            bind:value={displayName}
            autocomplete="off"
          />
          <label for="community-slug">{$t('pholy_community.slug')}</label>
          <input
            id="community-slug"
            required
            pattern={String.raw`[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]`}
            minlength="3"
            maxlength="40"
            bind:value={slug}
            autocomplete="off"
            spellcheck="false"
            aria-describedby="community-slug-hint"
          />
          <p class="muted" id="community-slug-hint">
            pholy.de/community/{slug || '…'} · {$t('pholy_community.slug_hint')}
          </p>
          <label for="community-bio">{$t('pholy_community.bio')}</label>
          <textarea id="community-bio" rows="3" maxlength="600" bind:value={bio}></textarea>
          <p class="notice">{$t('pholy_community.public_notice')}</p>
          <label class="check-row"
            ><input type="checkbox" bind:checked={published} disabled={mine.data.profile?.blocked} />{$t(
              'pholy_community.publish',
            )}</label
          >
        </section>
        <section class="community-card">
          <div class="section-heading">
            <h2>{$t('pholy_community.select_photos')}</h2>
            <strong>{$t('pholy_community.selected', { values: { count: selected.length } })}</strong>
          </div>
          <p class="muted">{$t('pholy_community.selection_hint')}</p>
          {#if mine.data.assets.some((asset) => photos.every((photo) => photo.id !== asset.assetId) || asset.hidden)}
            <ul class="selected-list">
              {#each mine.data.assets.filter((asset) => photos.every((photo) => photo.id !== asset.assetId) || asset.hidden) as asset (asset.assetId)}
                <li>
                  <label class="check-row"
                    ><input
                      type="checkbox"
                      checked={selected.includes(asset.assetId)}
                      onchange={() => toggle(asset.assetId)}
                    />{asset.originalFileName}{#if asset.hidden}<span class="muted">
                        · {$t('pholy_community.moderated_photo')}</span
                      >{/if}</label
                  >
                </li>
              {/each}
            </ul>
          {/if}
          {#if photos.length === 0}<p>{$t('pholy_community.no_photos')}</p>{/if}
          <div class="picker-grid">
            {#each photos as photo (photo.id)}
              <label class="picker-photo" class:chosen={selected.includes(photo.id)}>
                <img src={getAssetMediaUrl({ id: photo.id, size: AssetMediaSize.Thumbnail })} alt="" loading="lazy" />
                <span
                  ><input
                    type="checkbox"
                    checked={selected.includes(photo.id)}
                    disabled={selected.length >= 100 && !selected.includes(photo.id)}
                    onchange={() => toggle(photo.id)}
                  />{photo.originalFileName}</span
                >
                {#if mine.data.assets.some((asset) => asset.assetId === photo.id && asset.hidden)}<small
                    >{$t('pholy_community.moderated_photo')}</small
                  >{/if}
              </label>
            {/each}
          </div>
          {#if nextOffset !== null}<button class="secondary" type="button" disabled={loading} onclick={more}
              >{$t('pholy_community.load_more')}</button
            >{/if}
        </section>
        <div class="save-bar">
          <button type="submit" disabled={save.isPending || withdraw.isPending}
            >{save.isPending ? $t('pholy_community.saving') : $t('pholy_community.save')}</button
          >
        </div>
      </form>
    {:else}
      {const profiles = $derived(tab === 'following' ? following.data.profiles : (directory.data?.profiles ?? []))}
      {#if directory.isError && tab === 'discover'}<p role="alert" class="notice error">
          {$t('pholy_community.error')}
        </p>
        <button type="button" onclick={() => directory.refetch()}>{$t('pholy_community.reload')}</button>{/if}
      {#if profiles.length === 0 && !directory.isPending}<p class="community-card">
          {$t(tab === 'following' ? 'pholy_community.empty_following' : 'pholy_community.empty_directory')}
        </p>{/if}
      <div class="profile-grid">
        {#each profiles as profile (profile.slug)}
          <a class="community-card profile-card" href={Route.communityProfile(profile.slug)}
            ><span class="profile-initial" aria-hidden="true">{profile.displayName.slice(0, 1)}</span>
            <h2>{profile.displayName}</h2>
            <p>{profile.bio}</p>
            <span class="muted">@{profile.slug}</span></a
          >
        {/each}
      </div>
      {#if tab === 'discover'}<div class="community-actions">
          <button
            type="button"
            class="secondary"
            disabled={offset === 0 || directory.isFetching}
            onclick={() => (offset = Math.max(0, offset - 48))}>{$t('pholy_community.previous')}</button
          ><button
            type="button"
            class="secondary"
            disabled={directory.data?.nextOffset === null ||
              directory.data?.nextOffset === undefined ||
              directory.isFetching}
            onclick={() => (offset = directory.data?.nextOffset ?? offset)}>{$t('pholy_community.next')}</button
          >
        </div>{/if}
    {/if}
  </div>
</UserPageLayout>
