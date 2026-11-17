<script lang="ts">
  import LegalLinks from '#lib/components/pholy/LegalLinks.svelte';
  import { Route } from '#lib/route.ts';
  import '#lib/styles/pholy-public.css';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  let menuOpen = $state(false);
  let root: HTMLDivElement;
  const features = [
    ['pholy_landing.collection_title', 'pholy_landing.collection_text'],
    ['pholy_landing.albums_title', 'pholy_landing.albums_text'],
    ['pholy_landing.sharing_title', 'pholy_landing.sharing_text'],
  ] as const;

  const closeMenu = () => {
    menuOpen = false;
  };
  onMount(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          entry.target.classList.remove('awaiting');
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.08 },
    );
    for (const section of root.querySelectorAll('.reveal')) {
      section.classList.add('awaiting');
      observer.observe(section);
    }
    return () => observer.disconnect();
  });
</script>

<svelte:head>
  <meta name="description" content={$t('pholy_landing.description')} />
  <meta property="og:title" content={$t('pholy_landing.page_title') + ' · PHOLY'} />
  <meta property="og:description" content={$t('pholy_landing.description')} />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://pholy.de/" />
  <meta property="og:image" content="https://pholy.de/pholy/landing/lake.webp" />
  <link rel="canonical" href="https://pholy.de/" />
  <link rel="preload" href="/pholy/landing/inter.woff2" as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape') closeMenu();
  }}
/>

