import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';

String communityText(BuildContext context, String de, String en) =>
    Localizations.localeOf(context).languageCode == 'de' ? de : en;

class CommunityInitialAvatar extends StatelessWidget {
  const CommunityInitialAvatar({super.key, required this.name, this.radius = 24});
  final String name;
  final double radius;

  @override
  Widget build(BuildContext context) => CircleAvatar(
    radius: radius,
    backgroundColor: Theme.of(context).colorScheme.primaryContainer,
    foregroundColor: Theme.of(context).colorScheme.onPrimaryContainer,
    child: Text(
      name.trim().isEmpty ? '?' : name.trim().characters.first.toUpperCase(),
      style: TextStyle(fontSize: radius),
    ),
  );
}

class CommunityMessage extends StatelessWidget {
  const CommunityMessage({super.key, required this.message, this.error = false, this.onRetry});
  final String message;
  final bool error;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      color: error ? colors.errorContainer : colors.surfaceContainer,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(message, style: TextStyle(color: error ? colors.onErrorContainer : colors.onSurface)),
          if (onRetry != null)
            TextButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh),
              label: Text(communityText(context, 'Erneut versuchen', 'Try again')),
            ),
        ],
      ),
    );
  }
}

/// A memory-only preview fetched through Immich's existing authenticated client.
/// Keeping this separate avoids sending bearer tokens to a generic image loader.
class CommunityPhotoImage extends ConsumerStatefulWidget {
  const CommunityPhotoImage({
    super.key,
    required this.assetId,
    this.profileSlug,
    this.fit = BoxFit.cover,
    this.semanticLabel,
  });
  final String assetId;
  final String? profileSlug;
  final BoxFit fit;
  final String? semanticLabel;

  @override
  ConsumerState<CommunityPhotoImage> createState() => _CommunityPhotoImageState();
}

class _CommunityPhotoImageState extends ConsumerState<CommunityPhotoImage> {
  Future<Uint8List>? _bytes;
  Object? _service;

  @override
  void didUpdateWidget(covariant CommunityPhotoImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.assetId != widget.assetId || oldWidget.profileSlug != widget.profileSlug) {
      _bytes = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final service = ref.watch(pholyCommunityServiceProvider);
    if (!identical(service, _service)) {
      _service = service;
      _bytes = null;
    }
    final slug = widget.profileSlug;
    _bytes ??= slug == null ? service.ownPhoto(widget.assetId) : service.publicPhoto(slug, widget.assetId);
    return FutureBuilder<Uint8List>(
      key: ValueKey((service, widget.profileSlug, widget.assetId)),
      future: _bytes,
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return Center(
            child: IconButton(
              tooltip: communityText(context, 'Foto erneut laden', 'Retry photo'),
              onPressed: () => setState(() => _bytes = null),
              icon: const Icon(Icons.broken_image_outlined),
            ),
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: SizedBox.square(dimension: 24, child: CircularProgressIndicator(strokeWidth: 2)));
        }
        return Image.memory(
          snapshot.data!,
          fit: widget.fit,
          width: double.infinity,
          height: double.infinity,
          gaplessPlayback: false,
          semanticLabel: widget.semanticLabel,
          errorBuilder: (_, _, _) => const Center(child: Icon(Icons.broken_image_outlined)),
        );
      },
    );
  }
}
