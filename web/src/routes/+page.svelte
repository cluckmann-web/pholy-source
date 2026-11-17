<script lang="ts">
  import LandingPage from '#lib/components/pholy/LandingPage.svelte';
  import SetupWelcome from '#lib/components/pholy/SetupWelcome.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
</script>

{#if data.isInitialized}
  <LandingPage />
{:else}
  <SetupWelcome />
{/if}