<div class="landing" bind:this={root}>
  <a class="skip" href="#inhalt">{$t('pholy_landing.skip')}</a>
  <header class="header">
    <div class="header-inner">
      <a class="brand" href={Route.home()} aria-label="PHOLY">
        <img src="/pholy/logo.svg" alt="PHOLY" width="154" height="48" />
      </a>
      <button
        type="button"
        class="menu-button"
        aria-expanded={menuOpen}
        aria-controls="landing-navigation"
        onclick={() => (menuOpen = !menuOpen)}
      >
        {$t(menuOpen ? 'pholy_landing.close' : 'pholy_landing.menu')}
        <span aria-hidden="true">{menuOpen ? '−' : '+'}</span>
      </button>
      <nav id="landing-navigation" class:open={menuOpen} aria-label={$t('pholy_landing.navigation')}>
        <a href="#funktionen" onclick={closeMenu}>{$t('pholy_landing.features')}</a>
        <a href="#einblicke" onclick={closeMenu}>{$t('pholy_landing.insights')}</a>
        <a class="login" href={Route.login()}>{$t('pholy_landing.login')} <span aria-hidden="true">↗</span></a>
      </nav>
    </div>
  </header>

  <main id="inhalt" tabindex="-1">
    <section class="hero wrap" aria-labelledby="hero-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="dot"></span> {$t('pholy_landing.eyebrow')}</p>
        <h1 id="hero-title">{$t('pholy_landing.hero_one')}<br /><em>{$t('pholy_landing.hero_two')}</em></h1>
        <p class="intro">{$t('pholy_landing.description')}</p>
        <div class="hero-actions">
          <a class="button" href={Route.photos()}>{$t('pholy_landing.open')} <span aria-hidden="true">↗</span></a>
          <a class="text-link" href="#einblicke">{$t('pholy_landing.discover')} <span aria-hidden="true">↓</span></a>
        </div>
        <p class="hero-note">{$t('pholy_landing.hero_note')}</p>
      </div>
      <div class="hero-gallery">
        <figure class="hero-lake">
          <img
            src="/pholy/landing/lake.webp"
            srcset="/pholy/landing/lake-small.webp 800w, /pholy/landing/lake.webp 1600w"
            sizes="(max-width: 700px) 78vw, 35vw"
            alt={$t('pholy_landing.lake_alt')}
            width="1600"
            height="1067"
            fetchpriority="high"
          />
          <figcaption><span>01 / {$t('pholy_landing.moments')}</span><span aria-hidden="true">↗</span></figcaption>
        </figure>
        <figure class="hero-architecture">
          <img
            src="/pholy/landing/architecture-small.webp"
            alt={$t('pholy_landing.architecture_alt')}
            width="800"
            height="1000"
          />
        </figure>
        <figure class="hero-portrait">
          <img
            src="/pholy/landing/portrait-small.webp"
            alt={$t('pholy_landing.portrait_alt')}
            width="800"
            height="1000"
          />
        </figure>
        <p class="gallery-note">{$t('pholy_landing.gallery_note')}</p>
      </div>
    </section>

    <div class="manifesto wrap">
      <p>{$t('pholy_landing.manifesto')}</p>
      <a href="#funktionen" aria-label={$t('pholy_landing.features')}><span aria-hidden="true">↓</span></a>
    </div>

    <section id="funktionen" class="features wrap reveal" aria-labelledby="features-title">
      <div class="section-heading">
        <p class="eyebrow">01 — {$t('pholy_landing.features')}</p>
        <h2 id="features-title">
          {$t('pholy_landing.features_title')}<br /><em>{$t('pholy_landing.features_em')}</em>
        </h2>
        <p>{$t('pholy_landing.features_intro')}</p>
      </div>
      <div class="feature-list">
        {#each features as [title, text], index (title)}
          <article>
            <span class="feature-number">0{index + 1}</span>
            <div>
              <h3>{$t(title)}</h3>
              <p>{$t(text)}</p>
            </div>
          </article>
        {/each}
      </div>
    </section>

    <section id="einblicke" class="insights reveal" aria-labelledby="insights-title">
      <div class="wrap">
        <div class="insights-heading">
          <div>
            <p class="eyebrow">02 — {$t('pholy_landing.insights')}</p>
            <h2 id="insights-title">
              {$t('pholy_landing.insights_title')}<br /><em>{$t('pholy_landing.insights_em')}</em>
            </h2>
          </div>
          <p>{$t('pholy_landing.insights_text')}</p>
        </div>
        <figure class="app-preview">
          <div class="preview-bar">
            <span class="preview-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>pholy.de / photos</span
            ><span aria-hidden="true">↗</span>
          </div>
          <img
            src="/pholy/landing/app-desktop.webp"
            alt={$t('pholy_landing.desktop_alt')}
            width="1440"
            height="960"
            loading="lazy"
          />
        </figure>
        <p class="preview-caption">{$t('pholy_landing.sample_note')}</p>
      </div>
    </section>

    <section class="sharing wrap reveal" aria-labelledby="sharing-title">
      <figure class="sharing-photo">
        <img
          src="/pholy/landing/forest.webp"
          srcset="/pholy/landing/forest-small.webp 800w, /pholy/landing/forest.webp 1600w"
          sizes="(max-width: 700px) 90vw, 45vw"
          alt={$t('pholy_landing.forest_alt')}
          width="1600"
          height="1067"
          loading="lazy"
        />
        <figcaption>{$t('pholy_landing.forest_caption')}</figcaption>
      </figure>
      <div class="sharing-copy">
        <p class="eyebrow">03 — {$t('pholy_landing.share_eyebrow')}</p>
        <h2 id="sharing-title">{$t('pholy_landing.share_title')}<br /><em>{$t('pholy_landing.share_em')}</em></h2>
        <p>{$t('pholy_landing.share_text')}</p>
        <ul>
          <li><span aria-hidden="true">✓</span>{$t('pholy_landing.share_password')}</li>
          <li><span aria-hidden="true">✓</span>{$t('pholy_landing.share_expiry')}</li>
          <li><span aria-hidden="true">✓</span>{$t('pholy_landing.share_download')}</li>
        </ul>
        <a class="text-link" href={Route.photos()}
          >{$t('pholy_landing.to_collection')} <span aria-hidden="true">↗</span></a
        >
      </div>
    </section>

    <section class="mobile-section wrap reveal" aria-labelledby="mobile-title">
      <div class="mobile-copy">
        <p class="eyebrow">04 — {$t('pholy_landing.mobile_eyebrow')}</p>
        <h2 id="mobile-title">{$t('pholy_landing.mobile_title')}<br /><em>{$t('pholy_landing.mobile_em')}</em></h2>
        <p>{$t('pholy_landing.mobile_text')}</p>
        <a class="button" href={Route.photos()}>{$t('pholy_landing.open')} <span aria-hidden="true">↗</span></a>
      </div>
      <div class="device-stage">
        <img
          class="device-background"
          src="/pholy/landing/mountain-small.webp"
          alt=""
          width="800"
          height="1000"
          loading="lazy"
        />
        <figure class="mobile-preview">
          <img
            src="/pholy/landing/app-mobile.webp"
            alt={$t('pholy_landing.mobile_alt')}
            width="390"
            height="844"
            loading="lazy"
          />
          <figcaption>{$t('pholy_landing.sample_short')}</figcaption>
        </figure>
        <span class="device-caption">PHOLY / {$t('pholy_landing.everywhere')}</span>
      </div>
    </section>

    <section class="closing" aria-labelledby="closing-title">
      <div class="wrap">
        <p class="eyebrow">{$t('pholy_landing.closing_eyebrow')}</p>
        <h2 id="closing-title">{$t('pholy_landing.closing_title')}<br /><em>{$t('pholy_landing.closing_em')}</em></h2>
        <a class="button button-light" href={Route.photos()}
          >{$t('pholy_landing.open')} <span aria-hidden="true">↗</span></a
        >
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="wrap footer-top">
      <div>
        <a href={Route.home()} aria-label="PHOLY"><img src="/pholy/logo.svg" alt="PHOLY" width="154" height="48" /></a>
        <p>{$t('pholy_landing.footer_tagline')}</p>
      </div>
      <nav aria-label={$t('pholy_landing.footer_navigation')}>
        <a href="#funktionen">{$t('pholy_landing.features')}</a>
        <a href="#einblicke">{$t('pholy_landing.insights')}</a>
        <a href={Route.login()}>{$t('pholy_landing.login')}</a>
        <a href={Route.source()} data-sveltekit-reload>{$t('pholy_landing.source')} <span aria-hidden="true">↗</span></a
        >
      </nav>
    </div>
    <div class="wrap footer-bottom">
      <LegalLinks /><span>© {new Date().getFullYear()} PHOLY</span><span>{$t('pholy_landing.footer_note')}</span>
    </div>
  </footer>
</div>

<style>
  .landing {
    --green: #143e35;
    --ink: #1f332b;
    --muted: #637168;
    --paper: #f7f7f2;
    background: var(--paper);
    color: var(--ink);
    font-family: 'PHOLY Inter', sans-serif;
    line-height: 1.6;
    min-height: 100vh;
  }
  .landing :global(*) {
    box-sizing: border-box;
  }
  .landing :global(a),
  .landing :global(button) {
    -webkit-tap-highlight-color: transparent;
  }
  .landing :global(a:focus-visible),
  .landing :global(button:focus-visible) {
    outline: 3px solid #b5843d;
    outline-offset: 5px;
  }
  .landing :global(img) {
    display: block;
    max-width: 100%;
  }
  .landing :global(section[id]),
  .landing :global(main[id]) {
    scroll-margin-top: 108px;
  }
  .wrap {
    width: min(1440px, calc(100% - 112px));
    margin-inline: auto;
  }
  .skip {
    position: fixed;
    z-index: 100;
    top: -80px;
    left: 20px;
    padding: 12px 20px;
    background: white;
    color: var(--green);
  }
  .skip:focus {
    top: 12px;
  }
  .header {
    position: sticky;
    top: 0;
    z-index: 20;
    background: #f7f7f2f2;
    backdrop-filter: blur(16px);
    border-bottom: 1px solid #243e2814;
  }
  .header-inner {
    width: min(1440px, calc(100% - 112px));
    min-height: 94px;
    margin: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand img,
  .footer img {
    width: 142px;
    height: auto;
  }
  .header nav {
    display: flex;
    align-items: center;
    gap: 40px;
    font-size: 14px;
  }
  .header nav a {
    text-decoration: none;
    padding-block: 10px;
  }
  .header nav a:hover,
  .footer a:hover {
    text-decoration: underline;
    text-underline-offset: 5px;
  }
  .header nav .login {
    border: 1px solid #23433740;
    padding: 11px 20px;
    display: flex;
    gap: 28px;
    align-items: center;
  }
  .menu-button {
    display: none;
  }
  .eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin: 0 0 26px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot {
    background: #728774;
    height: 6px;
    width: 6px;
    border-radius: 50%;
  }
  h1,
  h2 {
    font-family: 'PHOLY Inter', sans-serif;
    font-weight: 600;
    letter-spacing: -0.045em;
    line-height: 1.12;
    margin: 0;
  }
  h1 {
    font-size: clamp(44px, 4.9vw, 76px);
    line-height: 1.08;
  }
  h2 {
    font-size: clamp(34px, 4vw, 58px);
    font-weight: 550;
  }
  em {
    font-style: normal;
    color: #6a806d;
  }
  .hero {
    display: grid;
    grid-template-columns: 1.02fr 1fr;
    gap: 48px;
    align-items: center;
    padding-top: 76px;
    padding-bottom: 80px;
    min-height: min(760px, calc(100svh - 94px));
  }
  .hero-copy {
    padding-block: 24px;
  }
  .intro {
    max-width: 395px;
    font-size: 16px;
    line-height: 1.85;
    color: var(--muted);
    margin: 30px 0 32px;
  }
  .hero-actions {
    display: flex;
    gap: 28px;
    align-items: center;
    flex-wrap: wrap;
  }
  .button {
    display: inline-flex;
    justify-content: space-between;
    align-items: center;
    gap: 36px;
    padding: 17px 24px;
    font-size: 13px;
    font-weight: 500;
    background: var(--green);
    color: white;
    text-decoration: none;
    transition: background 0.2s;
  }
  .button:hover {
    background: #28594b;
  }
  .button span,
  .text-link span {
    font-size: 20px;
    font-weight: 400;
    line-height: 1;
  }
  .text-link {
    display: inline-flex;
    gap: 18px;
    align-items: center;
    padding-block: 10px;
    font-size: 13px;
    text-decoration: none;
    border-bottom: 1px solid #244b3240;
  }
  .text-link:hover {
    border-bottom-color: currentColor;
  }
  .hero-note {
    font-size: 11px;
    color: var(--muted);
    margin-top: 22px;
  }
  .hero-gallery {
    height: 560px;
    position: relative;
  }
  .hero-gallery figure {
    position: absolute;
    margin: 0;
    overflow: hidden;
  }
  .hero-gallery img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .hero-lake {
    top: 0;
    left: 0;
    width: 76%;
    height: 70%;
  }
  .hero-lake img {
    object-position: 53% center;
  }
  .hero-lake figcaption {
    position: absolute;
    bottom: 0;
    inset-inline: 0;
    padding: 30px 22px 18px;
    display: flex;
    justify-content: space-between;
    color: white;
    background: linear-gradient(transparent, #071f2777);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .hero-architecture {
    right: 0;
    top: 15%;
    width: 33%;
    height: 40%;
    border: 9px solid var(--paper);
    border-right: 0;
  }
  .hero-portrait {
    right: 8%;
    bottom: 0;
    width: 42%;
    height: 45%;
    border: 10px solid var(--paper);
    border-bottom: 0;
  }
  .gallery-note {
    position: absolute;
    bottom: 36px;
    left: 0;
    width: 43%;
    font-size: 11px;
    line-height: 1.8;
    letter-spacing: 0.04em;
    color: var(--muted);
    margin: 0;
  }
  .manifesto {
    border-block: 1px solid #29492d26;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding-block: 26px;
  }
  .manifesto p {
    font-size: 13px;
    color: var(--muted);
    margin: 0;
  }
  .manifesto a {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 1px solid #29492d26;
    font-size: 20px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 100px;
    padding-block: 128px;
  }
  .section-heading > p:last-child {
    max-width: 390px;
    margin-top: 28px;
    font-size: 15px;
    color: var(--muted);
  }
  .feature-list article {
    display: flex;
    gap: 28px;
    padding: 26px 0;
    border-bottom: 1px solid #29492d26;
  }
  .feature-list article:first-child {
    padding-top: 0;
  }
  .feature-number {
    font-size: 11px;
    color: #829082;
    padding-top: 5px;
  }
  h3 {
    font-size: 18px;
    font-weight: 500;
    margin: 0 0 10px;
  }
  .feature-list p {
    font-size: 13px;
    line-height: 1.8;
    color: var(--muted);
    margin: 0;
    max-width: 390px;
  }
  .insights {
    background: #e9ede5;
    padding: 100px 0 64px;
  }
  .insights-heading {
    display: flex;
    justify-content: space-between;
    gap: 48px;
    align-items: end;
    margin-bottom: 54px;
  }
  .insights-heading > p {
    font-size: 14px;
    line-height: 1.8;
    color: var(--muted);
    max-width: 330px;
    margin: 0 0 7px;
  }
  .app-preview {
    margin: 0;
    border: 1px solid #d8ded3;
    box-shadow: 0 24px 60px #17351d0d;
    background: white;
  }
  .preview-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 40px;
    padding: 0 18px;
    background: #f7f8f4;
    border-bottom: 1px solid #e4e8df;
    font-size: 10px;
    color: #6f7a71;
  }
  .preview-dots {
    display: flex;
    gap: 5px;
  }
  .preview-dots i {
    display: block;
    width: 5px;
    height: 5px;
    background: #b5beb1;
    border-radius: 50%;
  }
  .app-preview > img {
    width: 100%;
    height: auto;
  }
  .preview-caption {
    margin: 19px 0 0;
    font-size: 11px;
    color: var(--muted);
    text-align: right;
  }
  .sharing {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 100px;
    align-items: center;
    padding-block: 128px;
  }
  .sharing-photo {
    margin: 0;
    position: relative;
    height: 590px;
  }
  .sharing-photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .sharing-photo figcaption {
    position: absolute;
    bottom: 25px;
    left: 25px;
    color: white;
    font-size: 11px;
    letter-spacing: 0.08em;
    background: #153b2a77;
    padding: 7px 12px;
  }
  .sharing-copy > p:not(.eyebrow),
  .mobile-copy > p:not(.eyebrow) {
    font-size: 14px;
    line-height: 1.85;
    color: var(--muted);
    margin: 28px 0;
    max-width: 390px;
  }
  .sharing-copy ul {
    list-style: none;
    padding: 0;
    margin: 28px 0;
    font-size: 13px;
  }
  .sharing-copy li {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-block: 14px;
  }
  .sharing-copy li span {
    color: #6a806d;
  }
  .mobile-section {
    border-top: 1px solid #29492d26;
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: 100px;
    padding-block: 100px 130px;
  }
  .device-stage {
    position: relative;
    height: 650px;
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .device-background {
    position: absolute;
    width: 87%;
    height: 76%;
    object-fit: cover;
    right: 0;
    top: 12%;
  }
  .mobile-preview {
    position: relative;
    width: 266px;
    margin: 0 0 0 -60px;
    border: 8px solid #19382f;
    box-shadow: 0 25px 70px #122c3740;
    background: #19382f;
  }
  .mobile-preview img {
    width: 100%;
    height: auto;
  }
  .mobile-preview figcaption {
    font-size: 9px;
    color: #e0e9df;
    text-align: center;
    padding: 9px 4px 1px;
  }
  .device-caption {
    position: absolute;
    bottom: 3%;
    right: 0;
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .closing {
    background: var(--green);
    color: #f7f7f2;
    text-align: center;
    padding-block: 100px 110px;
  }
  .closing .eyebrow {
    justify-content: center;
    color: #c1d1bd;
  }
  .closing h2 {
    font-size: clamp(40px, 5vw, 72px);
  }
  .closing em {
    color: #c1d1bd;
  }
  .closing .button {
    margin-top: 36px;
  }
  .button-light {
    background: #f1f3e9;
    color: var(--green);
  }
  .button-light:hover {
    background: #dce5d5;
  }
  .footer {
    padding-top: 62px;
  }
  .footer-top {
    display: flex;
    justify-content: space-between;
    gap: 32px;
    padding-bottom: 44px;
  }
  .footer-top p {
    font-size: 12px;
    color: var(--muted);
    margin-top: 17px;
  }
  .footer-top nav {
    display: flex;
    gap: 30px;
    align-items: flex-start;
    padding-top: 12px;
    font-size: 12px;
  }
  .footer a {
    text-decoration: none;
  }
  .footer-bottom {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    border-top: 1px solid #29492d26;
    padding-block: 22px;
    font-size: 10px;
    color: var(--muted);
  }
  .reveal {
    transition:
      opacity 0.7s,
      transform 0.7s;
  }
  .reveal:global(.awaiting) {
    opacity: 0;
    transform: translateY(20px);
  }
  @media (min-width: 1800px) {
    .hero {
      min-height: 820px;
    }
    .hero-gallery {
      height: 620px;
    }
  }
  @media (max-width: 1100px) {
    .wrap,
    .header-inner {
      width: calc(100% - 64px);
    }
    .hero {
      gap: 24px;
      padding-top: 50px;
      padding-bottom: 54px;
    }
    .hero-gallery {
      height: 470px;
    }
    h1 {
      font-size: clamp(38px, 5vw, 58px);
    }
    .features,
    .sharing,
    .mobile-section {
      gap: 50px;
    }
    .sharing-photo {
      height: 520px;
    }
  }
  @media (max-width: 700px) {
    .wrap,
    .header-inner {
      width: calc(100% - 40px);
    }
    .header-inner {
      min-height: 74px;
    }
    .brand img {
      width: 118px;
    }
    .menu-button {
      display: flex;
      align-items: center;
      gap: 18px;
      padding: 12px 0 12px 16px;
      font-size: 12px;
      background: none;
      border: 0;
      color: var(--green);
    }
    .menu-button span {
      font-size: 23px;
      line-height: 1;
    }
    .header nav {
      display: none;
      position: absolute;
      top: 74px;
      inset-inline: 0;
      padding: 20px;
      background: var(--paper);
      border-bottom: 1px solid #29492d26;
      gap: 12px;
      align-items: stretch;
    }
    .header nav.open {
      display: flex;
      flex-direction: column;
    }
    .header nav .login {
      justify-content: space-between;
      margin-top: 4px;
    }
    .hero {
      grid-template-columns: 1fr;
      gap: 32px;
      padding-top: 37px;
      padding-bottom: 42px;
      min-height: auto;
    }
    .hero-copy {
      padding-block: 0;
    }
    h1 {
      font-size: clamp(34px, 10.2vw, 60px);
    }
    h2 {
      font-size: clamp(30px, 8vw, 44px);
    }
    .eyebrow {
      font-size: 9px;
      margin-bottom: 22px;
      letter-spacing: 0.12em;
    }
    .intro {
      font-size: 14px;
      margin: 23px 0;
      max-width: 360px;
    }
    .hero-actions {
      gap: 20px;
    }
    .button {
      padding: 15px 18px;
      gap: 28px;
      font-size: 12px;
    }
    .text-link {
      font-size: 12px;
      gap: 12px;
    }
    .hero-note {
      font-size: 10px;
      margin-top: 17px;
    }
    .hero-gallery {
      height: min(112vw, 560px);
    }
    .hero-lake figcaption {
      inset: 0 0 auto;
      padding: 12px;
      font-size: 8px;
      letter-spacing: 0.08em;
      background: linear-gradient(#071f2777, transparent);
    }
    .hero-portrait {
      right: 5%;
      width: 42%;
      border-width: 7px;
    }
    .hero-architecture {
      border-width: 6px;
      right: 0;
    }
    .gallery-note {
      font-size: 10px;
      bottom: 23px;
    }
    .manifesto {
      padding-block: 20px;
    }
    .manifesto p {
      font-size: 11px;
      max-width: 250px;
    }
    .manifesto a {
      width: 36px;
      height: 36px;
    }
    .features {
      grid-template-columns: 1fr;
      gap: 40px;
      padding-block: 72px;
    }
    .section-heading > p:last-child {
      font-size: 13px;
      margin-top: 22px;
    }
    .feature-list article {
      gap: 22px;
      padding-block: 22px;
    }
    h3 {
      font-size: 17px;
    }
    .insights {
      padding-block: 68px 38px;
    }
    .insights-heading {
      display: block;
      margin-bottom: 30px;
    }
    .insights-heading > p {
      margin-top: 24px;
      max-width: 360px;
      font-size: 13px;
    }
    .preview-bar {
      height: 29px;
      padding-inline: 9px;
      font-size: 8px;
    }
    .preview-caption {
      font-size: 9px;
      margin-top: 13px;
      text-align: left;
    }
    .sharing {
      grid-template-columns: 1fr;
      gap: 37px;
      padding-block: 72px;
    }
    .sharing-photo {
      height: 420px;
    }
    .sharing-copy > p:not(.eyebrow),
    .mobile-copy > p:not(.eyebrow) {
      font-size: 13px;
      margin-block: 23px;
    }
    .mobile-section {
      grid-template-columns: 1fr;
      gap: 25px;
      padding-block: 66px;
    }
    .device-stage {
      height: 590px;
    }
    .mobile-preview {
      width: 240px;
      margin-left: -20px;
    }
    .closing {
      padding-block: 70px 80px;
    }
    .closing h2 {
      font-size: clamp(27px, 7.6vw, 48px);
    }
    .footer {
      padding-top: 40px;
    }
    .footer-top {
      flex-direction: column;
      gap: 16px;
      padding-bottom: 30px;
    }
    .footer-top nav {
      flex-wrap: wrap;
      gap: 18px 24px;
    }
    .footer-bottom {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .reveal,
    .button {
      transition: none;
    }
    .reveal:global(.awaiting) {
      opacity: 1;
      transform: none;
    }
  }
</style>
