<script lang="ts">
  import { t } from 'svelte-i18n';

  let copied = $state(false);
  let copyFailed = $state(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText('https://pholy.de');
      copied = true;
      copyFailed = false;
    } catch {
      copyFailed = true;
    }
  };
</script>

<section class="app-notice" aria-labelledby="app-notice-title">
  <div class="number" aria-hidden="true">↗</div>
  <div>
    <h2 id="app-notice-title">{$t('pholy_invitation.app_title')}</h2>
    <p>{$t('pholy_invitation.app_text')}</p>
    <div class="stores">
      <a href="https://apps.apple.com/us/app/immich/id1613945652" target="_blank" rel="noopener noreferrer"
        >App Store ↗</a
      >
      <a
        href="https://play.google.com/store/apps/details?id=app.alextran.immich"
        target="_blank"
        rel="noopener noreferrer">Google Play ↗</a
      >
    </div>
    <p class="server-label">{$t('pholy_invitation.server')}</p>
    <div class="server">
      <code>https://pholy.de</code><button type="button" onclick={copy}
        >{copied ? $t('pholy_invitation.copied') : $t('pholy_invitation.copy')}</button
      >
    </div>
    <p class="help">{$t('pholy_invitation.app_login')}</p>
    {#if copyFailed}<p role="status">{$t('pholy_invitation.copy_manually')}</p>{/if}
    <span class="sr-only" role="status">{copied ? $t('pholy_invitation.copied') : ''}</span>
  </div>
</section>

<style>
  .app-notice {
    display: grid;
    grid-template-columns: 36px 1fr;
    gap: 16px;
    padding: 28px;
    background: #edf1e9;
    border: 1px solid #d8ded4;
    color: #1f332b;
    line-height: 1.65;
    min-width: 0;
  }
  .number {
    font-size: 24px;
    color: #6c826e;
  }
  h2 {
    font-size: 23px;
    line-height: 1.2;
    font-weight: 550;
    letter-spacing: -0.03em;
    margin: 0 0 14px;
  }
  p {
    font-size: 14px;
    margin: 0 0 18px;
    color: #52675b;
  }
  .stores {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 22px;
  }
  .stores a {
    color: #143e35;
    border-bottom: 1px solid #adb9a7;
    padding: 4px 0;
    text-decoration: none;
    font-size: 13px;
  }
  .server-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 8px;
  }
  .server {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  code {
    font-size: 15px;
    overflow-wrap: anywhere;
  }
  button {
    background: transparent;
    border: 1px solid #aab9a7;
    padding: 6px 10px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .help {
    font-size: 12px;
    margin: 12px 0 0;
  }
  a:focus-visible,
  button:focus-visible {
    outline: 2px solid #143e35;
    outline-offset: 4px;
  }
  @media (max-width: 700px) {
    .app-notice {
      padding: 20px;
      grid-template-columns: 1fr;
    }
    .number {
      display: none;
    }
    h2 {
      font-size: 22px;
    }
  }
</style>
