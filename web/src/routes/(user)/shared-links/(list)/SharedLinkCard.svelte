<script lang="ts">
  import { Route } from '#lib/route.ts';
  import { getSharedLinkActions } from '#lib/services/shared-link.service.ts';
  import { locale } from '#lib/stores/preferences.store.ts';
  import { SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
  import { ActionButton, ContextMenuButton, MenuItemType, Text } from '@immich/ui';
  import { DateTime, type ToRelativeUnit } from 'luxon';
  import { t } from 'svelte-i18n';
  import ShareCover from './ShareCover.svelte';

  interface Props {
    sharedLink: SharedLinkResponseDto;
  }

  let { sharedLink }: Props = $props();

  let now = DateTime.now();
  let expiresAt = $derived(sharedLink.expiresAt ? DateTime.fromISO(sharedLink.expiresAt) : undefined);
  let isExpired = $derived(expiresAt && now > expiresAt);

  const getCountDownExpirationDate = (expiresAtDate: DateTime, now: DateTime) => {
    const relativeUnits: ToRelativeUnit[] = ['days', 'hours', 'minutes', 'seconds'];
    const expirationCountdown = expiresAtDate.diff(now, relativeUnits).toObject();

    for (const unit of relativeUnits) {
      const value = expirationCountdown[unit];
      if (value && value > 0) {
        return expiresAtDate.toRelativeCalendar({ base: now, locale: $locale, unit });
      }
    }
  };

  const { Edit, Copy, Delete } = $derived(getSharedLinkActions($t, sharedLink));

  const capabilities = $derived.by(() => {
    const items = [];

    if (sharedLink.allowUpload) {
      items.push($t('upload'));
    }

    if (sharedLink.allowDownload) {
      items.push($t('download'));
    }

    if (sharedLink.showMetadata) {
      items.push($t('exif'));
    }

    if (sharedLink.password) {
      items.push($t('password'));
    }

    return items;
  });
</script>

<div class="pholy-share-card">
  <svelte:element
    this={isExpired ? 'div' : 'a'}
    href={isExpired ? undefined : Route.viewSharedLink(sharedLink)}
    class="pholy-share-content"
  >
    <ShareCover {sharedLink} />

    <div class="flex min-w-0 flex-col justify-between gap-3">
      <div class="flex flex-col">
        <Text size="tiny" color={isExpired ? 'danger' : 'muted'} fontWeight="medium">
          {#if isExpired}
            {$t('expired')}
          {:else if expiresAt}
            {$t('expires_date', { values: { date: getCountDownExpirationDate(expiresAt, now) } })}
          {:else}
            {$t('expires_date', { values: { date: '∞' } })}
          {/if}
        </Text>

        <Text size="large" color="primary" class="pholy-share-title" fontWeight="medium">
          {#if sharedLink.type === SharedLinkType.Album}
            {sharedLink.album?.albumName}
          {:else if sharedLink.type === SharedLinkType.Individual}
            {$t('individual_share')}
          {/if}
        </Text>

        {#if sharedLink.description}
          <Text size="small" class="line-clamp-2 wrap-anywhere">{sharedLink.description}</Text>
        {/if}
      </div>

      <div class="flex flex-wrap items-center gap-2">
        {#each capabilities as capability, index (index)}
          <Text size="small" color="primary" fontWeight="medium">
            {capability}
          </Text>
          {#if index < capabilities.length - 1}
            <Text size="small" color="muted">•</Text>
          {/if}
        {/each}
      </div>
    </div>
  </svelte:element>
  <div class="pholy-share-actions">
    <div class="hidden sm:flex">
      <ActionButton action={Edit} />
      <ActionButton action={Copy} />
      <ActionButton action={Delete} />
    </div>

    <div class="sm:hidden">
      <ContextMenuButton
        aria-label={$t('shared_link_options')}
        position="top-right"
        items={[Edit, Copy, MenuItemType.Divider, Delete]}
      />
    </div>
  </div>
</div>

<style>
  .pholy-share-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
  }

  .pholy-share-card:hover {
    border-color: var(--immich-ui-primary-400);
  }

  .pholy-share-content {
    display: flex;
    min-width: 0;
    align-items: flex-start;
    gap: 16px;
  }

  .pholy-share-content:focus-visible {
    outline: 2px solid var(--immich-ui-primary-500);
    outline-offset: 4px;
  }

  :global(.pholy-share-title) {
    overflow-wrap: anywhere;
  }

  .pholy-share-actions {
    flex-shrink: 0;
  }

  @media (max-width: 639px) {
    .pholy-share-card {
      align-items: start;
      gap: 4px;
      padding: 12px;
    }

    .pholy-share-content {
      gap: 12px;
    }
  }
</style>
