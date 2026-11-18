import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';

/// An in-memory, loopback-only PHOLY/Immich contract fixture. No external service,
/// real account, SMTP connection, database or user media is accessed by this file.
class PholySmokeFixture {
  PholySmokeFixture._(this._server, this.photo);

  static const port = 17415;
  static const baseUrl = 'http://127.0.0.1:$port';
  static const userId = '11111111-1111-4111-8111-111111111111';
  static const otherUserId = '22222222-2222-4222-8222-222222222222';
  static const photoId = '33333333-3333-4333-8333-333333333333';
  static const secondPhotoId = '44444444-4444-4444-8444-444444444444';
  static const uploadedPhotoId = '55555555-5555-4555-8555-555555555555';
  static const albumId = '66666666-6666-4666-8666-666666666666';
  static const otherCommentId = '77777777-7777-4777-8777-777777777777';
  static const ownCommentId = '88888888-8888-4888-8888-888888888888';
  static const profileSlug = 'synthetic-gallery';
  static const email = 'pholy-mobile-smoke@example.test';
  static const password = 'synthetic-only-password';
  static const sessionToken = 'synthetic-pholy-smoke-session';
  static const timestamp = '2026-11-18T09:00:00.000Z';

  final HttpServer _server;
  final Uint8List photo;
  final List<WebSocket> _sockets = [];
  final List<Timer> _pingTimers = [];
  final List<String> unexpectedRequests = [];
  final List<Map<String, Object?>> commentRequests = [];
  final List<Map<String, Object?>> loginRequestDiagnostics = [];
  final List<String> errors = [];
  final Map<String, List<Map<String, dynamic>>> _discussions = {};
  int loginAttempts = 0;
  int successfulLogins = 0;
  int syncRequests = 0;
  int syncAcks = 0;
  int imageRequests = 0;
  int publicImageRequests = 0;
  int uploadRequests = 0;
  int uploadedBytes = 0;
  bool uploadIncludedAssetData = false;
  bool uploadIncludedDates = false;
  int passwordResetRequests = 0;
  int invalidContextRequests = 0;
  int deniedMutationRequests = 0;
  int _commentSequence = 0;
  bool followsProfile = false;

  static Future<PholySmokeFixture> start() async {
    final photo = await _makePhoto();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    final fixture = PholySmokeFixture._(server, photo);
    server.listen(
      (request) => unawaited(
        fixture._route(request).catchError((Object error, StackTrace stack) async {
          fixture.errors.add(error.toString());
          try {
            request.response.statusCode = 500;
            await request.response.close();
          } catch (_) {
            // Closing a request during test teardown is expected.
          }
        }),
      ),
    );
    return fixture;
  }

  static Future<Uint8List> _makePhoto() async {
    final recorder = ui.PictureRecorder();
    final canvas = ui.Canvas(recorder);
    canvas.drawRect(const ui.Rect.fromLTWH(0, 0, 640, 480), ui.Paint()..color = const ui.Color(0xFFECE9DA));
    canvas.drawRect(const ui.Rect.fromLTWH(0, 0, 640, 275), ui.Paint()..color = const ui.Color(0xFFB9D7CE));
    canvas.drawCircle(const ui.Offset(455, 120), 54, ui.Paint()..color = const ui.Color(0xFFF7F3E7));
    final hills = ui.Path()
      ..moveTo(0, 360)
      ..lineTo(170, 170)
      ..lineTo(355, 365)
      ..lineTo(480, 240)
      ..lineTo(640, 390)
      ..lineTo(640, 480)
      ..lineTo(0, 480)
      ..close();
    canvas.drawPath(hills, ui.Paint()..color = const ui.Color(0xFF143E35));
    final picture = recorder.endRecording();
    final image = await picture.toImage(640, 480);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    image.dispose();
    picture.dispose();
    return data!.buffer.asUint8List();
  }

  bool _authenticated(HttpRequest request) =>
      request.cookies.any((cookie) => cookie.name == 'immich_access_token' && cookie.value == sessionToken) ||
      request.headers.value('authorization') == 'Bearer $sessionToken' ||
      request.headers.value('x-immich-user-token') == sessionToken;

