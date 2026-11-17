<script lang="ts">
  import { twMerge } from 'tailwind-merge';

  type Props = {
    variant?: 'icon' | 'inline';
    size?: 'tiny' | 'small' | 'medium' | 'large' | 'giant';
    class?: string;
  };

  const sizes = {
    tiny: 'h-5',
    small: 'h-8',
    medium: 'h-11',
    large: 'h-16',
    giant: 'h-24',
  } as const;

  let { variant = 'inline', size = 'medium', class: className }: Props = $props();
</script>

<span class={twMerge('inline-flex shrink-0 items-center', sizes[size], className)}>
  {#if variant === 'icon'}
    <img
      src="/pholy/logo-icon.svg"
      alt="PHOLY"
      width="40"
      height="46"
      class="h-full w-auto object-contain dark:brightness-0 dark:invert"
    />
  {:else}
    <img src="/pholy/logo.svg" alt="PHOLY" width="208" height="57" class="h-full w-auto object-contain dark:hidden" />
    <img
      src="/pholy/logo-white.svg"
      alt="PHOLY"
      width="208"
      height="57"
      class="hidden h-full w-auto object-contain dark:block"
    />
  {/if}
</span>
