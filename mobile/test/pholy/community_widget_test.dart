import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.provider.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.service.dart';
import 'package:immich_mobile/pholy/community/community.model.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';
import 'package:immich_mobile/pholy/community/community.service.dart';
import 'package:immich_mobile/pholy/community/community_profile.page.dart';
import 'package:immich_mobile/pholy/community/community_profile_editor.page.dart';

const _profile = CommunityProfile(slug: 'fixture-profile', displayName: 'Synthetic Photographer', bio: 'Test gallery');
final _pixel = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNUCXNkYGBgYmBgYGBgAAAI0QC/ozGSywAAAABJRU5ErkJggg==',
);

final _testAccountProvider = StateProvider<({String userId, bool authenticated})>(
  (ref) => (userId: 'fixture-member', authenticated: true),
);

void main() {
  late List<http.Request> requests;
  late PholyCommunityService community;
  late PhotoCommentService comments;

  setUp(() {
    requests = [];
    final client = MockClient((request) async {
      requests.add(request);
      final path = request.url.path;
      if (path.endsWith('/relation')) {
        return http.Response('{"following":false,"ownProfile":false}', 200);
      }
      if (path.endsWith('/me/assets')) {
        return http.Response('{"assets":[],"nextOffset":null}', 200);
      }
      if (path.endsWith('/profiles/fixture-profile')) {
        return http.Response(
          jsonEncode({
            'slug': _profile.slug,
            'displayName': _profile.displayName,
            'bio': _profile.bio,
            'followers': 2,
            'assets': [
              {'id': 'public-one'},
              {'id': 'public-two'},
            ],
          }),
          200,
        );
      }
      if (path.contains('/community/profiles/') && path.contains('/assets/')) {
        return http.Response.bytes(_pixel, 200, headers: {'Content-Type': 'image/png'});
      }
      if (request.method == 'PUT' && path.endsWith('/community/me')) {
        return http.Response(
          jsonEncode({
            'profile': {...jsonDecode(request.body) as Map<String, dynamic>, 'blocked': false},
            'assets': [],
          }),
          200,
        );
      }
      return http.Response('{"comments":[],"total":0,"nextOffset":null,"canComment":true}', 200);
    });
    community = PholyCommunityService(client: () => client, endpoint: () => 'https://pholy.example/api');
    comments = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
  });

  Widget host(Widget child, {Brightness brightness = Brightness.light}) => ProviderScope(
    overrides: [
      pholyCommunityServiceProvider.overrideWithValue(community),
      pholyCommunityAccountProvider.overrideWith((ref) => ref.watch(_testAccountProvider)),
      photoCommentServiceProvider.overrideWithValue(comments),
      photoCommentSessionProvider.overrideWith((ref) => ref.watch(_testAccountProvider)),
    ],
    child: MaterialApp(
      theme: ThemeData(useMaterial3: true, brightness: brightness),
      home: child,
    ),
  );

  void size(WidgetTester tester, Size size) {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
  }

  testWidgets('public photo viewer sends profileSlug and keeps drafts across hide/show and keyboard layout', (
    tester,
  ) async {
    size(tester, const Size(390, 844));
    await tester.pumpWidget(
      host(
        const CommunityPhotoViewerPage(
          profile: _profile,
          assetIds: ['public-one', 'public-two'],
          initialIndex: 0,
          canReport: true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final draft = find.byKey(const ValueKey('pholy-comment-draft'));
    final toggle = find.byKey(const ValueKey('pholy-comments-toggle'));
    await tester.enterText(draft, 'Synthetic community draft');
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller?.text, 'Synthetic community draft');
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(draft, findsNothing);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller?.text, 'Synthetic community draft');
    final commentRequests = requests.where((request) => request.url.path.contains('/pholy/comments'));
    expect(commentRequests, isNotEmpty);
    expect(commentRequests.every((request) => request.url.queryParameters['profileSlug'] == 'fixture-profile'), isTrue);
    expect(commentRequests.any((request) => request.url.queryParameters.containsKey('slug')), isFalse);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('moving to another public photo clears its predecessor draft', (tester) async {
    size(tester, const Size(390, 844));
    await tester.pumpWidget(
      host(
        const CommunityPhotoViewerPage(
          profile: _profile,
          assetIds: ['public-one', 'public-two'],
          initialIndex: 0,
          canReport: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final draft = find.byKey(const ValueKey('pholy-comment-draft'));
    await tester.enterText(draft, 'Only for the first photo');
    await tester.tap(find.byTooltip('Next photo'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller?.text, isEmpty);
    expect(find.text('2 / 2'), findsOneWidget);
    await tester.enterText(draft, 'Only for the second photo');
    tester.view.viewInsets = const FakeViewPadding(bottom: 300);
    addTearDown(tester.view.resetViewInsets);
    await tester.pumpAndSettle();
    tester.view.resetViewInsets();
    await tester.pumpAndSettle();
    expect(tester.widget<PageView>(find.byType(PageView)).controller?.page, 1);
    expect(tester.widget<TextField>(draft).controller?.text, 'Only for the second photo');
    tester.view.physicalSize = const Size(960, 700);
    await tester.pumpAndSettle();
    expect(tester.widget<PageView>(find.byType(PageView)).controller?.page, 1);
    expect(tester.widget<TextField>(draft).controller?.text, 'Only for the second photo');
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  for (final brightness in Brightness.values) {
    testWidgets('public profile and viewer fit narrow ${brightness.name} display', (tester) async {
      size(tester, const Size(320, 760));
      await tester.pumpWidget(host(const CommunityProfilePage(slug: 'fixture-profile'), brightness: brightness));
      await tester.pumpAndSettle();
      expect(find.text('Synthetic Photographer'), findsWidgets);
      await tester.tap(find.bySemanticsLabel('Open photo 1 of 2'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('pholy-comments-toggle')), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
    });
  }

  testWidgets('profile editor preserves private visibility until explicitly changed', (tester) async {
    size(tester, const Size(390, 844));
    const initial = CommunityMine(profile: _profile, published: false, blocked: false, assets: []);
    await tester.pumpWidget(
      host(
        Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () async {
                await Navigator.of(
                  context,
                ).push<void>(MaterialPageRoute(builder: (_) => const CommunityProfileEditorPage(initial: initial)));
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    expect(requests.where((request) => request.method != 'GET'), isEmpty);
    await tester.tap(find.text('Save profile and photo selection'));
    await tester.pumpAndSettle();
    final save = requests.singleWhere((request) => request.method == 'PUT');
    expect(jsonDecode(save.body)['published'], isFalse);
    expect(jsonDecode(save.body)['assetIds'], isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('an account change clears and dismisses an already-pushed profile editor', (tester) async {
    size(tester, const Size(390, 844));
    const initial = CommunityMine(profile: _profile, published: false, blocked: false, assets: []);
    await tester.pumpWidget(
      host(
        Builder(
          builder: (context) => Scaffold(
            body: FilledButton(
              onPressed: () async {
                await Navigator.of(
                  context,
                ).push<void>(MaterialPageRoute(builder: (_) => const CommunityProfileEditorPage(initial: initial)));
              },
              child: const Text('Open editor'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open editor'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, 'Previous account private draft');
    final save = tester
        .widget<FilledButton>(find.widgetWithText(FilledButton, 'Save profile and photo selection'))
        .onPressed;
    final container = ProviderScope.containerOf(tester.element(find.byType(CommunityProfileEditorPage)));
    container.read(_testAccountProvider.notifier).state = (userId: 'different-member', authenticated: true);
    // Even a callback captured before the route is dismissed must not publish.
    save?.call();
    await tester.pumpAndSettle();
    expect(find.byType(CommunityProfileEditorPage), findsNothing);
    expect(find.text('Previous account private draft'), findsNothing);
    expect(requests.where((request) => request.method != 'GET'), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('an account change prevents a stale profile-follow action', (tester) async {
    size(tester, const Size(390, 844));
    await tester.pumpWidget(host(const CommunityProfilePage(slug: 'fixture-profile')));
    await tester.pumpAndSettle();
    final follow = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Follow')).onPressed;
    final container = ProviderScope.containerOf(tester.element(find.byType(CommunityProfilePage)));
    container.read(_testAccountProvider.notifier).state = (userId: 'different-member', authenticated: true);
    follow?.call();
    await tester.pumpAndSettle();
    expect(find.text('Follow'), findsNothing);
    expect(requests.where((request) => request.method != 'GET'), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('an account change clears a pending report and blocks its send callback', (tester) async {
    size(tester, const Size(390, 844));
    await tester.pumpWidget(
      host(
        const CommunityPhotoViewerPage(profile: _profile, assetIds: ['public-one'], initialIndex: 0, canReport: true),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Report photo'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), 'A synthetic report belonging to the previous account');
    final send = tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Send report')).onPressed;
    final container = ProviderScope.containerOf(tester.element(find.byType(CommunityPhotoViewerPage)));
    container.read(_testAccountProvider.notifier).state = (userId: 'different-member', authenticated: true);
    send?.call();
    await tester.pumpAndSettle();
    expect(find.text('Send report'), findsNothing);
    expect(find.text('A synthetic report belonging to the previous account'), findsNothing);
    expect(requests.where((request) => request.method != 'GET'), isEmpty);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