  Future<Map<String, dynamic>> _body(HttpRequest request) async {
    final value = await utf8.decoder.bind(request).join();
    return value.isEmpty ? <String, dynamic>{} : jsonDecode(value) as Map<String, dynamic>;
  }

  Future<void> _json(HttpRequest request, Object? body, {int status = 200}) async {
    request.response
      ..statusCode = status
      ..headers.contentType = ContentType.json
      ..headers.set('Cache-Control', 'no-store')
      ..write(jsonEncode(body));
    await request.response.close();
  }

  Future<void> _empty(HttpRequest request, {int status = 204}) async {
    request.response.statusCode = status;
    await request.response.close();
  }

  Future<void> _image(HttpRequest request, {bool public = false}) async {
    if (public) {
      publicImageRequests++;
    } else {
      imageRequests++;
    }
    request.response
      ..statusCode = 200
      ..headers.contentType = ContentType('image', 'png')
      ..headers.set('Cache-Control', 'no-store')
      ..add(photo);
    await request.response.close();
  }

  Future<void> _route(HttpRequest request) async {
    final path = request.uri.path;
    final method = request.method;
    if (path == '/.well-known/immich') {
      return _json(request, {
        'api': {'endpoint': '$baseUrl/api'},
      });
    }
    if (path == '/api/server/ping') {
      return _json(request, {'res': 'pong'});
    }
    if (path == '/api/server/version') {
      return _json(request, {'major': 3, 'minor': 4, 'patch': 1});
    }
    if (path == '/api/server/features') {
      return _json(request, {
        for (final name in [
          'backups',
          'configFile',
          'duplicateDetection',
          'email',
          'facialRecognition',
          'importFaces',
          'map',
          'oauth',
          'oauthAutoLaunch',
          'ocr',
          'realtimeTranscoding',
          'reverseGeocoding',
          'search',
          'sidecar',
          'smartSearch',
          'trash',
        ])
          name: false,
        'passwordLogin': true,
      });
    }
    if (path == '/api/server/config') {
      return _json(request, {
        'externalDomain': baseUrl,
        'isInitialized': true,
        'isOnboarded': true,
        'loginPageMessage': '',
        'maintenanceMode': false,
        'mapDarkStyleUrl': '',
        'mapLightStyleUrl': '',
        'minFaces': 1,
        'oauthAccountManagementUrl': '',
        'oauthButtonText': '',
        'publicUsers': false,
        'trashDays': 30,
        'userDeleteDelay': 7,
      });
    }
    if (path == '/api/pholy/auth/status') {
      return _json(request, {'mailEnabled': true, 'passwordLoginEnabled': true});
    }
    if (path == '/api/pholy/auth/forgot-password') {
      await _body(request);
      passwordResetRequests++;
      return _json(request, {'accepted': true});
    }
    if (path == '/api/auth/login') {
      final body = await _body(request);
      loginAttempts++;
      final receivedEmail = body['email'];
      final receivedPassword = body['password'];
      final emailMatches = receivedEmail == email;
      final passwordMatches = receivedPassword == password;
      // Diagnose input/serialization failures without retaining credentials.
      loginRequestDiagnostics.add({
        'attempt': loginAttempts,
        'keys': body.keys.toList()..sort(),
        'emailMatches': emailMatches,
        'passwordMatches': passwordMatches,
        'emailType': receivedEmail.runtimeType.toString(),
        'passwordType': receivedPassword.runtimeType.toString(),
        'emailLength': receivedEmail is String ? receivedEmail.length : null,
        'passwordLength': receivedPassword is String ? receivedPassword.length : null,
      });
      if (!emailMatches || !passwordMatches) {
        return _json(request, {'message': 'Incorrect email or password', 'statusCode': 401}, status: 401);
      }
      successfulLogins++;
      request.response.cookies.add(
        Cookie('immich_access_token', sessionToken)
          ..path = '/'
          ..httpOnly = true,
      );
      request.response.cookies.add(Cookie('immich_is_authenticated', 'true')..path = '/');
      return _json(request, {
        'accessToken': sessionToken,
        'isAdmin': false,
        'isOnboarded': true,
        'name': 'Synthetic Member',
        'profileImagePath': '',
        'shouldChangePassword': false,
        'userEmail': email,
        'userId': userId,
      });
    }
    if (path == '/api/auth/logout') {
      request.response.cookies.add(
        Cookie('immich_access_token', '')
          ..path = '/'
          ..maxAge = 0,
      );
      return _json(request, {'successful': true, 'redirectUri': '/', 'response': 'ok'});
    }
    if (!_authenticated(request)) {
      return _json(request, {'message': 'Synthetic fixture session required', 'statusCode': 401}, status: 401);
    }
    if (path.contains('/socket.io') && WebSocketTransformer.isUpgradeRequest(request)) {
      final socket = await WebSocketTransformer.upgrade(request);
      _sockets.add(socket);
      socket.add(
        '0${jsonEncode({'sid': 'pholy-smoke', 'upgrades': [], 'pingInterval': 25000, 'pingTimeout': 20000, 'maxPayload': 1000000})}',
      );
      socket.listen((message) {
        if (message is String && message.startsWith('40')) {
          socket.add('40{"sid":"pholy-smoke"}');
        }
        if (message == '2') {
          socket.add('3');
        }
      });
      _pingTimers.add(
        Timer.periodic(const Duration(seconds: 20), (_) {
          if (socket.readyState == WebSocket.open) {
            socket.add('2');
          }
        }),
      );
      return;
    }
    if (path == '/api/users/me') {
      return _json(request, _user());
    }
    if (path == '/api/users/me/preferences') {
      return _json(request, _preferences);
    }
    if (path == '/api/users/me/onboarding') {
      return _json(request, {'isOnboarded': true});
    }
    if (path == '/api/users/me/license') {
      return _json(request, null);
    }
    if (path == '/api/server/storage') {
      return _json(request, {
        'diskAvailable': '9 GiB',
        'diskAvailableRaw': 9000000000,
        'diskSize': '10 GiB',
        'diskSizeRaw': 10000000000,
        'diskUse': '1 GiB',
        'diskUseRaw': 1000000000,
        'diskUsagePercentage': 10.0,
      });
    }
    if (path == '/api/sync/ack') {
      await request.drain<void>();
      if (method != 'DELETE') {
        syncAcks++;
      }
      request.response.statusCode = 204;
      await request.response.close();
      return;
    }
    if (path == '/api/sync/stream') {
      return _sync(request);
    }
    if (path == '/api/assets' && method == 'POST') {
      final bytes = await request.fold<List<int>>([], (result, chunk) => result..addAll(chunk));
      final multipart = latin1.decode(bytes);
      uploadRequests++;
      uploadedBytes = bytes.length;
      uploadIncludedAssetData =
          multipart.contains('name="assetData"') && multipart.contains('pholy-synthetic-upload.png');
      uploadIncludedDates = multipart.contains('name="fileCreatedAt"') && multipart.contains('name="fileModifiedAt"');
      return _json(request, {'id': uploadedPhotoId, 'status': 'created'}, status: 201);
    }
    final asset = RegExp(r'^/api/assets/([^/]+)(?:/(.*))?$').firstMatch(path);
    if (asset != null) {
      final id = asset.group(1)!;
      final suffix = asset.group(2);
      if (suffix == 'thumbnail' || suffix == 'original' || suffix == 'preview') {
        return _image(request);
      }
      if (suffix == 'metadata') {
        return _json(request, []);
      }
      if (suffix == null && method == 'GET') {
        return _json(request, _assetDetail(id));
      }
    }
    if (path == '/api/albums') {
      return _json(request, []);
    }
    if (path == '/api/partners' || path.startsWith('/api/memories') || path == '/api/activities') {
      return _json(request, []);
    }
    if (path == '/api/activities/statistics') {
      return _json(request, {'comments': 0});
    }
    if (path.startsWith('/api/pholy/community/')) {
      return _community(request);
    }
    if (path.startsWith('/api/pholy/comments/')) {
      return _comments(request);
    }
    unexpectedRequests.add('$method $path');
    return _json(request, {'message': 'Unimplemented synthetic fixture route', 'statusCode': 404}, status: 404);
  }

