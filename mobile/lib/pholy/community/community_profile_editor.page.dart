import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/community/community.model.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';
import 'package:immich_mobile/pholy/community/community_session.dart';
import 'package:immich_mobile/pholy/community/community_widgets.dart';

class CommunityProfileEditorPage extends ConsumerStatefulWidget {
  const CommunityProfileEditorPage({super.key, required this.initial});
  final CommunityMine initial;

  @override
  ConsumerState<CommunityProfileEditorPage> createState() => _CommunityProfileEditorPageState();
}

class _CommunityProfileEditorPageState extends ConsumerState<CommunityProfileEditorPage>
    with CommunitySessionGuard<CommunityProfileEditorPage> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _slug;
  late final TextEditingController _bio;
  late final Map<String, CommunityPhoto> _selected;
  final List<CommunityPhoto> _photos = [];
  late bool _published;
  bool _loading = false;
  bool _saving = false;
  int? _nextOffset = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    final profile = widget.initial.profile;
    _name = TextEditingController(text: profile?.displayName ?? '');
    _slug = TextEditingController(text: profile?.slug ?? '');
    _bio = TextEditingController(text: profile?.bio ?? '');
    _selected = {for (final photo in widget.initial.assets) photo.id: photo};
    _published = widget.initial.published && !widget.initial.blocked;
    unawaited(_more());
  }

  @override
  void dispose() {
    _name.dispose();
    _slug.dispose();
    _bio.dispose();
    super.dispose();
  }

  @override
  void clearCommunitySession() {
    _name.clear();
    _slug.clear();
    _bio.clear();
    _selected.clear();
    _photos.clear();
    _published = false;
    _nextOffset = null;
  }

  Future<void> _more() async {
    final offset = _nextOffset;
    if (!hasCommunitySession || offset == null || _loading) {
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await ref.read(pholyCommunityServiceProvider).picker(offset: offset);
      if (!hasCommunitySession) {
        return;
      }
      setState(() {
        final known = _photos.map((photo) => photo.id).toSet();
        _photos.addAll(page.assets.where((photo) => known.add(photo.id)));
        _nextOffset = page.nextOffset;
      });
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _loading = false);
      }
    }
  }

  void _toggle(CommunityPhoto photo) {
    if (!hasCommunitySession || _saving) {
      return;
    }
    if (_selected.containsKey(photo.id)) {
      setState(() => _selected.remove(photo.id));
    } else if (_selected.length < 100) {
      setState(() => _selected[photo.id] = photo);
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            communityText(context, 'Du kannst bis zu 100 Fotos auswählen.', 'You can select up to 100 photos.'),
          ),
        ),
      );
    }
  }

  Future<void> _save() async {
    if (!hasCommunitySession || _saving || !(_form.currentState?.validate() ?? false)) {
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref
          .read(pholyCommunityServiceProvider)
          .save(
            slug: _slug.text.trim(),
            displayName: _name.text,
            bio: _bio.text,
            published: _published && !widget.initial.blocked,
            assetIds: _selected.keys.toList(),
          );
      if (mounted && hasCommunitySession) {
        ref.read(pholyCommunityRevisionProvider.notifier).state++;
        Navigator.of(context).pop();
      }
    } catch (error) {
      if (mounted) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!hasCommunitySession) {
      return communitySessionEndedView();
    }
    final size = MediaQuery.sizeOf(context);
    final padding = size.width > 900 ? (size.width - 860) / 2 : 20.0;
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: Text(communityText(context, 'Öffentliches Profil', 'Public profile'))),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(padding, 12, padding, 12),
          child: FilledButton.icon(
            onPressed: _saving ? null : () => unawaited(_save()),
            icon: _saving
                ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.check),
            label: Text(communityText(context, 'Profil und Fotoauswahl speichern', 'Save profile and photo selection')),
          ),
        ),
      ),
      body: Form(
        key: _form,
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: EdgeInsets.fromLTRB(padding, 12, padding, 20),
              sliver: SliverToBoxAdapter(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.initial.blocked)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 16),
                        child: CommunityMessage(
                          error: true,
                          message: communityText(
                            context,
                            'Dein Profil wurde von der Moderation gesperrt und kann derzeit nicht veröffentlicht werden.',
                            'Your profile is restricted by moderation and cannot currently be published.',
                          ),
                        ),
                      ),
                    TextFormField(
                      controller: _name,
                      enabled: !_saving,
                      maxLength: 60,
                      decoration: InputDecoration(labelText: communityText(context, 'Anzeigename', 'Display name')),
                      textCapitalization: TextCapitalization.words,
                      validator: (value) => (value?.trim().length ?? 0) < 2
                          ? communityText(
                              context,
                              'Bitte mindestens 2 Zeichen eingeben.',
                              'Enter at least 2 characters.',
                            )
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _slug,
                      enabled: !_saving,
                      maxLength: 40,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: communityText(context, 'Profiladresse', 'Profile address'),
                        prefixText: 'pholy.de/community/',
                      ),
                      validator: (value) => !isCommunitySlugValid(value?.trim() ?? '')
                          ? communityText(
                              context,
                              '3–40 kleine Buchstaben, Zahlen oder Bindestriche; Anfang und Ende ohne Bindestrich.',
                              'Use 3–40 lowercase letters, numbers or hyphens, with no leading or trailing hyphen.',
                            )
                          : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _bio,
                      enabled: !_saving,
                      minLines: 3,
                      maxLines: 6,
                      maxLength: 600,
                      decoration: InputDecoration(labelText: communityText(context, 'Über dich', 'About you')),
                      textCapitalization: TextCapitalization.sentences,
                    ),
                    const SizedBox(height: 16),
                    CommunityMessage(
                      message: communityText(
                        context,
                        'Nur die ausgewählten Fotos werden veröffentlicht. Ein öffentliches Profil ist ohne Anmeldung erreichbar. Private Alben und andere Fotos bleiben privat.',
                        'Only the selected photos will be published. A public profile can be viewed without signing in. Your private albums and other photos remain private.',
                      ),
                    ),
                    SwitchListTile.adaptive(
                      contentPadding: EdgeInsets.zero,
                      title: Text(communityText(context, 'Profil öffentlich anzeigen', 'Show profile publicly')),
                      value: _published,
                      onChanged: _saving || widget.initial.blocked
                          ? null
                          : (value) => setState(() => _published = value),
                    ),
                    const Divider(height: 32),
                    Text(
                      communityText(
                        context,
                        'Fotoauswahl · ${_selected.length}/100',
                        'Photo selection · ${_selected.length}/100',
                      ),
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 10),
                    Text(
                      communityText(
                        context,
                        'Wähle eigene Fotos aus deiner PHOLY-Bibliothek. Tippe erneut, um ein Foto aus der öffentlichen Auswahl zu entfernen.',
                        'Choose photos from your existing PHOLY library. Tap again to remove a photo from the public selection.',
                      ),
                    ),
                    if (_selected.isNotEmpty)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(communityText(context, 'Ausgewählte Fotos', 'Selected photos')),
                        children: _selected.values
                            .map(
                              (photo) => ListTile(
                                contentPadding: EdgeInsets.zero,
                                title: Text(photo.originalFileName, maxLines: 1, overflow: TextOverflow.ellipsis),
                                subtitle: photo.hidden
                                    ? Text(
                                        communityText(
                                          context,
                                          'Von der Moderation ausgeblendet',
                                          'Hidden by moderation',
                                        ),
                                        style: TextStyle(color: colors.error),
                                      )
                                    : null,
                                trailing: IconButton(
                                  tooltip: communityText(context, 'Aus Auswahl entfernen', 'Remove from selection'),
                                  onPressed: _saving ? null : () => _toggle(photo),
                                  icon: const Icon(Icons.close),
                                ),
                              ),
                            )
                            .toList(),
                      ),
                    if (_error != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: CommunityMessage(message: _error!, error: true),
                      ),
                  ],
                ),
              ),
            ),
            SliverPadding(
              padding: EdgeInsets.symmetric(horizontal: padding),
              sliver: SliverGrid.builder(
                gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: size.width > 700 ? 4 : 3,
                  mainAxisSpacing: 6,
                  crossAxisSpacing: 6,
                ),
                itemCount: _photos.length,
                itemBuilder: (context, index) {
                  final photo = _photos[index];
                  final selected = _selected.containsKey(photo.id);
                  return Semantics(
                    button: true,
                    selected: selected,
                    label: photo.originalFileName,
                    child: InkWell(
                      onTap: _saving ? null : () => _toggle(photo),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          CommunityPhotoImage(
                            key: ValueKey(photo.id),
                            assetId: photo.id,
                            semanticLabel: photo.originalFileName,
                          ),
                          if (selected)
                            DecoratedBox(
                              decoration: BoxDecoration(border: Border.all(color: colors.primary, width: 4)),
                            ),
                          Positioned(
                            top: 6,
                            right: 6,
                            child: Icon(
                              selected ? Icons.check_circle : Icons.radio_button_unchecked,
                              color: selected ? colors.primary : Colors.white,
                              shadows: const [Shadow(blurRadius: 4, color: Colors.black87)],
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            SliverPadding(
              padding: const EdgeInsets.all(20),
              sliver: SliverToBoxAdapter(
                child: Center(
                  child: _loading
                      ? const CircularProgressIndicator()
                      : _nextOffset != null
                      ? OutlinedButton(
                          onPressed: () => unawaited(_more()),
                          child: Text(communityText(context, 'Weitere Fotos laden', 'Load more photos')),
                        )
                      : _photos.isEmpty
                      ? Text(
                          communityText(
                            context,
                            'Noch keine eigenen Fotos verfügbar. Lade zuerst Fotos in PHOLY hoch.',
                            'No photos available yet. Upload some photos to PHOLY first.',
                          ),
                        )
                      : const SizedBox.shrink(),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
