import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';
import 'package:path/path.dart' as path;

const _testPackage = String.fromEnvironment('PHOLY_UPDATE_PACKAGE', defaultValue: 'de.pholy.app.test');
const _testChannel = String.fromEnvironment('PHOLY_UPDATE_CHANNEL', defaultValue: 'android-test');
const _maxApkBytes = 250 * 1024 * 1024;
const _maxFeedBytes = 64 * 1024;
const _supportedAbis = {'arm64-v8a', 'armeabi-v7a', 'x86_64'};
final _sha256Pattern = RegExp(r'^[a-fA-F0-9]{64}$');

class PholyUpdateException implements Exception {
  const PholyUpdateException(this.code);

  final String code;

  @override
  String toString() => 'PholyUpdateException($code)';
}

class PholyInstalledApp {
  const PholyInstalledApp({
    required this.packageName,
    required this.versionCode,
    required this.versionName,
    required this.supportedAbis,
    required this.sdkInt,
    required this.signingCertificateSha256,
    required this.updateDirectory,
    required this.sideloadUpdatesEnabled,
  });

  factory PholyInstalledApp.fromMap(Map<dynamic, dynamic> map) {
    const error = 'incompatible';
    final abis = map['supportedAbis'];
    final signatures = map['signingCertificateSha256'];
    final directory = _string(map, 'updateDirectory', max: 4096, code: error);
    if (abis is! List ||
        abis.isEmpty ||
        abis.length > 16 ||
        abis.any((value) => value is! String || !RegExp(r'^[a-zA-Z0-9_-]{1,32}$').hasMatch(value)) ||
        signatures is! List ||
        signatures.isEmpty ||
        signatures.length > 16 ||
        signatures.any((value) => value is! String || !_sha256Pattern.hasMatch(value)) ||
        !path.isAbsolute(directory) ||
        map['sideloadUpdatesEnabled'] is! bool) {
      throw const PholyUpdateException(error);
    }
    return PholyInstalledApp(
      packageName: _string(map, 'packageName', max: 255, code: error),
      versionCode: _integer(map, 'versionCode', max: 2100000000, code: error),
      versionName: _string(map, 'versionName', max: 128, code: error),
      supportedAbis: List<String>.unmodifiable(abis.cast<String>()),
      sdkInt: _integer(map, 'sdkInt', max: 1000, code: error),
      signingCertificateSha256: List<String>.unmodifiable(
        signatures.cast<String>().map((value) => value.toLowerCase()),
      ),
      updateDirectory: directory,
      sideloadUpdatesEnabled: map['sideloadUpdatesEnabled'] as bool,
    );
  }

  final String packageName;
  final int versionCode;
  final String versionName;
  final List<String> supportedAbis;
  final int sdkInt;
  final List<String> signingCertificateSha256;
  final String updateDirectory;
  final bool sideloadUpdatesEnabled;
}

class PholyUpdateBuild {
  const PholyUpdateBuild({
    required this.abi,
    required this.versionCode,
    required this.minSdk,
    required this.bytes,
    required this.sha256,
    required this.url,
  });

  factory PholyUpdateBuild.fromMap(Map<dynamic, dynamic> map) {
    _keys(map, {'abi', 'versionCode', 'minSdk', 'bytes', 'sha256', 'url'});
    final build = PholyUpdateBuild(
      abi: _string(map, 'abi', max: 32),
      versionCode: _integer(map, 'versionCode', max: 2100000000),
      minSdk: _integer(map, 'minSdk', max: 1000),
      bytes: _integer(map, 'bytes', max: _maxApkBytes),
      sha256: _string(map, 'sha256', max: 64).toLowerCase(),
      url: _uri(map, 'url'),
    );
    build._validate();
    return build;
  }

  final String abi;
  final int versionCode;
  final int minSdk;
  final int bytes;
  final String sha256;
  final Uri url;

  void _validate() {
    if (!_supportedAbis.contains(abi) ||
        versionCode <= 0 ||
        versionCode > 2100000000 ||
        minSdk <= 0 ||
        minSdk > 1000 ||
        bytes <= 0 ||
        bytes > _maxApkBytes ||
        !_sha256Pattern.hasMatch(sha256) ||
        !_isReleaseUrl(url)) {
      throw const PholyUpdateException('invalid_feed');
    }
  }
}

