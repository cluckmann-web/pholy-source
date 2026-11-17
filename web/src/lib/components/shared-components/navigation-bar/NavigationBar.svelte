<script lang="ts" module>
  export const menuButtonId = 'top-menu-button';
</script>

<script lang="ts">
  import { clickOutside } from '#lib/actions/click-outside.ts';
  import PholyLogo from '#lib/components/PholyLogo.svelte';
  import NotificationPanel from '#lib/components/shared-components/navigation-bar/NotificationPanel.svelte';
  import SearchBar from '#lib/components/shared-components/search-bar/SearchBar.svelte';
  import SkipLink from '#lib/elements/SkipLink.svelte';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { getNotificationsQuery } from '#lib/queries/notification.query.ts';
  import { Route } from '#lib/route.ts';
  import { getGlobalActions } from '#lib/services/app.service.ts';
  import { mediaQueryManager } from '#lib/stores/media-query-manager.svelte.ts';
  import { sidebarStore } from '#lib/stores/sidebar.svelte.ts';
  import { ActionButton, Button, IconButton } from '@immich/ui';
  import { mdiBellBadge, mdiBellOutline, mdiMagnify, mdiMenu, mdiTrayArrowUp } from '@mdi/js';
  import { createQuery } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import ThemeButton from '../ThemeButton.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import AccountInfoPanel from './AccountInfoPanel.svelte';

  type Props = {
    onUploadClick?: () => void;
    // TODO: remove once this is only used in <AppShellHeader>
    noBorder?: boolean;
  };

  let { onUploadClick, noBorder = false }: Props = $props();

  let shouldShowAccountInfoPanel = $state(false);
  let shouldShowNotificationPanel = $state(false);
  let innerWidth: number = $state(0);
  const query = createQuery(getNotificationsQuery);
  const unreadCount = $derived(query.data?.length ?? 0);
  const hasUnreadNotifications = $derived(unreadCount > 0);

  const { Cast } = $derived(getGlobalActions($t));
</script>

<svelte:window bind:innerWidth />

<nav id="dashboard-navbar" class="pholy-navbar h-(--navbar-height) w-full text-sm max-md:h-(--navbar-height-md)">
  <SkipLink text={$t('skip_to_content')} />
  <div
    class="pholy-navbar-grid grid h-full grid-cols-[88px_minmax(0,1fr)] items-center py-2 sidebar:grid-cols-[--spacing(64)_minmax(0,1fr)] {noBorder
      ? ''
      : 'border-b'}"
  >
    <div class="mx-2 flex min-w-0 flex-row items-center gap-0 sidebar:mx-5">
      <IconButton
        id={menuButtonId}
        shape="round"
        color="secondary"
        variant="ghost"
        size="medium"
        aria-label={$t('main_menu')}
        icon={mdiMenu}
        onclick={() => {
          sidebarStore.toggle();
        }}
        onmousedown={(event: MouseEvent) => {
          if (sidebarStore.isOpen) {
            // stops event from reaching the default handler when clicking outside of the sidebar
            event.stopPropagation();
          }
        }}
        class="sidebar:hidden"
      />
      <a class="pholy-navbar-logo" data-sveltekit-preload-data="hover" href={Route.photos()}>
        <PholyLogo
          variant={mediaQueryManager.isFullSidebar ? 'inline' : 'icon'}
          class={mediaQueryManager.isFullSidebar ? '' : 'h-7'}
        />
      </a>
    </div>
    <div class="pholy-navbar-content flex min-w-0 justify-between gap-2 md:gap-4 lg:gap-6">
      <div class="pholy-navbar-search hidden w-full flex-1 sm:block tall:ps-0">
        <SearchBar grayTheme={true} />
      </div>

      <section class="pholy-navbar-actions flex w-full min-w-0 place-items-center justify-end gap-0 sm:w-auto md:gap-2">
        <IconButton
          color="secondary"
          shape="round"
          variant="ghost"
          size="medium"
          icon={mdiMagnify}
          href={Route.search()}
          id="search-button"
          class="sm:hidden"
          aria-label={$t('go_to_search')}
        />

        {#if !page.url.pathname.includes('/admin') && onUploadClick}
          <Button
            leadingIcon={mdiTrayArrowUp}
            onclick={onUploadClick}
            class="hidden lg:flex"
            variant="filled"
            size="medium"
            color="primary"
            >{$t('upload')}
          </Button>
          <IconButton
            color="secondary"
            shape="round"
            variant="ghost"
            size="medium"
            onclick={onUploadClick}
            title={$t('upload')}
            aria-label={$t('upload')}
            icon={mdiTrayArrowUp}
            class="lg:hidden"
          />
        {/if}

        <ThemeButton />

        <div
          use:clickOutside={{
            onOutclick: () => (shouldShowNotificationPanel = false),
            onEscape: () => (shouldShowNotificationPanel = false),
          }}
        >
          <div class="relative">
            <IconButton
              shape="round"
              color={hasUnreadNotifications ? 'primary' : 'secondary'}
              variant="ghost"
              size="medium"
              icon={hasUnreadNotifications ? mdiBellBadge : mdiBellOutline}
              onclick={() => (shouldShowNotificationPanel = !shouldShowNotificationPanel)}
              aria-label={$t('notifications')}
            />

            {#if hasUnreadNotifications}
              <div
                class="pointer-events-none absolute top-0 right-1 flex size-5 items-center justify-center rounded-full border bg-primary text-[10px] font-bold text-light"
              >
                {unreadCount}
              </div>
            {/if}
          </div>

          {#if shouldShowNotificationPanel}
            <NotificationPanel />
          {/if}
        </div>

        <ActionButton action={Cast} />

        <div
          use:clickOutside={{
            onOutclick: () => (shouldShowAccountInfoPanel = false),
            onEscape: () => (shouldShowAccountInfoPanel = false),
          }}
        >
          <button
            type="button"
            class="pholy-account-button flex ps-1"
            aria-expanded={shouldShowAccountInfoPanel}
            onclick={() => (shouldShowAccountInfoPanel = !shouldShowAccountInfoPanel)}
            title="{authManager.user.name} ({authManager.user.email})"
          >
            {#key authManager.user}
              <UserAvatar user={authManager.user} size="md" noTitle interactive />
            {/key}
          </button>

          {#if shouldShowAccountInfoPanel}
            <AccountInfoPanel onClose={() => (shouldShowAccountInfoPanel = false)} />
          {/if}
        </div>
      </section>
    </div>
  </div>
</nav>

<style>
  @media (width < 360px) {
    .pholy-navbar-grid {
      grid-template-columns: 56px minmax(0, 1fr);
    }

    .pholy-navbar-logo {
      display: none;
    }
  }
</style>
