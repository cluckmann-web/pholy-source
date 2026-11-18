import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.service.dart';

Map<String, dynamic> commentFixture({String id = 'comment-1', bool deleted = false}) => {
  'id': id,
  'assetId': 'asset-1',
  'parentId': null,
  'body': 'A synthetic photo comment',
  'createdAt': '2026-11-18T10:00:00.000Z',
  'updatedAt': '2026-11-18T10:00:00.000Z',
  'deleted': deleted,
  'author': {'id': 'fixture-author', 'name': 'PHOLY Test', 'avatarColor': 'blue', 'hasProfileImage': false},
  'likeCount': 2,
  'liked': true,
  'canEdit': true,
  'canDelete': true,
  'replies': <dynamic>[],
};

void main() {
  late List<http.Request> requests;
  late PhotoCommentService service;

  setUp(() {
    requests = [];
    final client = MockClient((request) async {
      requests.add(request);
      if (request.url.path.endsWith('/avatar')) {
        return http.Response.bytes([1, 2, 3], 200, headers: {'content-type': 'image/jpeg'});
      }
      if (request.method == 'DELETE') {
        return http.Response('', 204);
      }
      if (request.method == 'GET') {
        return http.Response(
          jsonEncode({
            'comments': [commentFixture()],
            'total': 1,
            'nextOffset': 20,
            'canComment': true,
          }),
          200,
        );
      }
      return http.Response(jsonEncode(commentFixture()), 200);
    });
    service = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
  });

  test('private, album and community context cannot share a key or payload', () {
    const private = PhotoCommentContext.private();
    const album = PhotoCommentContext.album('album-1');
    const community = PhotoCommentContext.community('test-gallery');
    expect({private, album, community}.length, 3);
    expect(private.toJson(), {'kind': 'private'});
    expect(album.toJson(), {'kind': 'album', 'albumId': 'album-1'});
    expect(community.toJson(), {'kind': 'community', 'profileSlug': 'test-gallery'});
    expect(community, const PhotoCommentContext.community('test-gallery'));
    expect(community, isNot(const PhotoCommentContext.community('another-gallery')));
  });

  for (final context in [
    const PhotoCommentContext.private(),
    const PhotoCommentContext.album('album-1'),
    const PhotoCommentContext.community('test-gallery'),
  ]) {
    test('${context.kind.name}: every operation retains only its exact context', () async {
      final page = await service.list('asset-1', context, offset: 20);
      expect(page.comments.single.author!.name, 'PHOLY Test');
      expect(page.nextOffset, 20);
      expect(requests.last.url.path, '/api/pholy/comments/asset-1');
      expect(requests.last.url.queryParameters, {...context.toJson(), 'offset': '20'});

      await service.create('asset-1', context, '  reply  ', parentId: 'root-1');
      expect(requests.last.method, 'POST');
      expect(jsonDecode(requests.last.body), {...context.toJson(), 'body': 'reply', 'parentId': 'root-1'});

      await service.edit('asset-1', context, 'comment-1', 'Edited');
      expect(requests.last.method, 'PATCH');
      expect(requests.last.url.path, '/api/pholy/comments/asset-1/comment-1');
      expect(jsonDecode(requests.last.body), {...context.toJson(), 'body': 'Edited'});

      await service.like('asset-1', context, 'comment-1', enabled: true);
      expect(requests.last.method, 'PUT');
      expect(requests.last.url.query, isEmpty);
      expect(jsonDecode(requests.last.body), context.toJson());

      await service.like('asset-1', context, 'comment-1', enabled: false);
      expect(requests.last.method, 'DELETE');
      expect(requests.last.url.queryParameters, context.toJson());
      expect(requests.last.body, isEmpty);

      await service.remove('asset-1', context, 'comment-1');
      expect(requests.last.method, 'DELETE');
      expect(requests.last.url.queryParameters, context.toJson());

      final avatar = await service.avatar('asset-1', context, 'author-1');
      expect(avatar, [1, 2, 3]);
      expect(requests.last.url.path, '/api/pholy/comments/asset-1/authors/author-1/avatar');
      expect(requests.last.url.queryParameters, context.toJson());
      for (final request in requests) {
        expect(request.url.path, isNot(contains('/activities')));
        expect(request.url.queryParameters, isNot(contains('slug')));
        expect(request.headers['cache-control'], 'no-store');
      }
    });
  }

  test('blank and oversized comments do not make a request', () async {
    const context = PhotoCommentContext.private();
    await expectLater(service.create('asset-1', context, ' \n '), throwsArgumentError);
    await expectLater(service.edit('asset-1', context, 'comment-1', 'a' * 2001), throwsArgumentError);
    await expectLater(service.list('asset-1', context, offset: 501), throwsRangeError);
    expect(requests, isEmpty);
  });

  test('a new endpoint/client is picked up, rather than retaining an old session', () async {
    var endpoint = 'https://first.example/api';
    final first = MockClient((request) async {
      requests.add(request);
      return http.Response('', 204);
    });
    final second = MockClient((request) async {
      requests.add(request);
      return http.Response('', 204);
    });
    http.Client client = first;
    final dynamicService = PhotoCommentService(client: () => client, apiEndpoint: () => endpoint);
    await dynamicService.remove('asset-1', const PhotoCommentContext.private(), 'comment-1');
    client = second;
    endpoint = 'https://second.example/api/';
    await dynamicService.remove('asset-2', const PhotoCommentContext.album('album-2'), 'comment-2');
    expect(requests.first.url.host, 'first.example');
    expect(requests.last.url.host, 'second.example');
    expect(requests.last.url.path, '/api/pholy/comments/asset-2/comment-2');
  });

  test('permission failures are distinguishable from retryable transport errors', () async {
    final denied = PhotoCommentService(
      client: () => MockClient((_) async => http.Response('{"message":"Synthetic permission failure"}', 403)),
      apiEndpoint: () => 'https://pholy.example/api',
    );
    await expectLater(
      denied.list('asset-1', const PhotoCommentContext.private()),
      throwsA(isA<PhotoCommentException>().having((error) => error.accessRevoked, 'accessRevoked', true)),
    );
  });

  test('deleted comments cannot expose stale author, text, reactions or permissions', () {
    final comment = PhotoComment.fromJson(commentFixture(deleted: true));
    expect(comment.body, isEmpty);
    expect(comment.author, isNull);
    expect(comment.likeCount, 0);
    expect(comment.liked, false);
    expect(comment.canEdit, false);
    expect(comment.canDelete, false);
  });
}
