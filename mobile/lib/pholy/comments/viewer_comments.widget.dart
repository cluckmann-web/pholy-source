import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.provider.dart';
import 'package:immich_mobile/pholy/comments/photo_comments.widget.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/viewer_bottom_app_bar.widget.dart';
import 'package:immich_mobile/providers/asset_viewer/asset_viewer.provider.dart';
import 'package:immich_mobile/providers/infrastructure/current_album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/routes.provider.dart';

PhotoCommentContext? viewerPhotoCommentContext(WidgetRef ref) {
  final asset = ref.watch(assetViewerProvider.select((viewer) => viewer.currentAsset));
  // Local photos, videos and inaccessible assets have no PHOLY discussion.
  // Keep their viewer independent of the authenticated API/provider graph.
  if (asset is! RemoteAsset || !asset.isImage || asset.isLocked || asset.isTrashed) {
    return null;
  }

  final locked = ref.watch(inLockedViewProvider);
  final readonly = ref.watch(readonlyModeProvider);
  if (locked || readonly) {
    return null;
  }

  final session = ref.watch(photoCommentSessionProvider);
  if (!session.authenticated) {
    return null;
  }

  final album = ref.watch(currentRemoteAlbumProvider);
  // A partner's unscoped photo must not fall back to our private discussion.
  if (album == null && asset.ownerId != session.userId) {
    return null;
  }
  return album == null ? const PhotoCommentContext.private() : PhotoCommentContext.album(album.id);
}

/// The original viewer/actions remain in place. Only PHOLY photo discussions
/// are added here; the original album activity screen keeps its own API.
class PholyViewerCommentsBar extends ConsumerStatefulWidget {
  const PholyViewerCommentsBar({super.key});

  @override
  ConsumerState<PholyViewerCommentsBar> createState() => _PholyViewerCommentsBarState();
}

class _PholyViewerCommentsBarState extends ConsumerState<PholyViewerCommentsBar> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final viewer = ref.watch(assetViewerProvider);
    final asset = viewer.currentAsset;
    final commentContext = viewerPhotoCommentContext(ref);
    if (commentContext == null || asset is! RemoteAsset) {
      return const ViewerBottomAppBar();
    }

    final active = viewer.showingControls && !viewer.showingDetails;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    final availableHeight = MediaQuery.sizeOf(context).height - keyboard - MediaQuery.paddingOf(context).top;
    final panelHeight = math.min(360.0, math.max(180.0, availableHeight * 0.44));

    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Offstage(
            offstage: !active,
            child: SizedBox(
              height: _expanded ? panelHeight : 56,
              child: PholyPhotoComments(
                assetId: asset.id,
                commentContext: commentContext,
                expanded: _expanded,
                onExpandedChanged: (value) => setState(() => _expanded = value),
                active: active,
              ),
            ),
          ),
          if (keyboard == 0) const ViewerBottomAppBar(),
        ],
      ),
    );
  }
}
