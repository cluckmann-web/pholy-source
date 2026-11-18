import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:immich_mobile/services/pholy_update.service.dart';
import 'package:path/path.dart' as path;

final _apk = utf8.encode('Synthetic PHOLY APK bytes; native package validation is tested separately.');
final _apkUrl = Uri.parse(
  'https://github.com/cluckmann-web/pholy-source/releases/download/mobile-3.4.1-2/PHOLY-arm64.apk',
);

Map<String, dynamic> _buildMap({String abi = 'arm64-v8a'}) => {
  'abi': abi,
  'versionCode': 3042202,
  'minSdk': 26,
  'bytes': _apk.length,
  'sha256': crypto.sha256.convert(_apk).toString(),
  'url': _apkUrl.toString(),
};

Map<String, dynamic> _feed() => {
  'schemaVersion': 1,
  'channel': 'android-test',
  'packageName': 'de.pholy.app.test',
  'version': '3.4.1-pholy-mobile.2',
  'notes': {'de': 'Updatefunktion und Impressum.', 'en': 'Updates and legal notice.'},
  'sourceUrl': 'https://github.com/cluckmann-web/pholy-source/tree/mobile-3.4.1-2',
  'publishedAt': '2026-11-18T12:00:00Z',
  'builds': [_buildMap(abi: 'x86_64'), _buildMap()],
};

PholyInstalledApp _installed(
  String directory, {
  List<String> abis = const ['arm64-v8a', 'armeabi-v7a'],
  int sdk = 35,
  String packageName = 'de.pholy.app.test',
  bool enabled = true,
}) => PholyInstalledApp(
  packageName: packageName,
  versionCode: 3042201,
  versionName: '3.4.1-pholy-mobile.1',
  supportedAbis: abis,
  sdkInt: sdk,
  signingCertificateSha256: ['a' * 64],
  updateDirectory: directory,
  sideloadUpdatesEnabled: enabled,
);

Matcher _fails(String code) => throwsA(isA<PholyUpdateException>().having((error) => error.code, 'code', code));

class _Client extends http.BaseClient {
  _Client(this.respond);

  final FutureOr<http.StreamedResponse> Function(http.BaseRequest request) respond;
  final requests = <http.BaseRequest>[];
  bool closed = false;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    requests.add(request);
    return await respond(request);
  }

  @override
  void close() => closed = true;
}

http.StreamedResponse _bytes(List<int> bytes, {int? length, Map<String, String> headers = const {}}) =>
    http.StreamedResponse(Stream.value(bytes), 200, contentLength: length, headers: headers);

