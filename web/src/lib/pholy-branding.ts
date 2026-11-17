export const pholyBrand = {
  name: 'PHOLY',
  description: 'Deine Fotos. Deine Erinnerungen.',
  upstreamVersion: '3.4.1',
} as const;

export const getPholyCopy = (language: string) =>
  language.startsWith('de')
    ? {
        tagline: 'Deine Fotos. Deine Erinnerungen.',
        source: 'Quellcode',
        foundation: 'Auf Basis von Immich',
      }
    : {
        tagline: 'Your photos. Your memories.',
        source: 'Source code',
        foundation: 'Built on Immich',
      };

const brandedKeys = [
  'asset_offline_description',
  'delete_dialog_alert',
  'delete_dialog_alert_local',
  'delete_dialog_alert_local_ios',
  'delete_dialog_alert_local_non_backed_up',
  'empty_trash_confirmation',
  'immich_logo',
  'maintenance_description',
  'ocr_body',
  'onboarding_server_welcome_description',
  'onboarding_user_welcome_description',
  'passkeys_on_server',
  'passkeys_on_server_description',
  'recently_added_description',
  'search_type_description',
  'sync_upload_album_setting_subtitle',
  'upload_to_immich',
  'welcome_to_immich',
] as const;

const brandedAdminKeys = [
  'asset_offline_description',
  'backup_onboarding_description',
  'backups_hide_reminder_description',
  'confirm_delete_library_assets',
  'maintenance_integrity_checksum_mismatch_description',
  'maintenance_integrity_missing_file_description',
  'maintenance_integrity_untracked_file_description',
  'maintenance_restore_backup_description',
  'maintenance_restore_backup_different_version',
  'maintenance_settings_description',
  'storage_template_option_none_description',
  'theme_custom_css_settings_description',
  'theme_settings_description',
] as const;

export const applyPholyBranding = (messages: object): object => {
  const branded: Record<string, unknown> = { ...messages };
  for (const key of brandedKeys) {
    const value = branded[key];
    if (typeof value === 'string') {
      branded[key] = value.replaceAll('Immich', pholyBrand.name);
    }
  }

  const admin = branded.admin;
  if (admin && typeof admin === 'object' && !Array.isArray(admin)) {
    const brandedAdmin: Record<string, unknown> = { ...admin };
    for (const key of brandedAdminKeys) {
      const value = brandedAdmin[key];
      if (typeof value === 'string') {
        brandedAdmin[key] = value.replaceAll('Immich', pholyBrand.name);
      }
    }
    branded.admin = brandedAdmin;
  }

  return branded;
};
