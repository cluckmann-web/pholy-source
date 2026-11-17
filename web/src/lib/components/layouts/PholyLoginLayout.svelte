<script lang="ts">
  import LegalLinks from '#lib/components/pholy/LegalLinks.svelte';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-public.css';
  import type { Snippet } from 'svelte';
  import { t } from 'svelte-i18n';

  let { children, title, intro }: { children: Snippet; title?: string; intro?: string } = $props();
</script>

<svelte:head>
  <meta name="robots" content="noindex, follow" />
  <link rel="preload" href="/pholy/landing/inter.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<div class="pholy-login-shell light">
  <a class="skip-link" href="#anmeldung">{$t('pholy_login.skip')}</a>
  <header class="header">
    <div class="wrap header-inner">
      <a class="brand" href={Route.home()} aria-label="PHOLY">
        <img src="/pholy/logo.svg" alt="PHOLY" width="142" height="44" />
      </a>
      <a class="back-link" href={Route.home()}><span aria-hidden="true">←</span> {$t('pholy_login.back')}</a>
    </div>
  </header>

  <main id="anmeldung" class="wrap login-main" tabindex="-1">
    <figure class="photo-panel">
      <img
        src="/pholy/landing/lake.webp"
        srcset="/pholy/landing/lake-small.webp 800w, /pholy/landing/lake.webp 1600w"
        sizes="(max-width: 800px) 0px, 46vw"
        alt={$t('pholy_landing.lake_alt')}
        width="1600"
        height="1067"
        loading="lazy"
      />
      <figcaption>
        <p class="photo-eyebrow">PHOLY / {$t('pholy_landing.eyebrow')}</p>
        <p class="photo-title">{$t('pholy_landing.mobile_title')}<br /><em>{$t('pholy_landing.mobile_em')}</em></p>
      </figcaption>
    </figure>
    <section class="form-column" aria-labelledby="login-title">
      <div class="form-inner">
        <p class="eyebrow"><span aria-hidden="true"></span>{$t('pholy_login.eyebrow')}</p>
        <h1 id="login-title">
          {#if title}{title}{:else}{$t('pholy_login.welcome')}<br /><em>{$t('pholy_login.welcome_em')}</em>{/if}
        </h1>
        <p class="intro">{intro ?? $t('pholy_login.intro')}</p>
        <div class="login-controls">{@render children()}</div>
        <p class="account-note">{$t('pholy_login.account_note')}</p>
      </div>
    </section>
  </main>

  <footer class="wrap footer">
    <div>
      <p>{$t('pholy_landing.footer_tagline')}</p>
      <LegalLinks />
    </div>
    <a href={Route.source()} data-sveltekit-reload>{$t('pholy_landing.source')} <span aria-hidden="true">↗</span></a>
  </footer>
</div>

<style>
  .pholy-login-shell {
    --immich-ui-primary-500: #143e35;
    --immich-ui-primary-600: #143e35;
    --immich-ui-primary-50: #edf1e9;
    --immich-ui-primary-100: #dce6dc;
    --immich-ui-dark: #1f332b;
    --immich-ui-light: #ffffff;
    --immich-ui-muted: #637168;
    --immich-ui-gray: #edf0e8;
    color-scheme: light;
    background: #f7f7f2;
    color: #1f332b;
    font-family: 'PHOLY Inter', sans-serif;
    line-height: 1.6;
    min-height: 100svh;
    display: flex;
    flex-direction: column;
  }
  .pholy-login-shell :global(*) {
    box-sizing: border-box;
  }
  .pholy-login-shell :global(a:focus-visible),
  .pholy-login-shell :global(button:focus-visible) {
    outline: 3px solid #b5843d;
    outline-offset: 5px;
  }
  .pholy-login-shell :global(img) {
    display: block;
    max-width: 100%;
  }
  .wrap {
    width: min(1440px, calc(100% - 112px));
    margin-inline: auto;
  }
  .skip-link {
    position: fixed;
    top: -80px;
    left: 20px;
    background: white;
    color: #143e35;
    padding: 12px 20px;
    z-index: 40;
  }
  .skip-link:focus {
    top: 12px;
  }
  .header {
    border-bottom: 1px solid #243e2814;
  }
  .header-inner {
    min-height: 94px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }
  .brand img {
    width: 142px;
    height: auto;
  }
  .back-link {
    display: inline-flex;
    align-items: center;
    gap: 14px;
    padding-block: 10px;
    font-size: 13px;
    text-decoration: none;
  }
  .back-link:hover,
  .footer a:hover {
    text-decoration: underline;
    text-underline-offset: 5px;
  }
  .back-link span {
    font-size: 20px;
    line-height: 1;
  }
  .login-main {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: clamp(40px, 6vw, 100px);
    align-items: center;
    padding-block: 46px;
    flex: 1;
  }
  .photo-panel {
    position: relative;
    margin: 0;
    min-height: 590px;
    height: min(740px, calc(100svh - 258px));
    background: #143e35;
  }
  .photo-panel > img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    position: absolute;
    inset: 0;
    object-position: 49% center;
  }
  figcaption {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 42px;
    color: #fff;
    background: linear-gradient(180deg, transparent 35%, #0c302baf 100%);
  }
  .photo-eyebrow {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    margin: 0 0 24px;
    color: #e7ece4;
  }
  .photo-title {
    font-family: 'PHOLY Inter', sans-serif;
    font-size: clamp(36px, 3.6vw, 56px);
    font-weight: 500;
    line-height: 1.12;
    letter-spacing: -0.04em;
    margin: 0;
  }
  .photo-title em {
    color: #dce6d3;
    font-style: normal;
  }
  .form-column {
    display: flex;
    justify-content: center;
    min-width: 0;
    padding-block: 25px;
  }
  .form-inner {
    width: 100%;
    max-width: 410px;
  }
  .eyebrow {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 22px;
  }
  .eyebrow span {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #728774;
  }
  h1 {
    font-family: 'PHOLY Inter', sans-serif;
    font-weight: 600;
    font-size: 60px;
    letter-spacing: -0.045em;
    line-height: 1.1;
    margin: 0;
  }
  h1 em {
    color: #6a806d;
    font-style: normal;
  }
  .intro {
    font-size: 14px;
    color: #637168;
    line-height: 1.8;
    margin: 22px 0 30px;
    max-width: 340px;
  }
  .login-controls {
    font-size: 14px;
  }
  .login-controls :global(label) {
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    color: #1f332b;
    margin-bottom: 6px;
  }
  .login-controls :global(.pholy-login-input) {
    background: #fff;
    border: 1px solid #bfcabe;
    box-shadow: none;
    border-radius: 0;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;
  }
  .login-controls :global(.pholy-login-input:focus-within) {
    border-color: #143e35;
    box-shadow: 0 0 0 3px #143e3514;
  }
  .login-controls :global(.pholy-login-input:has(input:user-invalid)) {
    border-color: #b4232c;
  }
  .login-controls :global(input) {
    min-height: 50px;
    font-family: inherit;
    font-size: 16px;
    color: #1f332b;
  }
  .login-controls :global(input:-webkit-autofill) {
    -webkit-text-fill-color: #1f332b;
  }
  .login-controls :global(.pholy-login-input button) {
    min-width: 44px;
    min-height: 44px;
    color: #637168;
  }
  .login-controls :global(.pholy-login-submit),
  .login-controls :global(.pholy-login-alternative) {
    min-height: 52px;
    font-family: inherit;
    font-size: 13px;
    border-radius: 0;
  }
  .login-controls :global(.pholy-login-submit) {
    background: #143e35;
    color: #fff;
    margin-top: 10px;
  }
  .login-controls :global(.pholy-login-submit:hover:not(:disabled)) {
    background: #28594b;
  }
  .login-controls :global(.pholy-login-alternative) {
    background: transparent;
    color: #143e35;
    border: 1px solid #bfcabe;
  }
  .login-controls :global(.pholy-login-alternative:hover:not(:disabled)) {
    background: #e9ede5;
  }
  .login-controls :global(.pholy-login-divider) {
    display: flex;
    align-items: center;
    gap: 16px;
    margin: 5px 0;
    color: #637168;
    font-size: 11px;
  }
  .login-controls :global(.pholy-login-divider::before),
  .login-controls :global(.pholy-login-divider::after) {
    content: '';
    height: 1px;
    background: #29492d26;
    flex: 1;
  }
  .account-note {
    font-size: 11px;
    color: #637168;
    line-height: 1.7;
    margin: 24px 0 0;
  }
  .footer {
    border-top: 1px solid #29492d26;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding-block: 22px;
    font-size: 11px;
    color: #637168;
  }
  .footer p {
    margin: 0;
  }
  .footer a {
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 16px;
    padding-block: 6px;
    color: #1f332b;
  }
  @media (max-width: 1100px) {
    .wrap {
      width: calc(100% - 64px);
    }
    .login-main {
      gap: 48px;
    }
    .photo-panel {
      min-height: 590px;
    }
    figcaption {
      padding: 28px;
    }
    h1 {
      font-size: 52px;
    }
  }
  @media (max-width: 800px) {
    .wrap {
      width: calc(100% - 40px);
    }
    .header-inner {
      min-height: 74px;
    }
    .brand img {
      width: 118px;
    }
    .back-link {
      font-size: 11px;
      gap: 8px;
    }
    .login-main {
      grid-template-columns: 1fr;
      padding-block: 36px 46px;
    }
    .photo-panel {
      display: none;
    }
    .form-column {
      padding: 0;
    }
    .form-inner {
      max-width: 410px;
    }
    h1 {
      font-size: clamp(38px, 10.8vw, 48px);
    }
    .eyebrow {
      font-size: 9px;
      margin-bottom: 20px;
    }
    .intro {
      font-size: 13px;
      margin: 20px 0 28px;
    }
    .account-note {
      margin-top: 22px;
      font-size: 10px;
    }
    .footer {
      font-size: 10px;
      padding-block: 18px;
      gap: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .login-controls :global(.pholy-login-input) {
      transition: none;
    }
  }
</style>
