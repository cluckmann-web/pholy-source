<script lang="ts">
  import { scrollMemory } from '#lib/actions/scroll-memory.svelte.ts';
  import Albums from '#lib/components/album-page/AlbumsList.svelte';
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import EmptyPlaceholder from '#lib/components/shared-components/EmptyPlaceholder.svelte';
  import GroupTab from '#lib/elements/GroupTab.svelte';
  import SearchBar from '#lib/elements/SearchBar.svelte';
  import { getPholyCollectionCopy } from '#lib/pholy-collection-copy.ts';
  import { getAllAlbumsQuery } from '#lib/queries/album.query.ts';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { Route } from '#lib/route.ts';
  import { AlbumFilter, albumViewSettings } from '#lib/stores/preferences.store.ts';
  import { createAlbumAndRedirect } from '#lib/utils/album-utils.ts';
  import { locale, t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import AlbumsControls from './AlbumsControls.svelte';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const queries = {
    ownedAlbums: createPreloadedQuery(() => getAllAlbumsQuery({ isOwned: true })),
    sharedAlbums: createPreloadedQuery(() => getAllAlbumsQuery({ isShared: true })),
  };
  const copy = $derived(getPholyCollectionCopy($locale ?? 'en'));

  let searchQuery = $state('');
  let albumGroups: string[] = $state([]);
</script>

<UserPageLayout
  title={data.meta.title}
  description={copy.albumsDescription}
  {@attach scrollMemory({ routeStartsWith: Route.albums() })}
>
  {#snippet buttons()}
    <div class="pholy-album-toolbar flex w-full max-w-full min-w-0 flex-wrap items-center gap-2">
      <AlbumsControls {albumGroups} bind:searchQuery />
    </div>
  {/snippet}

  <div class="pholy-album-browser">
    <div class="pholy-album-filters xl:hidden">
      <div class="h-11 w-fit max-w-full">
        <GroupTab
          label={$t('show_albums')}
          filters={Object.values(AlbumFilter)}
          labels={[$t('all'), $t('owned'), $t('shared')]}
          selected={$albumViewSettings.filter}
          onSelect={(selected) => ($albumViewSettings.filter = selected)}
        />
      </div>
      <div class="min-w-0 grow sm:max-w-96">
        <SearchBar placeholder={$t('search_albums')} bind:name={searchQuery} showLoadingSpinner={false} />
      </div>
    </div>

    <Albums
      ownedAlbums={queries.ownedAlbums.data}
      sharedAlbums={queries.sharedAlbums.data}
      userSettings={$albumViewSettings}
      allowEdit
      {searchQuery}
      bind:albumGroupIds={albumGroups}
    >
      {#snippet empty()}
        <EmptyPlaceholder
          text={$t('no_albums_message')}
          onClick={() => createAlbumAndRedirect()}
          class="mx-auto mt-10"
        />
      {/snippet}
    </Albums>
  </div>
</UserPageLayout>

<style>
  .pholy-album-browser {
    max-width: 1440px;
    margin-inline: auto;
    padding: 4px 4px 24px;
  }

  .pholy-album-filters {
    gap: 12px;
    align-items: center;
    margin-bottom: 20px;
    padding: 16px;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: var(--pholy-surface-radius);
    background: var(--immich-ui-light);
  }

  @media (max-width: 1279px) {
    .pholy-album-filters {
      display: flex;
      flex-wrap: wrap;
    }
  }

  @media (max-width: 639px) {
    .pholy-album-filters {
      display: grid;
      padding: 12px;
    }
  }
</style>
