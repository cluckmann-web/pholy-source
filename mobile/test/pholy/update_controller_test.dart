import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/providers/pholy_update.provider.dart';
import 'package:immich_mobile/services/pholy_update.service.dart';

class _Preferences implements PholyUpdatePreferences {
  @override
  bool automatic = true;
  @override
  DateTime? lastAttempt;
  int attemptWrites = 0;
  int automaticWrites = 0;
  Error? automaticError;

  @override
  Future<void> setAutomatic(bool enabled) async {
    automaticWrites++;
    if (automaticError case final error?) {
      throw error;
    }
    automatic = enabled;
  }

  @override
  Future<void> setLastAttempt(DateTime time) async {
    attemptWrites++;
    lastAttempt = time;
  }
}

class _Platform implements PholyUpdatePlatform {
  _Platform(this.app);

  PholyInstalledApp app;
  @override
  bool supported = true;
  bool allowed = true;
  int infoCalls = 0;
  int permissionCalls = 0;
  int permissionOpens = 0;
  int installCalls = 0;
  Exception? infoError;
  Exception? installError;
  Completer<PholyInstalledApp>? infoGate;
  Completer<void>? installGate;
  final List<Future<bool>> permissionResults = [];
  File? installedFile;
  PholyUpdateBuild? installedBuild;
  String? installedPackage;

  @override
  Future<PholyInstalledApp> installedInfo() async {
    infoCalls++;
    if (infoError case final error?) {
      throw error;
    }
    return infoGate == null ? app : await infoGate!.future;
  }

  @override
  Future<bool> canInstall() async {
    permissionCalls++;
    return permissionResults.isEmpty ? allowed : await permissionResults.removeAt(0);
  }

  @override
  Future<void> openPermissionSettings() async {
    permissionOpens++;
  }

  @override
  Future<void> install(File file, PholyUpdateBuild build, String packageName) async {
    installCalls++;
    installedFile = file;
    installedBuild = build;
    installedPackage = packageName;
    if (installError case final error?) {
      throw error;
    }
    await installGate?.future;
  }
}

class _Service extends PholyUpdateService {
  _Service(this.latest, this.downloaded);

  PholyUpdateRelease latest;
  File downloaded;
  int fetchCalls = 0;
  int downloadCalls = 0;
  Exception? fetchError;
  Exception? downloadError;
  Completer<PholyUpdateRelease>? fetchGate;
  Completer<File>? downloadGate;
  PholyUpdateCancellation? cancellation;
  void Function(int, int)? progress;

  @override
  Future<PholyUpdateRelease> fetchLatest() async {
    fetchCalls++;
    if (fetchError case final error?) {
      throw error;
    }
    return fetchGate == null ? latest : await fetchGate!.future;
  }

  @override
  Future<File> download(
    PholyUpdateBuild build,
    PholyInstalledApp installed, {
    required void Function(int, int) onProgress,
    required PholyUpdateCancellation cancellation,
  }) async {
    downloadCalls++;
    this.cancellation = cancellation;
    progress = onProgress;
    if (downloadError case final error?) {
      throw error;
    }
    final file = downloadGate == null ? downloaded : await downloadGate!.future;
    if (cancellation.isCancelled) {
      throw const PholyUpdateException('cancelled');
    }
    return file;
  }
}

/// A file deletion that can be held while another UI action runs.
class _DelayedDeleteFile extends Fake implements File {
  final deleted = Completer<File>();

  @override
  Future<File> delete({bool recursive = false}) => deleted.future;
}

PholyInstalledApp _app(String directory, {String package = 'de.pholy.app.test', bool sideload = true}) =>
    PholyInstalledApp(
      packageName: package,
      versionCode: 3042201,
      versionName: '3.4.1-pholy-mobile.1',
      supportedAbis: const ['arm64-v8a'],
      sdkInt: 35,
      signingCertificateSha256: ['5' * 64],
      updateDirectory: directory,
      sideloadUpdatesEnabled: sideload,
    );

PholyUpdateRelease _release({int versionCode = 3042202, String abi = 'arm64-v8a', int minSdk = 26}) =>
    PholyUpdateRelease(
      version: '3.4.1-pholy-mobile.2',
      notesDe: 'Synthetische Aktualisierung',
      notesEn: 'Synthetic update',
      sourceUrl: Uri.parse('https://github.com/cluckmann-web/pholy-source/tree/releases/pholy-mobile-3.4.1-test.2'),
      publishedAt: DateTime.utc(2026, 11, 18),
      builds: [
        PholyUpdateBuild(
          abi: abi,
          versionCode: versionCode,
          minSdk: minSdk,
          bytes: 3,
          sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
          url: Uri.parse('https://pholy.de/app/android/releases/test.2/pholy-arm64-v8a.apk'),
        ),
      ],
    );

