<script lang="ts">
  import {
    createPholySupportMutation,
    getPholySupportQuery,
    getPholySupportThreadQuery,
    replyPholySupportMutation,
    updatePholySupportMutation,
    type SupportCategory,
    type SupportStatus,
  } from '#lib/queries/pholy-support.query.ts';
  import { createMutation, createQuery } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';

  let { admin = false }: { admin?: boolean } = $props();
  let selectedId = $state('');
  let offset = $state(0);
  let filter = $state<SupportStatus | ''>('');
  let composing = $state(false);
  let category = $state<SupportCategory>('upload');
  let subject = $state('');
  let message = $state('');
  let reply = $state('');
  let error = $state('');
  let notice = $state('');
  const tickets = createQuery(() => getPholySupportQuery(admin, offset, filter || undefined));
  const thread = createQuery(() => getPholySupportThreadQuery(selectedId, admin));
  const create = createMutation(createPholySupportMutation);
  const send = createMutation(replyPholySupportMutation);
  const update = createMutation(updatePholySupportMutation);
  const categories = ['upload', 'account', 'storage', 'app', 'privacy', 'other'] as const;
  const categoryKeys = {
    upload: 'pholy_support.category_upload',
    account: 'pholy_support.category_account',
    storage: 'pholy_support.category_storage',
    app: 'pholy_support.category_app',
    privacy: 'pholy_support.category_privacy',
    other: 'pholy_support.category_other',
  } as const;
  const statusKeys = {
    open: 'pholy_support.status_open',
    waiting: 'pholy_support.status_waiting',
    resolved: 'pholy_support.status_resolved',
  } as const;
  const date = (value: string) => new Date(value).toLocaleString();
  const select = (id: string) => {
    selectedId = id;
    composing = false;
    error = '';
    notice = '';
    reply = '';
  };
  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    error = '';
    notice = '';
    try {
      const result = await create.mutateAsync([{ category, subject, message }]);
      select(result.id);
      subject = '';
      message = '';
      offset = 0;
      filter = '';
      notice = $t('pholy_support.created');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_support.failed');
    }
  };
  const submitReply = async (event: SubmitEvent) => {
    event.preventDefault();
    if (send.isPending) return;
    error = '';
    notice = '';
    try {
      await send.mutateAsync([selectedId, reply, admin]);
      reply = '';
      notice = $t('pholy_support.sent');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_support.failed');
    }
  };
  const setStatus = async (status: SupportStatus) => {
    error = '';
    notice = '';
    try {
      await update.mutateAsync([selectedId, status]);
      notice = $t('pholy_support.updated');
    } catch (error_) {
      error = error_ instanceof Error ? error_.message : $t('pholy_support.failed');
    }
  };
</script>

