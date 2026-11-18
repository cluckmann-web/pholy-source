import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.provider.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.service.dart';
import 'package:immich_mobile/pholy/comments/photo_comments.widget.dart';

import 'photo_comment_service_test.dart' show commentFixture;

http.Response pageResponse({List<Map<String, dynamic>> comments = const [], bool canComment = true}) => http.Response(
  jsonEncode({'comments': comments, 'total': comments.length, 'nextOffset': null, 'canComment': canComment}),
  200,
);

Widget host(
  PhotoCommentService service, {
  String assetId = 'asset-1',
  PhotoCommentContext commentContext = const PhotoCommentContext.private(),
  String userId = 'fixture-member',
  bool authenticated = true,
  Brightness brightness = Brightness.light,
  double width = 360,
  double height = 420,
  double keyboard = 0,
  double textScale = 1,
}) => ProviderScope(
  overrides: [
    photoCommentServiceProvider.overrideWithValue(service),
    photoCommentSessionProvider.overrideWithValue((userId: userId, authenticated: authenticated)),
  ],
  child: MaterialApp(
    theme: ThemeData(brightness: brightness, useMaterial3: true),
    home: MediaQuery(
      data: MediaQueryData(
        textScaler: TextScaler.linear(textScale),
        viewInsets: EdgeInsets.only(bottom: keyboard),
      ),
      child: Scaffold(
        body: Center(
          child: SizedBox(
            width: width,
            child: _PanelHost(assetId: assetId, commentContext: commentContext, height: height),
          ),
        ),
      ),
    ),
  ),
);

class _PanelHost extends StatefulWidget {
  final String assetId;
  final PhotoCommentContext commentContext;
  final double height;

  const _PanelHost({required this.assetId, required this.commentContext, required this.height});

  @override
  State<_PanelHost> createState() => _PanelHostState();
}

class _PanelHostState extends State<_PanelHost> {
  bool expanded = true;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: expanded ? widget.height : 56,
    child: PholyPhotoComments(
      assetId: widget.assetId,
      commentContext: widget.commentContext,
      expanded: expanded,
      onExpandedChanged: (value) => setState(() => expanded = value),
    ),
  );
}

