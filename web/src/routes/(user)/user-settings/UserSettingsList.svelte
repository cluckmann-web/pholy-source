<script lang="ts">
  import SettingAccordion from '#lib/components/shared-components/settings/SettingAccordion.svelte';
  import { OpenQueryParam, QueryParameter } from '#lib/constants.ts';
  import { getPholyCollectionCopy } from '#lib/pholy-collection-copy.ts';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getUserConfigQuery } from '#lib/queries/config-user.query.ts';
  import { oauth } from '#lib/utils.ts';
  import {
    mdiAccountGroupOutline,
    mdiAccountOutline,
    mdiApi,
    mdiBellOutline,
    mdiCogOutline,
    mdiDevices,
    mdiDownload,
    mdiFeatureSearchOutline,
    mdiFormTextboxPassword,
    mdiKeyOutline,
    mdiLockSmart,
    mdiServerOutline,
    mdiShieldKeyOutline,
    mdiTwoFactorAuthentication,
  } from '@mdi/js';
  import { locale, t } from 'svelte-i18n';
  import { page } from '$app/state';
  import AppSettings from './AppSettings.svelte';
  import ChangePasswordSettings from './ChangePasswordSettings.svelte';
  import DeviceList from './DeviceList.svelte';
  import DownloadSettings from './DownloadSettings.svelte';
  import FeatureSettings from './FeatureSettings.svelte';
  import NotificationsSettings from './NotificationsSettings.svelte';
  import OAuthSettings from './OAuthSettings.svelte';
  import ChangePinCodeSettings from './PinCodeSettings.svelte';
  import SharingSettings from './SharingSettings.svelte';
  import UserApiKeyList from './UserApiKeyList.svelte';
  import UserPasskeyList from './UserPasskeyList.svelte';
  import UserProfileSettings from './UserProfileSettings.svelte';
  import UserPurchaseSettings from './UserPurchaseSettings.svelte';
  import UserUsageStatistic from './UserUsageStatistic.svelte';

  const query = createPreloadedQuery(getUserConfigQuery);
  const config = $derived(query.data);
  let oauthOpen =
    oauth.isCallback(location) || page.url.searchParams.get(QueryParameter.OPEN_SETTING) === OpenQueryParam.OAUTH;

  const copy = $derived(getPholyCollectionCopy($locale ?? 'en'));
</script>

<section class="pholy-settings-section" aria-labelledby="pholy-settings-profile">
  <header>
    <h2 id="pholy-settings-profile">{copy.profileGroup}</h2>
    <p>{copy.profileGroupDescription}</p>
  </header>

  <SettingAccordion icon={mdiAccountOutline} key="account" title={$t('account')} subtitle={$t('manage_your_account')}>
    <UserProfileSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiAccountGroupOutline}
    key={OpenQueryParam.SHARING}
    title={$t('sharing')}
    subtitle={$t('manage_sharing_with_other_users')}
  >
    <SharingSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiServerOutline}
    key="user-usage-info"
    title={$t('user_usage_stats')}
    subtitle={$t('user_usage_stats_description')}
  >
    <UserUsageStatistic />
  </SettingAccordion>
</section>

<section class="pholy-settings-section" aria-labelledby="pholy-settings-preferences">
  <header>
    <h2 id="pholy-settings-preferences">{copy.preferencesGroup}</h2>
    <p>{copy.preferencesGroupDescription}</p>
  </header>

  <SettingAccordion
    icon={mdiCogOutline}
    key="app-settings"
    title={$t('app_settings')}
    subtitle={$t('manage_the_app_settings')}
  >
    <AppSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiFeatureSearchOutline}
    key="feature"
    title={$t('features')}
    subtitle={$t('features_setting_description')}
  >
    <FeatureSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiDownload}
    key="download-settings"
    title={$t('download_settings')}
    subtitle={$t('download_settings_description')}
  >
    <DownloadSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiBellOutline}
    key={OpenQueryParam.NOTIFICATIONS}
    title={$t('notifications')}
    subtitle={$t('notifications_setting_description')}
  >
    <NotificationsSettings />
  </SettingAccordion>
</section>

<section class="pholy-settings-section" aria-labelledby="pholy-settings-security">
  <header>
    <h2 id="pholy-settings-security">{copy.securityGroup}</h2>
    <p>{copy.securityGroupDescription}</p>
  </header>

  <SettingAccordion
    icon={mdiFormTextboxPassword}
    key="password"
    title={$t('password')}
    subtitle={$t('change_your_password')}
  >
    <ChangePasswordSettings />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiDevices}
    key="authorized-devices"
    title={$t('authorized_devices')}
    subtitle={$t('manage_your_devices')}
  >
    <DeviceList />
  </SettingAccordion>

  {#if config.passkey.enabled}
    <SettingAccordion
      icon={mdiShieldKeyOutline}
      key="passkeys"
      title={$t('passkeys', { values: { count: 5 } })}
      subtitle={$t('manage_your_passkeys')}
    >
      <UserPasskeyList />
    </SettingAccordion>
  {/if}

  {#if config.oauth.enabled}
    <SettingAccordion
      icon={mdiTwoFactorAuthentication}
      key={OpenQueryParam.OAUTH}
      title={$t('oauth')}
      subtitle={$t('manage_your_oauth_connection')}
      isOpen={oauthOpen || undefined}
    >
      <OAuthSettings />
    </SettingAccordion>
  {/if}

  <SettingAccordion
    icon={mdiLockSmart}
    key="user-pin-code-settings"
    title={$t('user_pin_code_settings')}
    subtitle={$t('user_pin_code_settings_description')}
    autoScrollTo={true}
  >
    <ChangePinCodeSettings />
  </SettingAccordion>
</section>

<section class="pholy-settings-section" aria-labelledby="pholy-settings-advanced">
  <header>
    <h2 id="pholy-settings-advanced">{copy.advancedGroup}</h2>
    <p>{copy.advancedGroupDescription}</p>
  </header>

  <SettingAccordion icon={mdiApi} key="api-keys" title={$t('api_keys')} subtitle={$t('manage_your_api_keys')}>
    <UserApiKeyList />
  </SettingAccordion>

  <SettingAccordion
    icon={mdiKeyOutline}
    key={OpenQueryParam.PURCHASE_SETTINGS}
    title={$t('user_purchase_settings')}
    subtitle={$t('user_purchase_settings_description')}
    autoScrollTo={true}
  >
    <UserPurchaseSettings />
  </SettingAccordion>
</section>

<style>
  .pholy-settings-section {
    margin-top: 28px;
  }

  .pholy-settings-section > header {
    padding-inline: 2px;
    margin-bottom: 12px;
  }

  .pholy-settings-section > header h2 {
    color: var(--immich-ui-dark);
    font-size: 16px;
    line-height: 1.5;
    font-weight: 600;
  }

  .pholy-settings-section > header p {
    margin-top: 3px;
    color: var(--immich-ui-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .pholy-settings-section > :global(div) {
    margin-top: 10px;
    border-width: 1px;
    border-color: var(--immich-ui-default-border);
    border-radius: var(--pholy-surface-radius);
    background: var(--immich-ui-light);
  }

  .pholy-settings-section > :global(div:focus-within) {
    border-color: var(--immich-ui-primary-300);
  }

  @media (max-width: 639px) {
    .pholy-settings-section > :global(div) {
      padding: 14px;
    }
  }
</style>
