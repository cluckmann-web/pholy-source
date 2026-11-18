import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/providers/pholy_update.provider.dart';
import 'package:immich_mobile/routing/router.dart';

/// Reachable before sign-in as well as from settings. Updating the app never
/// requires a PHOLY account or sends the platform's credentials to GitHub.
class PholyUpdatesPage extends ConsumerStatefulWidget {
  const PholyUpdatesPage({super.key});

  @override
  ConsumerState<PholyUpdatesPage> createState() => _PholyUpdatesPageState();
}

class _PholyUpdatesPageState extends ConsumerState<PholyUpdatesPage> with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) {
        unawaited(ref.read(pholyUpdateProvider).initialize());
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(ref.read(pholyUpdateProvider).onResume());
    }
  }

  @override
  Widget build(BuildContext context) {
    final updates = ref.watch(pholyUpdateProvider);
    final theme = Theme.of(context);
    final release = updates.release;
    final build = updates.availableBuild;
    final isGerman = Localizations.localeOf(context).languageCode == 'de';
    final checking = updates.phase == PholyUpdatePhase.checking;
    final downloading = updates.phase == PholyUpdatePhase.downloading;
    final installing = updates.phase == PholyUpdatePhase.installing;
    final failure = updates.phase == PholyUpdatePhase.failed;
    final permission = updates.phase == PholyUpdatePhase.permission;
    final ready = updates.phase == PholyUpdatePhase.ready || updates.phase == PholyUpdatePhase.installerOpened;
    final color = failure ? theme.colorScheme.errorContainer : theme.colorScheme.surfaceContainerHigh;
    final onColor = failure ? theme.colorScheme.onErrorContainer : theme.colorScheme.onSurface;

    return Scaffold(
      appBar: AppBar(centerTitle: false, title: Text(pholyText(context, 'App-Updates', 'App updates'))),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 24, 20, 36),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('PHOLY', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
                  const SizedBox(height: 8),
                  Text(
                    pholyText(context, 'Deine App auf dem neuesten Stand.', 'Keep your app up to date.'),
                    style: theme.textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  if (updates.installed case final installed?) ...[
                    Text(
                      pholyText(
                        context,
                        'Installiert: ${installed.versionName}',
                        'Installed: ${installed.versionName}',
                      ),
                    ),
                    const SizedBox(height: 20),
                  ],
                  DecoratedBox(
                    decoration: BoxDecoration(color: color),
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: DefaultTextStyle.merge(
                        style: TextStyle(color: onColor, height: 1.5),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Icon(_statusIcon(updates.phase), color: onColor),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Text(
                                    _statusTitle(context, updates),
                                    style: theme.textTheme.titleMedium?.copyWith(color: onColor),
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Text(_statusBody(context, updates)),
                            if (checking || updates.phase == PholyUpdatePhase.loading || installing) ...[
                              const SizedBox(height: 16),
                              LinearProgressIndicator(semanticsLabel: _statusTitle(context, updates)),
                            ],
                            if (downloading && build != null) ...[
                              const SizedBox(height: 16),
                              LinearProgressIndicator(
                                value: (updates.receivedBytes / build.bytes).clamp(0, 1),
                                semanticsLabel: pholyText(context, 'Downloadfortschritt', 'Download progress'),
                              ),
                              const SizedBox(height: 8),
                              Text('${_megabytes(updates.receivedBytes)} / ${_megabytes(build.bytes)} MB'),
                            ],
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (updates.enabled) ...[
                    if (build != null && !updates.hasDownload && !downloading && !installing)
                      FilledButton.icon(
                        key: const ValueKey('pholy-update-download'),
                        onPressed: updates.busy ? null : () => unawaited(updates.download()),
                        icon: const Icon(Icons.download_outlined),
                        label: Text(pholyText(context, 'Update herunterladen', 'Download update')),
                      ),
                    if (downloading)
                      OutlinedButton.icon(
                        key: const ValueKey('pholy-update-cancel'),
                        onPressed: updates.cancelDownload,
                        icon: const Icon(Icons.close),
                        label: Text(pholyText(context, 'Download abbrechen', 'Cancel download')),
                      ),
                    if (permission) ...[
                      FilledButton.icon(
                        key: const ValueKey('pholy-update-permission'),
                        onPressed: () => unawaited(updates.openPermissionSettings()),
                        icon: const Icon(Icons.settings_outlined),
                        label: Text(pholyText(context, 'Installation erlauben', 'Allow installation')),
                      ),
                      const SizedBox(height: 8),
                      OutlinedButton(
                        onPressed: () => unawaited(updates.onResume()),
                        child: Text(pholyText(context, 'Berechtigung erneut prüfen', 'Check permission again')),
                      ),
                    ],
                    if (ready || (failure && updates.hasDownload))
                      FilledButton.icon(
                        key: const ValueKey('pholy-update-install'),
                        onPressed: () => unawaited(updates.install()),
                        icon: const Icon(Icons.system_update_outlined),
                        label: Text(pholyText(context, 'Update installieren', 'Install update')),
                      ),
                    if (updates.hasDownload && !updates.busy) ...[
                      const SizedBox(height: 8),
                      TextButton(
                        onPressed: () => unawaited(updates.discardDownload()),
                        child: Text(pholyText(context, 'Download verwerfen', 'Discard download')),
                      ),
                    ],
                    const SizedBox(height: 8),
                    OutlinedButton.icon(
                      key: const ValueKey('pholy-update-check'),
                      onPressed: updates.busy || updates.hasDownload ? null : () => unawaited(updates.check()),
                      icon: const Icon(Icons.refresh),
                      label: Text(pholyText(context, 'Nach Updates suchen', 'Check for updates')),
                    ),
                    if (release != null) ...[
                      const SizedBox(height: 28),
                      Text(
                        pholyText(context, 'Neues in ${release.version}', 'What’s new in ${release.version}'),
                        style: theme.textTheme.titleMedium,
                      ),
                      const SizedBox(height: 6),
                      Text(
                        MaterialLocalizations.of(context).formatMediumDate(release.publishedAt.toLocal()),
                        style: theme.textTheme.bodySmall,
                      ),
                      const SizedBox(height: 12),
                      Text(isGerman ? release.notesDe : release.notesEn, style: const TextStyle(height: 1.5)),
                    ],
                    const SizedBox(height: 24),
                    const Divider(),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        pholyText(context, 'Automatisch nach Updates suchen', 'Automatically check for updates'),
                      ),
                      subtitle: Text(
                        pholyText(
                          context,
                          'Beim Öffnen, höchstens einmal täglich. Du entscheidest, wann ein Download startet.',
                          'When opening the app, at most once a day. You choose when a download starts.',
                        ),
                      ),
                      value: updates.automatic,
                      onChanged: updates.busy ? null : (value) => unawaited(updates.setAutomatic(value)),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      pholyText(
                        context,
                        'Die Updateprüfung verbindet sich mit GitHub, ohne deine PHOLY-Anmeldedaten zu übertragen. '
                            'Der APK-Download benötigt Datenvolumen. Lass PHOLY währenddessen geöffnet.',
                        'Update checks connect to GitHub without sending your PHOLY credentials. '
                            'The APK download uses data. Keep PHOLY open while it downloads.',
                      ),
                      style: theme.textTheme.bodySmall?.copyWith(height: 1.5),
                    ),
                  ] else if (failure)
                    OutlinedButton(
                      onPressed: () => unawaited(updates.check()),
                      child: Text(pholyText(context, 'Erneut versuchen', 'Try again')),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

String _megabytes(int bytes) => (bytes / (1024 * 1024)).toStringAsFixed(1);

IconData _statusIcon(PholyUpdatePhase phase) => switch (phase) {
  PholyUpdatePhase.current => Icons.check_circle_outline,
  PholyUpdatePhase.failed => Icons.error_outline,
  PholyUpdatePhase.permission => Icons.admin_panel_settings_outlined,
  PholyUpdatePhase.downloading => Icons.download_outlined,
  PholyUpdatePhase.unsupported => Icons.info_outline,
  _ => Icons.system_update_outlined,
};

String _statusTitle(BuildContext context, PholyUpdateController updates) => switch (updates.phase) {
  PholyUpdatePhase.loading => pholyText(context, 'Version wird gelesen …', 'Reading app version …'),
  PholyUpdatePhase.unsupported => pholyText(context, 'Updates für diese Ausgabe', 'Updates for this edition'),
  PholyUpdatePhase.idle => pholyText(context, 'Bereit für die Updateprüfung', 'Ready to check for updates'),
  PholyUpdatePhase.checking => pholyText(context, 'Updates werden gesucht …', 'Checking for updates …'),
  PholyUpdatePhase.current => pholyText(context, 'PHOLY ist aktuell', 'PHOLY is up to date'),
  PholyUpdatePhase.available => pholyText(context, 'Ein Update ist verfügbar', 'An update is available'),
  PholyUpdatePhase.downloading => pholyText(context, 'Update wird heruntergeladen …', 'Downloading update …'),
  PholyUpdatePhase.permission => pholyText(context, 'Android-Freigabe erforderlich', 'Android permission required'),
  PholyUpdatePhase.ready => pholyText(context, 'Bereit zur Installation', 'Ready to install'),
  PholyUpdatePhase.installing => pholyText(context, 'Update wird geprüft …', 'Verifying update …'),
  PholyUpdatePhase.installerOpened => pholyText(context, 'Android-Installer geöffnet', 'Android installer opened'),
  PholyUpdatePhase.failed => pholyText(context, 'Update nicht abgeschlossen', 'Update not completed'),
};

String _statusBody(BuildContext context, PholyUpdateController updates) {
  final version = updates.release?.version ?? '';
  switch (updates.phase) {
    case PholyUpdatePhase.loading:
    case PholyUpdatePhase.checking:
      return pholyText(context, 'Das dauert normalerweise nur einen Moment.', 'This usually takes just a moment.');
    case PholyUpdatePhase.unsupported:
      return pholyText(
        context,
        'Direkte APK-Updates sind für diese Ausgabe nicht aktiviert. '
            'iOS- und Store-Ausgaben erhalten Updates über ihren jeweiligen Vertriebskanal.',
        'Direct APK updates are not enabled for this edition. '
            'iOS and store editions receive updates through their distribution channel.',
      );
    case PholyUpdatePhase.idle:
      return pholyText(
        context,
        'Du kannst jederzeit manuell nach einer neuen Version suchen.',
        'You can check for a new version at any time.',
      );
    case PholyUpdatePhase.current:
      return pholyText(
        context,
        'Für dein Gerät ist keine neuere Testversion verfügbar.',
        'There is no newer test version available for your device.',
      );
    case PholyUpdatePhase.available:
      final size = _megabytes(updates.availableBuild!.bytes);
      return pholyText(
        context,
        '$version · $size MB. Android fragt vor der Installation nach deiner Bestätigung.',
        '$version · $size MB. Android will ask for your confirmation before installing.',
      );
    case PholyUpdatePhase.downloading:
      return pholyText(
        context,
        'Lass PHOLY geöffnet. Du kannst den Download jederzeit abbrechen.',
        'Keep PHOLY open. You can cancel the download at any time.',
      );
    case PholyUpdatePhase.permission:
      return pholyText(
        context,
        'Der Download ist geprüft. Erlaube in den Android-Einstellungen „Dieser Quelle vertrauen“ bzw. „Aus dieser Quelle zulassen“ für PHOLY Test und kehre anschließend zurück.',
        'The download has been verified. Allow “Install unknown apps” for PHOLY Test in Android settings, then return here.',
      );
    case PholyUpdatePhase.ready:
      return pholyText(
        context,
        'Der Download ist vollständig. Vor dem Öffnen des Android-Installers prüfen wir die App-Signatur und Version. Du benötigst vorübergehend etwa die doppelte Downloadgröße als freien Speicher.',
        'The download is complete. The app signature and version will be checked before opening the Android installer. Temporarily allow about twice the download size as free space.',
      );
    case PholyUpdatePhase.installing:
      return pholyText(
        context,
        'Prüfsumme, App-Signatur und Version werden geprüft. Danach öffnet sich Androids Installationsdialog.',
        'Checking the checksum, app signature and version. Android’s installation dialog will open next.',
      );
    case PholyUpdatePhase.installerOpened:
      return pholyText(
        context,
        'Bestätige die Aktualisierung im Android-Dialog. Wenn du ihn abgebrochen hast, kannst du ihn erneut öffnen. Eine erfolgreiche Installation wird erst an der neuen installierten Version erkannt.',
        'Confirm the update in Android’s dialog. If you cancelled it, you can open it again. Installation is only confirmed by the new installed version.',
      );
    case PholyUpdatePhase.failed:
      return _errorMessage(context, updates.errorCode);
  }
}

String _errorMessage(BuildContext context, String? code) => switch (code) {
  'network' || 'timeout' => pholyText(
    context,
    'Die Verbindung zum Update-Server ist fehlgeschlagen. Prüfe deine Internetverbindung und versuche es erneut.',
    'Could not reach the update server. Check your internet connection and try again.',
  ),
  'invalid_feed' => pholyText(
    context,
    'Die Updateinformationen sind unvollständig oder ungültig. Bitte versuche es später erneut.',
    'The update information is incomplete or invalid. Please try again later.',
  ),
  'incompatible' || 'incompatible_sdk' || 'incompatible_abi' => pholyText(
    context,
    'Diese Testversion unterstützt dein Gerät oder deine Android-Version nicht. Es wird nichts installiert.',
    'This test version does not support your device or Android version. Nothing will be installed.',
  ),
  'checksum_mismatch' ||
  'size_mismatch' ||
  'signature_mismatch' ||
  'package_mismatch' ||
  'version_mismatch' ||
  'not_newer' ||
  'invalid_apk' ||
  'invalid_path' => pholyText(
    context,
    'Die Sicherheitsprüfung ist fehlgeschlagen. Die Datei wird nicht installiert. Verwirf den Download und lade das Update erneut.',
    'The security check failed. The file will not be installed. Discard the download and download the update again.',
  ),
  'installer_unavailable' || 'activity_unavailable' => pholyText(
    context,
    'Android konnte den Installationsdialog nicht öffnen. Öffne PHOLY erneut und versuche es noch einmal.',
    'Android could not open the installation dialog. Reopen PHOLY and try again.',
  ),
  _ => pholyText(
    context,
    'Die Aktualisierung konnte nicht vorbereitet werden. Prüfe den freien Speicherplatz und versuche es erneut.',
    'The update could not be prepared. Check your available storage and try again.',
  ),
};

/// A non-blocking foreground notice; photos, comments and upload tasks retain
/// their current route and state until the user explicitly opens updates.
class PholyUpdateNotice extends ConsumerWidget {
  const PholyUpdateNotice({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<int?>(pholyUpdateProvider.select((state) => state.automaticNoticeVersion), (_, version) {
      if (version == null) {
        return;
      }
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!context.mounted) {
          return;
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(pholyText(context, 'Ein PHOLY-Update ist verfügbar.', 'A PHOLY update is available.')),
            duration: const Duration(seconds: 12),
            action: SnackBarAction(
              label: pholyText(context, 'Ansehen', 'View'),
              onPressed: () {
                final navigator = ref.read(appRouterProvider).navigatorKey.currentState;
                unawaited(
                  navigator?.push<void>(
                    MaterialPageRoute<void>(
                      settings: const RouteSettings(name: 'PholyUpdatesPage'),
                      builder: (_) => const PholyUpdatesPage(),
                    ),
                  ),
                );
              },
            ),
          ),
        );
      });
    });
    return child;
  }
}