class PholyUpdateRelease {
  const PholyUpdateRelease({
    this.schemaVersion = 1,
    this.channel = _testChannel,
    this.packageName = _testPackage,
    required this.version,
    required this.notesDe,
    required this.notesEn,
    required this.sourceUrl,
    required this.publishedAt,
    required this.builds,
  });

  factory PholyUpdateRelease.fromMap(Map<dynamic, dynamic> map) {
    _keys(map, {'schemaVersion', 'channel', 'packageName', 'version', 'notes', 'sourceUrl', 'publishedAt', 'builds'});
    if (map['schemaVersion'] != 1 ||
        map['schemaVersion'] is! int ||
        map['channel'] != _testChannel ||
        map['packageName'] != _testPackage) {
      throw const PholyUpdateException('invalid_feed');
    }
    final version = _string(map, 'version', max: 128);
    if (!RegExp(
      r'^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$',
    ).hasMatch(version)) {
      throw const PholyUpdateException('invalid_feed');
    }
    final notes = map['notes'];
    final rawBuilds = map['builds'];
    if (notes is! Map || rawBuilds is! List || rawBuilds.isEmpty || rawBuilds.length > _supportedAbis.length) {
      throw const PholyUpdateException('invalid_feed');
    }
    _keys(notes, {'de', 'en'});
    final source = _uri(map, 'sourceUrl');
    final published = _string(map, 'publishedAt', max: 40);
    final date = DateTime.tryParse(published);
    if (!_isSourceUrl(source) ||
        !RegExp(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$').hasMatch(published) ||
        date == null ||
        !date.isUtc ||
        date.toIso8601String().substring(0, 19) != published.substring(0, 19)) {
      throw const PholyUpdateException('invalid_feed');
    }
    final builds = <PholyUpdateBuild>[];
    final abis = <String>{};
    for (final item in rawBuilds) {
      if (item is! Map) {
        throw const PholyUpdateException('invalid_feed');
      }
      final build = PholyUpdateBuild.fromMap(item);
      if (!abis.add(build.abi)) {
        throw const PholyUpdateException('invalid_feed');
      }
      builds.add(build);
    }
    return PholyUpdateRelease(
      version: version,
      notesDe: _string(notes, 'de', max: 8192, allowEmpty: true, multiline: true),
      notesEn: _string(notes, 'en', max: 8192, allowEmpty: true, multiline: true),
      sourceUrl: source,
      publishedAt: date,
      builds: List<PholyUpdateBuild>.unmodifiable(builds),
    );
  }

  final int schemaVersion;
  final String channel;
  final String packageName;
  final String version;
  final String notesDe;
  final String notesEn;
  final Uri sourceUrl;
  final DateTime publishedAt;
  final List<PholyUpdateBuild> builds;

  /// Android's ABI preference order is authoritative. Version comparison is a
  /// separate controller decision, so an installed current release still fits.
  PholyUpdateBuild? compatibleBuild(PholyInstalledApp installed) {
    if (installed.packageName != packageName) {
      return null;
    }
    for (final abi in installed.supportedAbis) {
      for (final build in builds) {
        if (build.abi == abi && build.minSdk <= installed.sdkInt) {
          return build;
        }
      }
    }
    return null;
  }
}

class PholyUpdateCancellation {
  bool _cancelled = false;
  http.Client? _client;
  final _listeners = <void Function()>{};

  bool get isCancelled => _cancelled;

  void cancel() {
    if (_cancelled) {
      return;
    }
    _cancelled = true;
    try {
      _client?.close();
    } catch (_) {
      // Cancellation must still reach a pending read if a client cannot close.
    } finally {
      for (final listener in _listeners.toList()) {
        listener();
      }
      _listeners.clear();
    }
  }

  void _check() {
    if (_cancelled) {
      throw const PholyUpdateException('cancelled');
    }
  }

  void _attach(http.Client client) {
    _check();
    if (_client != null) {
      throw const PholyUpdateException('incompatible');
    }
    _client = client;
  }

  void _detach(http.Client client) {
    if (identical(_client, client)) {
      _client = null;
    }
  }

