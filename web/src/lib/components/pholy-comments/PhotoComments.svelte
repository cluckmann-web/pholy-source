<script lang="ts">
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { queryClient } from '#lib/queries/client.ts';
  import {
    createPhotoCommentMutation,
    deletePhotoCommentMutation,
    editPhotoCommentMutation,
    getPhotoCommentsQuery,
    likePhotoCommentMutation,
    photoCommentAvatarUrl,
    type PhotoComment,
    type PhotoCommentContext,
  } from '#lib/queries/pholy-comments.query.ts';
  import { Route } from '#lib/route.ts';
  import { Icon } from '@immich/ui';
  import { mdiThumbUp, mdiThumbUpOutline } from '@mdi/js';
  import { createInfiniteQuery, createMutation } from '@tanstack/svelte-query';
  import { tick } from 'svelte';
  import { locale, t } from 'svelte-i18n';

  let { assetId, context }: { assetId: string; context: PhotoCommentContext } = $props();
  const authenticated = $derived(authManager.authenticated && !authManager.isSharedLink);
  const thread = createInfiniteQuery(
    () => ({
      ...getPhotoCommentsQuery(assetId, context, authenticated ? authManager.user.id : ''),
      enabled: authenticated,
    }),
    () => queryClient,
  );
  const create = createMutation(createPhotoCommentMutation, () => queryClient);
  const edit = createMutation(editPhotoCommentMutation, () => queryClient);
  const remove = createMutation(deletePhotoCommentMutation, () => queryClient);
  const like = createMutation(likePhotoCommentMutation, () => queryClient);
  const comments = $derived(thread.data?.pages.flatMap((page) => page.comments) ?? []);
  const canComment = $derived(thread.data?.pages[0]?.canComment ?? false);
  const total = $derived(thread.data?.pages[0]?.total ?? 0);
  let mutating = $state(false);
  const pending = $derived(mutating || create.isPending || edit.isPending || remove.isPending || like.isPending);
  let message = $state('');
  let replyId = $state<string>();
  let replyMessage = $state('');
  let editingId = $state<string>();
  let editingMessage = $state('');
  let deleteId = $state<string>();
  let error = $state('');
  let replyInput = $state<HTMLTextAreaElement>();
  let editInput = $state<HTMLTextAreaElement>();
  const scopeHint = $derived(
    context.kind === 'private'
      ? $t('pholy_comments.scope_private')
      : context.kind === 'album'
        ? $t('pholy_comments.scope_album')
        : $t('pholy_comments.scope_community'),
  );
  const initials = (name: string) =>
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  const name = (comment: PhotoComment) => comment.author?.name || $t('pholy_comments.deleted_author');
  const time = (date: string) => {
    const seconds = (new Date(date).getTime() - Date.now()) / 1000;
    if (Math.abs(seconds) < 60) return $t('pholy_comments.just_now');
    const language = $locale === 'dev' ? 'en' : ($locale ?? 'en');
    const formatter = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
    if (Math.abs(seconds) < 3600) return formatter.format(Math.trunc(seconds / 60), 'minute');
    if (Math.abs(seconds) < 86_400) return formatter.format(Math.trunc(seconds / 3600), 'hour');
    if (Math.abs(seconds) < 604_800) return formatter.format(Math.trunc(seconds / 86_400), 'day');
    return new Date(date).toLocaleDateString(language);
  };
  const failure = (cause: unknown) => {
    error = cause instanceof Error ? cause.message : $t('pholy_comments.error');
  };
  const submit = async (parentId?: string) => {
    const body = (parentId ? replyMessage : message).trim();
    if (!body || pending || !canComment) return;
    error = '';
    mutating = true;
    try {
      await create.mutateAsync([assetId, context, body, parentId]);
      if (parentId) {
        replyId = undefined;
        replyMessage = '';
      } else message = '';
    } catch (error_) {
      failure(error_);
    } finally {
      mutating = false;
    }
  };
  const keydown = (event: KeyboardEvent, action: () => Promise<void>) => {
    if (event.key === 'Escape') return;
    event.stopPropagation();
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void action();
    }
  };
  const startReply = async (comment: PhotoComment) => {
    replyId = comment.parentId ?? comment.id;
    replyMessage = '';
    editingId = undefined;
    error = '';
    await tick();
    replyInput?.focus();
  };
  const startEdit = async (comment: PhotoComment) => {
    editingId = comment.id;
    editingMessage = comment.body;
    replyId = undefined;
    error = '';
    await tick();
    editInput?.focus();
  };
  const saveEdit = async () => {
    if (!editingId || !editingMessage.trim() || pending) return;
    error = '';
    mutating = true;
    try {
      await edit.mutateAsync([assetId, context, editingId, editingMessage.trim()]);
      editingId = undefined;
      editingMessage = '';
    } catch (error_) {
      failure(error_);
    } finally {
      mutating = false;
    }
  };
  const deleteComment = async () => {
    if (!deleteId || pending) return;
    error = '';
    mutating = true;
    try {
      await remove.mutateAsync([assetId, context, deleteId]);
      deleteId = undefined;
    } catch (error_) {
      failure(error_);
    } finally {
      mutating = false;
    }
  };
  const toggleLike = async (comment: PhotoComment) => {
    if (pending) return;
    error = '';
    mutating = true;
    try {
      await like.mutateAsync([assetId, context, comment.id, !comment.liked]);
    } catch (error_) {
      failure(error_);
    } finally {
      mutating = false;
    }
  };