  Map<String, dynamic> _user() => {
    'id': userId,
    'email': email,
    'name': 'Synthetic Member',
    'avatarColor': 'primary',
    'clusterGroupId': '99999999-9999-4999-8999-999999999999',
    'createdAt': timestamp,
    'deletedAt': null,
    'isAdmin': false,
    'license': null,
    'oauthId': '',
    'profileChangedAt': timestamp,
    'profileImagePath': '',
    'quotaSizeInBytes': 10000000000,
    'quotaUsageInBytes': photo.length,
    'shouldChangePassword': false,
    'status': 'active',
    'storageLabel': null,
    'updatedAt': timestamp,
  };

  static const _preferences = {
    'albums': {'defaultAssetOrder': 'desc'},
    'cast': {'gCastEnabled': false},
    'download': {'archiveSize': 4000000000, 'includeEmbeddedVideos': false},
    'emailNotifications': {'albumInvite': false, 'albumUpdate': false, 'enabled': false},
    'folders': {'enabled': true, 'sidebarWeb': false},
    'memories': {'duration': 5, 'enabled': false, 'sidebarWeb': false},
    'people': {'enabled': false, 'sidebarWeb': false, 'updateStrategy': 'self'},
    'purchase': {'hideBuyButtonUntil': '2099-01-01T00:00:00.000Z', 'showSupportBadge': false},
    'ratings': {'enabled': false},
    'recentlyAdded': {'sidebarWeb': true},
    'sharedLinks': {'enabled': true, 'sidebarWeb': true},
    'tags': {'enabled': false, 'sidebarWeb': false},
  };

