<script lang="ts">
  import AdminPageLayout from '#lib/components/layouts/AdminPageLayout.svelte';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getPholyAuthStatusQuery } from '#lib/queries/pholy-auth.query.ts';
  import {
    createPholyInvitationMutation,
    getPholyInvitationsQuery,
    revokePholyInvitationMutation,
    sendPholyInvitationMutation,
    type PholyInvitation,
  } from '#lib/queries/pholy-invitation.query.ts';
  import { createMutation } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const query = createPreloadedQuery(getPholyInvitationsQuery);
  const availability = createPreloadedQuery(getPholyAuthStatusQuery);
  const send = createMutation(sendPholyInvitationMutation);
  let sendEmail = $state(false);
  const create = createMutation(createPholyInvitationMutation);
  const revoke = createMutation(revokePholyInvitationMutation);
  let email = $state('');
  let quota = $state<number | undefined>(100);
  let url = $state('');
  let error = $state('');
  let copied = $state(false);
  let mailResult = $state('');
  const mailLabels = {
    not_sent: 'pholy_invitation.mail_not_sent',
    sending: 'pholy_invitation.mail_sending',
    accepted: 'pholy_invitation.mail_accepted',
    failed: 'pholy_invitation.mail_failed',
    disabled: 'pholy_invitation.mail_disabled',
  } as const;
  const mailLabel = (status = 'not_sent') => $t(mailLabels[status as keyof typeof mailLabels] ?? mailLabels.not_sent);
  const status = (i: PholyInvitation) =>
    i.usedAt ? 'used' : i.revokedAt ? 'revoked' : Date.parse(i.expiresAt) <= Date.now() ? 'expired' : 'open';
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    error = '';
    url = '';
    copied = false;
    mailResult = '';
    try {
      const result = await create.mutateAsync([{ email, quotaGiB: quota ?? null, sendEmail }]);
      url = result.url;
      mailResult = mailLabel(result.mailStatus);
      email = '';
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_invitation.failed');
    }
  };
  const statusLabels = {
    open: 'pholy_invitation.status_open',
    used: 'pholy_invitation.status_used',
    revoked: 'pholy_invitation.status_revoked',
    expired: 'pholy_invitation.status_expired',
  } as const;
  const withdraw = async (id: string) => {
    error = '';
    try {
      await revoke.mutateAsync([id]);
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_invitation.failed');
    }
  };
  const sendInvitation = async (id: string) => {
    error = '';
    url = '';
    copied = false;
    mailResult = '';
    try {
      const result = await send.mutateAsync([id]);
      url = result.url;
      mailResult = mailLabel(result.mailStatus);
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_invitation.failed');
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
    } catch {
      error = $t('pholy_invitation.copy_manually');
    }
  };
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}>
  <div class="invitations">
    <p class="lead">{$t('pholy_invitation.admin_description')}</p>
    {#if !availability.data.mailEnabled}<p class="mail-notice" role="status">
        {$t('pholy_invitation.mail_unavailable')}
      </p>{/if}
    <form onsubmit={submit} class="create-form">
      <div>
        <label for="invitation-email">{$t('email')}</label><input
          id="invitation-email"
          type="email"
          required
          bind:value={email}
          placeholder="name@example.com"
          autocomplete="off"
        />
      </div>
      <div>
        <label for="invitation-quota">{$t('pholy_invitation.quota')}</label><input
          id="invitation-quota"
          type="number"
          min="1"
          max="10000"
          step="1"
          bind:value={quota}
        />
        <p>{$t('pholy_invitation.quota_help')}</p>
      </div>
      <div class="submit-controls">
        {#if availability.data.mailEnabled}<label class="checkbox"
            ><input type="checkbox" bind:checked={sendEmail} />{$t('pholy_invitation.send_email')}</label
          >{/if}
        <button type="submit" disabled={create.isPending || send.isPending}
          >{sendEmail ? $t('pholy_invitation.create_and_send') : $t('pholy_invitation.create_link')}</button
        >
      </div>
    </form>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if url}
      <section class="link-result" aria-label={$t('pholy_invitation.created')}>
        <h2>{$t('pholy_invitation.created')}</h2>
        <p role="status">{mailResult}</p>
        <p>{$t('pholy_invitation.link_help')}</p>
        <label for="invitation-link" class="sr-only">{$t('pholy_invitation.link')}</label><input
          id="invitation-link"
          value={url}
          readonly
          onclick={(event) => event.currentTarget.select()}
        />
        <button type="button" onclick={copy}
          >{copied ? $t('pholy_invitation.copied') : $t('pholy_invitation.copy_link')}</button
        >
        <span role="status">{copied ? $t('pholy_invitation.copied') : ''}</span>
      </section>
    {/if}
    <h2 class="list-title">{$t('pholy_invitation.list_title')}</h2>
    <p class="mail-help">{$t('pholy_invitation.resend_help')} {$t('pholy_invitation.mail_status_help')}</p>
    {#if query.data.length === 0}<p>{$t('pholy_invitation.empty')}</p>{/if}
    <ul>
      {#each query.data as invitation (invitation.id)}
        <li>
          <div class="identity">
            <strong>{invitation.email}</strong><span
              >{$t('pholy_invitation.expires')} {new Date(invitation.expiresAt).toLocaleDateString()}</span
            >
          </div>
          <span class="mail-status"
            >{mailLabel(invitation.mailStatus)}{#if invitation.mailAcceptedAt}<br />{new Date(
                invitation.mailAcceptedAt,
              ).toLocaleString()}{/if}</span
          >
          {#if !invitation.usedAt && !invitation.revokedAt && availability.data.mailEnabled}<button
              class="secondary"
              type="button"
              disabled={send.isPending || create.isPending || revoke.isPending}
              onclick={() => sendInvitation(invitation.id)}
              >{invitation.mailStatus === 'accepted'
                ? $t('pholy_invitation.resend')
                : $t('pholy_invitation.send')}</button
            >{/if}
          <span class="status" class:open={status(invitation) === 'open'}>{$t(statusLabels[status(invitation)])}</span>
          {#if status(invitation) === 'open'}<button
              class="secondary"
              type="button"
              disabled={revoke.isPending || send.isPending || create.isPending}
              onclick={() => withdraw(invitation.id)}>{$t('pholy_invitation.revoke')}</button
            >{/if}
        </li>
      {/each}
    </ul>
  </div>
</AdminPageLayout>

<style>
  .invitations {
    max-width: 1200px;
    margin: 24px auto;
    padding: 0 24px 60px;
  }
  .lead {
    max-width: 760px;
    line-height: 1.7;
    margin-bottom: 28px;
  }
  .create-form {
    display: grid;
    grid-template-columns: 2fr 1fr auto;
    gap: 20px;
    align-items: start;
    padding: 24px;
    background: #f1f3ee;
    border: 1px solid #d9dfd4;
    color: #1f332b;
  }
  label {
    display: block;
    font-size: 13px;
    margin-bottom: 8px;
  }
  input {
    width: 100%;
    min-width: 0;
    padding: 12px;
    border: 1px solid #b7c5b1;
    background: white;
    color: #1f332b;
    font-size: 16px;
    border-radius: 0;
  }
  button {
    padding: 13px 18px;
    background: #143e35;
    color: white;
    font-size: 13px;
    border: 0;
    cursor: pointer;
  }
  .create-form button {
    margin-top: 28px;
  }
  button:disabled {
    opacity: 0.5;
  }
  form p {
    font-size: 11px;
    margin-top: 8px;
  }
  .link-result {
    margin: 24px 0;
    padding: 24px;
    background: #edf1e9;
    color: #1f332b;
    border: 1px solid #b7c5b1;
  }
  .link-result h2,
  .list-title {
    font-size: 20px;
    font-weight: 550;
  }
  .link-result p {
    font-size: 13px;
    margin: 10px 0 16px;
  }
  .link-result button {
    margin-top: 12px;
  }
  .link-result span {
    font-size: 12px;
    margin-left: 12px;
  }
  .list-title {
    margin: 36px 0 16px;
  }
  ul {
    list-style: none;
    padding: 0;
  }
  li {
    display: flex;
    gap: 20px;
    align-items: center;
    flex-wrap: wrap;
    padding: 20px 0;
    border-bottom: 1px solid #d9dfd4;
  }
  .identity {
    flex: 1;
    min-width: 180px;
    overflow-wrap: anywhere;
  }
  .identity strong {
    font-size: 14px;
    display: block;
  }
  .identity span {
    font-size: 12px;
    opacity: 0.7;
  }
  .status {
    font-size: 12px;
    padding: 5px 10px;
    background: #eef0ea;
    color: #52675b;
  }
  .status.open {
    background: #dfeadd;
    color: #143e35;
  }
  .secondary {
    background: none;
    border: 1px solid #b7c5b1;
    color: inherit;
  }
  .checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
  }
  .checkbox input {
    width: 16px;
    height: 16px;
  }
  .submit-controls {
    min-width: 190px;
  }
  .submit-controls button {
    margin-top: 12px;
  }
  .mail-notice {
    padding: 16px;
    margin-bottom: 16px;
    border: 1px solid #b7c5b1;
  }
  .mail-help,
  .mail-status {
    font-size: 12px;
    line-height: 1.6;
    margin-bottom: 10px;
  }
  .error {
    color: #b12a21;
    margin-top: 16px;
  }
  input:focus-visible,
  button:focus-visible {
    outline: 2px solid #6c826e;
    outline-offset: 3px;
  }
  @media (max-width: 800px) {
    .create-form {
      grid-template-columns: 1fr;
    }
    .create-form button {
      margin: 0;
    }
    .invitations {
      padding-inline: 12px;
    }
    li {
      gap: 12px;
    }
  }
</style>
