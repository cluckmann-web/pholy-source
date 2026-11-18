import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/community/community.model.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';
import 'package:immich_mobile/pholy/community/community_profile.page.dart';
import 'package:immich_mobile/pholy/community/community_profile_editor.page.dart';
import 'package:immich_mobile/pholy/community/community_widgets.dart';
import 'package:immich_mobile/providers/auth.provider.dart';

@RoutePage()
class PholyCommunityPage extends ConsumerWidget {
  const PholyCommunityPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final account = ref.watch(authProvider.select((value) => value.userId));
    return DefaultTabController(
      key: ValueKey(account),
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Community'),
          automaticallyImplyLeading: false,
          bottom: TabBar(
            tabs: [
              Tab(text: communityText(context, 'Entdecken', 'Discover')),
              Tab(text: communityText(context, 'Gefolgt', 'Following')),
              Tab(text: communityText(context, 'Mein Profil', 'My profile')),
            ],
          ),
        ),
        body: const TabBarView(
          children: [_CommunityDirectory(), _CommunityDirectory(following: true), _CommunityOwnProfile()],
        ),
      ),
    );
  }
}

class _CommunityDirectory extends ConsumerStatefulWidget {
  const _CommunityDirectory({this.following = false});
  final bool following;

  @override
  ConsumerState<_CommunityDirectory> createState() => _CommunityDirectoryState();
}

