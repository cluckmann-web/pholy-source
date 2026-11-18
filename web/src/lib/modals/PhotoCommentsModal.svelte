<script lang="ts">
  import PhotoComments from '#lib/components/pholy-comments/PhotoComments.svelte';
  import type { PhotoCommentContext } from '#lib/queries/pholy-comments.query.ts';
  import { Icon, Modal, ModalBody } from '@immich/ui';
  import { mdiCommentOutline } from '@mdi/js';
  import { tick } from 'svelte';
  import { t } from 'svelte-i18n';

  let {
    assetId,
    context,
    imageUrl,
    imageAlt,
    onClose,
  }: {
    assetId: string;
    context: PhotoCommentContext;
    imageUrl: string;
    imageAlt: string;
    onClose: () => void;
  } = $props();
  let commentsCollapsed = $state(false);
  let showCommentsButton = $state<HTMLButtonElement>();
  let hideCommentsButton = $state<HTMLButtonElement>();
  const commentsPanelId = $props.id();
  const setCommentsCollapsed = async (collapsed: boolean) => {
    commentsCollapsed = collapsed;
    await tick();
    (collapsed ? showCommentsButton : hideCommentsButton)?.focus();
  };
</script>

<Modal title={$t('pholy_comments.open')} {onClose} size="full" icon={false} focusOnOpen class="pholy-photo-dialog">
  <ModalBody class="overflow-y-auto p-0!">
    <div class="photo-discussion" class:comments-collapsed={commentsCollapsed}>
      <div class="photo-stage">
        <img src={imageUrl} alt={imageAlt} />
        {#if commentsCollapsed}
          <button
            bind:this={showCommentsButton}
            class="show-comments"
            type="button"
            aria-expanded="false"
            aria-controls={commentsPanelId}
            onclick={() => setCommentsCollapsed(false)}
            ><Icon icon={mdiCommentOutline} size="18" />{$t('pholy_comments.show')}</button
          >
        {/if}
      </div>
      <div id={commentsPanelId} class="discussion-panel" hidden={commentsCollapsed} inert={commentsCollapsed}>
        {#key assetId + JSON.stringify(context)}
          <PhotoComments
            {assetId}
            {context}
            active={!commentsCollapsed}
            controlsId={commentsPanelId}
            bind:hideButton={hideCommentsButton}
            onHide={() => setCommentsCollapsed(true)}
          />
        {/key}
      </div>
    </div>
  </ModalBody>
</Modal>

<style>
  :global(.pholy-photo-dialog) {
    max-width: 1440px;
    margin: auto;
    width: 100%;
    max-height: calc(100dvh - 32px);
    border-radius: 0 !important;
  }
  .photo-discussion {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 410px;
    min-height: 0;
    height: calc(100dvh - 105px);
    max-height: 1000px;
  }
  .photo-stage {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    background: #11151c;
    padding: 20px;
  }
  .photo-stage img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  .discussion-panel {
    min-width: 0;
    overflow-y: auto;
    background: var(--color-light, #fff);
  }
  .discussion-panel[hidden] {
    display: none;
  }
  .comments-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
  .show-comments {
    position: absolute;
    bottom: 24px;
    inset-inline-start: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border: 1px solid #dce2ea;
    background: #fff;
    color: #172033;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }
  .show-comments:focus-visible {
    outline: 3px solid #5c8cff;
    outline-offset: 3px;
  }
  @media (max-width: 800px) {
    :global(.pholy-photo-dialog) {
      max-height: 100dvh;
    }
    .photo-discussion {
      display: flex;
      flex-direction: column;
      height: auto;
      max-height: none;
    }
    .photo-stage {
      height: 40dvh;
      min-height: 200px;
      padding: 12px;
      flex-shrink: 0;
    }
    .discussion-panel {
      overflow: visible;
    }
    .photo-stage img {
      max-height: 40dvh;
    }
    .photo-discussion.comments-collapsed {
      height: calc(100dvh - 105px);
    }
    .comments-collapsed .photo-stage {
      height: 100%;
      min-height: 0;
    }
    .comments-collapsed .photo-stage img {
      max-height: 100%;
    }
  }
</style>
