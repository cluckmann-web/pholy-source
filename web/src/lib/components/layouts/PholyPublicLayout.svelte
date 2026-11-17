<script lang="ts">
  import LegalLinks from '#lib/components/pholy/LegalLinks.svelte';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-public.css';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  let {
    title,
    subtitle = '',
    eyebrow = '',
    children,
  }: { title: string; subtitle?: string; eyebrow?: string; children: Snippet } = $props();
</script>

<svelte:head>
  <link rel="preload" href="/pholy/landing/inter.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
  <meta name="referrer" content="no-referrer" />
</svelte:head>
<div class="public-shell light">
  <a class="skip" href="#inhalt">{$t('pholy_public.skip')}</a>
  <header>
    <div class="public-wrap header-inner">
      <a href={Route.home()} aria-label="PHOLY"><img src="/pholy/logo.svg" alt="PHOLY" width="142" height="44" /></a>
      <a class="back" href={Route.home()}>← {$t('pholy_login.back')}</a>
    </div>
  </header>
  <main id="inhalt" class="public-wrap" tabindex="-1">
    <div class="intro">
      <p class="eyebrow">{eyebrow || $t('pholy_public.eyebrow')}</p>
      <h1>{title}</h1>
      {#if subtitle}<p class="subtitle">{subtitle}</p>{/if}
    </div>
    {@render children()}
  </main>
  <footer class="public-wrap">
    <div>
      <p>© {new Date().getFullYear()} PHOLY</p>
      <LegalLinks />
    </div>
    <a href={Route.source()} data-sveltekit-reload>{$t('pholy_landing.source')} ↗</a>
  </footer>
</div>

<style>
  .public-shell {
    min-height: 100svh;
    background: #f7f7f2;
    color: #1f332b;
    font-family: 'PHOLY Inter', sans-serif;
    color-scheme: light;
    line-height: 1.65;
  }
  .public-wrap {
    width: calc(100% - 112px);
    max-width: 1328px;
    margin-inline: auto;
  }
  header {
    border-bottom: 1px solid #d8ded4;
  }
  .header-inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    min-height: 94px;
  }
  .header-inner img {
    width: 142px;
    height: auto;
  }
  a {
    color: inherit;
    text-underline-offset: 5px;
  }
  .back {
    font-size: 13px;
    text-decoration: none;
  }
  main {
    padding-block: 70px 100px;
  }
  .intro {
    margin-bottom: 48px;
    max-width: 840px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    font-weight: 600;
    margin: 0 0 24px;
  }
  h1 {
    font-size: clamp(38px, 4.3vw, 64px);
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1.12;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .subtitle {
    color: #637168;
    max-width: 650px;
    font-size: 17px;
    margin: 24px 0 0;
  }
  footer {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 24px;
    padding: 28px 0 36px;
    border-top: 1px solid #d8ded4;
    font-size: 12px;
  }
  footer p {
    margin: 0 0 12px;
    color: #637168;
  }
  .skip {
    position: absolute;
    top: -100px;
    padding: 10px;
    background: #143e35;
    color: white;
    z-index: 20;
  }
  .skip:focus {
    top: 8px;
    left: 8px;
  }
  a:focus-visible {
    outline: 2px solid #143e35;
    outline-offset: 5px;
  }
  @media (max-width: 700px) {
    .public-wrap {
      width: calc(100% - 40px);
    }
    .header-inner {
      min-height: 76px;
      gap: 12px;
    }
    .header-inner img {
      width: 112px;
    }
    .back {
      font-size: 11px;
    }
    main {
      padding-block: 44px 64px;
    }
    .intro {
      margin-bottom: 32px;
    }
    .subtitle {
      font-size: 15px;
    }
    footer {
      align-items: flex-start;
      flex-direction: column;
    }
    h1 {
      font-size: 38px;
    }
  }
  @media print {
    header,
    footer,
    .skip {
      display: none;
    }
    main {
      padding: 0;
    }
    .public-wrap {
      width: 100%;
      max-width: none;
    }
    .public-shell {
      background: white;
      color: black;
    }
    h1 {
      font-size: 28pt;
    }
  }
</style>