  Map<String, dynamic> _asset(String id) => {
    'id': id,
    'ownerId': userId,
    'checksum': base64Encode(sha1.convert(photo).bytes),
    'createdAt': timestamp,
    'deletedAt': null,
    'duration': null,
    'fileCreatedAt': timestamp,
    'fileModifiedAt': timestamp,
    'localDateTime': timestamp,
    'height': 480,
    'width': 640,
    'isEdited': false,
    'isFavorite': false,
    'libraryId': null,
    'livePhotoVideoId': null,
    'originalFileName': id == uploadedPhotoId ? 'pholy-synthetic-upload.png' : 'pholy-synthetic-landscape.png',
    'stackId': null,
    'thumbhash': null,
    'type': 'IMAGE',
    'visibility': 'timeline',
  };

  Map<String, dynamic> _assetDetail(String id) => {
    ..._asset(id),
    'hasMetadata': false,
    'isArchived': false,
    'isOffline': false,
    'isTrashed': false,
    'originalPath': '/synthetic/$id.png',
    'updatedAt': timestamp,
    'people': [],
    'tags': [],
  };

  Future<void> _sync(HttpRequest request) async {
    await _body(request);
    syncRequests++;
    final auth = {
      'id': userId,
      'name': 'Synthetic Member',
      'email': email,
      'hasProfileImage': false,
      'profileChangedAt': timestamp,
      'avatarColor': 'primary',
      'deletedAt': null,
      'isAdmin': false,
      'oauthId': null,
      'pinCode': null,
      'quotaSizeInBytes': 10000000000,
      'quotaUsageInBytes': photo.length,
      'storageLabel': null,
    };
    final events = <(String, Object)>[
      ('AuthUserV2', auth),
      ('UserV1', auth),
      ('AssetV2', _asset(photoId)),
      if (uploadRequests > 0) ('AssetV2', _asset(uploadedPhotoId)),
      (
        'AlbumV2',
        {
          'id': albumId,
          'createdAt': timestamp,
          'updatedAt': timestamp,
          'name': 'Synthetic album',
          'description': 'An in-memory test album',
          'isActivityEnabled': true,
          'order': 'desc',
          'thumbnailAssetId': photoId,
        },
      ),
      ('AlbumUserV1', {'albumId': albumId, 'userId': userId, 'role': 'owner'}),
      ('AlbumToAssetV1', {'albumId': albumId, 'assetId': photoId}),
      ('SyncCompleteV1', <String, Object>{}),
    ];
    request.response
      ..statusCode = 200
      ..headers.contentType = ContentType('application', 'jsonlines+json');
    for (var index = 0; index < events.length; index++) {
      final (type, data) = events[index];
      request.response.write('${jsonEncode({'type': type, 'data': data, 'ack': '$type|$syncRequests-$index'})}\n');
    }
    await request.response.close();
  }

