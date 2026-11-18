import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/services/pholy_update.service.dart';

enum PholyUpdatePhase {
  loading,
  unsupported,
  idle,
  checking,
  current,
  available,
  downloading,
  permission,
  ready,
  installing,
  installerOpened,
  failed,
}

abstract interface class PholyUpdatePlatform {
  bool get supported;
  Future<PholyInstalledApp> installedInfo();
  Future<bool> canInstall();
  Future<void> openPermissionSettings();
  Future<void> install(File file, PholyUpdateBuild build, String packageName);
}

class AndroidPholyUpdatePlatform implements PholyUpdatePlatform {
  static const _channel = MethodChannel('de.pholy.app/updates');

  @override
  bool get supported => Platform.isAndroid;

  @override
  Future<PholyInstalledApp> installedInfo() async {
    final result = await _channel.invokeMapMethod<String, Object?>('getInstalledInfo');
    if (result == null) {
      throw PlatformException(code: 'invalid_apk');
    }
    return PholyInstalledApp.fromMap(result);
  }

  @override
  Future<bool> canInstall() async => await _channel.invokeMethod<bool>('canRequestPackageInstalls') ?? false;

  @override
  Future<void> openPermissionSettings() => _channel.invokeMethod<void>('openInstallPermissionSettings');

  @override
  Future<void> install(File file, PholyUpdateBuild build, String packageName) =>
      _channel.invokeMethod<void>('inspectAndInstallApk', {
        'path': file.path,
        'expectedSha256': build.sha256,
        'expectedVersionCode': build.versionCode,
        'expectedPackageName': packageName,
      });
}

abstract interface class PholyUpdatePreferences {
  bool get automatic;
  DateTime? get lastAttempt;
  Future<void> setAutomatic(bool enabled);
  Future<void> setLastAttempt(DateTime time);
}

class StoredPholyUpdatePreferences implements PholyUpdatePreferences {
  @override
  bool get automatic => Store.get(StoreKey.pholyUpdateAutoCheck, true);

  @override
  DateTime? get lastAttempt {
    final value = Store.get(StoreKey.pholyUpdateLastCheck, 0);
    return value == 0 ? null : DateTime.fromMillisecondsSinceEpoch(value);
  }

  @override
  Future<void> setAutomatic(bool enabled) => Store.put(StoreKey.pholyUpdateAutoCheck, enabled);

  @override
  Future<void> setLastAttempt(DateTime time) => Store.put(StoreKey.pholyUpdateLastCheck, time.millisecondsSinceEpoch);
}

final pholyUpdateProvider = ChangeNotifierProvider<PholyUpdateController>(
  (_) => PholyUpdateController(
    service: PholyUpdateService(),
    platform: AndroidPholyUpdatePlatform(),
    preferences: StoredPholyUpdatePreferences(),
  ),
);

