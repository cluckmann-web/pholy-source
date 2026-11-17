<script lang="ts">
  import PholyPublicLayout from '#lib/components/layouts/PholyPublicLayout.svelte';
  import AppNotice from '#lib/components/pholy/AppNotice.svelte';
  import {
    acceptPholyInvitationMutation,
    previewPholyInvitation,
    type PholyInvitationPreview,
  } from '#lib/queries/pholy-invitation.query.ts';
  import { Route } from '#lib/route.ts';
  import { createMutation } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let token = $state('');
  let loading = $state(true);
  let invitation = $state<PholyInvitationPreview>();
  let failure = $state('');
  let name = $state('');
  let password = $state('');
  let confirm = $state('');
  let accepted = $state(false);
  let visible = $state(false);
  let success = $state(false);
  const mutation = createMutation(acceptPholyInvitationMutation);
  const mismatch = $derived(confirm.length > 0 && password !== confirm);
  onMount(() => {
    const controller = new AbortController();
    token = new URLSearchParams(location.hash.slice(1)).get('invitation') ?? '';
    if (!/^[\w-]{43}$/.test(token)) {
      loading = false;
      return;
    }
    previewPholyInvitation(token, controller.signal)
      .then((data) => {
        invitation = data;
      })
      .catch((error: Error) => {
        if (error.name !== 'AbortError') failure = error.message;
      })
      .finally(() => {
        loading = false;
      });
    return () => controller.abort();
  });
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!invitation || !accepted || mismatch || mutation.isPending || success) return;
    failure = '';
    try {
      const result = await mutation.mutateAsync([
        { token, name, password, termsAccepted: true, termsVersion: invitation.termsVersion },
      ]);
      if (result.registered) {
        success = true;
        password = '';
        confirm = '';
        token = '';
        history.replaceState(history.state, '', location.pathname);
      }
    } catch (error) {
      failure = error instanceof Error ? error.message : $t('pholy_invitation.failed');
    }
  };
</script>

<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
<PholyPublicLayout
  title={success ? $t('pholy_invitation.success_title') : $t('pholy_invitation.title')}
  subtitle={$t('pholy_invitation.subtitle')}
