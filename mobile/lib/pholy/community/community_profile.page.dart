import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comments.widget.dart';
import 'package:immich_mobile/pholy/community/community.model.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';
import 'package:immich_mobile/pholy/community/community_session.dart';
import 'package:immich_mobile/pholy/community/community_widgets.dart';

class CommunityProfilePage extends ConsumerStatefulWidget {
  const CommunityProfilePage({super.key, required this.slug});
  final String slug;

  @override
  ConsumerState<CommunityProfilePage> createState() => _CommunityProfilePageState();
}

class _CommunityProfilePageState extends ConsumerState<CommunityProfilePage>
    with CommunitySessionGuard<CommunityProfilePage> {
  CommunityGallery? _gallery;
  CommunityRelation? _relation;
  bool _loading = true;
  bool _busy = false;
  String? _error;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void clearCommunitySession() {
    _request++;
    _gallery = null;
    _relation = null;
    _error = null;
  }

  Future<void> _load() async {
    if (!hasCommunitySession) {
      return;
    }
    final request = ++_request;
    final service = ref.read(pholyCommunityServiceProvider);
    var loadedGallery = false;
    setState(() {
      _loading = true;
      _error = null;
      _relation = null;
    });
    try {
      final gallery = await service.gallery(widget.slug);
      if (!hasCommunitySession || request != _request) {
        return;
      }
      loadedGallery = true;
      setState(() => _gallery = gallery);
      final relation = await service.relation(widget.slug);
      if (hasCommunitySession && request == _request) {
        setState(() => _relation = relation);
      }
    } catch (error) {
      if (mounted && request == _request) {
        setState(() {
          _error = error.toString();
          if (!loadedGallery) {
            _gallery = null;
          }
        });
      }
    } finally {
      if (mounted && request == _request) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _follow() async {
    final relation = _relation;
    if (!hasCommunitySession || relation == null || relation.ownProfile || _busy) {
      return;
    }
    final service = ref.read(pholyCommunityServiceProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await service.follow(widget.slug, enabled: !relation.following);
      if (!hasCommunitySession) {
        return;
      }
      setState(() => _relation = result);
      ref.read(pholyCommunityRevisionProvider.notifier).state++;
      final gallery = await service.gallery(widget.slug);
      if (hasCommunitySession) {
        setState(() => _gallery = gallery);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _openPhoto(int index) async {
    final gallery = _gallery;
    if (!hasCommunitySession || gallery == null) {
      return;
    }
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => CommunityPhotoViewerPage(
          profile: gallery.profile,
          assetIds: gallery.assetIds,
          initialIndex: index,
          canReport: _relation != null && !_relation!.ownProfile,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (!hasCommunitySession) {
      return communitySessionEndedView();
    }
    final gallery = _gallery;
    final profile = gallery?.profile;
    return Scaffold(
      appBar: AppBar(
        title: Text(profile?.displayName ?? '@${widget.slug}', maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final padding = constraints.maxWidth > 1160 ? (constraints.maxWidth - 1120) / 2 : 20.0;
            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(padding, 16, padding, 24),
                  sliver: SliverToBoxAdapter(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (profile != null) ...[
                          Center(child: CommunityInitialAvatar(name: profile.displayName, radius: 36)),
                          const SizedBox(height: 16),
                          Text(
                            profile.displayName,
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 4),
                          Text('@${profile.slug}', textAlign: TextAlign.center),
                          if (profile.bio.isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              child: Text(profile.bio, textAlign: TextAlign.center),
                            ),
                          const SizedBox(height: 8),
                          Text(
                            communityText(
                              context,
                              '${gallery!.followers} Follower · ${gallery.assetIds.length} Fotos',
                              '${gallery.followers} followers · ${gallery.assetIds.length} photos',
                            ),
                            textAlign: TextAlign.center,
                          ),
                          if (_relation != null && !_relation!.ownProfile)
                            Padding(
                              padding: const EdgeInsets.only(top: 16),
                              child: Wrap(
                                alignment: WrapAlignment.center,
                                spacing: 12,
                                runSpacing: 8,
                                children: [
                                  FilledButton.icon(
                                    onPressed: _busy ? null : () => unawaited(_follow()),
                                    icon: Icon(_relation!.following ? Icons.check : Icons.person_add_outlined),
                                    label: Text(
                                      _relation!.following
                                          ? communityText(context, 'Nicht mehr folgen', 'Unfollow')
                                          : communityText(context, 'Folgen', 'Follow'),
                                    ),
                                  ),
                                  OutlinedButton.icon(
                                    onPressed: () => unawaited(showCommunityReport(context, slug: widget.slug)),
                                    icon: const Icon(Icons.flag_outlined),
                                    label: Text(communityText(context, 'Profil melden', 'Report profile')),
                                  ),
                                ],
                              ),
                            ),
                        ],
                        if (_error != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 16),
                            child: CommunityMessage(message: _error!, error: true, onRetry: () => unawaited(_load())),
                          ),
                        if (_loading)
                          const Padding(
                            padding: EdgeInsets.all(20),
                            child: Center(child: CircularProgressIndicator()),
                          ),
                        if (gallery != null && gallery.assetIds.isEmpty)
                          Padding(
                            padding: const EdgeInsets.only(top: 20),
                            child: CommunityMessage(
                              message: communityText(
                                context,
                                'In dieser Galerie sind noch keine Fotos veröffentlicht.',
                                'No photos have been published in this gallery yet.',
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (gallery != null)
                  SliverPadding(
                    padding: EdgeInsets.symmetric(horizontal: padding),
                    sliver: SliverGrid.builder(
                      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                        maxCrossAxisExtent: 380,
                        crossAxisSpacing: 10,
                        mainAxisSpacing: 10,
                      ),
                      itemCount: gallery.assetIds.length,
                      itemBuilder: (context, index) => Semantics(
                        button: true,
                        label: communityText(
                          context,
                          'Foto ${index + 1} von ${gallery.assetIds.length} öffnen',
                          'Open photo ${index + 1} of ${gallery.assetIds.length}',
                        ),
                        child: InkWell(
                          onTap: () => unawaited(_openPhoto(index)),
                          child: CommunityPhotoImage(
                            key: ValueKey('${widget.slug}:${gallery.assetIds[index]}'),
                            profileSlug: widget.slug,
                            assetId: gallery.assetIds[index],
                            semanticLabel: communityText(
                              context,
                              'Foto von ${gallery.profile.displayName}',
                              'Photo by ${gallery.profile.displayName}',
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(child: SizedBox(height: 24)),
              ],
            );
          },
        ),
      ),
    );
  }
}

/// A viewer for explicitly public previews only. It must not resolve these IDs
/// through the private library or infer album/private discussion contexts.
class CommunityPhotoViewerPage extends ConsumerStatefulWidget {
  const CommunityPhotoViewerPage({
    super.key,
    required this.profile,
    required this.assetIds,
    required this.initialIndex,
    required this.canReport,
  });
  final CommunityProfile profile;
  final List<String> assetIds;
  final int initialIndex;
  final bool canReport;

  @override
  ConsumerState<CommunityPhotoViewerPage> createState() => _CommunityPhotoViewerPageState();
}

class _CommunityPhotoViewerPageState extends ConsumerState<CommunityPhotoViewerPage>
    with CommunitySessionGuard<CommunityPhotoViewerPage> {
  late int _index;
  late final PageController _pages;
  final _photoKey = GlobalKey();
  final _commentsKey = GlobalKey();
  bool _commentsExpanded = true;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _pages = PageController(initialPage: _index);
  }

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _move(int index) {
    if (index < 0 || index >= widget.assetIds.length) {
      return;
    }
    unawaited(_pages.animateToPage(index, duration: const Duration(milliseconds: 180), curve: Curves.easeOut));
  }

  @override
  Widget build(BuildContext context) {
    if (!hasCommunitySession) {
      return communitySessionEndedView();
    }
    final assetId = widget.assetIds[_index];
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.profile.displayName,
              style: Theme.of(context).textTheme.titleMedium,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text('${_index + 1} / ${widget.assetIds.length}', style: Theme.of(context).textTheme.bodySmall),
          ],
        ),
        actions: [
          if (widget.canReport)
            IconButton(
              tooltip: communityText(context, 'Foto melden', 'Report photo'),
              onPressed: () => unawaited(showCommunityReport(context, slug: widget.profile.slug, assetId: assetId)),
              icon: const Icon(Icons.flag_outlined),
            ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: LayoutBuilder(
          builder: (context, constraints) {
            final keyboardOpen = MediaQuery.viewInsetsOf(context).bottom > 0;
            final landscape = constraints.maxWidth >= 840 && !keyboardOpen;
            final comments = PholyPhotoComments(
              key: _commentsKey,
              assetId: assetId,
              commentContext: PhotoCommentContext.community(widget.profile.slug),
              expanded: _commentsExpanded,
              onExpandedChanged: (value) => setState(() => _commentsExpanded = value),
            );
            final photo = ColoredBox(
              key: _photoKey,
              color: Colors.black,
              child: Stack(
                children: [
                  PageView.builder(
                    controller: _pages,
                    onPageChanged: (index) => setState(() => _index = index),
                    itemCount: widget.assetIds.length,
                    itemBuilder: (context, index) => InteractiveViewer(
                      key: ValueKey(widget.assetIds[index]),
                      minScale: 1,
                      maxScale: 5,
                      child: CommunityPhotoImage(
                        key: ValueKey('${widget.profile.slug}:${widget.assetIds[index]}'),
                        profileSlug: widget.profile.slug,
                        assetId: widget.assetIds[index],
                        fit: BoxFit.contain,
                        semanticLabel: communityText(
                          context,
                          'Foto von ${widget.profile.displayName}',
                          'Photo by ${widget.profile.displayName}',
                        ),
                      ),
                    ),
                  ),
                  if (_index > 0)
                    Positioned(
                      left: 6,
                      top: 6,
                      child: IconButton.filledTonal(
                        tooltip: communityText(context, 'Vorheriges Foto', 'Previous photo'),
                        onPressed: () => _move(_index - 1),
                        icon: const Icon(Icons.chevron_left),
                      ),
                    ),
                  if (_index + 1 < widget.assetIds.length)
                    Positioned(
                      right: 6,
                      top: 6,
                      child: IconButton.filledTonal(
                        tooltip: communityText(context, 'Nächstes Foto', 'Next photo'),
                        onPressed: () => _move(_index + 1),
                        icon: const Icon(Icons.chevron_right),
                      ),
                    ),
                ],
              ),
            );
            if (keyboardOpen && _commentsExpanded) {
              return Stack(
                children: [
                  // Keep the current page/zoom mounted while making room for
                  // the composer. Otherwise closing the keyboard could show
                  // a different photo from the active discussion.
                  Offstage(
                    offstage: true,
                    child: SizedBox(width: constraints.maxWidth, height: constraints.maxHeight, child: photo),
                  ),
                  comments,
                ],
              );
            }
            if (landscape && _commentsExpanded) {
              return Row(
                children: [
                  Expanded(child: photo),
                  SizedBox(
                    width: 360,
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: SizedBox(height: constraints.maxHeight, child: comments),
                    ),
                  ),
                ],
              );
            }
            return Column(
              children: [
                Expanded(child: photo),
                SizedBox(height: _commentsExpanded ? math.min(380, constraints.maxHeight * 0.55) : 56, child: comments),
              ],
            );
          },
        ),
      ),
    );
  }
}

Future<void> showCommunityReport(BuildContext context, {required String slug, String? assetId}) async {
  await showDialog<void>(
    context: context,
    builder: (_) => _CommunityReportDialog(slug: slug, assetId: assetId),
  );
}

class _CommunityReportDialog extends ConsumerStatefulWidget {
  const _CommunityReportDialog({required this.slug, this.assetId});
  final String slug;
  final String? assetId;

  @override
  ConsumerState<_CommunityReportDialog> createState() => _CommunityReportDialogState();
}

class _CommunityReportDialogState extends ConsumerState<_CommunityReportDialog>
    with CommunitySessionGuard<_CommunityReportDialog> {
  final _details = TextEditingController();
  final _form = GlobalKey<FormState>();
  CommunityReportReason _reason = CommunityReportReason.privacy;
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _details.dispose();
    super.dispose();
  }

  @override
  void clearCommunitySession() {
    _details.clear();
    _error = null;
  }

  Future<void> _send() async {
    if (!hasCommunitySession || _sending || !(_form.currentState?.validate() ?? false)) {
      return;
    }
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref
          .read(pholyCommunityServiceProvider)
          .report(slug: widget.slug, assetId: widget.assetId, reason: _reason, details: _details.text);
      if (!mounted || !hasCommunitySession) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            communityText(
              context,
              'Die Meldung wurde zur Prüfung übermittelt.',
              'Your report has been submitted for review.',
            ),
          ),
        ),
      );
      Navigator.pop(context);
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!hasCommunitySession) {
      return const SizedBox.shrink();
    }
    return AlertDialog(
      title: Text(
        widget.assetId == null
            ? communityText(context, 'Profil melden', 'Report profile')
            : communityText(context, 'Foto melden', 'Report photo'),
      ),
      content: SizedBox(
        width: 420,
        child: Form(
          key: _form,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                DropdownButtonFormField<CommunityReportReason>(
                  initialValue: _reason,
                  decoration: InputDecoration(labelText: communityText(context, 'Grund', 'Reason')),
                  items: [
                    DropdownMenuItem(
                      value: CommunityReportReason.privacy,
                      child: Text(communityText(context, 'Privatsphäre', 'Privacy')),
                    ),
                    DropdownMenuItem(
                      value: CommunityReportReason.copyright,
                      child: Text(communityText(context, 'Urheberrecht', 'Copyright')),
                    ),
                    DropdownMenuItem(
                      value: CommunityReportReason.abuse,
                      child: Text(communityText(context, 'Missbrauch', 'Abuse')),
                    ),
                    DropdownMenuItem(
                      value: CommunityReportReason.other,
                      child: Text(communityText(context, 'Sonstiges', 'Other')),
                    ),
                  ],
                  onChanged: _sending ? null : (value) => setState(() => _reason = value ?? _reason),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _details,
                  enabled: !_sending,
                  minLines: 3,
                  maxLines: 6,
                  maxLength: 2000,
                  decoration: InputDecoration(labelText: communityText(context, 'Beschreibung', 'Details')),
                  validator: (value) => (value?.trim().length ?? 0) < 10
                      ? communityText(
                          context,
                          'Bitte mindestens 10 Zeichen eingeben.',
                          'Please enter at least 10 characters.',
                        )
                      : null,
                ),
                if (_error != null) CommunityMessage(message: _error!, error: true),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _sending ? null : () => Navigator.pop(context),
          child: Text(communityText(context, 'Abbrechen', 'Cancel')),
        ),
        FilledButton(
          onPressed: _sending ? null : () => unawaited(_send()),
          child: Text(communityText(context, 'Meldung senden', 'Send report')),
        ),
      ],
    );
  }
}
