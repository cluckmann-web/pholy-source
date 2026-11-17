<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import UserAvatar from '#lib/components/shared-components/UserAvatar.svelte';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import AvatarEditModal from '#lib/modals/AvatarEditModal.svelte';
  import { getPholyCollectionCopy } from '#lib/pholy-collection-copy.ts';
  import { getKeyboardActions } from '#lib/services/keyboard.service.ts';
  import { Button, modalManager } from '@immich/ui';
  import { mdiPencilOutline } from '@mdi/js';
  import { locale, t } from 'svelte-i18n';
  import type { PageData } from './$types';
  import UserSettingsList from './UserSettingsList.svelte';

  type Props = {
    data: PageData;
  };

  let { data }: Props = $props();

  const copy = $derived(getPholyCollectionCopy($locale ?? 'en'));
  const { KeyboardShortcuts } = $derived(getKeyboardActions($t));
</script>

<UserPageLayout title={data.meta.title} description={copy.settingsDescription} actions={[KeyboardShortcuts]}>
  <div class="pholy-settings-page">
    <section class="pholy-account-summary" aria-label={copy.accountEyebrow}>
      <UserAvatar user={authManager.user} size="xl" />
      <div class="pholy-account-identity">
        <p class="pholy-account-eyebrow">{copy.accountEyebrow}</p>
        <h2>{authManager.user.name}</h2>
        <p class="pholy-account-email">{authManager.user.email}</p>
      </div>
      <div class="pholy-account-action">
        <Button
          leadingIcon={mdiPencilOutline}
          variant="outline"
          shape="round"
          size="small"
          onclick={() => modalManager.show(AvatarEditModal)}
        >
          {$t('select_avatar_color')}
        </Button>
      </div>
    </section>

    <UserSettingsList />
  </div>
</UserPageLayout>

<style>
  .pholy-settings-page {
    width: 100%;
    max-width: 1100px;
    margin-inline: auto;
    padding: 4px 4px 32px;
  }

  .pholy-account-summary {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
    padding: 24px;
    border: 1px solid var(--immich-ui-default-border);
    border-radius: var(--pholy-surface-radius);
    background: var(--immich-ui-light);
    box-shadow: 0 4px 24px #102f3305;
  }

  .pholy-account-identity {
    min-width: 0;
    flex: 1;
  }

  .pholy-account-eyebrow {
    margin-bottom: 4px;
    color: var(--immich-ui-primary-500);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h2 {
    color: var(--immich-ui-dark);
    font-size: 22px;
    line-height: 1.3;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .pholy-account-email {
    margin-top: 4px;
    color: var(--immich-ui-muted);
    font-size: 14px;
    overflow-wrap: anywhere;
  }

  @media (max-width: 639px) {
    .pholy-account-summary {
      padding: 18px;
      gap: 14px;
    }

    .pholy-account-action {
      width: 100%;
    }

    h2 {
      font-size: 20px;
    }
  }
</style>
