<script lang="ts">
  import PhotoComments from '#lib/components/pholy-comments/PhotoComments.svelte';
  import type { PhotoCommentContext } from '#lib/queries/pholy-comments.query.ts';
  import { Modal, ModalBody } from '@immich/ui';
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
</script>

<Modal title={$t('pholy_comments.open')} {onClose} size="full" icon={false} focusOnOpen class="pholy-photo-dialog">
  <ModalBody class="overflow-y-auto p-0!">
    <div class="photo-discussion">
      <div class="photo-stage"><img src={imageUrl} alt={imageAlt} /></div>
      <div class="discussion-panel">
        {#key assetId + JSON.stringify(context)}<PhotoComments {assetId} {context} />{/key}
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
  }
</style>