void main() {
  test('manifest selects Android preference order and enforces SDK/package compatibility', () {
    final release = PholyUpdateRelease.fromMap(_feed());
    expect(release.version, '3.4.1-pholy-mobile.2');
    expect(release.notesDe, 'Updatefunktion und Impressum.');
    expect(release.publishedAt, DateTime.utc(2026, 11, 18, 12));
    expect(release.compatibleBuild(_installed('/private/pholy-updates'))?.abi, 'arm64-v8a');
    expect(release.compatibleBuild(_installed('/private/pholy-updates', abis: ['x86_64']))?.abi, 'x86_64');
    expect(release.compatibleBuild(_installed('/private/pholy-updates', abis: ['x86'])), isNull);
    expect(release.compatibleBuild(_installed('/private/pholy-updates', sdk: 25)), isNull);
    expect(release.compatibleBuild(_installed('/private/pholy-updates', packageName: 'de.pholy.app')), isNull);
  });

  test('native installed information retains certificate hashes and rejects malformed fields', () {
    final map = <dynamic, dynamic>{
      'packageName': 'de.pholy.app.test',
      'versionCode': 3042201,
      'versionName': '3.4.1-pholy-mobile.1',
      'supportedAbis': ['arm64-v8a', 'armeabi-v7a'],
      'sdkInt': 35,
      'signingCertificateSha256': ['A' * 64],
      'updateDirectory': '/private/pholy-updates',
      'sideloadUpdatesEnabled': true,
    };
    final installed = PholyInstalledApp.fromMap(map);
    expect(installed.signingCertificateSha256, ['a' * 64]);
    expect(installed.sideloadUpdatesEnabled, isTrue);
    expect(() => PholyInstalledApp.fromMap({...map, 'updateDirectory': '../outside'}), _fails('incompatible'));
    expect(
      () => PholyInstalledApp.fromMap({
        ...map,
        'supportedAbis': [1],
      }),
      _fails('incompatible'),
    );
    expect(() => PholyInstalledApp.fromMap({...map, 'signingCertificateSha256': []}), _fails('incompatible'));
    expect(() => PholyInstalledApp.fromMap({...map, 'sideloadUpdatesEnabled': 'true'}), _fails('incompatible'));
  });

  final invalidFeeds = <String, void Function(Map<String, dynamic>)>{
    'wrong schema': (feed) => feed['schemaVersion'] = 2,
    'floating schema': (feed) => feed['schemaVersion'] = 1.0,
    'wrong package': (feed) => feed['packageName'] = 'de.pholy.app',
    'wrong channel': (feed) => feed['channel'] = 'stable',
    'unknown field': (feed) => feed['installCommand'] = 'untrusted',
    'no builds': (feed) => feed['builds'] = [],
    'duplicate ABI': (feed) => feed['builds'] = [_buildMap(), _buildMap()],
    'unsupported ABI': (feed) => feed['builds'] = [_buildMap(abi: 'x86')],
    'missing hash': (feed) => (feed['builds'] as List).first.remove('sha256'),
    'malformed hash': (feed) => (feed['builds'] as List).first['sha256'] = 'zz' * 32,
    'zero bytes': (feed) => (feed['builds'] as List).first['bytes'] = 0,
    'oversized APK': (feed) => (feed['builds'] as List).first['bytes'] = 250 * 1024 * 1024 + 1,
    'floating size': (feed) => (feed['builds'] as List).first['bytes'] = 12.0,
    'text versionCode': (feed) => (feed['builds'] as List).first['versionCode'] = '3042202',
    'negative SDK': (feed) => (feed['builds'] as List).first['minSdk'] = -1,
    'invalid release version': (feed) => feed['version'] = '<script>',
    'invalid calendar date': (feed) => feed['publishedAt'] = '2026-02-30T12:00:00Z',
    'timezone missing': (feed) => feed['publishedAt'] = '2026-11-18T12:00:00',
    'wrong notes type': (feed) => feed['notes'] = 'text',
    'control character': (feed) => feed['notes'] = {'de': '\u0000', 'en': ''},
    'untrusted source': (feed) => feed['sourceUrl'] = 'https://example.com/pholy-source',
  };
  for (final entry in invalidFeeds.entries) {
    test('rejects manifest: ${entry.key}', () {
      final feed = _feed();
      entry.value(feed);
      expect(() => PholyUpdateRelease.fromMap(feed), _fails('invalid_feed'));
    });
  }

  for (final url in [
    'http://github.com/cluckmann-web/pholy-source/releases/download/tag/test.apk',
    'https://github.com.evil.example/cluckmann-web/pholy-source/releases/download/tag/test.apk',
    'https://user:password@github.com/cluckmann-web/pholy-source/releases/download/tag/test.apk',
    'https://github.com:444/cluckmann-web/pholy-source/releases/download/tag/test.apk',
    'https://github.com/cluckmann-web/pholy-source-evil/releases/download/tag/test.apk',
    'https://github.com/cluckmann-web/pholy-source/releases/download/tag/test.apk?access_token=secret',
    'https://github.com/cluckmann-web/pholy-source/releases/download/tag/test.apk#fragment',
    'https://github.com/cluckmann-web/pholy-source/releases/download/tag/test.apk/extra',
    'https://github.com/cluckmann-web/pholy-source/releases/download/tag/file.zip',
    'https://release-assets.githubusercontent.com/unpinned.apk',
  ]) {
    test('rejects unsafe initial APK URL $url', () {
      expect(() => PholyUpdateBuild.fromMap({..._buildMap(), 'url': url}), _fails('invalid_feed'));
    });
  }

  test('feed request is fixed, bounded, public, and never automatically follows redirects', () async {
    final client = _Client((_) => _bytes(utf8.encode(jsonEncode(_feed()))));
    final release = await PholyUpdateService(clientFactory: () => client).fetchLatest();
    expect(release.builds.length, 2);
    final request = client.requests.single;
    expect(
      request.url.toString(),
      'https://raw.githubusercontent.com/cluckmann-web/pholy-source/main/mobile/updates/android-test.json',
    );
    expect(request.followRedirects, isFalse);
    expect(
      request.headers.keys.map((key) => key.toLowerCase()),
      unorderedEquals(['accept', 'accept-encoding', 'cache-control']),
    );
    expect(client.closed, isTrue);
  });

  test('feed caps both declared and streamed bytes and rejects malformed JSON/encoding', () async {
    final responses = [
      _bytes([], length: 64 * 1024 + 1),
      _bytes(List.filled(64 * 1024 + 1, 32)),
      _bytes(utf8.encode('{not json}')),
      _bytes([0xff, 0xff]),
      _bytes(utf8.encode(jsonEncode(_feed())), headers: {'content-encoding': 'gzip'}),
    ];
    for (final response in responses) {
      final client = _Client((_) => response);
      await expectLater(PholyUpdateService(clientFactory: () => client).fetchLatest(), _fails('invalid_feed'));
      expect(client.closed, isTrue);
    }
  });

  test('feed redirects and unavailable responses fail without a second request', () async {
    for (final status in [302, 404, 503]) {
      final client = _Client(
        (_) => http.StreamedResponse(Stream.value([]), status, headers: {'location': 'https://evil.example'}),
      );
      await expectLater(PholyUpdateService(clientFactory: () => client).fetchLatest(), _fails('network'));
      expect(client.requests.length, 1);
      expect(client.closed, isTrue);
    }
  });

  group('private streaming download', () {
    late Directory directory;
    late PholyInstalledApp installed;
    late PholyUpdateBuild build;

    setUp(() async {
      directory = await Directory.systemTemp.createTemp('pholy-update-service-');
      installed = _installed(await directory.resolveSymbolicLinks());
      build = PholyUpdateBuild.fromMap(_buildMap());
      await Directory(path.join(directory.path, 'verified')).create();
      await File(path.join(directory.path, 'verified', 'keep.apk')).writeAsString('Native installer snapshot');
      await File(path.join(directory.path, 'keep.apk')).writeAsString('Unrelated earlier download');
    });

    tearDown(() async {
      await directory.delete(recursive: true);
    });

    Future<void> noDownloadRemains() async {
      final names = await directory.list().map((entry) => path.basename(entry.path)).toList();
      expect(names, unorderedEquals(['verified', 'keep.apk']));
      expect(await File(path.join(directory.path, 'verified', 'keep.apk')).readAsString(), 'Native installer snapshot');
      expect(await File(path.join(directory.path, 'keep.apk')).readAsString(), 'Unrelated earlier download');
    }

    Future<File> download(_Client client, {PholyUpdateCancellation? cancellation, void Function(int, int)? progress}) =>
        PholyUpdateService(clientFactory: () => client).download(
          build,
          installed,
          onProgress: progress ?? (_, _) {},
          cancellation: cancellation ?? PholyUpdateCancellation(),
        );

    test('cache cleanup removes installed or expired own files and preserves recent/foreign/verified files', () async {
      final token = 'a' * 24;
      final removed = [
        'pholy-3042201-$token.apk',
        'pholy-3042200-$token.apk',
        'pholy-3042202-$token.apk',
        'pholy-3042202-$token.part',
      ];
      final kept = [
        'pholy-3042203-$token.apk',
        'pholy-3042203-$token.part',
        'pholy-3042201-too-short.apk',
        'pholy-not-a-version-$token.apk',
      ];
      for (final name in [...removed, ...kept]) {
        await File(path.join(directory.path, name)).writeAsString('Synthetic download');
      }
      for (final name in removed.skip(2)) {
        await File(path.join(directory.path, name)).setLastModified(DateTime.now().subtract(const Duration(days: 8)));
      }
      final snapshot = File(path.join(directory.path, 'verified', 'pholy-3042200-$token.apk'));
      await snapshot.writeAsString('Native snapshot must remain');
      await snapshot.setLastModified(DateTime.now().subtract(const Duration(days: 8)));
      await PholyUpdateService().cleanupPreviousDownloads(installed);

      final names = await directory.list().map((entry) => path.basename(entry.path)).toList();
      expect(names, unorderedEquals(['keep.apk', 'verified', ...kept]));
      expect(await snapshot.readAsString(), 'Native snapshot must remain');
    });

    test('cache cleanup ignores matching symlinks and rejects a symlinked or absent root without throwing', () async {
      final target = File(path.join(directory.path, 'keep.apk'));
      final linkedFile = await Link(path.join(directory.path, 'pholy-1-${'b' * 24}.apk')).create(target.path);
      await PholyUpdateService().cleanupPreviousDownloads(installed);
      expect(FileSystemEntity.typeSync(linkedFile.path, followLinks: false), FileSystemEntityType.link);
      expect(await target.readAsString(), 'Unrelated earlier download');

      final ownFile = File(path.join(directory.path, 'pholy-1-${'c' * 24}.apk'));
      await ownFile.writeAsString('Do not traverse alias');
      final alias = await Link('${directory.path}-alias').create(directory.path);
      addTearDown(alias.delete);
      await PholyUpdateService().cleanupPreviousDownloads(_installed(alias.path));
      await PholyUpdateService().cleanupPreviousDownloads(_installed('${directory.path}/absent'));
      expect(await ownFile.readAsString(), 'Do not traverse alias');
    });

    test('allows controlled CDN redirects, hashes streamed bytes, and atomically returns one APK', () async {
      final progress = <int>[];
      final client = _Client((request) {
        if (request.url.host == 'github.com') {
          return http.StreamedResponse(
            Stream.value([]),
            302,
            headers: {
              'location':
                  'https://release-assets.githubusercontent.com/github-production-release-asset/1/file?signature=public',
            },
          );
        }
        if (request.url.host == 'release-assets.githubusercontent.com') {
          return http.StreamedResponse(
            Stream.value([]),
            307,
            headers: {
              'location':
                  'https://objects.githubusercontent.com/github-production-release-asset/1/file?signature=public',
            },
          );
        }
        return http.StreamedResponse(
          Stream.fromIterable([_apk.sublist(0, 3), _apk.sublist(3)]),
          200,
          contentLength: _apk.length,
        );
      });
      final file = await download(
        client,
        progress: (received, total) {
          expect(total, _apk.length);
          progress.add(received);
        },
      );
      expect(await file.readAsBytes(), _apk);
      expect(path.dirname(file.path), installed.updateDirectory);
      expect(file.path, endsWith('.apk'));
      expect(progress, [0, 3, _apk.length]);
      expect(client.requests.length, 3);
      expect(client.requests.every((request) => !request.followRedirects), isTrue);
      expect(
        client.requests.every(
          (request) => request.headers.keys.every(
            (key) => {'accept', 'accept-encoding', 'cache-control'}.contains(key.toLowerCase()),
          ),
        ),
        isTrue,
      );
      expect(client.closed, isTrue);
      await file.delete();
      await noDownloadRemains();
    });

    for (final target in [
      'http://release-assets.githubusercontent.com/file',
      'https://evil.example/file.apk',
      'https://release-assets.githubusercontent.com.evil.example/file',
      'https://user@objects.githubusercontent.com/file',
      'https://objects.githubusercontent.com:444/file',
      'https://github.com/another/repository/releases/download/tag/file.apk',
      'https://objects.githubusercontent.com/file#fragment',
    ]) {
      test('stops untrusted redirect $target before requesting it', () async {
        final client = _Client((_) => http.StreamedResponse(Stream.value([]), 302, headers: {'location': target}));
        await expectLater(download(client), _fails('network'));
        expect(client.requests.length, 1);
        expect(client.closed, isTrue);
        await noDownloadRemains();
      });
    }

    test('redirect loops stop after five allowed hops', () async {
      final client = _Client(
        (_) => http.StreamedResponse(
          Stream.value([]),
          302,
          headers: {'location': 'https://objects.githubusercontent.com/loop'},
        ),
      );
      await expectLater(download(client), _fails('network'));
      expect(client.requests.length, 6);
      await noDownloadRemains();
    });

    test('rejects same-length tampering and removes only its partial file', () async {
      final tampered = List<int>.of(_apk)..[0] ^= 1;
      final client = _Client((_) => _bytes(tampered, length: _apk.length));
      await expectLater(download(client), _fails('checksum_mismatch'));
      expect(client.closed, isTrue);
      await noDownloadRemains();
    });

    test('rejects truncation, streamed overrun and declared length mismatch', () async {
      for (final response in [
        _bytes(_apk.sublist(1)),
        _bytes([..._apk, 0]),
        _bytes(_apk, length: _apk.length + 1),
      ]) {
        final client = _Client((_) => response);
        await expectLater(download(client), _fails('size_mismatch'));
        await noDownloadRemains();
      }
    });

    test('incompatible device/package/build channel is rejected before networking', () async {
      for (final app in [
        _installed(directory.path, sdk: 25),
        _installed(directory.path, abis: ['x86']),
        _installed(directory.path, packageName: 'de.pholy.app'),
        _installed(directory.path, enabled: false),
      ]) {
        final client = _Client((_) => _bytes(_apk));
        await expectLater(
          PholyUpdateService(
            clientFactory: () => client,
          ).download(build, app, onProgress: (_, _) {}, cancellation: PholyUpdateCancellation()),
          _fails('incompatible'),
        );
        expect(client.requests, isEmpty);
      }
      await noDownloadRemains();
    });

    test('rejects a symlinked update root without touching its target', () async {
      final link = await Link('${directory.path}-link').create(directory.path);
      addTearDown(link.delete);
      final client = _Client((_) => _bytes(_apk));
      await expectLater(
        PholyUpdateService(
          clientFactory: () => client,
        ).download(build, _installed(link.path), onProgress: (_, _) {}, cancellation: PholyUpdateCancellation()),
        _fails('storage'),
      );
      expect(client.requests, isEmpty);
      await noDownloadRemains();
    });

    test('a token cancelled before download opens no connection and creates no file', () async {
      final cancellation = PholyUpdateCancellation()..cancel();
      final client = _Client((_) => _bytes(_apk));
      await expectLater(download(client, cancellation: cancellation), _fails('cancelled'));
      expect(client.requests, isEmpty);
      await noDownloadRemains();
    });

    test('cancellation during streaming closes the client and removes the partial file', () async {
      final cancellation = PholyUpdateCancellation();
      final client = _Client(
        (_) => http.StreamedResponse(Stream.fromIterable([_apk.sublist(0, 3), _apk.sublist(3)]), 200),
      );
      await expectLater(
        download(
          client,
          cancellation: cancellation,
          progress: (received, _) {
            if (received > 0) {
              cancellation.cancel();
            }
          },
        ),
        _fails('cancelled'),
      );
      expect(client.closed, isTrue);
      expect(cancellation.isCancelled, isTrue);
      await noDownloadRemains();
    });

    test('cancellation also interrupts a stalled response body whose client does not end its stream', () async {
      final listening = Completer<void>();
      final stream = StreamController<List<int>>(onListen: listening.complete);
      final cancellation = PholyUpdateCancellation();
      final client = _Client((_) => http.StreamedResponse(stream.stream, 200));
      final outcome = expectLater(download(client, cancellation: cancellation), _fails('cancelled'));
      await listening.future;
      cancellation.cancel();
      await outcome.timeout(const Duration(seconds: 1));
      await stream.close();
      expect(client.closed, isTrue);
      await noDownloadRemains();
    });

    test('cancellation interrupts a pending connection immediately', () async {
      final requested = Completer<void>();
      final pending = Completer<http.StreamedResponse>();
      final cancellation = PholyUpdateCancellation();
      final client = _Client((_) {
        requested.complete();
        return pending.future;
      });
      final outcome = expectLater(download(client, cancellation: cancellation), _fails('cancelled'));
      await requested.future;
      cancellation.cancel();
      await outcome.timeout(const Duration(seconds: 1));
      pending.completeError(const SocketException('Cancelled connection'));
      await Future<void>.delayed(Duration.zero);
      expect(client.closed, isTrue);
      await noDownloadRemains();
    });

    test('connection and idle body timeouts close the client and clean up', () async {
      final pending = Completer<http.StreamedResponse>();
      final clients = [
        _Client((_) => pending.future),
        _Client(
          (_) => http.StreamedResponse(
            const Stream<List<int>>.empty().transform(StreamTransformer.fromHandlers(handleDone: (_) {})),
            200,
          ),
        ),
      ];
      for (final client in clients) {
        final service = PholyUpdateService(
          clientFactory: () => client,
          connectTimeout: const Duration(milliseconds: 15),
          readTimeout: const Duration(milliseconds: 15),
        );
        await expectLater(
          service.download(build, installed, onProgress: (_, _) {}, cancellation: PholyUpdateCancellation()),
          _fails('network'),
        );
        expect(client.closed, isTrue);
        await noDownloadRemains();
      }
      pending.completeError(const SocketException('Connection timed out'));
      await Future<void>.delayed(Duration.zero);
    });
  });
}
