import 'dart:io';

import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pages/common/pholy_updates.page.dart';
import 'package:immich_mobile/providers/pholy_update.provider.dart';
import 'package:immich_mobile/services/pholy_update.service.dart';

class _MaterialDelegate extends LocalizationsDelegate<MaterialLocalizations> {
  const _MaterialDelegate();
  @override
  bool isSupported(Locale locale) => true;
  @override
  Future<MaterialLocalizations> load(Locale locale) => DefaultMaterialLocalizations.load(locale);
  @override
  bool shouldReload(_MaterialDelegate old) => false;
}

class _CupertinoDelegate extends LocalizationsDelegate<CupertinoLocalizations> {
  const _CupertinoDelegate();
  @override
  bool isSupported(Locale locale) => true;
  @override
  Future<CupertinoLocalizations> load(Locale locale) => DefaultCupertinoLocalizations.load(locale);
  @override
  bool shouldReload(_CupertinoDelegate old) => false;
}

class _NoPlatform implements PholyUpdatePlatform {
  @override
  bool get supported => false;
  @override
  Future<PholyInstalledApp> installedInfo() => throw StateError('No native calls in UI tests');
  @override
  Future<bool> canInstall() => throw StateError('No native calls in UI tests');
  @override
  Future<void> install(File file, PholyUpdateBuild build, String packageName) => throw StateError('No native calls');
  @override
  Future<void> openPermissionSettings() => throw StateError('No native calls');
}

class _Preferences implements PholyUpdatePreferences {
  @override
  bool automatic = true;
  @override
  DateTime? lastAttempt;
  @override
  Future<void> setAutomatic(bool enabled) async => automatic = enabled;
  @override
  Future<void> setLastAttempt(DateTime time) async => lastAttempt = time;
}

class _UiController extends PholyUpdateController {
  _UiController(PholyUpdatePhase initialPhase)
    : super(service: PholyUpdateService(), platform: _NoPlatform(), preferences: _Preferences()) {
    phase = initialPhase;
    installed = const PholyInstalledApp(
      packageName: 'de.pholy.app.test',
      versionCode: 3042201,
      versionName: '3.4.1-pholy-mobile.1',
      supportedAbis: ['arm64-v8a'],
      sdkInt: 35,
      signingCertificateSha256: ['508817d5ae05654119171066f8f23777093d15fc2cd8d1facef8735c9092f769'],
      updateDirectory: '/unused',
      sideloadUpdatesEnabled: true,
    );
    final build = PholyUpdateBuild(
      abi: 'arm64-v8a',
      versionCode: 3042202,
      minSdk: 26,
      bytes: 90 * 1024 * 1024,
      sha256: 'a' * 64,
      url: Uri.parse('https://github.com/cluckmann-web/pholy-source/releases/download/test/PHOLY.apk'),
    );
    release = PholyUpdateRelease(
      version: '3.4.1-pholy-mobile.2',
      notesDe: 'Updatefunktion und offline verfügbares Impressum.',
      notesEn: 'App updates and an offline legal notice.',
      sourceUrl: Uri.parse('https://github.com/cluckmann-web/pholy-source'),
      publishedAt: DateTime.utc(2026, 11, 18),
      builds: [build],
    );
    availableBuild = initialPhase == PholyUpdatePhase.current ? null : build;
    receivedBytes = 45 * 1024 * 1024;
  }

  int checks = 0;
  int downloads = 0;
  int installs = 0;
  int permissions = 0;
  int cancellations = 0;
  bool downloaded = false;

  @override
  bool get enabled => phase != PholyUpdatePhase.unsupported;
  @override
  bool get hasDownload => downloaded;
  @override
  Future<void> initialize() async {}
  @override
  Future<void> check({bool automatically = false}) async => checks++;
  @override
  Future<void> download() async => downloads++;
  @override
  Future<void> install() async {
    installs++;
    phase = PholyUpdatePhase.installerOpened;
    notifyListeners();
  }

  @override
  Future<void> openPermissionSettings() async => permissions++;
  @override
  void cancelDownload() => cancellations++;
}

