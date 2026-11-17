<script lang="ts">
  import PholyLoginLayout from '#lib/components/layouts/PholyLoginLayout.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { forgotPholyPasswordMutation, getPholyAuthStatusQuery } from '#lib/queries/pholy-auth.query.ts';
  import { Route } from '#lib/route.ts';
  import { Alert, Button, Field, Input } from '@immich/ui';
  import { createMutation } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';

  const availability = createPreloadedQuery(getPholyAuthStatusQuery);
  const mutation = createMutation(forgotPholyPasswordMutation);
  let email = $state('');
  let sent = $state(false);
  let error = $state('');
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (mutation.isPending) return;
    error = '';
    try {
      await mutation.mutateAsync([email]);
      sent = true;
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_auth.failed');
    }
  };
</script>

<svelte:head><meta name="referrer" content="no-referrer" /></svelte:head>
<PholyLoginLayout title={$t('pholy_auth.forgot_title')} intro={$t('pholy_auth.forgot_intro')}>
  <div class="flex flex-col gap-5">
    {#if !availability.data.mailEnabled || !availability.data.passwordLoginEnabled}
      <Alert color="warning" title={$t('pholy_auth.unavailable')} />
    {:else if sent}
      <div role="status"><Alert color="primary" title={$t('pholy_auth.request_accepted')} /></div>
      <p class="text-sm">{$t('pholy_auth.check_mail')}</p>
    {:else}
      <form onsubmit={submit} class="flex flex-col gap-4">
        <Field label={$t('email')} required="indicator"
          ><Input id="reset-email" type="email" autocomplete="email" bind:value={email} required /></Field
        >
        {#if error}<Alert color="danger" title={error} />{/if}
        <Button type="submit" shape="rectangle" fullWidth loading={mutation.isPending} disabled={mutation.isPending}
          >{$t('pholy_auth.send_link')}</Button
        >
      </form>
    {/if}
    <a href={Route.login()} class="text-sm underline underline-offset-4">{$t('pholy_auth.back_login')}</a>
  </div>
</PholyLoginLayout>
