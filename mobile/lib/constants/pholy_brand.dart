import 'package:flutter/widgets.dart';

/// PHOLY uses the existing platform account and media collection.
abstract final class PholyBrand {
  static const name = 'PHOLY';

  /// Only isolated integration builds override this compile-time value.
  /// There is deliberately no server selector in the normal sign-in flow.
  static const serverUrl = String.fromEnvironment('PHOLY_SERVER_URL', defaultValue: 'https://pholy.de');
  static const sourceUrl = 'https://github.com/cluckmann-web/pholy-source';
}

String pholyText(BuildContext context, String german, String english) =>
    Localizations.localeOf(context).languageCode == 'de' ? german : english;
