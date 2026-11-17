<script lang="ts">
  import BottomInfo from '#lib/components/shared-components/side-bar/BottomInfo.svelte';
  import Sidebar from '#lib/components/sidebar/Sidebar.svelte';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { getPholyNavigationCopy } from '#lib/pholy-navigation-copy.ts';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getUserConfigQuery } from '#lib/queries/config-user.query.ts';
  import { Route } from '#lib/route.ts';
  import { NavbarItem } from '@immich/ui';
  import {
    mdiAccount,
    mdiAccountCircle,
    mdiAccountCircleOutline,
    mdiAccountMultiple,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiArchiveArrowDown,
    mdiArchiveArrowDownOutline,
    mdiCards,
    mdiCardsOutline,
    mdiFolderOutline,
    mdiHeart,
    mdiHeartOutline,
    mdiHelpCircleOutline,
    mdiHistory,
    mdiImageAlbum,
    mdiImageMultiple,
    mdiImageMultipleOutline,
    mdiLink,
    mdiLock,
    mdiLockOutline,
    mdiMagnify,
    mdiMap,
    mdiMapOutline,
    mdiShieldAccountOutline,
    mdiTagMultipleOutline,
    mdiToolbox,
    mdiToolboxOutline,
    mdiTrashCan,
    mdiTrashCanOutline,
    mdiUploadOutline,
  } from '@mdi/js';
  import { locale, t } from 'svelte-i18n';

  const query = createPreloadedQuery(getUserConfigQuery);
  const config = $derived(query.data);
  const copy = $derived(getPholyNavigationCopy($locale ?? 'en'));
  const photosTitle = $derived($locale === 'dev' ? $t('photos') : copy.myPhotos);
</script>

<Sidebar ariaLabel={$t('primary')}>
  <h2 class="pholy-nav-group-title">{copy.library}</h2>
  <NavbarItem
    title={photosTitle}
    href={Route.photos()}
    icon={mdiImageMultipleOutline}
    activeIcon={mdiImageMultiple}
    class="pholy-nav-item"
  />

  <NavbarItem
    title={$t('favorites')}
    href={Route.favorites()}
    icon={mdiHeartOutline}
    activeIcon={mdiHeart}
    class="pholy-nav-item"
  />

  <NavbarItem
    title={$t('albums')}
    href={Route.albums()}
    icon={{ icon: mdiImageAlbum, flipped: true }}
    class="pholy-nav-item"
  />

  <NavbarItem title={$t('explore')} href={Route.explore()} icon={mdiMagnify} class="pholy-nav-item" />

  {#if config.map.enabled}
    <NavbarItem title={$t('map')} href={Route.map()} icon={mdiMapOutline} activeIcon={mdiMap} class="pholy-nav-item" />
  {/if}

  {#if authManager.preferences.memories.enabled && authManager.preferences.memories.sidebarWeb}
    <NavbarItem
      title={$t('memories')}
      href={Route.memories()}
      icon={mdiCardsOutline}
      activeIcon={mdiCards}
      class="pholy-nav-item"
    />
  {/if}

  {#if authManager.preferences.people.enabled && authManager.preferences.people.sidebarWeb}
    <NavbarItem
      title={$t('people')}
      href={Route.people()}
      icon={mdiAccountOutline}
      activeIcon={mdiAccount}
      class="pholy-nav-item"
    />
  {/if}

  <h2 class="pholy-nav-group-title">{copy.sharing}</h2>

  <NavbarItem
    title={$t('sharing')}
    href={Route.sharing()}
    icon={mdiAccountMultipleOutline}
    activeIcon={mdiAccountMultiple}
    class="pholy-nav-item"
  />

  {#if authManager.preferences.sharedLinks.enabled && authManager.preferences.sharedLinks.sidebarWeb}
    <NavbarItem title={$t('shared_links')} href={Route.sharedLinks()} icon={mdiLink} class="pholy-nav-item" />
  {/if}

  <NavbarItem
    title={$t('pholy_nav_community')}
    href={Route.community()}
    icon={mdiAccountMultipleOutline}
    class="pholy-nav-item"
  />

  <h2 class="pholy-nav-group-title">{copy.organize}</h2>

  <NavbarItem
    title={$t('pholy_nav_upload_history')}
    href={Route.uploadHistory()}
    icon={mdiHistory}
    class="pholy-nav-item"
  />

  {#if authManager.preferences.tags.enabled && authManager.preferences.tags.sidebarWeb}
    <NavbarItem
      title={$t('tags')}
      href={Route.tags()}
      icon={{ icon: mdiTagMultipleOutline, flipped: true }}
      class="pholy-nav-item"
    />
  {/if}

  {#if authManager.preferences.recentlyAdded.sidebarWeb}
    <NavbarItem
      title={$t('recently_added')}
      href={Route.recentlyAdded()}
      icon={{ icon: mdiUploadOutline, flipped: true }}
      class="pholy-nav-item"
    />
  {/if}

  {#if authManager.preferences.folders.enabled && authManager.preferences.folders.sidebarWeb}
    <NavbarItem
      title={$t('folders')}
      href={Route.folders()}
      icon={{ icon: mdiFolderOutline, flipped: true }}
      class="pholy-nav-item"
    />
  {/if}

  <NavbarItem
    title={$t('utilities')}
    href={Route.utilities()}
    icon={mdiToolboxOutline}
    activeIcon={mdiToolbox}
    class="pholy-nav-item"
  />

  <NavbarItem
    title={$t('archive')}
    href={Route.archive()}
    icon={mdiArchiveArrowDownOutline}
    activeIcon={mdiArchiveArrowDown}
    class="pholy-nav-item"
  />

  <NavbarItem
    title={$t('locked_folder')}
    href={Route.locked()}
    icon={mdiLockOutline}
    activeIcon={mdiLock}
    class="pholy-nav-item"
  />

  {#if config.trash.enabled}
    <NavbarItem
      title={$t('trash')}
      href={Route.trash()}
      icon={mdiTrashCanOutline}
      activeIcon={mdiTrashCan}
      class="pholy-nav-item"
    />
  {/if}

  <h2 class="pholy-nav-group-title">{copy.account}</h2>

  <NavbarItem
    title={copy.profile}
    href={Route.userSettings()}
    icon={mdiAccountCircleOutline}
    activeIcon={mdiAccountCircle}
    class="pholy-nav-item"
  />

  <NavbarItem
    title={$t('pholy_nav_account')}
    href={Route.account()}
    icon={mdiShieldAccountOutline}
    class="pholy-nav-item"
  />
  <NavbarItem title={$t('pholy_nav_help')} href={Route.help()} icon={mdiHelpCircleOutline} class="pholy-nav-item" />

  <div class="pholy-sidebar-footer mt-auto pt-5">
    <BottomInfo />
  </div>
</Sidebar>