  Future<T> _race<T>(Future<T> operation) async {
    final result = Completer<T>();
    void cancelled() {
      if (!result.isCompleted) {
        result.completeError(const PholyUpdateException('cancelled'));
      }
    }

    if (_cancelled) {
      cancelled();
    } else {
      _listeners.add(cancelled);
    }
    unawaited(
      operation.then(
        (value) {
          if (!result.isCompleted) {
            result.complete(value);
          }
        },
        onError: (Object error, StackTrace stack) {
          if (!result.isCompleted) {
            result.completeError(error, stack);
          }
        },
      ),
    );
    try {
      return await result.future;
    } finally {
      _listeners.remove(cancelled);
    }
  }
}

/// Isolated public GitHub traffic: never uses the authenticated Immich client,
/// its custom headers, cookies, certificates or account settings.
class PholyUpdateService {
  PholyUpdateService({
    this.clientFactory,
    this.connectTimeout = const Duration(seconds: 15),
    this.readTimeout = const Duration(seconds: 20),
  });

  static final feedUri = Uri.https(
    'raw.githubusercontent.com',
    const String.fromEnvironment('PHOLY_UPDATE_FEED_PATH', defaultValue: '/cluckmann-web/pholy-source/main/mobile/updates/android-test.json'),
  );

  final http.Client Function()? clientFactory;
  final Duration connectTimeout;
  final Duration readTimeout;

  http.Client _newClient() =>
      clientFactory?.call() ??
      IOClient(
        HttpClient()
          ..connectionTimeout = connectTimeout
          ..idleTimeout = readTimeout
          ..autoUncompress = false,
      );

  /// Remove only this downloader's direct cache files. Native installer
  /// snapshots in verified/ and all other files remain untouched.
  Future<void> cleanupPreviousDownloads(PholyInstalledApp installed) async {
    try {
      final directory = Directory(installed.updateDirectory);
      if (!path.isAbsolute(directory.path) ||
          FileSystemEntity.typeSync(directory.path, followLinks: false) != FileSystemEntityType.directory ||
          await directory.resolveSymbolicLinks() != path.normalize(directory.path)) {
        return;
      }
      final expiresBefore = DateTime.now().subtract(const Duration(days: 7));
      final filename = RegExp(r'^pholy-([0-9]+)-[a-f0-9]{24}\.(part|apk)$');
      await for (final entry in directory.list(followLinks: false)) {
        if (entry is! File) {
          continue;
        }
        final match = filename.firstMatch(path.basename(entry.path));
        if (match == null) {
          continue;
        }
        try {
          if (FileSystemEntity.typeSync(entry.path, followLinks: false) != FileSystemEntityType.file) {
            continue;
          }
          final versionCode = int.tryParse(match.group(1)!);
          if (versionCode == null) {
            continue;
          }
          final installedOrOlder = match.group(2) == 'apk' && versionCode <= installed.versionCode;
          final expired = entry.statSync().modified.isBefore(expiresBefore);
          if (installedOrOlder || expired) {
            await entry.delete();
          }
        } catch (_) {
          // Another download or the OS may remove a cache file concurrently.
        }
      }
    } catch (_) {
      // Cache cleanup is optional and must never prevent opening PHOLY.
    }
  }

  Future<PholyUpdateRelease> fetchLatest() async {
    final client = _newClient();
    try {
      final response = await client.send(_request(feedUri, 'application/json')).timeout(connectTimeout);
      if (response.statusCode != 200) {
        await _discard(response);
        throw const PholyUpdateException('network');
      }
      if ((response.contentLength ?? 0) > _maxFeedBytes || !_identityEncoding(response)) {
        await _discard(response);
        throw const PholyUpdateException('invalid_feed');
      }
      final bytes = BytesBuilder(copy: false);
      await for (final chunk in response.stream.timeout(readTimeout)) {
        if (bytes.length + chunk.length > _maxFeedBytes) {
          throw const PholyUpdateException('invalid_feed');
        }
        bytes.add(chunk);
      }
      final decoded = jsonDecode(utf8.decode(bytes.takeBytes()));
      if (decoded is! Map) {
        throw const PholyUpdateException('invalid_feed');
      }
      return PholyUpdateRelease.fromMap(decoded);
    } on PholyUpdateException {
      rethrow;
    } on FormatException {
      throw const PholyUpdateException('invalid_feed');
    } on Object {
      throw const PholyUpdateException('network');
    } finally {
      client.close();
    }
  }