Future<void> _flush() => Future<void>.delayed(Duration.zero);

void main() {
  late Directory directory;
  late _Platform platform;
  late _Preferences preferences;
  late _Service service;
  late PholyUpdateController controller;
  late DateTime now;
  var disposed = false;

  setUp(() {
    directory = Directory.systemTemp.createTempSync('pholy-update-controller-');
    final file = File('${directory.path}/pholy.apk')..writeAsStringSync('abc');
    now = DateTime.utc(2026, 11, 18, 12);
    platform = _Platform(_app(directory.path));
    preferences = _Preferences();
    service = _Service(_release(), file);
    controller = PholyUpdateController(service: service, platform: platform, preferences: preferences, now: () => now);
    disposed = false;
  });

  tearDown(() {
    if (!disposed) {
      controller.dispose();
    }
    directory.deleteSync(recursive: true);
  });

  Future<void> prepareDownload() async {
    await controller.check();
    await controller.download();
  }

  test('iOS and other unsupported platforms never invoke Android or the feed', () async {
    platform.supported = false;
    await controller.initialize();
    await controller.check();
    await controller.download();
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.unsupported);
    expect(platform.infoCalls, 0);
    expect(service.fetchCalls, 0);
    expect(service.downloadCalls, 0);
    expect(platform.installCalls, 0);
  });

  test('store distribution cannot use the test APK updater', () async {
    platform.app = _app(directory.path, package: 'de.pholy.app', sideload: false);
    await controller.check();
    expect(controller.phase, PholyUpdatePhase.unsupported);
    expect(controller.enabled, isFalse);
    expect(service.fetchCalls, 0);
  });

  test('concurrent startup and checks share one native lookup and one feed request', () async {
    platform.infoGate = Completer<PholyInstalledApp>();
    service.fetchGate = Completer<PholyUpdateRelease>();
    final first = controller.check();
    final second = controller.check();
    await _flush();
    expect(platform.infoCalls, 1);
    platform.infoGate!.complete(platform.app);
    // Startup also performs best-effort filesystem cleanup. Await the actual
    // initialization boundary rather than assuming a number of microtasks.
    await controller.initialize();
    await _flush();
    expect(service.fetchCalls, 1);
    service.fetchGate!.complete(service.latest);
    await Future.wait([first, second]);
    expect(preferences.attemptWrites, 1);
    expect(controller.phase, PholyUpdatePhase.available);
  });

  test('a failed native initialization can be retried by a later manual check', () async {
    platform.infoError = PlatformException(code: 'activity_unavailable');
    await controller.check();
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(service.fetchCalls, 0);
    platform.infoError = null;
    await controller.check();
    expect(platform.infoCalls, 2);
    expect(service.fetchCalls, 1);
    expect(controller.phase, PholyUpdatePhase.available);
  });

  test('automatic checks wait 24 hours and the boundary permits one new check', () async {
    preferences.lastAttempt = now.subtract(const Duration(hours: 23));
    await controller.check(automatically: true);
    expect(service.fetchCalls, 0);
    now = now.add(const Duration(hours: 1));
    await controller.check(automatically: true);
    await controller.onResume();
    expect(service.fetchCalls, 1);
    expect(preferences.lastAttempt, now);
    expect(controller.automaticNoticeVersion, 3042202);
    now = now.add(const Duration(days: 1));
    await controller.check(automatically: true);
    expect(service.fetchCalls, 2);
  });

  test('automatic opt-out persists and still permits an explicit check', () async {
    await controller.initialize();
    await controller.setAutomatic(false);
    await controller.check(automatically: true);
    await controller.onResume();
    expect(preferences.automatic, isFalse);
    expect(preferences.automaticWrites, 1);
    expect(controller.automatic, isFalse);
    expect(service.fetchCalls, 0);
    await controller.check();
    expect(service.fetchCalls, 1);
    expect(controller.automaticNoticeVersion, isNull);
  });

  test('offline attempts are persisted and do not repeat at every resume', () async {
    service.fetchError = const PholyUpdateException('network');
    await controller.check(automatically: true);
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(controller.errorCode, 'network');
    expect(preferences.lastAttempt, now);
    await controller.onResume();
    expect(service.fetchCalls, 1);
    service.fetchError = null;
    now = now.add(const Duration(days: 1));
    await controller.onResume();
    expect(service.fetchCalls, 2);
    expect(controller.phase, PholyUpdatePhase.available);
  });

  for (final code in [3042200, 3042201]) {
    test('version $code is current or older and can never be downloaded', () async {
      service.latest = _release(versionCode: code);
      await controller.check();
      await controller.download();
      expect(controller.phase, PholyUpdatePhase.current);
      expect(controller.availableBuild, isNull);
      expect(service.downloadCalls, 0);
      expect(platform.installCalls, 0);
    });
  }

  test('only a strictly higher compatible build is offered', () async {
    await controller.check();
    expect(controller.phase, PholyUpdatePhase.available);
    expect(controller.availableBuild!.versionCode, 3042202);
    expect(service.downloadCalls, 0);
    service.latest = _release(abi: 'x86_64');
    await controller.check();
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(controller.errorCode, 'incompatible');
    expect(controller.availableBuild, isNull);
    await controller.download();
    expect(service.downloadCalls, 0);
  });

  test('a later feed error clears an earlier offer before any download', () async {
    await controller.check();
    expect(controller.availableBuild, isNotNull);
    service.fetchError = const PholyUpdateException('invalid_feed');
    await controller.check();
    await controller.download();
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(controller.errorCode, 'invalid_feed');
    expect(controller.availableBuild, isNull);
    expect(controller.release, isNull);
    expect(service.downloadCalls, 0);
  });

  test('double taps and a completed download cannot trigger duplicate downloads', () async {
    await controller.check();
    service.downloadGate = Completer<File>();
    final first = controller.download();
    await controller.download();
    expect(service.downloadCalls, 1);
    expect(controller.phase, PholyUpdatePhase.downloading);
    service.progress!(2, 3);
    expect(controller.receivedBytes, 2);
    service.downloadGate!.complete(service.downloaded);
    await first;
    await controller.download();
    expect(controller.phase, PholyUpdatePhase.ready);
    expect(controller.hasDownload, isTrue);
    expect(service.downloadCalls, 1);
  });

  test('cancel is propagated to the download and returns to the existing offer', () async {
    await controller.check();
    service.downloadGate = Completer<File>();
    final downloading = controller.download();
    controller.cancelDownload();
    expect(service.cancellation!.isCancelled, isTrue);
    service.downloadGate!.complete(service.downloaded);
    await downloading;
    expect(controller.phase, PholyUpdatePhase.available);
    expect(controller.errorCode, isNull);
    expect(controller.hasDownload, isFalse);
    expect(controller.availableBuild!.versionCode, 3042202);
    expect(platform.installCalls, 0);
  });

  test('download integrity errors cannot enable an install', () async {
    service.downloadError = const PholyUpdateException('checksum_mismatch');
    await prepareDownload();
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(controller.errorCode, 'checksum_mismatch');
    expect(controller.hasDownload, isFalse);
    expect(platform.installCalls, 0);
  });

  test('a settings write failure cannot unlock an active download for a duplicate', () async {
    await controller.check();
    service.downloadGate = Completer<File>();
    final downloading = controller.download();
    preferences.automaticError = StateError('Synthetic preference write failure');
    await controller.setAutomatic(false);
    final phaseDuringDownload = controller.phase;
    final duplicate = controller.download();
    final calls = service.downloadCalls;
    service.downloadGate!.complete(service.downloaded);
    await Future.wait([downloading, duplicate]);
    expect(phaseDuringDownload, PholyUpdatePhase.downloading);
    expect(calls, 1);
  });

  test('permission settings and resume lead to ready without automatically installing', () async {
    platform.allowed = false;
    await prepareDownload();
    expect(controller.phase, PholyUpdatePhase.permission);
    await controller.openPermissionSettings();
    expect(platform.permissionOpens, 1);
    platform.allowed = true;
    await controller.onResume();
    expect(controller.phase, PholyUpdatePhase.ready);
    expect(controller.errorCode, isNull);
    expect(platform.installCalls, 0);
    expect(service.downloadCalls, 1);
  });

  test('installation rechecks revoked Android permission', () async {
    await prepareDownload();
    platform.allowed = false;
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.permission);
    expect(platform.installCalls, 0);
  });

  test('Android permission failure during handoff returns to permission state', () async {
    await prepareDownload();
    platform.installError = PlatformException(code: 'install_permission_required');
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.permission);
    expect(controller.installed!.versionCode, 3042201);
  });

  test('native signature failure remains an error and never reports installation', () async {
    await prepareDownload();
    platform.installError = PlatformException(code: 'signature_mismatch');
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.failed);
    expect(controller.errorCode, 'signature_mismatch');
    expect(controller.installed!.versionCode, 3042201);
    expect(controller.hasDownload, isTrue);
  });

  test('installerOpened records handoff only and preserves the installed version', () async {
    await prepareDownload();
    await controller.install();
    expect(controller.phase, PholyUpdatePhase.installerOpened);
    expect(controller.errorCode, isNull);
    expect(controller.installed!.versionCode, 3042201);
    expect(platform.installedFile, same(service.downloaded));
    expect(platform.installedBuild, same(controller.availableBuild));
    expect(platform.installedPackage, 'de.pholy.app.test');
    await controller.onResume();
    expect(controller.phase, PholyUpdatePhase.ready);
    expect(platform.installCalls, 1);
    expect(controller.installed!.versionCode, 3042201);
  });

  test('duplicate install taps cannot open two simultaneous installer dialogs', () async {
    await prepareDownload();
    platform.installGate = Completer<void>();
    final first = controller.install();
    await _flush();
    await controller.install();
    final calls = platform.installCalls;
    final phase = controller.phase;
    platform.installGate!.complete();
    await first;
    expect(calls, 1);
    expect(phase, PholyUpdatePhase.installing);
    expect(controller.phase, PholyUpdatePhase.installerOpened);
  });

  test('disposing while Android checks permission prevents a later installer call', () async {
    await prepareDownload();
    final permission = Completer<bool>();
    platform.permissionResults.add(permission.future);
    final installing = controller.install();
    controller.dispose();
    disposed = true;
    permission.complete(true);
    await installing;
    expect(platform.installCalls, 0);
  });

  test('late resume permission result cannot overwrite an ongoing installation', () async {
    await prepareDownload();
    final resumePermission = Completer<bool>();
    platform.permissionResults.add(resumePermission.future);
    final resume = controller.onResume();
    platform.installGate = Completer<void>();
    final installation = controller.install();
    await _flush();
    resumePermission.complete(true);
    await resume;
    final phaseDuringInstall = controller.phase;
    final duplicate = controller.install();
    await _flush();
    final calls = platform.installCalls;
    platform.installGate!.complete();
    await Future.wait([installation, duplicate]);
    expect(phaseDuringInstall, PholyUpdatePhase.installing);
    expect(calls, 1);
  });

  test('concurrent resume notifications share one Android permission request', () async {
    await prepareDownload();
    final previousCalls = platform.permissionCalls;
    final permission = Completer<bool>();
    platform.permissionResults.add(permission.future);
    final first = controller.onResume();
    final second = controller.onResume();
    final calls = platform.permissionCalls;
    permission.complete(true);
    await Future.wait([first, second]);
    expect(calls, previousCalls + 1);
    expect(controller.phase, PholyUpdatePhase.ready);
  });

  test('late resume answer cannot restore ready after the download was discarded', () async {
    await prepareDownload();
    final permission = Completer<bool>();
    platform.permissionResults.add(permission.future);
    final resume = controller.onResume();
    await controller.discardDownload();
    permission.complete(true);
    await resume;
    expect(controller.hasDownload, isFalse);
    expect(controller.phase, PholyUpdatePhase.available);
    expect(platform.installCalls, 0);
  });

  test('discard holds a busy operation until deletion and cannot race another download', () async {
    final file = _DelayedDeleteFile();
    service.downloaded = file;
    await prepareDownload();
    final discard = controller.discardDownload();
    final busyDuringDelete = controller.busy;
    await controller.download();
    final callsDuringDelete = service.downloadCalls;
    file.deleted.complete(file);
    await discard;
    expect(busyDuringDelete, isTrue);
    expect(callsDuringDelete, 1);
    expect(controller.hasDownload, isFalse);
    expect(controller.phase, PholyUpdatePhase.available);
    expect(controller.busy, isFalse);
  });

  test('discard removes only the downloaded file and preserves native verified copies', () async {
    final verifiedDirectory = Directory('${directory.path}/verified')..createSync();
    final verified = File('${verifiedDirectory.path}/pholy-verified.apk')..writeAsStringSync('native snapshot');
    await prepareDownload();
    await controller.discardDownload();
    expect(service.downloaded.existsSync(), isFalse);
    expect(await verified.readAsString(), 'native snapshot');
    expect(controller.hasDownload, isFalse);
  });

  test('disposal cancels an active download and emits no further notifications', () async {
    await controller.check();
    service.downloadGate = Completer<File>();
    var notifications = 0;
    controller.addListener(() => notifications++);
    final downloading = controller.download();
    controller.dispose();
    disposed = true;
    final countAfterDispose = notifications;
    expect(service.cancellation!.isCancelled, isTrue);
    service.progress!(2, 3);
    service.downloadGate!.complete(service.downloaded);
    await downloading;
    expect(notifications, countAfterDispose);
    expect(platform.installCalls, 0);
  });
}