<section class="support" aria-label={$t(admin ? 'pholy_support.admin_title' : 'pholy_support.requests')}>
  <div class="section-heading">
    <div>
      <h2>{$t(admin ? 'pholy_support.admin_title' : 'pholy_support.requests')}</h2>
      <p>{$t('pholy_support.in_app')}</p>
      <p>{$t('pholy_support.retention')}</p>
    </div>
    {#if !admin}<button
        type="button"
        onclick={() => {
          composing = true;
          selectedId = '';
          error = '';
          notice = '';
        }}>{$t('pholy_support.new_request')}</button
      >{/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if notice}<p class="notice" role="status">{notice}</p>{/if}
  <div class="workspace">
    <aside class="ticket-list" aria-label={$t('pholy_support.requests')}>
      <label for="support-filter">{$t('pholy_support.filter')}</label>
      <select id="support-filter" bind:value={filter} onchange={() => (offset = 0)}>
        <option value="">{$t('pholy_support.all_statuses')}</option>
        {#each ['open', 'waiting', 'resolved'] as status (status)}<option value={status}
            >{$t(statusKeys[status as SupportStatus])}</option
          >{/each}
      </select>
      {#if tickets.isPending}<p class="muted">{$t('pholy_support.loading')}</p>
      {:else if tickets.isError}<p class="error" role="alert">{$t('pholy_support.failed')}</p>
        <button type="button" class="secondary" onclick={() => tickets.refetch()}>{$t('pholy_support.retry')}</button>
      {:else if tickets.data?.items.length === 0}<p class="muted">{$t('pholy_support.empty')}</p>{/if}
      <ul>
        {#each tickets.data?.items ?? [] as ticket (ticket.id)}
          <li>
            <button
              type="button"
              class="ticket"
              class:selected={selectedId === ticket.id}
              aria-pressed={selectedId === ticket.id}
              onclick={() => select(ticket.id)}
            >
              <span class="ticket-subject">{ticket.subject}</span>
              {#if admin}<span class="muted">{ticket.userName} · {ticket.userEmail}</span>{/if}
              <span class="ticket-meta"
                ><span class="status" class:resolved={ticket.status === 'resolved'}
                  >{$t(statusKeys[ticket.status])}</span
                ><time datetime={ticket.updatedAt}>{new Date(ticket.updatedAt).toLocaleDateString()}</time></span
              >
            </button>
          </li>
        {/each}
      </ul>
      {#if offset > 0 || tickets.data?.hasMore}<div class="pagination">
          <button
            class="secondary"
            type="button"
            disabled={offset === 0}
            onclick={() => (offset = Math.max(0, offset - 50))}>{$t('pholy_support.previous')}</button
          >
          <button class="secondary" type="button" disabled={!tickets.data?.hasMore} onclick={() => (offset += 50)}
            >{$t('pholy_support.next')}</button
          >
        </div>{/if}
    </aside>
    <div class="detail">
      {#if composing && !admin}
        <h3>{$t('pholy_support.new_request')}</h3>
        <p class="muted">{$t('pholy_support.privacy_hint')}</p>
        <form onsubmit={submit}>
          <label for="support-category">{$t('pholy_support.category')}</label>
          <select id="support-category" bind:value={category}
            >{#each categories as item (item)}<option value={item}>{$t(categoryKeys[item])}</option>{/each}</select
          >
          <label for="support-subject">{$t('pholy_support.subject')}</label><input
            id="support-subject"
            bind:value={subject}
            required
            minlength="3"
            maxlength="160"
          />
          <label for="support-message">{$t('pholy_support.message')}</label><textarea
            id="support-message"
            bind:value={message}
            required
            minlength="3"
            maxlength="8000"
            rows="7"></textarea>
          <p class="muted">{$t('pholy_support.describe_hint')}</p>
          <div class="actions">
            <button type="submit" disabled={create.isPending}>{$t('pholy_support.submit')}</button><button
              type="button"
              class="secondary"
              onclick={() => (composing = false)}>{$t('pholy_support.cancel')}</button
            >
          </div>
        </form>
      {:else if selectedId}
        {#if thread.isPending}<p class="muted">{$t('pholy_support.loading')}</p>
        {:else if thread.isError}<p class="error" role="alert">{$t('pholy_support.failed')}</p>
          <button type="button" class="secondary" onclick={() => thread.refetch()}>{$t('pholy_support.retry')}</button>
        {:else if thread.data}
          <div class="thread-heading">
            <div>
              <span class="eyebrow">{$t(categoryKeys[thread.data.category])}</span>
              <h3>{thread.data.subject}</h3>
              <p class="muted">{$t(statusKeys[thread.data.status])} · {date(thread.data.createdAt)}</p>
            </div>
            {#if admin}<button
                type="button"
                class="secondary"
                disabled={update.isPending}
                onclick={() => setStatus(thread.data?.status === 'resolved' ? 'open' : 'resolved')}
                >{$t(thread.data.status === 'resolved' ? 'pholy_support.reopen' : 'pholy_support.resolve')}</button
              >{/if}
          </div>
          {#if admin}<p class="muted">{thread.data.userName} · {thread.data.userEmail}</p>{/if}
          <ol class="messages">
            {#each thread.data.messages as item (item.id)}<li class:staff={item.isStaff}>
                <div class="message-meta">
                  <strong>{$t(item.isStaff ? 'pholy_support.staff' : 'pholy_support.member')}</strong><time
                    datetime={item.createdAt}>{date(item.createdAt)}</time
                  >
                </div>
                <p>{item.message}</p>
              </li>{/each}
          </ol>
          {#if thread.data.messages.length < 200}
            <form onsubmit={submitReply}>
              <label for="support-reply">{$t('pholy_support.reply')}</label><textarea
                id="support-reply"
                bind:value={reply}
                required
                minlength="3"
                maxlength="8000"
                rows="4"></textarea>
              {#if thread.data.status === 'resolved'}<p class="muted">{$t('pholy_support.reopen_hint')}</p>{/if}
              <button type="submit" disabled={send.isPending}>{$t('pholy_support.send_reply')}</button>
            </form>
          {:else}<p class="muted">{$t('pholy_support.thread_full')}</p>{/if}
        {/if}
      {:else}<div class="placeholder">
          <h3>{$t('pholy_support.select_title')}</h3>
          <p>{$t(admin ? 'pholy_support.admin_select' : 'pholy_support.select_hint')}</p>
        </div>{/if}
    </div>
  </div>
</section>

<style>
  .support {
    --support-accent: #174f40;
    color: var(--immich-ui-dark);
  }
  .section-heading,
  .thread-heading {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 20px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  h2 {
    font-size: 23px;
    font-weight: 600;
    letter-spacing: -0.035em;
  }
  h3 {
    font-size: 20px;
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  .section-heading p,
  .muted {
    font-size: 13px;
    color: var(--immich-ui-muted);
    line-height: 1.65;
    margin-top: 8px;
  }
  .workspace {
    display: grid;
    grid-template-columns: minmax(230px, 0.8fr) minmax(0, 1.8fr);
    border: 1px solid var(--immich-ui-default-border);
  }
  .ticket-list {
    padding: 20px;
    background: var(--immich-ui-light);
    border-right: 1px solid var(--immich-ui-default-border);
    min-width: 0;
  }
  .detail {
    min-width: 0;
    padding: 28px;
  }
  .ticket-list ul {
    margin-top: 18px;
  }
  .ticket-list li + li {
    border-top: 1px solid var(--immich-ui-default-border);
  }
  button {
    background: var(--support-accent);
    color: #fff;
    padding: 11px 16px;
    border: 1px solid transparent;
    border-radius: 0;
    font-size: 13px;
    cursor: pointer;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #779d8d;
    outline-offset: 3px;
  }
  .secondary {
    background: transparent;
    color: inherit;
    border-color: var(--immich-ui-default-border);
  }
  .ticket {
    padding: 16px 12px;
    width: 100%;
    background: transparent;
    color: inherit;
    display: grid;
    text-align: left;
    gap: 9px;
    border-left: 3px solid transparent;
  }
  .ticket.selected {
    background: var(--immich-ui-gray);
    border-left-color: #5c977e;
  }
  .ticket-subject {
    font-weight: 550;
    overflow-wrap: anywhere;
  }
  .ticket .muted {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .ticket-meta {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
  }
  .status {
    color: var(--support-accent);
    background: #e4efe6;
    padding: 3px 7px;
  }
  .status.resolved {
    color: #565c57;
    background: #e9eae7;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 550;
    margin: 18px 0 8px;
  }
  .ticket-list label {
    margin-top: 0;
  }
  input,
  select,
  textarea {
    width: 100%;
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    color: inherit;
    border-radius: 0;
    padding: 11px 12px;
    font: inherit;
    font-size: 14px;
  }
  textarea {
    resize: vertical;
    min-height: 90px;
  }
  form button {
    margin-top: 18px;
  }
  .actions,
  .pagination {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .pagination {
    margin-top: 18px;
  }
  .error,
  .notice {
    padding: 14px 18px;
    margin-bottom: 20px;
    border-left: 3px solid #aa3c34;
    background: #fff0ed;
    color: #83342d;
    font-size: 14px;
  }
  .notice {
    border-color: #508563;
    color: #275437;
    background: #edf5eb;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--immich-ui-muted);
  }
  .messages {
    display: grid;
    gap: 12px;
    margin: 24px 0;
  }
  .messages li {
    padding: 18px;
    background: var(--immich-ui-light);
    border: 1px solid var(--immich-ui-default-border);
  }
  .messages li.staff {
    border-left: 3px solid #69947d;
  }
  .message-meta {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px;
    font-size: 12px;
  }
  .message-meta time {
    color: var(--immich-ui-muted);
  }
  .messages p {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 14px;
    line-height: 1.75;
    margin-top: 12px;
  }
  .placeholder {
    max-width: 400px;
    margin: 60px auto;
    text-align: center;
  }
  .placeholder p {
    font-size: 14px;
    line-height: 1.7;
    margin-top: 14px;
    color: var(--immich-ui-muted);
  }
  @media (max-width: 850px) {
    .workspace {
      grid-template-columns: 1fr;
    }
    .ticket-list {
      border-right: 0;
      border-bottom: 1px solid var(--immich-ui-default-border);
    }
    .ticket-list ul {
      max-height: 300px;
      overflow: auto;
    }
    .detail {
      padding: 20px;
    }
  }
</style>