Widget _host(
  _UiController controller, {
  Locale locale = const Locale('en'),
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) => ProviderScope(
  overrides: [pholyUpdateProvider.overrideWith((_) => controller)],
  child: MaterialApp(
    locale: locale,
    supportedLocales: const [Locale('de'), Locale('en')],
    localizationsDelegates: const [_MaterialDelegate(), _CupertinoDelegate()],
    theme: ThemeData(useMaterial3: true, brightness: brightness),
    builder: (context, child) => MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
      child: child!,
    ),
    home: const PholyUpdatesPage(),
  ),
);

void main() {
  testWidgets('a new version offers a deliberate download and does not start one on page entry', (tester) async {
    final controller = _UiController(PholyUpdatePhase.available);
    await tester.pumpWidget(_host(controller));
    await tester.pumpAndSettle();
    expect(find.text('An update is available'), findsOneWidget);
    expect(controller.downloads, 0);
    await tester.ensureVisible(find.byKey(const ValueKey('pholy-update-download')));
    await tester.tap(find.byKey(const ValueKey('pholy-update-download')));
    expect(controller.downloads, 1);
    expect(controller.installs, 0);
  });

  testWidgets('opening the installer never displays an installation-success claim', (tester) async {
    final controller = _UiController(PholyUpdatePhase.ready)..downloaded = true;
    await tester.pumpWidget(_host(controller));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byKey(const ValueKey('pholy-update-install')));
    await tester.tap(find.byKey(const ValueKey('pholy-update-install')));
    await tester.pumpAndSettle();
    expect(controller.installs, 1);
    expect(find.text('Android installer opened'), findsOneWidget);
    expect(find.textContaining('Installation is only confirmed by the new installed version.'), findsOneWidget);
    expect(find.text('PHOLY is up to date'), findsNothing);
  });

  testWidgets('Android permission is explained and opened only by user action', (tester) async {
    final controller = _UiController(PholyUpdatePhase.permission)..downloaded = true;
    await tester.pumpWidget(_host(controller));
    await tester.pumpAndSettle();
    expect(controller.permissions, 0);
    expect(find.text('Android permission required'), findsOneWidget);
    await tester.ensureVisible(find.byKey(const ValueKey('pholy-update-permission')));
    await tester.tap(find.byKey(const ValueKey('pholy-update-permission')));
    expect(controller.permissions, 1);
    expect(controller.installs, 0);
  });

  testWidgets('a current version has a manual check but no download', (tester) async {
    final controller = _UiController(PholyUpdatePhase.current);
    await tester.pumpWidget(_host(controller));
    await tester.pumpAndSettle();
    expect(find.text('PHOLY is up to date'), findsOneWidget);
    expect(find.byKey(const ValueKey('pholy-update-download')), findsNothing);
    await tester.ensureVisible(find.byKey(const ValueKey('pholy-update-check')));
    await tester.tap(find.byKey(const ValueKey('pholy-update-check')));
    expect(controller.checks, 1);
  });

  testWidgets('unsupported editions have no APK actions or automatic-check switch', (tester) async {
    final controller = _UiController(PholyUpdatePhase.unsupported);
    await tester.pumpWidget(_host(controller));
    await tester.pumpAndSettle();
    expect(find.textContaining('Direct APK updates are not enabled'), findsOneWidget);
    expect(find.byKey(const ValueKey('pholy-update-download')), findsNothing);
    expect(find.byType(SwitchListTile), findsNothing);
    expect(controller.checks, 0);
  });

  for (final phase in [
    PholyUpdatePhase.available,
    PholyUpdatePhase.downloading,
    PholyUpdatePhase.permission,
    PholyUpdatePhase.ready,
    PholyUpdatePhase.installerOpened,
    PholyUpdatePhase.failed,
  ]) {
    for (final brightness in Brightness.values) {
      testWidgets('all actions remain reachable at 200% German text on 320px: $phase / $brightness', (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final controller = _UiController(phase)
          ..errorCode = 'signature_mismatch'
          ..downloaded = const {
            PholyUpdatePhase.permission,
            PholyUpdatePhase.ready,
            PholyUpdatePhase.installerOpened,
          }.contains(phase);
        await tester.pumpWidget(_host(controller, locale: const Locale('de'), brightness: brightness, textScale: 2));
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.text('App-Updates'), findsOneWidget);
        await tester.ensureVisible(find.byType(SwitchListTile));
        await tester.pump(const Duration(milliseconds: 100));
        expect(find.byType(SwitchListTile).hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