  Future<void> _community(HttpRequest request) async {
    final path = request.uri.path;
    final profile = {
      'slug': profileSlug,
      'displayName': 'Synthetic Gallery',
      'bio': 'Only generated test images. No real people or media.',
    };
    if (path == '/api/pholy/community/profiles' || path == '/api/pholy/community/me/following') {
      return _json(request, {
        'profiles': [profile],
        'nextOffset': null,
      });
    }
    if (path == '/api/pholy/community/profiles/$profileSlug') {
      return _json(request, {
        ...profile,
        'followers': followsProfile ? 1 : 0,
        'assets': [
          {'id': photoId},
          {'id': secondPhotoId},
        ],
      });
    }
    if (path.endsWith('/relation') || path.endsWith('/follow')) {
      if (path.endsWith('/follow')) {
        followsProfile = request.method == 'PUT';
      }
      return _json(request, {'following': followsProfile, 'ownProfile': false});
    }
    if (path.contains('/assets/')) {
      return _image(request, public: true);
    }
    if (path == '/api/pholy/community/me') {
      return _json(request, {'profile': null, 'assets': []});
    }
    if (path == '/api/pholy/community/me/assets') {
      return _json(request, {'assets': [], 'nextOffset': null});
    }
    unexpectedRequests.add('${request.method} $path');
    return _json(request, {'message': 'Unknown synthetic community route'}, status: 404);
  }

  String? _scope(Map<String, dynamic> context) {
    if (context.containsKey('slug')) {
      return null;
    }
    return switch (context['kind']) {
      'private' when !context.containsKey('albumId') && !context.containsKey('profileSlug') => 'private',
      'album' when context['albumId'] == albumId && !context.containsKey('profileSlug') => 'album',
      'community' when context['profileSlug'] == profileSlug && !context.containsKey('albumId') => 'community',
      _ => null,
    };
  }

  Map<String, dynamic> _comment(String id, String assetId, String text, {bool own = false, String? parentId}) => {
    'id': id,
    'assetId': assetId,
    'parentId': parentId,
    'body': text,
    'createdAt': timestamp,
    'updatedAt': timestamp,
    'deleted': false,
    'author': {
      'id': own ? userId : otherUserId,
      'name': own ? 'Synthetic Member' : 'Synthetic Photographer',
      'avatarColor': 'primary',
      'hasProfileImage': true,
    },
    'likeCount': 0,
    'liked': false,
    'canEdit': own,
    'canDelete': own,
    'replies': <Map<String, dynamic>>[],
  };

  List<Map<String, dynamic>> _discussion(String assetId, String scope) => _discussions.putIfAbsent(
    '$scope:$assetId',
    () => [
      _comment(otherCommentId, assetId, 'A synthetic $scope comment'),
      if (scope == 'community' && assetId != secondPhotoId)
        _comment(ownCommentId, assetId, 'My synthetic public comment', own: true),
    ],
  );

