<script lang="ts">
  import UserPageLayout from '#lib/components/layouts/UserPageLayout.svelte';
  import SupportWorkspace from '#lib/components/pholy-support/SupportWorkspace.svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let search = $state('');
  const topics = [
    { title: 'pholy_support.help_upload_title', body: 'pholy_support.help_upload_body' },
    { title: 'pholy_support.help_resume_title', body: 'pholy_support.help_resume_body' },
    { title: 'pholy_support.help_app_title', body: 'pholy_support.help_app_body' },
    { title: 'pholy_support.help_invites_title', body: 'pholy_support.help_invites_body' },
    { title: 'pholy_support.help_storage_title', body: 'pholy_support.help_storage_body' },
    { title: 'pholy_support.help_privacy_title', body: 'pholy_support.help_privacy_body' },
    { title: 'pholy_support.help_processing_title', body: 'pholy_support.help_processing_body' },
    { title: 'pholy_support.help_account_title', body: 'pholy_support.help_account_body' },
  ] as const;
  const visible = $derived(
    topics.filter((topic) =>
      `${$t(topic.title)} ${$t(topic.body)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
    ),
  );
</script>

<UserPageLayout title={data.meta.title} description={$t('pholy_support.help_intro')}>
  <div class="help">
    <section class="guide" aria-label={$t('pholy_support.help_topics')}>
      <div class="guide-heading">
        <div>
          <span class="eyebrow">PHOLY</span>
          <h2>{$t('pholy_support.help_topics')}</h2>
        </div>
        <div class="search">
          <label for="help-search">{$t('pholy_support.search')}</label><input
            id="help-search"
            type="search"
            bind:value={search}
            placeholder={$t('pholy_support.search_placeholder')}
          />
        </div>
      </div>
      <div class="topics">
        {#each visible as topic (topic.title)}<details>
            <summary>{$t(topic.title)}</summary>
            <p>{$t(topic.body)}</p>
          </details>{/each}
      </div>
      {#if visible.length === 0}<p class="empty" role="status">{$t('pholy_support.no_results')}</p>{/if}
    </section>
    <SupportWorkspace />
  </div>
</UserPageLayout>

<style>
  .help {
    max-width: 1200px;
    margin: 0 auto;
    padding: 30px 26px 70px;
  }
  .guide {
    margin-bottom: 48px;
  }
  .guide-heading {
    display: flex;
    gap: 24px;
    justify-content: space-between;
    align-items: end;
    flex-wrap: wrap;
    margin-bottom: 22px;
  }
  h2 {
    font-size: 28px;
    letter-spacing: -0.04em;
    font-weight: 550;
  }
  .eyebrow {
    display: block;
    color: var(--immich-ui-muted);
    letter-spacing: 0.16em;
    font-size: 10px;
    margin-bottom: 10px;
  }
  .search {
    width: 340px;
    max-width: 100%;
  }
  label {
    display: block;
    font-size: 12px;
    margin-bottom: 8px;
  }
  input {
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
    color: inherit;
    border-radius: 0;
    padding: 12px 14px;
    width: 100%;
    font-size: 14px;
  }
  .topics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: start;
  }
  details {
    border: 1px solid var(--immich-ui-default-border);
    background: var(--immich-ui-light);
  }
  summary {
    padding: 20px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 550;
  }
  details p {
    font-size: 14px;
    line-height: 1.85;
    padding: 0 20px 22px;
    white-space: pre-line;
    color: var(--immich-ui-muted);
  }
  .empty {
    font-size: 14px;
    padding: 20px 0;
  }
  @media (max-width: 700px) {
    .help {
      padding: 22px 16px 50px;
    }
    .topics {
      grid-template-columns: 1fr;
    }
    .search {
      width: 100%;
    }
  }
</style>