class _CommunityDirectoryState extends ConsumerState<_CommunityDirectory> with AutomaticKeepAliveClientMixin {
  final List<CommunityProfile> _profiles = [];
  bool _loading = true;
  String? _error;
  int? _nextOffset;
  int _request = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    unawaited(_load(refresh: true));
  }

  Future<void> _load({bool refresh = false}) async {
    final request = ++_request;
    final service = ref.read(pholyCommunityServiceProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final result = widget.following
          ? CommunityDirectory(profiles: await service.following(), nextOffset: null)
          : await service.directory(offset: refresh ? 0 : (_nextOffset ?? 0));
      if (!mounted || request != _request) {
        return;
      }
      setState(() {
        if (refresh) {
          _profiles.clear();
        }
        final known = _profiles.map((profile) => profile.slug).toSet();
        _profiles.addAll(result.profiles.where((profile) => known.add(profile.slug)));
        _nextOffset = result.nextOffset;
      });
    } catch (error) {
      if (mounted && request == _request) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && request == _request) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _open(CommunityProfile profile) async {
    await Navigator.of(context).push<void>(MaterialPageRoute(builder: (_) => CommunityProfilePage(slug: profile.slug)));
    if (mounted && widget.following) {
      await _load(refresh: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    ref.listen(pholyCommunityRevisionProvider, (_, _) => unawaited(_load(refresh: true)));
    return RefreshIndicator(
      onRefresh: () => _load(refresh: true),
      child: LayoutBuilder(
        builder: (context, constraints) {
          return CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPadding(
                padding: const EdgeInsets.all(20),
                sliver: SliverToBoxAdapter(
                  child: Text(
                    widget.following
                        ? communityText(
                            context,
                            'Neue Perspektiven von Menschen, denen du folgst.',
                            'Fresh perspectives from people you follow.',
                          )
                        : communityText(
                            context,
                            'Entdecke freigegebene Fotos und die Menschen dahinter.',
                            'Discover shared photos and the people behind them.',
                          ),
                    style: Theme.of(context).textTheme.bodyLarge,
                  ),
                ),
              ),
              if (_error != null)
                SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  sliver: SliverToBoxAdapter(
                    child: CommunityMessage(
                      message: _error!,
                      error: true,
                      onRetry: () => unawaited(_load(refresh: _profiles.isEmpty)),
                    ),
                  ),
                ),
              if (!_loading && _error == null && _profiles.isEmpty)
                SliverPadding(
                  padding: const EdgeInsets.all(20),
                  sliver: SliverToBoxAdapter(
                    child: CommunityMessage(
                      message: widget.following
                          ? communityText(
                              context,
                              'Du folgst noch keinem Profil. Unter Entdecken findest du öffentliche Galerien.',
                              'You are not following anyone yet. Find public galleries in Discover.',
                            )
                          : communityText(
                              context,
                              'Hier erscheinen veröffentlichte PHOLY-Profile.',
                              'Published PHOLY profiles will appear here.',
                            ),
                    ),
                  ),
                ),
              SliverPadding(
                padding: EdgeInsets.symmetric(
                  horizontal: constraints.maxWidth > 1200 ? (constraints.maxWidth - 1160) / 2 : 20,
                ),
                sliver: SliverGrid.builder(
                  gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: constraints.maxWidth >= 1100
                        ? 4
                        : constraints.maxWidth >= 700
                        ? 3
                        : constraints.maxWidth >= 480
                        ? 2
                        : 1,
                    mainAxisExtent: 188,
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                  ),
                  itemCount: _profiles.length,
                  itemBuilder: (context, index) {
                    final profile = _profiles[index];
                    return Card.outlined(
                      margin: EdgeInsets.zero,
                      child: InkWell(
                        onTap: () => unawaited(_open(profile)),
                        child: Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  CommunityInitialAvatar(name: profile.displayName),
                                  const SizedBox(width: 12),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          profile.displayName,
                                          style: Theme.of(context).textTheme.titleMedium,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                        ),
                                        Text('@${profile.slug}', maxLines: 1, overflow: TextOverflow.ellipsis),
                                      ],
                                    ),
                                  ),
                                  const Icon(Icons.chevron_right, size: 20),
                                ],
                              ),
                              const SizedBox(height: 14),
                              Expanded(child: Text(profile.bio, maxLines: 3, overflow: TextOverflow.ellipsis)),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Center(
                    child: _loading
                        ? const CircularProgressIndicator()
                        : _nextOffset != null
                        ? OutlinedButton(
                            onPressed: () => unawaited(_load()),
                            child: Text(communityText(context, 'Weitere Profile laden', 'Load more profiles')),
                          )
                        : const SizedBox.shrink(),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _CommunityOwnProfile extends ConsumerStatefulWidget {
  const _CommunityOwnProfile();

  @override
  ConsumerState<_CommunityOwnProfile> createState() => _CommunityOwnProfileState();
}

class _CommunityOwnProfileState extends ConsumerState<_CommunityOwnProfile> with AutomaticKeepAliveClientMixin {
  CommunityMine? _mine;
  bool _loading = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final mine = await ref.read(pholyCommunityServiceProvider).mine();
      if (mounted) {
        setState(() => _mine = mine);
      }
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

  Future<void> _edit() async {
    final mine = _mine;
    if (mine == null) {
      return;
    }
    await Navigator.of(
      context,
    ).push<void>(MaterialPageRoute(builder: (_) => CommunityProfileEditorPage(initial: mine)));
    if (mounted) {
      await _load();
    }
  }

  Future<void> _unpublish() async {
    final accepted = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(communityText(context, 'Profil privat stellen?', 'Make profile private?')),
        content: Text(
          communityText(
            context,
            'Deine öffentliche Galerie wird ausgeblendet. Die Fotos bleiben in deiner privaten Bibliothek.',
            'Your public gallery will be hidden. Your photos stay in your private library.',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(communityText(context, 'Abbrechen', 'Cancel')),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(communityText(context, 'Privat stellen', 'Make private')),
          ),
        ],
      ),
    );
    if (accepted != true || !mounted) {
      return;
    }
    setState(() => _loading = true);
    try {
      final mine = await ref.read(pholyCommunityServiceProvider).unpublish();
      if (mounted) {
        setState(() => _mine = mine);
        ref.read(pholyCommunityRevisionProvider.notifier).state++;
      }
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final mine = _mine;
    final profile = mine?.profile;
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 760),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    communityText(context, 'Deine öffentliche Galerie', 'Your public gallery'),
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 12),
                  Text(
                    communityText(
                      context,
                      'Du entscheidest, welche deiner Fotos in der Community sichtbar sind. Dein PHOLY-Konto und deine private Bibliothek bleiben dieselben.',
                      'You decide which photos appear in the community. This uses your existing PHOLY account and private library.',
                    ),
                  ),
                  const SizedBox(height: 20),
                  if (_error != null)
                    CommunityMessage(message: _error!, error: true, onRetry: () => unawaited(_load())),
                  if (_loading) const Center(child: CircularProgressIndicator()),
                  if (mine != null) ...[
                    if (mine.blocked)
                      CommunityMessage(
                        error: true,
                        message: communityText(
                          context,
                          'Dieses öffentliche Profil wurde von der Moderation gesperrt.',
                          'This public profile has been restricted by moderation.',
                        ),
                      ),
                    Card.outlined(
                      margin: const EdgeInsets.symmetric(vertical: 16),
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                CommunityInitialAvatar(name: profile?.displayName ?? 'PHOLY'),
                                const SizedBox(width: 14),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        profile?.displayName ??
                                            communityText(
                                              context,
                                              'Noch kein öffentliches Profil',
                                              'No public profile yet',
                                            ),
                                        style: Theme.of(context).textTheme.titleLarge,
                                      ),
                                      if (profile != null) Text('@${profile.slug}'),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              mine.published && !mine.blocked
                                  ? communityText(context, 'Öffentlich sichtbar', 'Publicly visible')
                                  : communityText(context, 'Privat', 'Private'),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              communityText(
                                context,
                                '${mine.assets.length} ausgewählte Fotos',
                                '${mine.assets.length} selected photos',
                              ),
                            ),
                            if (profile != null && profile.bio.isNotEmpty)
                              Padding(padding: const EdgeInsets.only(top: 12), child: Text(profile.bio)),
                          ],
                        ),
                      ),
                    ),
                    FilledButton.icon(
                      onPressed: _loading ? null : () => unawaited(_edit()),
                      icon: const Icon(Icons.edit_outlined),
                      label: Text(
                        communityText(context, 'Profil und Fotoauswahl bearbeiten', 'Edit profile and photo selection'),
                      ),
                    ),
                    if (profile != null && mine.published && !mine.blocked) ...[
                      const SizedBox(height: 10),
                      OutlinedButton.icon(
                        onPressed: () => unawaited(
                          Navigator.of(
                            context,
                          ).push<void>(MaterialPageRoute(builder: (_) => CommunityProfilePage(slug: profile.slug))),
                        ),
                        icon: const Icon(Icons.open_in_new),
                        label: Text(communityText(context, 'Öffentliche Galerie ansehen', 'View public gallery')),
                      ),
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed: _loading ? null : () => unawaited(_unpublish()),
                        child: Text(communityText(context, 'Veröffentlichung zurücknehmen', 'Unpublish gallery')),
                      ),
                    ],
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
