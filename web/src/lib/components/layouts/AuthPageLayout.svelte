<script lang="ts">
  import PholyLogo from '#lib/components/PholyLogo.svelte';
  import { getPholyCopy } from '#lib/pholy-branding.ts';
  import { Route } from '#lib/route.ts';
  import { lang } from '#lib/stores/preferences.store.ts';
  import { Card, CardBody, CardHeader, Heading, VStack } from '@immich/ui';
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    children?: Snippet;
    withHeader?: boolean;
    withBackdrop?: boolean;
  }

  let { title, children, withHeader = true, withBackdrop = true }: Props = $props();
  const copy = $derived(getPholyCopy($lang));
</script>

<section
  class="pholy-auth-shell relative isolate flex min-h-dvh w-full items-center justify-center px-4 py-10"
  class:pholy-auth-backdrop={withBackdrop}
>
  <div class="w-full max-w-md">
    <Card color="secondary" class="pholy-auth-card w-full rounded-3xl border">
      {#if withHeader}
        <CardHeader class="pt-8">
          <VStack>
            <PholyLogo variant="inline" size="large" class="mx-auto" />
            <p class="mt-2 text-center text-sm text-muted">{copy.tagline}</p>
            <Heading size="large" class="mt-6 font-semibold" color="primary" tag="h1">{title}</Heading>
          </VStack>
        </CardHeader>
      {/if}

      <CardBody class="px-6 pt-4 pb-8 sm:px-8">
        {@render children?.()}
      </CardBody>
    </Card>

    <p class="mt-6 text-center text-xs text-muted">
      PHOLY
      <span aria-hidden="true" class="mx-2">·</span>
      <a href={Route.source()} data-sveltekit-reload class="underline-offset-4 hover:underline">{copy.source}</a>
    </p>
  </div>
</section>
