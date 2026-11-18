import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:immich_mobile/pholy/community/community.model.dart';

class CommunityRequestException implements Exception {
  const CommunityRequestException(this.statusCode, this.message);
  final int statusCode;
  final String message;

  @override
  String toString() => message;
}

/// Uses the app's existing native HTTP client, including the current session,
/// TLS policy and custom headers. No second login or persistent photo cache.
class PholyCommunityService {
  PholyCommunityService({required this.client, required this.endpoint});

  final http.Client Function() client;
  final String Function() endpoint;

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = endpoint().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/pholy/community$path').replace(queryParameters: query);
  }

  Future<Map<String, dynamic>> _request(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String>? query,
  }) async {
    final request = http.Request(method, _uri(path, query))
      ..headers.addAll({'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    if (body != null) {
      request.body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(
      await client().send(request).timeout(const Duration(seconds: 30)),
    ).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String message = 'PHOLY (${response.statusCode})';
      try {
        final data = jsonDecode(response.body);
        if (data is Map<String, dynamic> && data['message'] is String) {
          message = data['message'] as String;
        }
      } on FormatException {
        // A reverse proxy can return HTML; never render or expose its body.
      }
      throw CommunityRequestException(response.statusCode, message);
    }
    return jsonDecode(response.body) as Map<String, dynamic>;
  }

  Future<CommunityDirectory> directory({int offset = 0}) async =>
      CommunityDirectory.fromJson(await _request('/profiles', query: {'offset': '$offset'}));

  Future<List<CommunityProfile>> following() async {
    final json = await _request('/me/following');
    return (json['profiles'] as List).map((value) => CommunityProfile.fromJson(value as Map<String, dynamic>)).toList();
  }

  Future<CommunityGallery> gallery(String slug) async =>
      CommunityGallery.fromJson(await _request('/profiles/${Uri.encodeComponent(slug)}'));

  Future<CommunityRelation> relation(String slug) async =>
      CommunityRelation.fromJson(await _request('/profiles/${Uri.encodeComponent(slug)}/relation'));

  Future<CommunityRelation> follow(String slug, {required bool enabled}) async => CommunityRelation.fromJson(
    await _request('/profiles/${Uri.encodeComponent(slug)}/follow', method: enabled ? 'PUT' : 'DELETE'),
  );

  Future<CommunityMine> mine() async => CommunityMine.fromJson(await _request('/me'));

  Future<CommunityPhotoPage> picker({int offset = 0}) async =>
      CommunityPhotoPage.fromJson(await _request('/me/assets', query: {'offset': '$offset'}));

  Future<CommunityMine> save({
    required String slug,
    required String displayName,
    required String bio,
    required bool published,
    required List<String> assetIds,
  }) async {
    if (!isCommunitySlugValid(slug)) {
      throw const FormatException('Invalid community profile address');
    }
    if (assetIds.length > 100 || assetIds.toSet().length != assetIds.length) {
      throw const FormatException('Select at most 100 distinct photos');
    }
    return CommunityMine.fromJson(
      await _request(
        '/me',
        method: 'PUT',
        body: {
          'slug': slug,
          'displayName': displayName.trim(),
          'bio': bio.trim(),
          'published': published,
          'assetIds': assetIds,
        },
      ),
    );
  }

  Future<CommunityMine> unpublish() async =>
      CommunityMine.fromJson(await _request('/me/publication', method: 'DELETE'));

  Future<void> report({
    required String slug,
    String? assetId,
    required CommunityReportReason reason,
    required String details,
  }) async {
    await _request(
      '/reports',
      method: 'POST',
      body: {'slug': slug, 'assetId': assetId, 'reason': reason.name, 'details': details.trim()},
    );
  }

  /// The public endpoint returns only a metadata-stripped, permission-checked
  /// preview. Never replace this with /assets/:id/original or a private fallback.
  Uri publicPhotoUri(String slug, String assetId) =>
      _uri('/profiles/${Uri.encodeComponent(slug)}/assets/${Uri.encodeComponent(assetId)}');

  Future<Uint8List> publicPhoto(String slug, String assetId) => _image(publicPhotoUri(slug, assetId));

  Future<Uint8List> ownPhoto(String assetId) {
    final base = endpoint().replaceFirst(RegExp(r'/+$'), '');
    return _image(Uri.parse('$base/assets/${Uri.encodeComponent(assetId)}/thumbnail?size=thumbnail'));
  }

  Future<Uint8List> _image(Uri uri) async {
    final response = await client()
        .get(uri, headers: {'Cache-Control': 'no-store'})
        .timeout(const Duration(seconds: 30));
    if (response.statusCode != 200) {
      throw CommunityRequestException(response.statusCode, 'Photo unavailable');
    }
    return response.bodyBytes;
  }
}
