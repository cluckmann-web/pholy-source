<script lang="ts">
  import { Route } from '#lib/route.ts';
  import { t } from 'svelte-i18n';
</script>

<nav aria-label={$t('pholy_public.legal_navigation')} class="pholy-legal-links">
  <a href={Route.contact()}>{$t('pholy_public.contact')}</a>
  <a href={Route.imprint()}>{$t('pholy_public.imprint')}</a>
  <a href={Route.privacy()}>{$t('pholy_public.privacy')}</a>
  <a href={Route.terms()}>{$t('pholy_public.terms')}</a>
</nav>

<style>
  .pholy-legal-links {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 24px;
    font-size: 13px;
    line-height: 1.6;
  }
  a {
    color: inherit;
    text-decoration: none;
    text-underline-offset: 5px;
  }
  a:hover {
    text-decoration: underline;
  }
  a:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 5px;
  }
</style>