  Future<File> download(
    PholyUpdateBuild build,
    PholyInstalledApp installed, {
    required void Function(int received, int total) onProgress,
    required PholyUpdateCancellation cancellation,
  }) async {
    cancellation._check();
    build._validate();
    if (!installed.sideloadUpdatesEnabled ||
        installed.packageName != _testPackage ||
        !installed.supportedAbis.contains(build.abi) ||
        installed.sdkInt < build.minSdk) {
      throw const PholyUpdateException('incompatible');
    }
    final client = _newClient();
    File? partial;
    File? completed;
    RandomAccessFile? output;
    StreamIterator<List<int>>? chunks;
    var successful = false;
    try {
      cancellation._attach(client);
      final directory = Directory(installed.updateDirectory);
      if (!path.isAbsolute(directory.path) ||
          FileSystemEntity.typeSync(directory.path, followLinks: false) != FileSystemEntityType.directory ||
          await directory.resolveSymbolicLinks() != path.normalize(directory.path)) {
        throw const PholyUpdateException('storage');
      }
      cancellation._check();
      final response = await _apkResponse(client, build.url, cancellation);
      if ((response.contentLength != null && response.contentLength != build.bytes) || !_identityEncoding(response)) {
        await _discard(response);
        throw const PholyUpdateException('size_mismatch');
      }
      final random = Random.secure();
      final token = List.generate(12, (_) => random.nextInt(256).toRadixString(16).padLeft(2, '0')).join();
      final basename = 'pholy-${build.versionCode}-$token';
      final candidate = File(path.join(directory.path, '$basename.part'));
      await candidate.create(exclusive: true);
      partial = candidate;
      output = await partial.open(mode: FileMode.write);
      final digest = _DigestSink();
      final hasher = crypto.sha256.startChunkedConversion(digest);
      var received = 0;
      onProgress(0, build.bytes);
      chunks = StreamIterator(response.stream.timeout(readTimeout));
      while (await cancellation._race(chunks.moveNext())) {
        cancellation._check();
        final chunk = chunks.current;
        received += chunk.length;
        if (received > build.bytes || received > _maxApkBytes) {
          throw const PholyUpdateException('size_mismatch');
        }
        hasher.add(chunk);
        await output.writeFrom(chunk);
        cancellation._check();
        onProgress(received, build.bytes);
      }
      hasher.close();
      if (received != build.bytes) {
        throw const PholyUpdateException('size_mismatch');
      }
      if (digest.value?.toString() != build.sha256.toLowerCase()) {
        throw const PholyUpdateException('checksum_mismatch');
      }
      await output.flush();
      await output.close();
      output = null;
      cancellation._check();
      completed = await partial.rename(path.join(directory.path, '$basename.apk'));
      partial = null;
      cancellation._check();
      successful = true;
      return completed;
    } on PholyUpdateException {
      rethrow;
    } on FileSystemException {
      cancellation._check();
      throw const PholyUpdateException('storage');
    } on Object {
      cancellation._check();
      throw const PholyUpdateException('network');
    } finally {
      cancellation._detach(client);
      client.close();
      try {
        await chunks?.cancel();
      } catch (_) {
        // A failed HTTP cancellation must not prevent partial-file cleanup.
      }
      try {
        await output?.close();
      } on FileSystemException {
        // Preserve the original error; remove only this download's file below.
      }
      await _deleteOwnFile(partial);
      if (!successful) {
        await _deleteOwnFile(completed);
      }
    }
  }