>
  <div class="registration-grid">
    <section class="registration">
      {#if loading}
        <p role="status">{$t('pholy_invitation.checking')}</p>
      {:else if success}
        <div class="success" role="status">
          <h2>{$t('pholy_invitation.success_heading')}</h2>
          <p>{$t('pholy_invitation.success_text')}</p>
        </div>
        <a class="primary" href={Route.login()}>{$t('pholy_landing.login')} ↗</a>
      {:else if invitation}
        <form onsubmit={submit}>
          {#if invitation.quotaSizeInBytes !== null}
            <p class="help quota">
              {$t('pholy_invitation.quota_label')}: {(Number(invitation.quotaSizeInBytes) / 1024 ** 3).toLocaleString()} GiB
            </p>
          {/if}
          <label for="invite-email">{$t('email')}</label>
          <input id="invite-email" value={invitation.email} type="email" readonly autocomplete="email" />
          <p class="help">{$t('pholy_invitation.email_fixed')}</p>
          <label for="invite-name">{$t('name')}</label>
          <input id="invite-name" bind:value={name} required minlength="2" maxlength="100" autocomplete="name" />
          <label for="invite-password">{$t('password')}</label>
          <div class="password-row">
            <input
              id="invite-password"
              type={visible ? 'text' : 'password'}
              bind:value={password}
              required
              minlength="12"
              maxlength="72"
              autocomplete="new-password"
              aria-describedby="password-help"
            />
            <button
              type="button"
              class="toggle"
              onclick={() => (visible = !visible)}
              aria-label={visible ? $t('hide_password') : $t('show_password')}
              >{visible ? $t('pholy_invitation.hide') : $t('pholy_invitation.show')}</button
            >
          </div>
          <p id="password-help" class="help">{$t('pholy_invitation.password_help')}</p>
          <label for="invite-confirm">{$t('confirm_password')}</label>
          <input
            id="invite-confirm"
            type={visible ? 'text' : 'password'}
            bind:value={confirm}
            required
            minlength="12"
            maxlength="72"
            autocomplete="new-password"
            aria-invalid={mismatch}
          />
          {#if mismatch}<p class="error" role="alert">{$t('password_does_not_match')}</p>{/if}
          <label class="terms" for="invite-terms"
            ><input id="invite-terms" type="checkbox" bind:checked={accepted} required />
            <span
              >{$t('pholy_invitation.accept_prefix')}
              <a href={Route.terms()} target="_blank" rel="noopener noreferrer">{$t('pholy_public.terms_long')}</a>. {$t(
                'pholy_invitation.privacy_prefix',
              )}
              <a href={Route.privacy()} target="_blank" rel="noopener noreferrer">{$t('pholy_public.privacy')}</a
              >.</span
            ></label
          >
          {#if failure}<p class="error" role="alert">{failure}</p>{/if}
          <button class="primary" type="submit" disabled={mutation.isPending || !accepted || mismatch}
            >{mutation.isPending ? $t('pholy_invitation.creating') : $t('pholy_invitation.submit')}</button
          >
        </form>
      {:else}
        <h2>{$t('pholy_invitation.required_title')}</h2>
        <p>{failure || $t('pholy_invitation.required_text')}</p>
        <a class="primary" href={Route.login()}>{$t('pholy_landing.login')} ↗</a>
      {/if}
    </section>
    <aside>
      <AppNotice />
      <p class="free">{$t('pholy_invitation.free')}</p>
    </aside>
  </div>
</PholyPublicLayout>

<style>
  .registration-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(40px, 8vw, 130px);
    align-items: start;
    max-width: 1150px;
  }
  .registration {
    min-width: 0;
  }
  h2 {
    font-size: 26px;
    line-height: 1.2;
    letter-spacing: -0.03em;
    font-weight: 550;
    margin: 0 0 16px;
  }
  p {
    color: #637168;
    margin: 0 0 24px;
  }
  form {
    display: flex;
    flex-direction: column;
  }
  label {
    font-size: 13px;
    font-weight: 500;
    margin: 0 0 7px;
  }
  input:not([type='checkbox']) {
    width: 100%;
    min-width: 0;
    background: white;
    color: #1f332b;
    border: 1px solid #b7c5b1;
    padding: 13px 14px;
    font: inherit;
    font-size: 16px;
    border-radius: 0;
    margin-bottom: 20px;
  }
  input[readonly] {
    background: #edf1e9;
  }
  input:focus {
    outline: 2px solid #143e35;
    outline-offset: 2px;
  }
  .help {
    font-size: 12px;
    margin: -12px 0 22px;
    color: #637168;
  }
  .password-row {
    position: relative;
  }
  .password-row input {
    padding-right: 92px;
  }
  .toggle {
    position: absolute;
    right: 10px;
    top: 14px;
    font-size: 12px;
    border: 0;
    background: none;
    cursor: pointer;
    color: #143e35;
  }
  .terms {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 13px;
    font-weight: 400;
    margin: 8px 0 24px;
    line-height: 1.65;
  }
  .terms input {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    margin-top: 3px;
    accent-color: #143e35;
  }
  .terms a {
    color: #143e35;
    text-decoration: underline;
  }
  .primary {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    min-height: 52px;
    background: #143e35;
    color: white;
    padding: 14px 24px;
    border: 0;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    margin-top: 8px;
  }
  .primary:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  .error {
    color: #a12922;
    font-size: 13px;
    margin: 0 0 20px;
  }
  .free {
    font-size: 12px;
    margin-top: 18px;
  }
  .success {
    border-left: 3px solid #6c826e;
    padding-left: 22px;
  }
  a:focus-visible,
  button:focus-visible {
    outline: 2px solid #143e35;
    outline-offset: 4px;
  }
  @media (max-width: 800px) {
    .registration-grid {
      grid-template-columns: 1fr;
      gap: 36px;
      max-width: 600px;
    }
    .registration {
      order: 1;
    }
    aside {
      order: 0;
    }
    .primary {
      width: 100%;
    }
  }
</style>
