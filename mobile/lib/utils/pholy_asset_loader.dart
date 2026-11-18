import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/widgets.dart';
import 'package:immich_mobile/generated/codegen_loader.g.dart';

/// Brand app-owned instructions while preserving upstream credits, licenses,
/// support documentation and translation identifiers shared with the server.
class PholyAssetLoader extends AssetLoader {
  const PholyAssetLoader();

  static const _appCopy = {
    'about',
    'advanced_settings_proxy_headers_subtitle',
    'asset_offline_description',
    'background_location_permission_content',
    'backup_controller_page_background_battery_info_message',
    'cleanup_confirm_description',
    'cleanup_step4_summary',
    'delete_dialog_alert',
    'delete_dialog_alert_local',
    'delete_dialog_alert_local_ios',
    'delete_dialog_alert_local_non_backed_up',
    'empty_trash_confirmation',
    'immich_logo',
    'location_permission_content',
    'maintenance_description',
    'manage_media_access_subtitle',
    'my_immich_description',
    'my_immich_title',
    'notification_enabled_list_tile_content',
    'ocr_body',
    'open_in_immich_body',
    'open_in_immich_title',
    'passkeys_on_server',
    'passkeys_on_server_description',
    'recently_added_description',
    'reset_sqlite_done',
    'search_type_description',
    'sync_upload_album_setting_subtitle',
    'upload_to_immich',
    'welcome_to_immich',
    'whats_new_settings_subtitle',
  };

  @override
  Future<Map<String, dynamic>?> load(String path, Locale locale) async {
    final original = await const CodegenLoader().load(path, locale);
    if (original == null) {
      return null;
    }
    return {
      for (final entry in original.entries)
        entry.key: _appCopy.contains(entry.key) && entry.value is String
            ? (entry.value as String).replaceAll('Immich', 'PHOLY')
            : entry.value,
    };
  }
}
