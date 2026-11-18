import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:immich_mobile/constants/pholy_brand.dart';

class PholyAuthAvailability {
  final bool mailEnabled;
  final bool passwordLoginEnabled;

  const PholyAuthAvailability({required this.mailEnabled, required this.passwordLoginEnabled});

  bool get canRecoverPassword => mailEnabled && passwordLoginEnabled;
}

class PholyRecoveryException implements Exception {
  final int statusCode;

  const PholyRecoveryException(this.statusCode);
}

/// Uses PHOLY's invitation-only platform and its existing recovery flow.
/// No credentials, account-existence details or reset tokens are persisted here.
class PholyAuthService {
  final http.Client client;
  final Uri _base;

  PholyAuthService({required this.client, String serverUrl = PholyBrand.serverUrl})
    : _base = Uri.parse('${serverUrl.replaceFirst(RegExp(r'/+$'), '')}/api/pholy/auth/');

  Future<PholyAuthAvailability> availability() async {
    final response = await client.get(_base.resolve('status')).timeout(const Duration(seconds: 15));
    if (response.statusCode != 200) {
      throw PholyRecoveryException(response.statusCode);
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    return PholyAuthAvailability(
      mailEnabled: body['mailEnabled'] == true,
      passwordLoginEnabled: body['passwordLoginEnabled'] == true,
    );
  }

  Future<void> requestPasswordReset(String email) async {
    final response = await client
        .post(
          _base.resolve('forgot-password'),
          headers: const {'Content-Type': 'application/json', 'Accept': 'application/json'},
          body: jsonEncode({'email': email.trim()}),
        )
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw PholyRecoveryException(response.statusCode);
    }
    final body = jsonDecode(response.body) as Map<String, dynamic>;
    if (body['accepted'] != true) {
      throw const PholyRecoveryException(502);
    }
  }
}
