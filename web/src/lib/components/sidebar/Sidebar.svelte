<script lang="ts">
  import { clickOutside } from '#lib/actions/click-outside.ts';
  import { focusTrap } from '#lib/actions/focus-trap.ts';
  import { menuButtonId } from '#lib/components/shared-components/navigation-bar/NavigationBar.svelte';
  import { getPholyNavigationCopy } from '#lib/pholy-navigation-copy.ts';
  import { mediaQueryManager } from '#lib/stores/media-query-manager.svelte.ts';
  import { sidebarStore } from '#lib/stores/sidebar.svelte.ts';
  import { IconButton } from '@immich/ui';
  import { mdiClose } from '@mdi/js';
  import { onMount, type Snippet } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  interface Props {
    ariaLabel?: string;
    children?: Snippet;
  }

  let { ariaLabel, children }: Props = $props();

  const isHidden = $derived(!sidebarStore.isOpen && !mediaQueryManager.isFullSidebar);
  const isExpanded = $derived(sidebarStore.isOpen && !mediaQueryManager.isFullSidebar);
  const copy = $derived(getPholyNavigationCopy($locale ?? 'en'));

  onMount(() => {
    closeSidebar();
  });

  const closeSidebar = () => {
    if (!isExpanded) {
      return;
    }
    sidebarStore.reset();
    if (isHidden) {
      document.querySelector<HTMLButtonElement>(`#${menuButtonId}`)?.focus();
    }
  };
</script>

<nav
  id="sidebar"
  aria-label={ariaLabel}
  tabindex="-1"
  class="pholy-sidebar relative z-1 w-0 immich-scrollbar overflow-x-hidden overflow-y-auto bg-light transition-all duration-200 sidebar:w-64"
  class:shadow-2xl={isExpanded}
  class:dark:border-e-immich-dark-gray={isExpanded}
  class:border-r={isExpanded}
  class:w-[min(100vw,16rem)]={sidebarStore.isOpen}
  data-testid="sidebar-parent"
  data-visible={!isHidden}
  inert={isHidden}
  use:clickOutside={{ onOutclick: closeSidebar, onEscape: isExpanded ? closeSidebar : undefined }}
  use:focusTrap={{ active: isExpanded }}
>
  <div class="pholy-sidebar-content flex h-max min-h-full flex-col">
    {#if isExpanded}
      <div class="pholy-sidebar-header">
        <span>{copy.menu}</span>
        <IconButton
          aria-label={$t('close')}
          icon={mdiClose}
          variant="ghost"
          color="secondary"
          size="medium"
          shape="round"
          onclick={closeSidebar}
        />
      </div>
    {/if}

    {@render children?.()}
  </div>
</nav>

<style>
  .pholy-sidebar[data-visible='true'] {
    border-inline-end: 1px solid var(--immich-ui-default-border);
  }

  .pholy-sidebar-content {
    padding: 1.1rem 0.75rem max(1rem, env(safe-area-inset-bottom));
  }

  .pholy-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin: -0.35rem 0 0.25rem;
    padding-inline-start: 0.75rem;
    color: var(--immich-ui-dark);
    font-size: 0.9375rem;
    font-weight: 650;
  }

  .pholy-sidebar :global(a.pholy-nav-item) {
    min-height: 3rem;
    border: 0;
    border-radius: var(--pholy-surface-radius);
    padding-block: 0.625rem;
    padding-inline: 1.25rem 0.75rem;
    transition:
      background-color 150ms ease,
      color 150ms ease;
  }

  .pholy-sidebar :global(a.pholy-nav-item[aria-current='page']) {
    background: color-mix(in srgb, var(--immich-ui-primary-500) 10%, var(--immich-ui-light));
    box-shadow: inset 3px 0 0 var(--immich-ui-primary-500);
  }

  .pholy-sidebar :global(a.pholy-nav-item:focus-visible) {
    outline: 2px solid var(--immich-ui-primary-500);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pholy-sidebar,
    .pholy-sidebar :global(a.pholy-nav-item) {
      transition: none;
    }
  }
</style>
