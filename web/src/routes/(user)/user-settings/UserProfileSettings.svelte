<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { getPholyCollectionCopy } from '#lib/pholy-collection-copy.ts';
  import { handleError } from '#lib/utils/handle-error.ts';
  import { updateMyUser } from '@immich/sdk';
  import { Button, Field, Input, toastManager } from '@immich/ui';
  import { cloneDeep } from 'lodash-es';
  import { locale, t } from 'svelte-i18n';
  import { createBubbler, preventDefault } from 'svelte/legacy';
  import { fade } from 'svelte/transition';

  let editedUser = $state(cloneDeep(authManager.user));
  const bubble = createBubbler();
  const copy = $derived(getPholyCollectionCopy($locale ?? 'en'));

  const handleSaveProfile = async () => {
    try {
      const data = await updateMyUser({
        userUpdateMeDto: {
          email: editedUser.email,
          name: editedUser.name,
        },
      });

      Object.assign(editedUser, data);
      authManager.setUser(data);

      toastManager.primary($t('saved_profile'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_profile'));
    }
  };
</script>

<section class="my-4">
  <div in:fade={{ duration: 500 }}>
    <form autocomplete="off" onsubmit={preventDefault(bubble('submit'))}>
      <div class="pholy-profile-form">
        <div class="pholy-profile-fields">
          <Field label={$t('name')} required>
            <Input bind:value={editedUser.name} />
          </Field>

          <Field label={$t('email')} required>
            <Input type="email" bind:value={editedUser.email} />
          </Field>
        </div>

        <details class="pholy-profile-details">
          <summary>{copy.technicalDetails}</summary>
          <div class="pholy-profile-fields">
            <Field label={$t('user_id')} disabled>
              <Input bind:value={editedUser.id} />
            </Field>

            <Field label={$t('storage_label')} disabled>
              <Input value={editedUser.storageLabel || ''} />
            </Field>
          </div>
        </details>

        <div class="flex justify-end">
          <Button shape="round" type="submit" size="small" onclick={() => handleSaveProfile()}>{$t('save')}</Button>
        </div>
      </div>
    </form>
  </div>
</section>

<style>
  .pholy-profile-form {
    display: grid;
    gap: 20px;
    padding-top: 8px;
  }

  .pholy-profile-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .pholy-profile-details {
    border-top: 1px solid var(--immich-ui-default-border);
    padding-top: 14px;
  }

  .pholy-profile-details summary {
    width: fit-content;
    cursor: pointer;
    color: var(--immich-ui-muted);
    font-size: 13px;
  }

  .pholy-profile-details[open] summary {
    margin-bottom: 16px;
  }

  @media (max-width: 767px) {
    .pholy-profile-fields {
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
    }
  }
</style>