void main() {
  final draft = find.byKey(const ValueKey('pholy-comment-draft'));
  final toggle = find.byKey(const ValueKey('pholy-comments-toggle'));
  final send = find.byKey(const ValueKey('pholy-comment-send'));
  late List<http.Request> requests;
  late PhotoCommentService service;

  setUp(() {
    requests = [];
    final client = MockClient((request) async {
      requests.add(request);
      return request.method == 'GET' ? pageResponse() : http.Response(jsonEncode(commentFixture()), 200);
    });
    service = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
  });

  testWidgets('hide/show retains draft and pauses fetching while hidden', (tester) async {
    await tester.pumpWidget(host(service));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'A private synthetic draft');
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(draft, findsNothing);
    final before = requests.length;
    await tester.pump(const Duration(seconds: 65));
    expect(requests.length, before);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, 'A private synthetic draft');
    expect(requests.length, before + 1);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('a hidden photo change clears the prior draft without fetching until shown', (tester) async {
    await tester.pumpWidget(host(service));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'Never transfer to another photo');
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    final before = requests.length;
    await tester.pumpWidget(host(service, assetId: 'asset-2'));
    await tester.pumpAndSettle();
    expect(requests.length, before);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, isEmpty);
    expect(requests.last.url.path, '/api/pholy/comments/asset-2');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('community and private drafts on the same photo remain separate', (tester) async {
    await tester.pumpWidget(host(service));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'Private draft');
    await tester.pumpWidget(host(service, commentContext: const PhotoCommentContext.community('test-gallery')));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, isEmpty);
    expect(requests.last.url.queryParameters, {'kind': 'community', 'profileSlug': 'test-gallery', 'offset': '0'});
    await tester.enterText(draft, 'Public reply');
    await tester.pump();
    expect(tester.widget<IconButton>(send).onPressed, isNotNull);
    await tester.tap(send);
    await tester.pumpAndSettle();
    final post = requests.singleWhere((request) => request.method == 'POST');
    expect(jsonDecode(post.body), {'kind': 'community', 'profileSlug': 'test-gallery', 'body': 'Public reply'});
    expect(tester.widget<TextField>(draft).controller!.text, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('account switch clears the old account draft', (tester) async {
    await tester.pumpWidget(host(service));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'Account A');
    await tester.pumpWidget(host(service, userId: 'fixture-member-b'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, isEmpty);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('anonymous viewer makes no comment requests and has no composer', (tester) async {
    await tester.pumpWidget(host(service, authenticated: false, userId: ''));
    await tester.pumpAndSettle();
    expect(requests, isEmpty);
    expect(draft, findsNothing);
    expect(find.textContaining('Sign in with your PHOLY account'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('late response for previous photo never appears on next photo', (tester) async {
    final first = Completer<http.Response>();
    final client = MockClient((request) async {
      if (request.url.path.endsWith('/asset-1')) {
        return first.future;
      }
      return pageResponse();
    });
    final delayed = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
    await tester.pumpWidget(host(delayed));
    await tester.pump();
    await tester.pumpWidget(host(delayed, assetId: 'asset-2'));
    await tester.pumpAndSettle();
    first.complete(pageResponse(comments: [commentFixture()]));
    await tester.pumpAndSettle();
    expect(find.text('A synthetic photo comment'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('server permission loss removes cached discussion and composer', (tester) async {
    var denied = false;
    final client = MockClient(
      (request) async => denied ? http.Response('{}', 403) : pageResponse(comments: [commentFixture()]),
    );
    final revocable = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
    await tester.pumpWidget(host(revocable));
    await tester.pumpAndSettle();
    expect(find.text('A synthetic photo comment'), findsOneWidget);
    await tester.enterText(draft, 'Draft before access revoked');
    denied = true;
    await tester.pump(const Duration(seconds: 31));
    await tester.pumpAndSettle();
    expect(find.text('A synthetic photo comment'), findsNothing);
    expect(draft, findsNothing);
    expect(find.text('These photo comments are no longer available.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('only server-permitted edit/delete actions are offered', (tester) async {
    final fixture = commentFixture()..addAll({'canEdit': false, 'canDelete': false});
    final client = MockClient((_) async => pageResponse(comments: [fixture]));
    final readonly = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
    await tester.pumpWidget(host(readonly));
    await tester.pumpAndSettle();
    expect(find.text('PHOLY Test'), findsOneWidget);
    expect(find.byKey(const ValueKey('pholy-comment-menu-comment-1')), findsNothing);
    expect(find.text('Reply'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('reply, edit, like and delete use the opened photo context', (tester) async {
    final fixture = commentFixture();
    final mutations = <http.Request>[];
    final client = MockClient((request) async {
      if (request.method == 'GET') {
        return pageResponse(comments: [fixture]);
      }
      mutations.add(request);
      if (request.method == 'PATCH') {
        fixture['body'] = (jsonDecode(request.body) as Map<String, dynamic>)['body'];
      }
      if (request.method == 'PUT') {
        fixture['liked'] = true;
      }
      if (request.method == 'DELETE') {
        fixture['deleted'] = true;
        return http.Response('', 204);
      }
      return http.Response(jsonEncode(fixture), 200);
    });
    final mutable = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
    const scope = PhotoCommentContext.album('fixture-album');
    await tester.pumpWidget(host(mutable, commentContext: scope));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'Synthetic answer');
    await tester.pump();
    expect(tester.widget<IconButton>(send).onPressed, isNotNull);
    await tester.tap(send);
    await tester.pumpAndSettle();
    expect(jsonDecode(mutations.single.body), {
      'kind': 'album',
      'albumId': 'fixture-album',
      'body': 'Synthetic answer',
      'parentId': 'comment-1',
    });

    final menu = find.byKey(const ValueKey('pholy-comment-menu-comment-1'));
    await tester.tap(menu);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, 'A synthetic photo comment');
    await tester.enterText(draft, 'Synthetic corrected comment');
    await tester.pump();
    expect(tester.widget<IconButton>(send).onPressed, isNotNull);
    await tester.tap(send);
    await tester.pumpAndSettle();
    expect(mutations.last.method, 'PATCH');
    expect(jsonDecode(mutations.last.body), {...scope.toJson(), 'body': 'Synthetic corrected comment'});
    expect(find.text('Synthetic corrected comment'), findsOneWidget);

    fixture['liked'] = false;
    await tester.pump(const Duration(seconds: 31));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('pholy-comment-like-comment-1')));
    await tester.pumpAndSettle();
    expect(mutations.last.method, 'PUT');
    expect(mutations.last.url.path, '/api/pholy/comments/asset-1/comment-1/like');
    expect(jsonDecode(mutations.last.body), scope.toJson());

    await tester.tap(menu);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Delete comment?'), findsOneWidget);
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(mutations.last.method, 'DELETE');
    expect(mutations.last.url.queryParameters, scope.toJson());
    expect(find.text('This comment was deleted.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('backgrounding pauses polling and resuming refreshes once', (tester) async {
    await tester.pumpWidget(host(service));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'Draft before backgrounding');
    final before = requests.length;
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await tester.pump(const Duration(seconds: 65));
    expect(requests.length, before);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.hidden);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.inactive);
    tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await tester.pumpAndSettle();
    expect(requests.length, before + 1);
    expect(tester.widget<TextField>(draft).controller!.text, 'Draft before backgrounding');
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('dark narrow panel supports larger text without layout errors', (tester) async {
    await tester.pumpWidget(host(service, brightness: Brightness.dark, width: 320, textScale: 1.6));
    await tester.pumpAndSettle();
    await tester.enterText(draft, 'A larger-font comment');
    expect(tester.takeException(), isNull);
    await tester.tap(toggle);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  testWidgets('short landscape panel keeps multiline reply draft across keyboard and size changes', (tester) async {
    final client = MockClient((_) async => pageResponse(comments: [commentFixture()]));
    final compact = PhotoCommentService(client: () => client, apiEndpoint: () => 'https://pholy.example/api');
    await tester.pumpWidget(host(compact));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reply'));
    await tester.pumpAndSettle();
    const text = 'Synthetic reply\nSecond line\nThird line';
    await tester.enterText(draft, text);
    await tester.pumpWidget(host(compact, height: 180, textScale: 1.5, keyboard: 220));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(tester.widget<TextField>(draft).controller!.text, text);
    expect(tester.widget<TextField>(draft).maxLines, 1);
    await tester.pumpWidget(host(compact, height: 220, textScale: 1.6, keyboard: 180));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(host(compact));
    await tester.pumpAndSettle();
    expect(tester.widget<TextField>(draft).controller!.text, text);
    expect(tester.widget<TextField>(draft).maxLines, 3);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
  });
}