/// Device-local update state. No account tokens, photo requests or background
/// backup tasks participate in this controller.
class PholyUpdateController extends ChangeNotifier {
  PholyUpdateController({
    required this._service,
    required this._platform,
    required this._preferences,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final PholyUpdateService _service;
  final PholyUpdatePlatform _platform;
  final PholyUpdatePreferences _preferences;
  final DateTime Function() _now;
  Future<void>? _initialization;
  Future<void>? _resuming;
  bool _disposed = false;
  bool _discarding = false;
  bool _settingAutomatic = false;
  int _operation = 0;
  PholyUpdateCancellation? _cancellation;
  File? _downloaded;

  PholyUpdatePhase phase = PholyUpdatePhase.loading;
  PholyInstalledApp? installed;
  PholyUpdateRelease? release;
  PholyUpdateBuild? availableBuild;
  String? errorCode;
  bool automatic = true;
  DateTime? lastAttempt;
  int receivedBytes = 0;
  int? automaticNoticeVersion;

  bool get enabled => installed?.sideloadUpdatesEnabled == true && installed?.packageName == 'de.pholy.app.test';
  bool get busy =>
      _discarding ||
      _settingAutomatic ||
      const {
        PholyUpdatePhase.loading,
        PholyUpdatePhase.checking,
        PholyUpdatePhase.downloading,
        PholyUpdatePhase.installing,
      }.contains(phase);
  bool get hasDownload => _downloaded != null;

  void _changed() {
    if (!_disposed) {
      notifyListeners();
    }
  }

  Future<void> initialize() => _initialization ??= _initialize();

  Future<void> _initialize() async {
    if (!_platform.supported) {
      phase = PholyUpdatePhase.unsupported;
      _changed();
      return;
    }
    try {
      automatic = _preferences.automatic;
      lastAttempt = _preferences.lastAttempt;
      installed = await _platform.installedInfo();
      if (enabled && !_disposed) {
        await _service.cleanupPreviousDownloads(installed!);
      }
      phase = enabled ? PholyUpdatePhase.idle : PholyUpdatePhase.unsupported;
    } catch (error) {
      _fail(error);
    }
    _changed();
  }

  Future<void> check({bool automatically = false}) async {
    if (installed == null && phase == PholyUpdatePhase.failed) {
      _initialization = null;
    }
    await initialize();
    if (_disposed || !enabled || busy || hasDownload) {
      return;
    }
    final now = _now();
    final elapsed = lastAttempt == null ? null : now.difference(lastAttempt!);
    if (automatically &&
        (!automatic || (elapsed != null && !elapsed.isNegative && elapsed < const Duration(days: 1)))) {
      return;
    }
    phase = PholyUpdatePhase.checking;
    errorCode = null;
    availableBuild = null;
    release = null;
    lastAttempt = now;
    _changed();
    try {
      // Persist the attempt, including offline attempts, to avoid repeated
      // requests on every foreground transition.
      await _preferences.setLastAttempt(now);
      final latest = await _service.fetchLatest();
      if (_disposed) {
        return;
      }
      final build = latest.compatibleBuild(installed!);
      if (build == null) {
        throw const PholyUpdateException('incompatible');
      }
      release = latest;
      availableBuild = build.versionCode > installed!.versionCode ? build : null;
      phase = availableBuild == null ? PholyUpdatePhase.current : PholyUpdatePhase.available;
      if (automatically && availableBuild != null) {
        automaticNoticeVersion = build.versionCode;
      }
    } catch (error) {
      _fail(error);
    }
    _changed();
  }

  Future<void> setAutomatic(bool enabled) async {
    if (_disposed || busy) {
      return;
    }
    _settingAutomatic = true;
    _changed();
    try {
      await _preferences.setAutomatic(enabled);
      automatic = enabled;
    } catch (error) {
      _fail(error);
    } finally {
      _settingAutomatic = false;
    }
    _changed();
  }

  Future<void> download() async {
    final build = availableBuild;
    final app = installed;
    if (_disposed || !enabled || busy || build == null || app == null || hasDownload) {
      return;
    }
    if (build.versionCode <= app.versionCode) {
      return;
    }
    final cancellation = PholyUpdateCancellation();
    _cancellation = cancellation;
    _operation++;
    phase = PholyUpdatePhase.downloading;
    errorCode = null;
    receivedBytes = 0;
    _changed();
    try {
      _downloaded = await _service.download(
        build,
        app,
        cancellation: cancellation,
        onProgress: (received, total) {
          receivedBytes = received;
          _changed();
        },
      );
      if (_disposed) {
        return;
      }
      phase = await _platform.canInstall() ? PholyUpdatePhase.ready : PholyUpdatePhase.permission;
    } catch (error) {
      if (error is PholyUpdateException && error.code == 'cancelled') {
        phase = PholyUpdatePhase.available;
        errorCode = null;
      } else {
        _fail(error);
      }
    } finally {
      _cancellation = null;
      _changed();
    }
  }

  void cancelDownload() => _cancellation?.cancel();

  Future<void> openPermissionSettings() async {
    if (_disposed || !enabled || busy || !hasDownload) {
      return;
    }
    try {
      await _platform.openPermissionSettings();
    } catch (error) {
      _fail(error);
    }
    _changed();
  }

  Future<void> onResume() => _resuming ??= _onResume().whenComplete(() => _resuming = null);

  Future<void> _onResume() async {
    if (_disposed) {
      return;
    }
    if (hasDownload && !busy) {
      final file = _downloaded;
      final operation = _operation;
      try {
        final allowed = await _platform.canInstall();
        if (_disposed || busy || operation != _operation || !identical(file, _downloaded)) {
          return;
        }
        phase = allowed ? PholyUpdatePhase.ready : PholyUpdatePhase.permission;
        errorCode = null;
      } catch (error) {
        if (_disposed || busy || operation != _operation || !identical(file, _downloaded)) {
          return;
        }
        _fail(error);
      }
      _changed();
    } else {
      await check(automatically: true);
    }
  }

  Future<void> install() async {
    final file = _downloaded;
    final build = availableBuild;
    final app = installed;
    if (_disposed || !enabled || busy || file == null || build == null || app == null) {
      return;
    }
    _operation++;
    phase = PholyUpdatePhase.installing;
    errorCode = null;
    _changed();
    try {
      final allowed = await _platform.canInstall();
      if (_disposed) {
        return;
      }
      if (!allowed) {
        phase = PholyUpdatePhase.permission;
      } else {
        await _platform.install(file, build, app.packageName);
        // Android has opened its consent UI. This is deliberately not a
        // success state; only a subsequent installed version proves success.
        phase = PholyUpdatePhase.installerOpened;
      }
    } catch (error) {
      if (error is PlatformException && error.code == 'install_permission_required') {
        phase = PholyUpdatePhase.permission;
      } else {
        _fail(error);
      }
    }
    _changed();
  }

  Future<void> discardDownload() async {
    if (_disposed || busy) {
      return;
    }
    _discarding = true;
    _operation++;
    final file = _downloaded;
    _changed();
    try {
      if (file != null) {
        await file.delete();
      }
    } on FileSystemException {
      // Only our original download is removed. The native verified copy may
      // still be read by Android and is never traversed or deleted here.
    }
    _downloaded = null;
    _discarding = false;
    phase = availableBuild == null ? PholyUpdatePhase.idle : PholyUpdatePhase.available;
    errorCode = null;
    _changed();
  }

  void _fail(Object error) {
    errorCode = switch (error) {
      PholyUpdateException() => error.code,
      PlatformException() => error.code,
      _ => 'update_io_error',
    };
    phase = PholyUpdatePhase.failed;
  }

  @override
  void dispose() {
    _disposed = true;
    _operation++;
    _cancellation?.cancel();
    super.dispose();
  }
}
