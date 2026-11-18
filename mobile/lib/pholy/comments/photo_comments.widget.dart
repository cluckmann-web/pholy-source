import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.model.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.provider.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.service.dart';

/// Embed in a bounded panel beside/below the opened photo. Keep this widget
/// mounted when collapsing it: drafts intentionally live only in this viewer.
class PholyPhotoComments extends ConsumerWidget {
  final String assetId;
  final PhotoCommentContext commentContext;
  final bool expanded;
  final ValueChanged<bool> onExpandedChanged;
  final bool active;

  const PholyPhotoComments({
    super.key,
    required this.assetId,
    required this.commentContext,
    required this.expanded,
    required this.onExpandedChanged,
    this.active = true,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(photoCommentSessionProvider);
    return _DiscussionPanel(
      key: ValueKey((assetId, commentContext, session.userId, session.authenticated)),
      assetId: assetId,
      commentContext: commentContext,
      service: ref.watch(photoCommentServiceProvider),
      authenticated: session.authenticated,
      expanded: expanded,
      onExpandedChanged: onExpandedChanged,
      active: active,
    );
  }
}

class _DiscussionPanel extends StatefulWidget {
  final String assetId;
  final PhotoCommentContext commentContext;
  final PhotoCommentService service;
  final bool authenticated;
  final bool expanded;
  final ValueChanged<bool> onExpandedChanged;
  final bool active;

  const _DiscussionPanel({
    super.key,
    required this.assetId,
    required this.commentContext,
    required this.service,
    required this.authenticated,
    required this.expanded,
    required this.onExpandedChanged,
    required this.active,
  });

  @override
  State<_DiscussionPanel> createState() => _DiscussionPanelState();
}

class _DiscussionPanelState extends State<_DiscussionPanel> with WidgetsBindingObserver {
  final _draft = TextEditingController();
  final _composerFocus = FocusNode();
  final _toggleFocus = FocusNode();
  final _scroll = ScrollController();
  List<PhotoComment> _comments = const [];
  Timer? _poll;
  bool _foreground = true;
  bool _loading = false;
  bool _busy = false;
  bool _canComment = false;
  int _total = 0;
  int? _nextOffset;
  int _loadedPages = 1;
  int _requestSerial = 0;
  Object? _loadError;
  Object? _mutationError;
  PhotoComment? _replyTo;
  PhotoComment? _editing;
  String? _draftBeforeEdit;

  bool get _visible => widget.active && widget.expanded && _foreground && widget.authenticated;
  bool get _canWrite => widget.authenticated && !_busy && _loadError == null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    _foreground = lifecycle == null || lifecycle == AppLifecycleState.resumed;
    _updatePolling();
    if (_visible) {
      unawaited(_load());
    }
  }

