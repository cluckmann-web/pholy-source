import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/pages/common/pholy_imprint.page.dart';

// Supply the framework defaults for both test locales without loading the
// application's account, database or translation providers.
class _MaterialDelegate extends LocalizationsDelegate<MaterialLocalizations> {
  const _MaterialDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<MaterialLocalizations> load(Locale locale) => DefaultMaterialLocalizations.load(locale);

  @override
  bool shouldReload(_MaterialDelegate old) => false;
}

class _CupertinoDelegate extends LocalizationsDelegate<CupertinoLocalizations> {
  const _CupertinoDelegate();

  @override
  bool isSupported(Locale locale) => true;

  @override
  Future<CupertinoLocalizations> load(Locale locale) => DefaultCupertinoLocalizations.load(locale);

  @override
  bool shouldReload(_CupertinoDelegate old) => false;
}

Widget _host({
  required Future<bool> Function(Uri uri) openLink,
  Locale locale = const Locale('en'),
  Brightness brightness = Brightness.light,
  double textScale = 1,
}) => MaterialApp(
  locale: locale,
  supportedLocales: const [Locale('de'), Locale('en')],
  localizationsDelegates: const [_MaterialDelegate(), _CupertinoDelegate()],
  theme: ThemeData(useMaterial3: true, brightness: brightness),
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(textScale)),
    child: child!,
  ),
  home: PholyImprintPage(openLink: openLink),
);

void main() {
  testWidgets('legal information is available offline without account providers or opening a link', (tester) async {
    final opened = <Uri>[];
    await tester.pumpWidget(
      _host(
        openLink: (uri) async {
          opened.add(uri);
          return true;
        },
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Legal notice'), findsOneWidget);
    expect(find.text('Weblygo\nInhaber: Carsten Luckmann\nThomästr. 27\n59494 Soest\nDeutschland'), findsOneWidget);
    expect(find.text('mail@weblygo.de\n02921 559 72 39'), findsOneWidget);
    expect(find.textContaining('Gesetzliche Ansprüche werden dadurch nicht eingeschränkt.'), findsOneWidget);
    expect(find.textContaining('PHOLY basiert auf Immich.'), findsOneWidget);
    expect(opened, isEmpty);
    expect(tester.takeException(), isNull);

    for (final label in [
      'Latest legal notice on pholy.de',
      'Privacy notice on pholy.de',
      'Source code and licence notices',
    ]) {
      await tester.ensureVisible(find.text(label));
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }
    expect(opened.map((uri) => uri.toString()).toList(), [
      'https://pholy.de/impressum',
      'https://pholy.de/datenschutz',
      'https://pholy.de/source/',
    ]);
  });

  testWidgets('contact links use the published address without sending a message from the app', (tester) async {
    final opened = <Uri>[];
    await tester.pumpWidget(
      _host(
        locale: const Locale('de'),
        openLink: (uri) async {
          opened.add(uri);
          return true;
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Impressum'), findsOneWidget);

    for (final label in ['E-Mail öffnen', 'Telefon öffnen']) {
      await tester.ensureVisible(find.text(label));
      await tester.tap(find.text(label));
      await tester.pumpAndSettle();
    }
    expect(opened.map((uri) => uri.toString()).toList(), ['mailto:mail@weblygo.de', 'tel:+4929215597239']);
  });

  for (final throws in [false, true]) {
    testWidgets('missing external application is reported without losing the offline information (throws: $throws)', (
      tester,
    ) async {
      await tester.pumpWidget(
        _host(
          openLink: (_) async {
            if (throws) {
              throw Exception('No external handler');
            }
            return false;
          },
        ),
      );
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Latest legal notice on pholy.de'));
      await tester.tap(find.text('Latest legal notice on pholy.de'));
      await tester.pumpAndSettle();

      expect(
        find.text('The link could not be opened. You can copy the address from the legal notice.'),
        findsOneWidget,
      );
      expect(find.text('https://pholy.de/impressum'), findsOneWidget);
      expect(find.textContaining('Inhaber: Carsten Luckmann'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  for (final size in [const Size(320, 640), const Size(1024, 768)]) {
    for (final brightness in Brightness.values) {
      testWidgets('legal content and all links remain reachable at 200% text on $size in $brightness', (tester) async {
        tester.view.physicalSize = size;
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);

        await tester.pumpWidget(
          _host(locale: const Locale('de'), brightness: brightness, textScale: 2, openLink: (_) async => true),
        );
        await tester.pumpAndSettle();
        expect(find.text('Impressum'), findsOneWidget);
        await tester.ensureVisible(find.text('Datenschutzhinweise auf pholy.de'));
        await tester.pumpAndSettle();
        expect(find.text('Datenschutzhinweise auf pholy.de').hitTestable(), findsOneWidget);
        expect(tester.takeException(), isNull);
      });
    }
  }
}