  Future<http.StreamedResponse> _apkResponse(
    http.Client client,
    Uri initial,
    PholyUpdateCancellation cancellation,
  ) async {
    var uri = initial;
    for (var redirects = 0; ; redirects++) {
      cancellation._check();
      final response = await cancellation._race(
        client.send(_request(uri, 'application/octet-stream')).timeout(connectTimeout),
      );
      if (response.statusCode == 200) {
        return response;
      }
      final location = response.headers['location'];
      await _discard(response);
      if (!{301, 302, 303, 307, 308}.contains(response.statusCode) ||
          redirects >= 5 ||
          location == null ||
          location.length > 8192 ||
          RegExp(r'[\x00-\x20\x7f]').hasMatch(location)) {
        throw const PholyUpdateException('network');
      }
      final next = uri.resolve(location);
      if (!_isReleaseUrl(next) &&
          !(_isHttps(next) &&
              {'release-assets.githubusercontent.com', 'objects.githubusercontent.com'}.contains(next.host))) {
        throw const PholyUpdateException('network');
      }
      uri = next;
    }
  }
}

http.Request _request(Uri uri, String accept) => http.Request('GET', uri)
  ..followRedirects = false
  ..headers.addAll({'Accept': accept, 'Accept-Encoding': 'identity', 'Cache-Control': 'no-cache'});

bool _identityEncoding(http.StreamedResponse response) =>
    response.headers['content-encoding'] == null || response.headers['content-encoding']?.toLowerCase() == 'identity';

Future<void> _discard(http.StreamedResponse response) async {
  await response.stream.listen(null, onError: (Object _) {}).cancel();
}

Future<void> _deleteOwnFile(File? file) async {
  if (file == null) {
    return;
  }
  try {
    await file.delete();
  } on FileSystemException {
    // Never recursively delete the update root or the native verified/ folder.
  }
}

class _DigestSink implements Sink<crypto.Digest> {
  crypto.Digest? value;

  @override
  void add(crypto.Digest data) => value = data;

  @override
  void close() {}
}

void _keys(Map<dynamic, dynamic> map, Set<String> keys) {
  if (map.length != keys.length || !map.keys.every(keys.contains)) {
    throw const PholyUpdateException('invalid_feed');
  }
}

String _string(
  Map<dynamic, dynamic> map,
  String key, {
  required int max,
  bool allowEmpty = false,
  bool multiline = false,
  String code = 'invalid_feed',
}) {
  final value = map[key];
  if (value is! String ||
      (!allowEmpty && value.isEmpty) ||
      value.length > max ||
      (multiline ? RegExp(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]') : RegExp(r'[\x00-\x1f\x7f]')).hasMatch(value)) {
    throw PholyUpdateException(code);
  }
  return value;
}

int _integer(Map<dynamic, dynamic> map, String key, {required int max, String code = 'invalid_feed'}) {
  final value = map[key];
  if (value is! int || value <= 0 || value > max) {
    throw PholyUpdateException(code);
  }
  return value;
}

Uri _uri(Map<dynamic, dynamic> map, String key) {
  final uri = Uri.tryParse(_string(map, key, max: 2048));
  if (uri == null || !_isHttps(uri)) {
    throw const PholyUpdateException('invalid_feed');
  }
  return uri;
}

bool _isHttps(Uri uri) =>
    uri.scheme == 'https' &&
    uri.hasAuthority &&
    uri.host.isNotEmpty &&
    uri.port == 443 &&
    uri.userInfo.isEmpty &&
    !uri.hasFragment;

bool _isReleaseUrl(Uri uri) {
  if (!_isHttps(uri) || uri.host != 'github.com' || uri.hasQuery) {
    return false;
  }
  final parts = uri.pathSegments;
  return parts.length == 6 &&
      parts[0] == 'cluckmann-web' &&
      parts[1] == 'pholy-source' &&
      parts[2] == 'releases' &&
      parts[3] == 'download' &&
      parts[4].length <= 200 &&
      RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9._+/-]*$').hasMatch(parts[4]) &&
      !parts[4].split('/').any((part) => part == '..' || part == '.' || part.isEmpty) &&
      RegExp(r'^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,180}\.apk$').hasMatch(parts[5]);
}

bool _isSourceUrl(Uri uri) {
  if (!_isHttps(uri) || uri.hasQuery) {
    return false;
  }
  if (uri.host == 'pholy.de' && (uri.path == '/source/' || uri.path == '/source')) {
    return true;
  }
  final parts = uri.pathSegments;
  return uri.host == 'github.com' && parts.length >= 2 && parts[0] == 'cluckmann-web' && parts[1] == 'pholy-source';
}
