<script lang="ts">
  import BreadcrumbActionPage from '#lib/components/BreadcrumbActionPage.svelte';
  import NavigationBar from '#lib/components/shared-components/navigation-bar/NavigationBar.svelte';
  import BottomInfo from '#lib/components/shared-components/side-bar/BottomInfo.svelte';
  import { featureFlagsManager } from '#lib/managers/feature-flags-manager.svelte.ts';
  import { Route } from '#lib/route.ts';
  import { sidebarStore } from '#lib/stores/sidebar.svelte.ts';
  import type { HeaderButtonActionItem } from '#lib/types.ts';
  import { ImmichBackupsAdminNavButton } from '@futo-org/backups-orchestrator-ui';
  import { AppShell, AppShellHeader, AppShellSidebar, MenuItemType, NavbarItem, type BreadcrumbItem } from '@immich/ui';
  import {
    mdiAccountMultipleOutline,
    mdiBookshelf,
    mdiCog,
    mdiServer,
    mdiTrayFull,
    mdiViewDashboardOutline,
    mdiWrench,
  } from '@mdi/js';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  type Props = {
    breadcrumbs: BreadcrumbItem[];
    actions?: Array<HeaderButtonActionItem | MenuItemType>;
    children?: Snippet;
  };

  let { breadcrumbs, actions, children }: Props = $props();
</script>

<AppShell class="pholy-admin-shell">
  <AppShellHeader>
    <NavigationBar noBorder />
  </AppShellHeader>
  <AppShellSidebar
    bind:open={sidebarStore.isOpen}
    class="pholy-admin-sidebar flex h-full flex-col justify-between gap-2 border-none shadow-none"
  >
    <div class="flex flex-col gap-1 pe-4 pt-8">
      <NavbarItem title={$t('pholy_admin_title')} href={Route.admin()} icon={mdiViewDashboardOutline} />
      {#if featureFlagsManager.value.backups}
        <ImmichBackupsAdminNavButton href={Route.backups()} />
      {/if}

      <NavbarItem
        title={$t('pholy_invitation.admin_title')}
        href={Route.invitations()}
        icon={mdiAccountMultipleOutline}
      />
      <NavbarItem title={$t('users')} href={Route.users()} icon={mdiAccountMultipleOutline} />
      <NavbarItem title={$t('external_libraries')} href={Route.libraries()} icon={mdiBookshelf} />
      <NavbarItem title={$t('admin.queues')} href={Route.queues()} icon={mdiTrayFull} />
      <NavbarItem title={$t('settings')} href={Route.systemSettings()} icon={mdiCog} />
      <NavbarItem title={$t('admin.maintenance_settings')} href={Route.systemMaintenance()} icon={mdiWrench} />
      <NavbarItem title={$t('server_stats')} href={Route.systemStatistics()} icon={mdiServer} />
    </div>

    <div class="me-4 mb-2">
      <BottomInfo />
    </div>
  </AppShellSidebar>

  <BreadcrumbActionPage {breadcrumbs} {actions}>
    {@render children?.()}
  </BreadcrumbActionPage>
</AppShell>
