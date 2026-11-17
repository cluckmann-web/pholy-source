<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import { type SharedLinkTab } from '#lib/constants.ts';
  import GroupTab from '#lib/elements/GroupTab.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getAllSharedLinksQuery } from '#lib/queries/shared-link.query.ts';
  import { Route } from '#lib/route.ts';
  import { SharedLinkType } from '@immich/sdk';
  import { Button } from '@immich/ui';
  import { type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { LayoutData } from './$types';
  import SharedLinkCard from './SharedLinkCard.svelte';

  type Props = {
    children?: Snippet;
    data: LayoutData;
  };

  const { children, data }: Props = $props();

  const query = createPreloadedQuery(getAllSharedLinksQuery);
  const sharedLinks = $derived(query.data);
  const filters: SharedLinkTab[] = ['all', 'album', 'individual'];
  const labels = $derived([$t('all'), $t('albums'), $t('individual_shares')]);
  const selectedTab = $derived(filters.find((filter) => filter === page.url.searchParams.get('filter')) ?? 'all');

  let searchQuery = $state('');
  const searchTerm = $derived(searchQuery.trim().toLocaleLowerCase());
  const filteredSharedLinks = $derived(
    sharedLinks.filter((link) => {
      const matchesType =
        selectedTab === 'all' ||
        (link.type === SharedLinkType.Album && selectedTab === 'album') ||
        (link.type === SharedLinkType.Individual && selectedTab === 'individual');
      const searchText = [link.album?.albumName, link.description, link.slug]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return matchesType && searchText.includes(searchTerm);
    }),
  );

  const resetFilters = () => {
    searchQuery = '';
    void goto(Route.sharedLinks());
  };
</script>

<UserPageLayout title={data.meta.title}>
  <div class="pholy-shares">
    {#if sharedLinks.length === 0}
      <div class="pholy-shares-empty">
        <p>{$t('you_dont_have_any_shared_links')}</p>
        <p class="pholy-shares-hint">{$t('pholy_shared_links_empty_hint')}</p>
        <a class="pholy-shares-photos" href={Route.photos()}>{$t('photos')}</a>
      </div>
    {:else}
      <div class="pholy-shares-toolbar">
        <div class="pholy-shares-tabs">
          <GroupTab
            label={$t('show_shared_links')}
            {filters}
            {labels}
            selected={selectedTab}
            onSelect={(value) => goto(Route.sharedLinks({ filter: value as SharedLinkTab }))}
          />
        </div>
        <input
          type="search"
          class="pholy-shares-search"
          aria-label={$t('pholy_search_shared_links')}
          placeholder={$t('pholy_search_shared_links')}
          bind:value={searchQuery}
        />
      </div>
      {#if filteredSharedLinks.length === 0}
        <div class="pholy-shares-empty" role="status">
          <p>{$t('pholy_no_matching_shared_links')}</p>
          <Button variant="outline" size="small" onclick={resetFilters}>
            {$t('pholy_clear_shared_link_filters')}
          </Button>
        </div>
      {:else}
        <div class="pholy-shares-list">
          {#each filteredSharedLinks as sharedLink (sharedLink.id)}
            <SharedLinkCard {sharedLink} />
          {/each}
        </div>
      {/if}
    {/if}

    {@render children?.()}
  </div>
</UserPageLayout>

<style>
  .pholy-shares {
    max-width: 1440px;
    margin-inline: auto;
    padding-block: 4px 24px;
  }

  .pholy-shares-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
    padding: 16px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
  }

  .pholy-shares-tabs {
    max-width: 100%;
  }

  .pholy-shares-tabs :global(fieldset) {
    flex-wrap: wrap;
  }

  .pholy-shares-tabs :global(label) {
    min-height: 44px;
    padding-inline: 12px;
  }

  .pholy-shares-search {
    flex: 1 1 240px;
    min-width: 0;
    width: 100%;
    max-width: 360px;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: var(--pholy-surface-radius);
    background: var(--immich-ui-light);
    color: var(--immich-ui-dark);
    font-size: 14px;
  }

  .pholy-shares-search:focus-visible,
  .pholy-shares-photos:focus-visible {
    outline: 2px solid var(--immich-ui-primary-500);
    outline-offset: 2px;
  }

  .pholy-shares-list {
    display: grid;
    gap: 12px;
  }

  .pholy-shares-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 40px 16px;
    border: 1px solid var(--immich-ui-default-border);
    text-align: center;
  }

  .pholy-shares-hint {
    max-width: 48ch;
    color: var(--immich-ui-muted);
    font-size: 14px;
  }

  .pholy-shares-photos {
    color: var(--immich-ui-primary-600);
    text-decoration: underline;
    text-underline-offset: 4px;
  }

  @media (max-width: 639px) {
    .pholy-shares-toolbar {
      padding: 12px;
    }

    .pholy-shares-search {
      max-width: none;
    }
  }
</style>
