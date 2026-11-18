import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';

class PhotoCommentException implements Exception {
  final int statusCode;
  final String message;

  const PhotoCommentException(this.statusCode, this.message);

  bool get accessRevoked => statusCode == 401 || statusCode == 403 || statusCode == 404;

  @override
  String toString() => message;
}

/// Uses the existing native HTTP session, including its secure token and custom
/// TLS/network configuration. No second account or cookie store is introduced.
/// Callbacks also ensure that a refreshed iOS HTTP client is picked up.
class PhotoCommentService {
  final http.Client Function() client;
  final String Function() apiEndpoint;

  PhotoCommentService({required this.client, required this.apiEndpoint});

  Uri _uri(String assetId, {String suffix = '', Map<String, String>? query}) {
    final base = apiEndpoint().replaceFirst(RegExp(r'/+$'), '');
    return Uri.parse('$base/pholy/comments/${Uri.encodeComponent(assetId)}$suffix').replace(queryParameters: query);
  }

  Future<http.Response> _request(String method, Uri uri, {Map<String, dynamic>? body}) async {
    final request = http.Request(method, uri)
      ..headers.addAll({'Accept': 'application/json', 'Cache-Control': 'no-store'});
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.body = jsonEncode(body);
    }
    final response = await client().send(request).then(http.Response.fromStream).timeout(const Duration(seconds: 25));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      String? message;
      try {
        final error = jsonDecode(response.body);
        if (error is Map<String, dynamic> && error['message'] is String) {
          message = error['message'] as String;
        }
      } on FormatException {
        // Reverse-proxy errors need not contain a JSON response.
      }
      throw PhotoCommentException(response.statusCode, message ?? 'PHOLY (${response.statusCode})');
    }
    return response;
  }

  Future<PhotoCommentsPage> list(String assetId, PhotoCommentContext context, {int offset = 0}) async {
    if (offset < 0 || offset > 500) {
      throw RangeError.range(offset, 0, 500, 'offset');
    }
    final response = await _request('GET', _uri(assetId, query: {...context.toJson(), 'offset': '$offset'}));
    return PhotoCommentsPage.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<PhotoComment> create(String assetId, PhotoCommentContext context, String body, {String? parentId}) async {
    final response = await _request(
      'POST',
      _uri(assetId),
      body: {...context.toJson(), 'body': _body(body), 'parentId': ?parentId},
    );
    return PhotoComment.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<PhotoComment> edit(String assetId, PhotoCommentContext context, String commentId, String body) async {
    final response = await _request(
      'PATCH',
      _uri(assetId, suffix: '/${Uri.encodeComponent(commentId)}'),
      body: {...context.toJson(), 'body': _body(body)},
    );
    return PhotoComment.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }

  Future<void> remove(String assetId, PhotoCommentContext context, String commentId) async {
    await _request('DELETE', _uri(assetId, suffix: '/${Uri.encodeComponent(commentId)}', query: context.toJson()));
  }

  Future<void> like(String assetId, PhotoCommentContext context, String commentId, {required bool enabled}) async {
    await _request(
      enabled ? 'PUT' : 'DELETE',
      _uri(assetId, suffix: '/${Uri.encodeComponent(commentId)}/like', query: enabled ? null : context.toJson()),
      body: enabled ? context.toJson() : null,
    );
  }

  Future<Uint8List> avatar(String assetId, PhotoCommentContext context, String userId) async {
    final response = await _request(
      'GET',
      _uri(assetId, suffix: '/authors/${Uri.encodeComponent(userId)}/avatar', query: context.toJson()),
    );
    return response.bodyBytes;
  }

  String _body(String body) {
    final trimmed = body.trim();
    if (trimmed.isEmpty || trimmed.length > 2000) {
      throw ArgumentError('Comments must contain between 1 and 2000 characters.');
    }
    return trimmed;
  }
}