</script>

{#snippet entry(comment: PhotoComment, isReply = false, allowReply = true)}
  <article
    class:reply={isReply}
    class="comment"
    data-comment-id={comment.id}
    aria-label={$t('pholy_comments.comment_by', { values: { name: name(comment) } })}
  >
    <div class="avatar" aria-hidden="true">
      <span>{comment.deleted ? '–' : initials(name(comment))}</span>
      {#if !comment.deleted && comment.author?.hasProfileImage}
        <img
          src={photoCommentAvatarUrl(assetId, context, comment.author.id)}
          alt=""
          loading="lazy"
          onerror={(event) => event.currentTarget.setAttribute('hidden', '')}
        />
      {/if}
    </div>
    <div class="comment-content">
      <div class="bubble" class:removed={comment.deleted}>
        {#if !comment.deleted}<strong>{name(comment)}</strong>{/if}
        {#if editingId === comment.id}
          <form
            onsubmit={(event) => {
              event.preventDefault();
              void saveEdit();
            }}
          >
            <label class="sr-only" for="edit-{comment.id}">{$t('pholy_comments.edit_label')}</label>
            <textarea
              id="edit-{comment.id}"
              bind:this={editInput}
              bind:value={editingMessage}
              maxlength="2000"
              rows="3"
              disabled={pending}
              onkeydown={(event) => keydown(event, saveEdit)}></textarea>
            <div class="form-actions">
              <button class="primary" type="submit" disabled={pending || !editingMessage.trim()}
                >{$t('pholy_comments.save')}</button
              ><button type="button" disabled={pending} onclick={() => (editingId = undefined)}
                >{$t('pholy_comments.cancel')}</button
              >
            </div>
          </form>
        {:else}<p>{comment.deleted ? $t('pholy_comments.deleted') : comment.body}</p>{/if}
      </div>
      <div class="comment-actions">
        <time datetime={comment.createdAt} title={new Date(comment.createdAt).toLocaleString()}
          >{time(comment.createdAt)}</time
        >
        {#if !comment.deleted && comment.updatedAt !== comment.createdAt}<span>{$t('pholy_comments.edited')}</span>{/if}
        {#if !comment.deleted}
          <button
            type="button"
            class:liked={comment.liked}
            aria-pressed={comment.liked}
            disabled={pending || !canComment}
            onclick={() => toggleLike(comment)}>{$t('pholy_comments.like')}</button
          >
          {#if canComment && allowReply}<button type="button" disabled={pending} onclick={() => startReply(comment)}
              >{$t('pholy_comments.reply')}</button
            >{/if}
          {#if comment.canEdit}<button type="button" disabled={pending} onclick={() => startEdit(comment)}
              >{$t('pholy_comments.edit')}</button
            >{/if}
          {#if comment.canDelete}<button type="button" disabled={pending} onclick={() => (deleteId = comment.id)}
              >{$t('pholy_comments.delete')}</button
            >{/if}
          {#if comment.likeCount > 0}<span
              class="like-count"
              aria-label={$t('pholy_comments.likes', { values: { count: comment.likeCount } })}
              ><Icon icon={comment.liked ? mdiThumbUp : mdiThumbUpOutline} size="13" />{comment.likeCount}</span
            >{/if}
        {/if}
      </div>
      {#if deleteId === comment.id}
        <div class="confirmation" role="alert">
          <p>{$t('pholy_comments.delete_confirm')}</p>
          <div class="form-actions">
            <button type="button" class="danger" disabled={pending} onclick={deleteComment}
              >{$t('pholy_comments.delete_action')}</button
            ><button type="button" disabled={pending} onclick={() => (deleteId = undefined)}
              >{$t('pholy_comments.cancel')}</button
            >
          </div>
        </div>
      {/if}
    </div>
  </article>
{/snippet}

<section class="photo-comments" aria-label={$t('pholy_comments.title')}>
  <header>
    <h2>{$t('pholy_comments.title')}</h2>
    {#if authenticated && thread.data}<span>{$t('pholy_comments.total', { values: { count: total } })}</span>{/if}
  </header>
  {#if !authenticated}
    <p class="notice">{$t('pholy_comments.login')}</p>
    <a
      class="login"
      href={Route.login({
        continue: String(
          Route.continue(
            context.kind === 'community' ? Route.communityProfile(context.profileSlug) : null,
            Route.photos(),
          ),
        ),
      })}>{$t('pholy_comments.sign_in')}</a
    >
  {:else}
    <p class="scope">{scopeHint}</p>
    {#if error}<p class="notice error" role="alert">{error}</p>{/if}
    {#if thread.isPending}<p class="notice" role="status">{$t('pholy_comments.loading')}</p>
    {:else if thread.isError}
      <p class="notice error" role="alert">{thread.error.message}</p>
      <button type="button" onclick={() => thread.refetch()}>{$t('pholy_comments.retry')}</button>
    {:else}
      {#if comments.length === 0}<p class="notice">{$t('pholy_comments.empty')}</p>{/if}
      <div class="threads">
        {#each comments as comment (comment.id)}
          <div class="thread">
            {@render entry(comment)}
            {#each comment.replies as reply (reply.id)}{@render entry(reply, true, !comment.deleted)}{/each}
            {#if replyId === comment.id}
              <form
                class="reply-composer"
                onsubmit={(event) => {
                  event.preventDefault();
                  void submit(comment.id);
                }}
              >
                <label for="reply-{comment.id}"
                  >{$t('pholy_comments.reply_to', { values: { name: name(comment) } })}</label
                >
                <textarea
                  id="reply-{comment.id}"
                  bind:this={replyInput}
                  bind:value={replyMessage}
                  placeholder={$t('pholy_comments.reply_write')}
                  maxlength="2000"
                  rows="2"
                  disabled={pending}
                  onkeydown={(event) => keydown(event, () => submit(comment.id))}></textarea>
                <div class="form-actions">
                  <button class="primary" type="submit" disabled={pending || !replyMessage.trim()}
                    >{$t('pholy_comments.send_reply')}</button
                  ><button type="button" disabled={pending} onclick={() => (replyId = undefined)}
                    >{$t('pholy_comments.cancel')}</button
                  >
                </div>
              </form>
            {/if}
          </div>
        {/each}
      </div>
      {#if thread.hasNextPage}<button
          class="more"
          type="button"
          disabled={thread.isFetchingNextPage}
          onclick={() => thread.fetchNextPage()}>{$t('pholy_comments.more')}</button
        >{/if}
      {#if canComment}
        <form
          class="composer"
          onsubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div class="compose-row">
            <span class="avatar" aria-hidden="true">{initials(authManager.user.name)}</span>
            <div class="compose-field">
              <label class="sr-only" for="comment-{assetId}">{$t('pholy_comments.write')}</label><textarea
                id="comment-{assetId}"
                bind:value={message}
                placeholder={$t('pholy_comments.write')}
                maxlength="2000"
                rows="2"
                disabled={pending}
                onkeydown={(event) => keydown(event, () => submit())}></textarea>
            </div>
          </div>
          <div class="composer-footer">
            <span>{$t('pholy_comments.keyboard')}</span><button
              class="primary"
              type="submit"
              disabled={pending || !message.trim()}>{$t('pholy_comments.send')}</button
            >
          </div>
        </form>
      {:else}<p class="notice">{$t('pholy_comments.disabled')}</p>{/if}
    {/if}
  {/if}
</section>

<style>
  .photo-comments {
    font-family: var(--font-sans);
    color: var(--color-dark, #172033);
    font-size: 14px;
    width: 100%;
    min-width: 0;
    padding: 20px;
    background: var(--color-light, #fff);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  h2 {
    font-family: inherit;
    font-size: 18px;
    font-weight: 700;
  }
  header > span,
  .scope,
  .notice {
    color: #64748b;
  }
  .scope {
    font-size: 12px;
    line-height: 1.5;
    margin: 0 0 20px;
  }
  .notice {
    padding: 12px 0;
    line-height: 1.5;
  }
  .error {
    color: #b42318;
    background: #fff1f0;
    padding: 12px;
  }
  .thread + .thread {
    margin-top: 18px;
  }
  .comment {
    display: flex;
    gap: 9px;
    min-width: 0;
  }
  .avatar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    flex-shrink: 0;
    overflow: hidden;
    border-radius: 50%;
    background: #e0e8f5;
    color: #2b4b78;
    font-size: 11px;
    font-weight: 700;
  }
  .avatar img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .comment-content {
    min-width: 0;
    flex: 1;
  }
  .bubble {
    background: #f0f2f5;
    padding: 9px 12px;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  .bubble strong {
    font-size: 13px;
    display: block;
    margin-bottom: 2px;
  }
  .bubble p {
    white-space: pre-wrap;
    margin: 0;
  }
  .bubble.removed {
    color: #738096;
    font-style: italic;
    background: transparent;
    border: 1px solid #e5e9ef;
  }
  .comment-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    padding: 4px 2px;
    font-size: 11px;
    color: #67758b;
  }
  .comment-actions button {
    padding: 0;
    font-size: 11px;
    font-weight: 650;
    color: #64748b;
  }
  .comment-actions button.liked,
  .like-count {
    color: #315fd5;
  }
  .like-count {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .reply {
    margin: 10px 0 0 32px;
  }
  .reply .avatar {
    height: 28px;
    width: 28px;
    font-size: 10px;
  }
  .reply-composer {
    margin: 12px 0 0 41px;
  }
  .reply-composer label {
    display: block;
    font-size: 12px;
    margin-bottom: 5px;
    color: #64748b;
  }
  .form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  .confirmation {
    background: #fff8ed;
    border: 1px solid #f0d7ad;
    padding: 12px;
    margin: 8px 0;
  }
  .confirmation p {
    font-size: 12px;
  }
  .composer {
    border-top: 1px solid #e7ebf0;
    margin-top: 20px;
    padding-top: 16px;
  }
  .compose-row {
    display: flex;
    gap: 10px;
  }
  .compose-field {
    min-width: 0;
    flex: 1;
  }
  .composer-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  .composer-footer span {
    font-size: 10px;
    color: #7b8797;
  }
  textarea {
    display: block;
    resize: vertical;
    width: 100%;
    min-width: 0;
    background: #f5f7fa;
    border: 1px solid #dce2ea;
    color: #172033;
    padding: 10px;
    line-height: 1.5;
    border-radius: 0;
    font: inherit;
    min-height: 68px;
  }
  button,
  .login {
    border: 0;
    background: transparent;
    padding: 7px 9px;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 0;
  }
  button.primary,
  .login {
    background: #315fd5;
    color: white;
  }
  button.danger {
    background: #b42318;
    color: white;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:not(:disabled):hover {
    text-decoration: underline;
  }
  button:focus-visible,
  a:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #315fd5;
    outline-offset: 2px;
  }
  .more {
    color: #315fd5;
    margin-top: 12px;
  }
  .login {
    display: inline-block;
    text-decoration: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  :global(.dark) .photo-comments {
    background: #171d28;
    color: #e4e8ef;
  }
  :global(.dark) .bubble {
    background: #252d3a;
  }
  :global(.dark) textarea {
    background: #202835;
    color: #e4e8ef;
    border-color: #394358;
  }
  :global(.dark) .scope,
  :global(.dark) .notice,
  :global(.dark) .comment-actions,
  :global(.dark) .comment-actions button {
    color: #a3b0c3;
  }
  :global(.dark) .comment-actions button.liked {
    color: #9db9ff;
  }
  :global(.dark) .confirmation {
    background: #30291d;
    border-color: #5e4d2f;
  }
  @media (max-width: 600px) {
    .photo-comments {
      padding: 16px;
    }
    .reply {
      margin-left: 20px;
    }
    .reply-composer {
      margin-left: 29px;
    }
    .composer-footer span {
      font-size: 9px;
    }
  }
</style>
