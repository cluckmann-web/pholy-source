import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/community/community.providers.dart';
import 'package:immich_mobile/pholy/community/community_widgets.dart';

/// Imperatively pushed routes outlive the keyed main tab. Bind those routes
/// and their drafts to the person who opened them, including dialog callbacks.
mixin CommunitySessionGuard<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  late final ({String userId, bool authenticated}) _communityAccount;
  bool _communitySessionEnded = false;

  @override
  void initState() {
    super.initState();
    _communityAccount = ref.read(pholyCommunityAccountProvider);
    ref.listenManual(pholyCommunityAccountProvider, (_, next) {
      if (next != _communityAccount && !_communitySessionEnded && mounted) {
        setState(() {
          _communitySessionEnded = true;
          clearCommunitySession();
        });
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (!mounted) {
            return;
          }
          final route = ModalRoute.of(context);
          final navigator = Navigator.of(context);
          if (route != null && route.isActive && !route.isFirst) {
            navigator.removeRoute(route);
          }
        });
      }
    });
  }

  bool get hasCommunitySession =>
      mounted &&
      !_communitySessionEnded &&
      _communityAccount.authenticated &&
      ref.read(pholyCommunityAccountProvider) == _communityAccount;

  /// Called before dismissing the route so a dialog above it cannot retain
  /// text or selected private assets from the preceding account.
  void clearCommunitySession() {}

  Widget communitySessionEndedView() => Scaffold(
    appBar: AppBar(title: const Text('PHOLY')),
    body: Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          communityText(
            context,
            'Deine Sitzung hat sich geändert. Öffne diesen Bereich erneut.',
            'Your session has changed. Open this section again.',
          ),
        ),
      ),
    ),
  );
}
