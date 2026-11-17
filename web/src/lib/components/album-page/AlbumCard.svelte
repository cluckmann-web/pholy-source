<script lang="ts">
  import AlbumCover from '#lib/components/album-page/AlbumCover.svelte';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { getShortDateRange } from '#lib/utils/date-time.ts';
  import { type AlbumResponseDto } from '@immich/sdk';
  import { ContextMenuButton, type MenuItems } from '@immich/ui';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    showOwner?: boolean;
    showDateRange?: boolean;
    showItemCount?: boolean;
    preload?: boolean;
    contextMenuItems?: MenuItems;
  };

  const {
    album,
    showOwner = false,
    showDateRange = false,
    showItemCount = false,
    preload = false,
    contextMenuItems,
  }: Props = $props();

  const owner = $derived(album.albumUsers[0].user);
</script>

<div class="group pholy-album-card" data-testid="album-card">
  {#if contextMenuItems}
    <div id="icon-{album.id}" class="pholy-album-menu absolute inset-e-5 top-5 z-1" data-testid="context-button-parent">
      <ContextMenuButton
        translations={{ open_menu: $t('show_album_options') }}
        position="top-left"
        variant="filled"
        class="icon-white-drop-shadow"
        items={contextMenuItems}
      />
    </div>
  {/if}

  <AlbumCover {album} {preload} class="pholy-album-cover" />

  <div class="pholy-album-info">
    <p
      class="line-clamp-2 w-full text-base/6 font-semibold wrap-break-word text-dark group-hover:text-primary"
      data-testid="album-name"
      title={album.albumName}
    >
      {album.albumName}
    </p>

    {#if album.description}
      <p class="pholy-album-description line-clamp-2">{album.description}</p>
    {/if}

    {#if showDateRange && album.startDate && album.endDate}
      <p class="pholy-album-date text-sm capitalize">
        {getShortDateRange(album.startDate, album.endDate)}
      </p>
    {/if}

    <span class="pholy-album-details flex flex-wrap gap-x-2 gap-y-1 text-sm" data-testid="album-details">
      {#if showItemCount}
        <p>
          {$t('items_count', { values: { count: album.assetCount } })}
        </p>
      {/if}

      {#if (showOwner || album.shared) && showItemCount}
        <p>•</p>
      {/if}

      {#if showOwner}
        {#if owner.id === authManager.user.id}
          <p>{$t('owned')}</p>
        {:else}
          <p>
            {$t('shared_by_user', { values: { user: owner.name } })}
          </p>
        {/if}
      {:else if album.shared}
        <p>{$t('shared')}</p>
      {/if}
    </span>
  </div>
</div>

<style>
  .pholy-album-card {
    position: relative;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: var(--pholy-surface-radius);
    background: var(--immich-ui-light);
    transition:
      border-color 160ms ease,
      box-shadow 160ms ease;
  }

  .pholy-album-card:hover,
  .pholy-album-card:focus-within {
    border-color: var(--immich-ui-primary-300);
    box-shadow: 0 5px 20px #102f330a;
  }

  .pholy-album-card :global(.pholy-album-cover) {
    border-radius: var(--pholy-surface-radius);
  }

  .pholy-album-info {
    display: grid;
    gap: 5px;
    padding: 13px 3px 3px;
  }

  .pholy-album-description,
  .pholy-album-date,
  .pholy-album-details {
    color: var(--immich-ui-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .pholy-album-menu {
    opacity: 1;
    transition: opacity 120ms ease;
  }

  @media (hover: hover) and (pointer: fine) {
    .pholy-album-menu {
      opacity: 0;
    }

    .pholy-album-card:hover .pholy-album-menu,
    .pholy-album-card:focus-within .pholy-album-menu {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pholy-album-card,
    .pholy-album-menu {
      transition: none;
    }
  }
</style>