  Future<void> _comments(HttpRequest request) async {
    final parts = request.uri.pathSegments;
    final assetId = parts[3];
    final method = request.method;
    final context = ['POST', 'PATCH', 'PUT'].contains(method)
        ? await _body(request)
        : <String, dynamic>{...request.uri.queryParameters};
    final scope = _scope(context);
    commentRequests.add({'method': method, 'assetId': assetId, ...context, 'path': request.uri.path});
    if (scope == null) {
      invalidContextRequests++;
      return _json(request, {'message': 'Invalid or mixed synthetic discussion scope'}, status: 400);
    }
    if (parts.length >= 5 && parts[4] == 'authors') {
      return _image(request, public: scope == 'community');
    }
    final comments = _discussion(assetId, scope);
    final writable = assetId != secondPhotoId;
    if (method == 'GET' && parts.length == 4) {
      return _json(request, {
        'comments': comments,
        'nextOffset': null,
        'total': comments.fold<int>(0, (total, comment) => total + 1 + (comment['replies'] as List).length),
        'canComment': writable,
      });
    }
    if (!writable) {
      deniedMutationRequests++;
      return _json(request, {'message': 'Synthetic discussion is read only'}, status: 403);
    }
    if (method == 'POST' && parts.length == 4) {
      final parentId = context['parentId'] as String?;
      final next = _comment(
        'a0000000-0000-4000-8000-${(++_commentSequence).toString().padLeft(12, '0')}',
        assetId,
        context['body'] as String,
        own: true,
        parentId: parentId,
      );
      if (parentId == null) {
        comments.add(next);
      } else {
        final parent = comments.singleWhere((comment) => comment['id'] == parentId);
        (parent['replies'] as List).add(next);
      }
      return _json(request, next, status: 201);
    }
    final commentId = parts[4];
    final candidates = [
      for (final comment in comments) comment,
      for (final comment in comments) ...(comment['replies'] as List).cast<Map<String, dynamic>>(),
    ];
    final matches = candidates.where((comment) => comment['id'] == commentId);
    if (matches.isEmpty) {
      return _json(request, {'message': 'Comment unavailable'}, status: 404);
    }
    final comment = matches.first;
    if (parts.length == 6 && parts[5] == 'like') {
      comment['liked'] = method == 'PUT';
      comment['likeCount'] = method == 'PUT' ? 1 : 0;
      return _empty(request);
    }
    if (comment['canEdit'] != true || comment['canDelete'] != true) {
      deniedMutationRequests++;
      return _json(request, {'message': 'Synthetic author permission denied'}, status: 403);
    }
    if (method == 'PATCH') {
      comment['body'] = context['body'];
      comment['updatedAt'] = '2026-11-18T09:05:00.000Z';
      return _json(request, comment);
    }
    if (method == 'DELETE') {
      comments.removeWhere((value) => value['id'] == commentId);
      for (final parent in comments) {
        (parent['replies'] as List).removeWhere((dynamic value) => (value as Map)['id'] == commentId);
      }
      return _empty(request);
    }
    return _json(request, {'message': 'Unsupported synthetic comment operation'}, status: 405);
  }

  Map<String, dynamic> get evidence => {
    'fixture': 'loopback-only; all accounts, comments and images synthetic',
    'loginAttempts': loginAttempts,
    'successfulLogins': successfulLogins,
    'loginRequestDiagnostics': loginRequestDiagnostics,
    'syncRequests': syncRequests,
    'syncAcks': syncAcks,
    'imageRequests': imageRequests,
    'publicImageRequests': publicImageRequests,
    'uploadRequests': uploadRequests,
    'uploadedBytes': uploadedBytes,
    'uploadIncludedAssetData': uploadIncludedAssetData,
    'uploadIncludedDates': uploadIncludedDates,
    'passwordResetRequests': passwordResetRequests,
    'invalidContextRequests': invalidContextRequests,
    'deniedMutationRequests': deniedMutationRequests,
    'commentMethods': commentRequests.map((request) => request['method']).toList(),
    'commentScopes': commentRequests.map((request) => request['kind']).toSet().toList(),
    'unexpectedRequests': unexpectedRequests,
    'fixtureErrors': errors,
  };

  Future<void> close() async {
    for (final timer in _pingTimers) {
      timer.cancel();
    }
    for (final socket in _sockets) {
      await socket.close();
    }
    await _server.close(force: true);
  }
}
