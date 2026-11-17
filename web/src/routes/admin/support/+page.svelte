<script lang="ts">
  import AdminPageLayout from '#lib/components/layouts/AdminPageLayout.svelte';
  import SupportWorkspace from '#lib/components/pholy-support/SupportWorkspace.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

<AdminPageLayout breadcrumbs={[{ title: data.meta.title }]}
  ><div class="support-page"><SupportWorkspace admin /></div></AdminPageLayout
>

<style>
  .support-page {
    max-width: 1300px;
    margin: 0 auto;
    padding: 30px 24px 60px;
  }
</style>
