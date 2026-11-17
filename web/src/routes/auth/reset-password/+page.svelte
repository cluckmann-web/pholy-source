<script lang="ts">
  import PholyLoginLayout from '#lib/components/layouts/PholyLoginLayout.svelte';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { eventManager } from '#lib/managers/event-manager.svelte.ts';
  import { resetPholyPasswordMutation } from '#lib/queries/pholy-auth.query.ts';
  import { Route } from '#lib/route.ts';
  import { Alert, Button, Field, PasswordInput } from '@immich/ui';
  import { createMutation } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let token = $state('');
  let ready = $state(false);
  let password = $state('');
  let confirm = $state('');
  let done = $state(false);
  let error = $state('');
  const mutation = createMutation(resetPholyPasswordMutation);
  onMount(() => {
    token = new URLSearchParams(location.hash.slice(1)).get('token') ?? '';
    history.replaceState(history.state, '', location.pathname + location.search);
    ready = true;
  });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    error = '';
    if (password !== confirm) {
      error = $t('password_does_not_match');
      return;
    }
    if (password.length < 12 || new TextEncoder().encode(password).length > 72) {
      error = $t('pholy_auth.password_help');
      return;
    }
    try {
      await mutation.mutateAsync([{ token, password }]);
      authManager.reset();
      eventManager.emit('AuthLogout');
      done = true;
      token = '';
      password = '';
      confirm = '';
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_auth.failed');
    }
  };
</script>

<svelte:head><meta name="referrer" content="no-referrer" /></svelte:head>
<PholyLoginLayout title={$t('pholy_auth.reset_title')} intro={$t('pholy_auth.reset_intro')}>
  <div class="flex flex-col gap-5">
    {#if done}
      <div role="status"><Alert color="primary" title={$t('pholy_auth.reset_success')} /></div>
      <a href={Route.login()} class="underline underline-offset-4">{$t('pholy_auth.back_login')}</a>
    {:else if ready && !/^[\w-]{43}$/.test(token)}
      <Alert color="warning" title={$t('pholy_auth.invalid_link')} />
      <a href={Route.forgotPassword()} class="underline underline-offset-4">{$t('pholy_auth.new_link')}</a>
    {:else if ready}
      <form onsubmit={submit} class="flex flex-col gap-4">
        <Field label={$t('pholy_auth.new_password')} required="indicator"
          ><PasswordInput id="new-password" bind:value={password} autocomplete="new-password" required /></Field
        >
        <p class="text-xs">{$t('pholy_auth.password_help')}</p>
        <Field label={$t('confirm_password')} required="indicator"
          ><PasswordInput id="confirm-password" bind:value={confirm} autocomplete="new-password" required /></Field
        >
        {#if error}<Alert color="danger" title={error} /><a
            href={Route.forgotPassword()}
            class="text-sm underline underline-offset-4">{$t('pholy_auth.new_link')}</a
          >{/if}
        <Button type="submit" shape="rectangle" fullWidth loading={mutation.isPending} disabled={mutation.isPending}
          >{$t('pholy_auth.save_password')}</Button
        >
      </form>
    {/if}
  </div>
</PholyLoginLayout>
