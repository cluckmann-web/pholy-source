import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/services/pholy_auth.service.dart';

void main() {
  test('uses the existing PHOLY availability endpoint without requesting email', () async {
    final client = MockClient((request) async {
      expect(request.url.toString(), 'https://pholy.de/api/pholy/auth/status');
      expect(request.method, 'GET');
      expect(request.body, isEmpty);
      return http.Response('{"mailEnabled":true,"passwordLoginEnabled":true}', 200);
    });
    final status = await PholyAuthService(client: client).availability();
    expect(status.canRecoverPassword, isTrue);
  });

  test('recovery stays unavailable when SMTP or password login is disabled', () async {
    for (final body in [
      '{"mailEnabled":false,"passwordLoginEnabled":true}',
      '{"mailEnabled":true,"passwordLoginEnabled":false}',
      '{}',
    ]) {
      final service = PholyAuthService(client: MockClient((_) async => http.Response(body, 200)));
      expect((await service.availability()).canRecoverPassword, isFalse);
    }
  });

  test('reset request sends only the trimmed email to the existing endpoint', () async {
    final client = MockClient((request) async {
      expect(request.method, 'POST');
      expect(request.url.toString(), 'https://pholy.de/api/pholy/auth/forgot-password');
      expect(jsonDecode(request.body), {'email': 'member@example.test'});
      expect(request.headers['content-type'], contains('application/json'));
      return http.Response('{"accepted":true}', 200);
    });
    await PholyAuthService(client: client).requestPasswordReset(' member@example.test ');
  });

  test('rate limiting remains distinguishable without exposing server messages', () async {
    final service = PholyAuthService(client: MockClient((_) async => http.Response('private server text', 429)));
    await expectLater(
      service.requestPasswordReset('member@example.test'),
      throwsA(isA<PholyRecoveryException>().having((e) => e.statusCode, 'statusCode', 429)),
    );
  });

  test('does not show accepted state for an unexpected successful response', () async {
    final service = PholyAuthService(client: MockClient((_) async => http.Response('{}', 200)));
    await expectLater(service.requestPasswordReset('member@example.test'), throwsA(isA<PholyRecoveryException>()));
  });

  test('isolated test server is an explicit construction option, not a login field', () async {
    final service = PholyAuthService(
      serverUrl: 'http://127.0.0.1:18080/',
      client: MockClient((request) async {
        expect(request.url.toString(), 'http://127.0.0.1:18080/api/pholy/auth/status');
        return http.Response('{"mailEnabled":true,"passwordLoginEnabled":true}', 200);
      }),
    );
    expect((await service.availability()).canRecoverPassword, isTrue);
  });
}
