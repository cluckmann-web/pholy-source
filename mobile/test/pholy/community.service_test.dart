import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/pholy/community/community.model.dart';
import 'package:immich_mobile/pholy/community/community.service.dart';

void main() {
  const profile = {'slug': 'test-profile', 'displayName': 'Test profile', 'bio': 'Synthetic fixture'};

  test('Directory uses the existing paginated public endpoint', () async {
    late http.Request sent;
    final client = MockClient((request) async {
      sent = request;
      return http.Response(
        jsonEncode({
          'profiles': [profile],
          'nextOffset': 96,
        }),
        200,
      );
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api/');
    final page = await service.directory(offset: 48);
    expect(sent.url.toString(), 'https://pholy.example/api/pholy/community/profiles?offset=48');
    expect(sent.method, 'GET');
    expect(page.nextOffset, 96);
    expect(page.profiles.single.slug, 'test-profile');
  });

  test('Public viewer never falls back to private/original files after a permission failure', () async {
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('Hidden', 404);
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    await expectLater(service.publicPhoto('test-profile', 'photo-id'), throwsA(isA<CommunityRequestException>()));
    expect(requests, hasLength(1));
    expect(requests.single.url.path, '/api/pholy/community/profiles/test-profile/assets/photo-id');
    expect(requests.single.url.path.contains('original'), isFalse);
    expect(requests.single.headers['Cache-Control'], 'no-store');
  });

  test('Own photo picker uses the existing authenticated thumbnail client', () async {
    late http.Request sent;
    final client = MockClient((request) async {
      sent = request;
      return http.Response.bytes([1, 2, 3], 200);
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    expect(await service.ownPhoto('fixture-id'), [1, 2, 3]);
    expect(sent.url.path, '/api/assets/fixture-id/thumbnail');
    expect(sent.url.queryParameters, {'size': 'thumbnail'});
  });

  test('Saving a profile preserves explicit visibility and selected existing photo IDs', () async {
    late http.Request sent;
    final client = MockClient((request) async {
      sent = request;
      return http.Response(
        jsonEncode({
          'profile': {...profile, 'published': false, 'blocked': true},
          'assets': [
            {'assetId': 'existing-id', 'originalFileName': 'fixture.jpg', 'hidden': true},
          ],
        }),
        200,
      );
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    final result = await service.save(
      slug: 'test-profile',
      displayName: ' Test profile ',
      bio: ' Synthetic fixture ',
      published: false,
      assetIds: ['existing-id'],
    );
    expect(sent.method, 'PUT');
    expect(sent.url.path, '/api/pholy/community/me');
    expect(jsonDecode(sent.body), {
      ...profile,
      'published': false,
      'assetIds': ['existing-id'],
    });
    expect(result.published, isFalse);
    expect(result.blocked, isTrue);
    expect(result.assets.single.hidden, isTrue);
    expect(result.assets.single.id, 'existing-id');
  });

  test('Invalid or duplicate selections are rejected before a request is sent', () async {
    var count = 0;
    final client = MockClient((_) async {
      count++;
      return http.Response('{}', 200);
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    await expectLater(
      service.save(slug: 'test-profile', displayName: 'Test', bio: '', published: true, assetIds: ['same', 'same']),
      throwsFormatException,
    );
    await expectLater(
      service.save(slug: '../private', displayName: 'Test', bio: '', published: true, assetIds: []),
      throwsFormatException,
    );
    await expectLater(
      service.save(
        slug: 'test-profile',
        displayName: 'Test',
        bio: '',
        published: true,
        assetIds: List.generate(101, (index) => '$index'),
      ),
      throwsFormatException,
    );
    expect(count, 0);
  });

  test('Unpublish uses publication endpoint and does not delete photos', () async {
    late http.Request sent;
    final client = MockClient((request) async {
      sent = request;
      return http.Response(
        jsonEncode({
          'profile': {...profile, 'published': false, 'blocked': false},
          'assets': [],
        }),
        200,
      );
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    final result = await service.unpublish();
    expect(sent.method, 'DELETE');
    expect(sent.url.path, '/api/pholy/community/me/publication');
    expect(result.published, isFalse);
  });

  test('Native client and endpoint are resolved afresh after a session change', () async {
    final requests = <Uri>[];
    var endpoint = 'https://pholy.example/api';
    var client = MockClient((request) async {
      requests.add(request.url);
      return http.Response('{"profiles":[]}', 200);
    });
    final service = PholyCommunityService(client: () => client, endpoint: () => endpoint);
    await service.following();
    endpoint = 'https://fixture.example/api';
    client = MockClient((request) async {
      requests.add(request.url);
      return http.Response('{"profiles":[]}', 200);
    });
    await service.following();
    expect(requests.map((uri) => uri.host), ['pholy.example', 'fixture.example']);
  });

  test('Proxy error HTML is not rendered as a server error message', () async {
    final client = MockClient((_) async => http.Response('<html>internal proxy path</html>', 502));
    final service = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    await expectLater(
      service.mine(),
      throwsA(
        isA<CommunityRequestException>()
            .having((error) => error.statusCode, 'status', 502)
            .having((error) => error.message, 'message', 'PHOLY (502)'),
      ),
    );
  });

  test('Public gallery model exposes only returned public photos', () {
    final gallery = CommunityGallery.fromJson({
      ...profile,
      'assets': [
        {'id': 'public-id'},
      ],
      'followers': 3,
    });
    expect(gallery.assetIds, ['public-id']);
    expect(gallery.followers, 3);
    expect(gallery.profile.displayName, 'Test profile');
  });

  test('Profile address validation matches the PHOLY contract boundaries', () {
    expect(isCommunitySlugValid('abc'), isTrue);
    expect(isCommunitySlugValid('a-b'), isTrue);
    expect(isCommunitySlugValid('ab'), isFalse);
    expect(isCommunitySlugValid('-abc'), isFalse);
    expect(isCommunitySlugValid('abc-'), isFalse);
    expect(isCommunitySlugValid('ABC'), isFalse);
    expect(isCommunitySlugValid('a' * 40), isTrue);
    expect(isCommunitySlugValid('a' * 41), isFalse);
  });
}
