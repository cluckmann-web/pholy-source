<script lang="ts" module>
  export const headerId = 'user-page-header';
</script>

<script lang="ts">
  import NavigationBar from '#lib/components/shared-components/navigation-bar/NavigationBar.svelte';
  import UserSidebar from '#lib/components/shared-components/side-bar/UserSidebar.svelte';
  import type { HeaderButtonActionItem } from '#lib/types.ts';
  import { openFileUploadDialog } from '#lib/utils/file-uploader.ts';
  import { Button, ContextMenuButton, HStack, isMenuItemType, type MenuItemType } from '@immich/ui';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    hideNavbar?: boolean;
    title?: string | undefined;
    description?: string | undefined;
    scrollbar?: boolean;
    actions?: Array<HeaderButtonActionItem | MenuItemType>;
    sidebar?: Snippet;
    buttons?: Snippet;
    children?: Snippet;
  }

  let {
    hideNavbar = false,
    title = undefined,
    description = undefined,
    scrollbar = true,
    actions = [],
    sidebar,
    buttons,
    children,
    ...rest
  }: Props = $props();

  const enabledActions = $derived(
    actions
      .filter((action): action is HeaderButtonActionItem => !isMenuItemType(action))
      .filter((action) => action.$if?.() ?? true),
  );

  let scrollbarClass = $derived(scrollbar ? 'immich-scrollbar' : 'scrollbar-hidden');
</script>

<header>
  {#if !hideNavbar}
    <NavigationBar onUploadClick={() => openFileUploadDialog()} />
  {/if}
</header>
<div
  tabindex="-1"
  class="pholy-page-shell relative z-0 grid grid-cols-[--spacing(0)_minmax(0,1fr)] overflow-hidden sidebar:grid-cols-[--spacing(64)_minmax(0,1fr)]
    {hideNavbar ? 'h-dvh' : 'h-[calc(100dvh-var(--navbar-height))] max-md:h-[calc(100dvh-var(--navbar-height-md))]'}
    {hideNavbar ? 'pt-(--navbar-height)' : ''}
    {hideNavbar ? 'max-md:pt-(--navbar-height-md)' : ''}"
>
  {#if sidebar}
    {@render sidebar()}
  {:else}
    <UserSidebar />
  {/if}

  <main class="pholy-main relative flex min-h-0 min-w-0 flex-col">
    {#if title || buttons || enabledActions.length > 0}
      <div
        class="pholy-page-header flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b text-dark"
      >
        <div class="min-w-0 flex-1 basis-56 md:basis-72">
          {#if title}
            <h1 class="pholy-page-title outline-none" tabindex="-1" id={headerId}>{title}</h1>
          {/if}
          {#if description}
            <p class="pholy-page-description">{description}</p>
          {/if}
        </div>

        <div class="pholy-page-header-actions flex max-w-full min-w-0 flex-wrap items-center gap-2">
          {@render buttons?.()}

          {#if enabledActions.length > 0}
            <div class="hidden md:block">
              <HStack gap={0}>
                {#each enabledActions as action, i (i)}
                  <Button
                    variant="ghost"
                    size="small"
                    color={action.color ?? 'secondary'}
                    leadingIcon={action.icon}
                    onclick={(event: MouseEvent) => action.onAction({ event, action })}
                    title={action.data?.title}
                  >
                    {action.title}
                  </Button>
                {/each}
              </HStack>
            </div>

            <ContextMenuButton aria-label={$t('open')} items={actions} class="md:hidden" />
          {/if}
        </div>
      </div>
    {/if}

    <div class="{scrollbarClass} pholy-page-content relative min-h-0 w-full flex-1 overflow-y-auto" {...rest}>
      {@render children?.()}
    </div>
  </main>
</div>