  @override
  void didUpdateWidget(covariant _DiscussionPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.active != widget.active || oldWidget.expanded != widget.expanded) {
      _updatePolling();
      if (_visible) {
        unawaited(_load());
      } else {
        _requestSerial++;
        _loading = false;
        _composerFocus.unfocus();
      }
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _foreground = state == AppLifecycleState.resumed;
    _updatePolling();
    if (_visible) {
      unawaited(_load());
    } else {
      _requestSerial++;
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _updatePolling() {
    _poll?.cancel();
    _poll = _visible
        ? Timer.periodic(const Duration(seconds: 30), (_) {
            if (!_busy && !_loading) {
              unawaited(_load());
            }
          })
        : null;
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _poll?.cancel();
    _draft.dispose();
    _composerFocus.dispose();
    _toggleFocus.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load({bool append = false}) async {
    if (!_visible || (append && (_nextOffset == null || _loading))) {
      return;
    }
    final serial = ++_requestSerial;
    final pagesToRead = append ? 1 : _loadedPages;
    var offset = append ? _nextOffset! : 0;
    final comments = <PhotoComment>[if (append) ..._comments];
    setState(() => _loading = true);
    try {
      PhotoCommentsPage? lastPage;
      var pagesRead = 0;
      do {
        if (!mounted || serial != _requestSerial || !_visible) {
          return;
        }
        final page = await widget.service.list(widget.assetId, widget.commentContext, offset: offset);
        comments.addAll(page.comments);
        lastPage = page;
        pagesRead++;
        if (page.nextOffset == null) {
          break;
        }
        offset = page.nextOffset!;
      } while (pagesRead < pagesToRead);
      if (!mounted || serial != _requestSerial || !_visible) {
        return;
      }
      final result = lastPage;
      setState(() {
        _comments = {for (final comment in comments) comment.id: comment}.values.toList(growable: false);
        _nextOffset = result.nextOffset;
        _total = result.total;
        _canComment = result.canComment;
        _loadedPages = append ? _loadedPages + 1 : pagesRead;
        _loadError = null;
        _mutationError = null;
        // Permission changes must also invalidate an edit/reply already open.
        if (_editing != null && !_findComment(_editing!.id, _comments).any((comment) => comment.canEdit)) {
          _cancelComposition();
        }
        if (_replyTo != null && !_findComment(_replyTo!.id, _comments).any((comment) => !comment.deleted)) {
          _replyTo = null;
        }
      });
    } catch (error) {
      if (!mounted || serial != _requestSerial) {
        return;
      }
      setState(() {
        _loadError = error;
        if (error is PhotoCommentException && error.accessRevoked) {
          _clearInaccessibleDiscussion();
        }
      });
    } finally {
      if (mounted && serial == _requestSerial) {
        setState(() => _loading = false);
      }
    }
  }

  Iterable<PhotoComment> _findComment(String id, List<PhotoComment> comments) sync* {
    for (final comment in comments) {
      if (comment.id == id) {
        yield comment;
      }
      yield* _findComment(id, comment.replies);
    }
  }

  void _clearInaccessibleDiscussion() {
    _composerFocus.unfocus();
    _comments = const [];
    _canComment = false;
    _nextOffset = null;
    _loadedPages = 1;
    _total = 0;
    _draft.clear();
    _draftBeforeEdit = null;
    _editing = null;
    _replyTo = null;
  }

  Future<void> _mutate(Future<void> Function() action, {VoidCallback? onSuccess}) async {
    if (!_canWrite) {
      return;
    }
    setState(() {
      _busy = true;
      _mutationError = null;
    });
    try {
      await action();
      if (!mounted) {
        return;
      }
      setState(() => onSuccess?.call());
      await _load();
    } catch (error) {
      if (mounted) {
        setState(() {
          _mutationError = error;
          if (error is PhotoCommentException && error.accessRevoked) {
            _clearInaccessibleDiscussion();
            _loadError = error;
          }
        });
      }
    } finally {
      if (mounted) {
        setState(() => _busy = false);
      }
    }
  }

  Future<void> _submit() async {
    final body = _draft.text.trim();
    final editing = _editing;
    if (!_canWrite || body.isEmpty || body.length > 2000 || (editing == null ? !_canComment : !editing.canEdit)) {
      return;
    }
    await _mutate(
      () async {
        if (editing != null) {
          await widget.service.edit(widget.assetId, widget.commentContext, editing.id, body);
        } else {
          await widget.service.create(widget.assetId, widget.commentContext, body, parentId: _replyTo?.id);
        }
      },
      onSuccess: () {
        _draft.text = editing == null ? '' : _draftBeforeEdit ?? '';
        _draftBeforeEdit = null;
        _editing = null;
        _replyTo = null;
        _composerFocus.unfocus();
      },
    );
  }

  void _cancelComposition() {
    if (_editing != null) {
      _draft.text = _draftBeforeEdit ?? '';
    }
    _draftBeforeEdit = null;
    _editing = null;
    _replyTo = null;
  }

  void _startReply(PhotoComment comment) {
    if (!_canWrite || !_canComment || comment.deleted) {
      return;
    }
    setState(() {
      _cancelComposition();
      _replyTo = comment;
    });
    _composerFocus.requestFocus();
  }

  void _startEdit(PhotoComment comment) {
    if (!_canWrite || !comment.canEdit) {
      return;
    }
    setState(() {
      _cancelComposition();
      _draftBeforeEdit = _draft.text;
      _draft.text = comment.body;
      _editing = comment;
    });
    _composerFocus.requestFocus();
  }

  Future<void> _remove(PhotoComment comment) async {
    if (!_canWrite || !comment.canDelete) {
      return;
    }
    final copy = _CommentCopy.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        shape: const RoundedRectangleBorder(),
        title: Text(copy.deleteTitle),
        content: Text(copy.deleteExplanation),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: Text(copy.cancel)),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(copy.delete)),
        ],
      ),
    );
    if (!mounted || confirmed != true) {
      return;
    }
    await _mutate(() => widget.service.remove(widget.assetId, widget.commentContext, comment.id));
  }

  @override
  Widget build(BuildContext context) {
    final copy = _CommentCopy.of(context);
    final colors = Theme.of(context).colorScheme;
    final draftEnabled = _canWrite && (_editing?.canEdit ?? _canComment);
    return Material(
      color: colors.surface,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final compact = constraints.maxHeight < 300 || MediaQuery.textScalerOf(context).scale(16) > 24;
          return Column(
            children: [
              SizedBox(
                height: 56,
                child: Row(
                  children: [
                    const SizedBox(width: 12),
                    Icon(Icons.mode_comment_outlined, size: 20, color: colors.primary),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _total == 0 ? copy.title : '${copy.title} ($_total)',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                    ),
                    IconButton(
                      key: const ValueKey('pholy-comments-toggle'),
                      focusNode: _toggleFocus,
                      tooltip: widget.expanded ? copy.hide : copy.show,
                      isSelected: widget.expanded,
                      icon: Icon(widget.expanded ? Icons.keyboard_arrow_down : Icons.keyboard_arrow_up),
                      onPressed: () {
                        _composerFocus.unfocus();
                        _toggleFocus.requestFocus();
                        widget.onExpandedChanged(!widget.expanded);
                      },
                    ),
                  ],
                ),
              ),
              if (widget.expanded) ...[
                const Divider(height: 1),
                Expanded(
                  child: widget.authenticated
                      ? _discussion(copy, colors)
                      : Center(
                          child: Padding(padding: const EdgeInsets.all(16), child: Text(copy.signIn)),
                        ),
                ),
                if (widget.authenticated && (_canComment || _editing != null))
                  ConstrainedBox(
                    // A landscape keyboard or large accessibility text must not
                    // push the composer beyond the bounded discussion panel.
                    constraints: BoxConstraints(maxHeight: constraints.maxHeight > 57 ? constraints.maxHeight - 57 : 0),
                    child: SingleChildScrollView(
                      primary: false,
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 6, 8, 10),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (!compact && (_editing != null || _replyTo != null))
                              Row(
                                key: const ValueKey('pholy-comment-mode'),
                                children: [
                                  Expanded(
                                    child: Text(
                                      _editing != null
                                          ? copy.editing
                                          : copy.replying(_replyTo!.author?.name ?? copy.deletedAuthor),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context).textTheme.labelMedium,
                                    ),
                                  ),
                                  IconButton(
                                    tooltip: copy.cancel,
                                    onPressed: _busy ? null : () => setState(_cancelComposition),
                                    icon: const Icon(Icons.close, size: 18),
                                  ),
                                ],
                              ),
                            Row(
                              key: const ValueKey('pholy-comment-composer'),
                              crossAxisAlignment: CrossAxisAlignment.end,
                              children: [
                                Expanded(
                                  child: TextField(
                                    key: const ValueKey('pholy-comment-draft'),
                                    controller: _draft,
                                    focusNode: _composerFocus,
                                    enabled: draftEnabled,
                                    minLines: 1,
                                    maxLines: compact ? 1 : 3,
                                    maxLength: 2000,
                                    textCapitalization: TextCapitalization.sentences,
                                    decoration: InputDecoration(
                                      label: Text(
                                        _editing != null
                                            ? copy.edit
                                            : compact && _replyTo != null
                                            ? copy.replying(_replyTo!.author?.name ?? copy.deletedAuthor)
                                            : copy.write,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      suffixIcon: compact && (_editing != null || _replyTo != null)
                                          ? IconButton(
                                              tooltip: copy.cancel,
                                              onPressed: _busy ? null : () => setState(_cancelComposition),
                                              icon: const Icon(Icons.close, size: 18),
                                            )
                                          : null,
                                      border: const OutlineInputBorder(borderRadius: BorderRadius.zero),
                                      counterText: '',
                                      isDense: true,
                                    ),
                                  ),
                                ),
                                ValueListenableBuilder<TextEditingValue>(
                                  valueListenable: _draft,
                                  builder: (context, value, _) => IconButton.filled(
                                    key: const ValueKey('pholy-comment-send'),
                                    tooltip: _editing != null ? copy.save : copy.send,
                                    style: IconButton.styleFrom(shape: const RoundedRectangleBorder()),
                                    onPressed:
                                        draftEnabled && value.text.trim().isNotEmpty && value.text.trim().length <= 2000
                                        ? () => unawaited(_submit())
                                        : null,
                                    icon: _busy
                                        ? const SizedBox(
                                            width: 20,
                                            height: 20,
                                            child: CircularProgressIndicator(strokeWidth: 2),
                                          )
                                        : Icon(_editing != null ? Icons.check : Icons.send_outlined, size: 20),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
              ],
            ],
          );
        },
      ),
    );
  }

  Widget _discussion(_CommentCopy copy, ColorScheme colors) {
    final error = _mutationError ?? _loadError;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
        children: [
          Text(copy.scope(widget.commentContext.kind), style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 12),
          if (error != null)
            Semantics(
              liveRegion: true,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    error is PhotoCommentException && error.accessRevoked ? copy.unavailable : copy.error,
                    style: TextStyle(color: colors.error),
                  ),
                  if (error is PhotoCommentException && !error.accessRevoked)
                    Text(error.message, style: Theme.of(context).textTheme.bodySmall),
                  TextButton(onPressed: _loading ? null : () => unawaited(_load()), child: Text(copy.retry)),
                ],
              ),
            ),
          if (_loading && _comments.isEmpty)
            const Padding(
              padding: EdgeInsets.all(20),
              child: Center(child: CircularProgressIndicator()),
            ),
          if (!_loading && _comments.isEmpty && _loadError == null)
            Padding(padding: const EdgeInsets.symmetric(vertical: 16), child: Text(copy.empty)),
          for (final comment in _comments) ...[
            _entry(comment, copy, colors),
            for (final reply in comment.replies)
              Padding(padding: const EdgeInsets.only(left: 28), child: _entry(reply, copy, colors)),
          ],
          if (_nextOffset != null)
            TextButton(
              onPressed: _loading ? null : () => unawaited(_load(append: true)),
              child: Text(_loading ? copy.loading : copy.loadMore),
            ),
          if (!_loading && !_canComment && _loadError == null) Text(copy.disabled),
        ],
      ),
    );
  }

  Widget _entry(PhotoComment comment, _CommentCopy copy, ColorScheme colors) {
    final name = comment.author?.name ?? copy.deletedAuthor;
    final localTime = comment.createdAt.toLocal();
    final material = MaterialLocalizations.of(context);
    final exactTime =
        '${material.formatFullDate(localTime)} ${material.formatTimeOfDay(TimeOfDay.fromDateTime(localTime))}';
    return Padding(
      key: ValueKey('pholy-comment-${comment.id}'),
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _CommentAvatar(
            key: ValueKey((comment.author?.id, comment.author?.hasProfileImage)),
            author: comment.author,
            service: widget.service,
            assetId: widget.assetId,
            commentContext: widget.commentContext,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (!comment.deleted) Text(name, style: Theme.of(context).textTheme.labelLarge),
                Text(
                  comment.deleted ? copy.deleted : comment.body,
                  style: TextStyle(color: comment.deleted ? colors.onSurfaceVariant : colors.onSurface),
                ),
                const SizedBox(height: 4),
                Tooltip(
                  message: exactTime,
                  child: Text(
                    '${copy.timeAgo(localTime, material)}${comment.updatedAt.isAfter(comment.createdAt) && !comment.deleted ? ' · ${copy.edited}' : ''}',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(color: colors.onSurfaceVariant),
                  ),
                ),
                if (!comment.deleted)
                  Wrap(
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 2,
                    children: [
                      TextButton.icon(
                        key: ValueKey('pholy-comment-like-${comment.id}'),
                        onPressed: _canWrite && _canComment
                            ? () => unawaited(
                                _mutate(
                                  () => widget.service.like(
                                    widget.assetId,
                                    widget.commentContext,
                                    comment.id,
                                    enabled: !comment.liked,
                                  ),
                                ),
                              )
                            : null,
                        icon: Icon(comment.liked ? Icons.thumb_up : Icons.thumb_up_outlined, size: 16),
                        label: Text('${copy.like}${comment.likeCount == 0 ? '' : ' · ${comment.likeCount}'}'),
                      ),
                      if (comment.parentId == null && _canComment && comment.replies.length < 50)
                        TextButton(onPressed: _canWrite ? () => _startReply(comment) : null, child: Text(copy.reply)),
                      if (comment.canEdit || comment.canDelete)
                        PopupMenuButton<String>(
                          key: ValueKey('pholy-comment-menu-${comment.id}'),
                          tooltip: copy.actions,
                          enabled: _canWrite,
                          icon: const Icon(Icons.more_horiz, size: 20),
                          onSelected: (action) {
                            if (action == 'edit') {
                              _startEdit(comment);
                            } else if (action == 'delete') {
                              unawaited(_remove(comment));
                            }
                          },
                          itemBuilder: (_) => [
                            if (comment.canEdit) PopupMenuItem(value: 'edit', child: Text(copy.edit)),
                            if (comment.canDelete) PopupMenuItem(value: 'delete', child: Text(copy.delete)),
                          ],
                        ),
                    ],
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _CommentAvatar extends StatefulWidget {
  final PhotoCommentAuthor? author;
  final PhotoCommentService service;
  final String assetId;
  final PhotoCommentContext commentContext;

  const _CommentAvatar({
    super.key,
    required this.author,
    required this.service,
    required this.assetId,
    required this.commentContext,
  });

  @override
  State<_CommentAvatar> createState() => _CommentAvatarState();
}

class _CommentAvatarState extends State<_CommentAvatar> {
  late final Future<Uint8List>? _image = widget.author?.hasProfileImage == true
      ? widget.service.avatar(widget.assetId, widget.commentContext, widget.author!.id)
      : null;

  @override
  Widget build(BuildContext context) {
    final name = widget.author?.name.trim() ?? '';
    final initials = name.isEmpty
        ? '–'
        : name.split(RegExp(r'\s+')).take(2).map((part) => part.characters.first).join().toUpperCase();
    final colors = Theme.of(context).colorScheme;
    final placeholder = Center(
      child: Text(initials, style: TextStyle(fontSize: 11, color: colors.onPrimaryContainer)),
    );
    return ExcludeSemantics(
      child: CircleAvatar(
        radius: 16,
        backgroundColor: colors.primaryContainer,
        child: _image == null
            ? placeholder
            : ClipOval(
                child: FutureBuilder<Uint8List>(
                  future: _image,
                  builder: (context, snapshot) => snapshot.hasData
                      ? Image.memory(
                          snapshot.data!,
                          width: 32,
                          height: 32,
                          fit: BoxFit.cover,
                          errorBuilder: (_, error, stackTrace) => placeholder,
                        )
                      : placeholder,
                ),
              ),
      ),
    );
  }
}

class _CommentCopy {
  final bool de;
  const _CommentCopy(this.de);
  factory _CommentCopy.of(BuildContext context) => _CommentCopy(Localizations.localeOf(context).languageCode == 'de');

  String get title => de ? 'Fotokommentare' : 'Photo comments';
  String get hide => de ? 'Kommentare ausblenden' : 'Hide comments';
  String get show => de ? 'Kommentare anzeigen' : 'Show comments';
  String get signIn => de
      ? 'Melde dich mit deinem PHOLY-Konto an, um Kommentare zu lesen und zu schreiben.'
      : 'Sign in with your PHOLY account to read and write comments.';
  String get unavailable =>
      de ? 'Diese Fotokommentare sind nicht mehr verfügbar.' : 'These photo comments are no longer available.';
  String get error => de
      ? 'Die Kommentare konnten nicht aktualisiert werden. Dein Entwurf bleibt erhalten.'
      : 'Could not update the comments. Your draft has been kept.';
  String get retry => de ? 'Erneut versuchen' : 'Try again';
  String get empty =>
      de ? 'Noch keine Kommentare. Beginne die Unterhaltung.' : 'No comments yet. Start the conversation.';
  String get disabled => de
      ? 'Hier können derzeit keine neuen Kommentare geschrieben werden.'
      : 'New comments are currently unavailable for this discussion.';
  String get loading => de ? 'Wird geladen …' : 'Loading…';
  String get loadMore => de ? 'Weitere Kommentare laden' : 'Load more comments';
  String get write => de ? 'Kommentar schreiben' : 'Write a comment';
  String get send => de ? 'Kommentar senden' : 'Send comment';
  String get save => de ? 'Speichern' : 'Save';
  String get cancel => de ? 'Abbrechen' : 'Cancel';
  String get editing => de ? 'Kommentar bearbeiten' : 'Editing comment';
  String get edited => de ? 'bearbeitet' : 'edited';
  String get edit => de ? 'Bearbeiten' : 'Edit';
  String get delete => de ? 'Löschen' : 'Delete';
  String get deleteTitle => de ? 'Kommentar löschen?' : 'Delete comment?';
  String get deleteExplanation => de
      ? 'Der Kommentar wird entfernt. Vorhandene Antworten bleiben erhalten.'
      : 'The comment will be removed. Existing replies will be kept.';
  String get deleted => de ? 'Dieser Kommentar wurde gelöscht.' : 'This comment was deleted.';
  String get deletedAuthor => de ? 'Gelöschtes Mitglied' : 'Deleted member';
  String get like => de ? 'Gefällt mir' : 'Like';
  String get reply => de ? 'Antworten' : 'Reply';
  String get actions => de ? 'Kommentaraktionen' : 'Comment actions';
  String replying(String name) => de ? 'Antwort an $name' : 'Replying to $name';
  String scope(PhotoCommentKind kind) => switch (kind) {
    PhotoCommentKind.private => de ? 'Privat · nur für dich sichtbar' : 'Private · visible only to you',
    PhotoCommentKind.album =>
      de ? 'Album · nur für Mitglieder dieses Albums' : 'Album · only for members of this album',
    PhotoCommentKind.community =>
      de ? 'Community · für angemeldete PHOLY-Mitglieder' : 'Community · for signed-in PHOLY members',
  };
  String timeAgo(DateTime time, MaterialLocalizations material) {
    final elapsed = DateTime.now().difference(time);
    if (elapsed.inSeconds < 60) {
      return de ? 'Gerade eben' : 'Just now';
    }
    if (elapsed.inMinutes < 60) {
      return de ? 'vor ${elapsed.inMinutes} Min.' : '${elapsed.inMinutes} min ago';
    }
    if (elapsed.inHours < 24) {
      return de ? 'vor ${elapsed.inHours} Std.' : '${elapsed.inHours} hr ago';
    }
    return material.formatMediumDate(time);
  }
}
