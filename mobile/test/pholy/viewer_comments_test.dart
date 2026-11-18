import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.provider.dart';
import 'package:immich_mobile/pholy/comments/viewer_comments.widget.dart';
import 'package:immich_mobile/providers/asset_viewer/asset_viewer.provider.dart';

import '../fixtures/asset.stub.dart';

class _LocalAssetViewerNotifier extends AssetViewerStateNotifier {
  @override
  AssetViewerState build() => AssetViewerState(currentAsset: LocalAssetStub.image1);
}

void main() {
  testWidgets('a local photo does not initialize the comment session or its API graph', (tester) async {
    var sessionReads = 0;
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          assetViewerProvider.overrideWith(_LocalAssetViewerNotifier.new),
          photoCommentSessionProvider.overrideWith((ref) {
            sessionReads++;
            throw StateError('Local photos must not depend on PHOLY authentication');
          }),
        ],
        child: MaterialApp(
          home: Consumer(
            builder: (context, ref, child) => Text(
              viewerPhotoCommentContext(ref) == null ? 'No photo discussion' : 'Unexpected photo discussion',
            ),
          ),
        ),
      ),
    );

    expect(tester.takeException(), isNull);
    expect(sessionReads, 0);
    expect(find.text('No photo discussion'), findsOneWidget);
  });
}
