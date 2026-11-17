<script lang="ts">
  import AlbumCover from '#lib/components/album-page/AlbumCover.svelte';
  import { getAlbumQuery } from '#lib/queries/album.query.ts';
  import { queryClient } from '#lib/queries/client.ts';
  import { IconButton, LoadingSpinner, Text } from '@immich/ui';
  import { mdiTrashCanOutline } from '@mdi/js';
  import { createQuery } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';

  interface Props {
    albumId: string;
    onDelete: () => unknown;
  }

  let { albumId, onDelete }: Props = $props();

  const query = createQuery(
    () => getAlbumQuery(albumId),
    () => queryClient,
  );
  const album = $derived(query.data);
</script>

<div class="pholy-album-summary">
  {#if query.isPending}
    <LoadingSpinner />
  {:else if album}
    <div class="pholy-album-summary-cover">
      <AlbumCover {album} />
    </div>
    <div class="pholy-album-summary-copy">
      <p class="line-clamp-2 text-base/6 font-semibold text-dark" data-testid="album-name" title={album.albumName}>
        {album.albumName}
      </p>
      {#if album.description}
        <p class="pholy-album-summary-description line-clamp-2" data-testid="album-description">
          {album.description}
        </p>
      {/if}
    </div>
    <div class="shrink-0">
      <IconButton
        icon={mdiTrashCanOutline}
        shape="round"
        color="danger"
        variant="ghost"
        onclick={onDelete}
        aria-label={$t('remove')}
      />
    </div>
  {:else}
    <div class="pholy-album-summary-copy flex flex-col gap-1">
      <Text>{$t('unknown')}</Text>
      <Text color="muted" size="small" variant="italic">{albumId}</Text>
    </div>
    <div class="shrink-0">
      <IconButton
        icon={mdiTrashCanOutline}
        shape="round"
        color="danger"
        variant="ghost"
        onclick={onDelete}
        aria-label={$t('remove')}
      />
    </div>
  {/if}
</div>

<style>
  .pholy-album-summary {
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 80px;
  }

  .pholy-album-summary-cover {
    width: 80px;
    flex-shrink: 0;
  }

  .pholy-album-summary-copy {
    min-width: 0;
    flex-grow: 1;
    overflow-wrap: anywhere;
  }

  .pholy-album-summary-description {
    margin-top: 5px;
    color: var(--immich-ui-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  @media (max-width: 479px) {
    .pholy-album-summary {
      gap: 10px;
    }

    .pholy-album-summary-cover {
      width: 64px;
    }
  }
</style>
