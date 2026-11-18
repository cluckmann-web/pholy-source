import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/community/community.service.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/auth.provider.dart';

/// Refresh already-open directory/following tabs after an explicit user action.
final pholyCommunityRevisionProvider = StateProvider<int>((ref) => 0);

final pholyCommunityAccountProvider = Provider<({String userId, bool authenticated})>((ref) {
  final auth = ref.watch(authProvider);
  return (userId: auth.userId, authenticated: auth.isAuthenticated);
});

final pholyCommunityServiceProvider = Provider<PholyCommunityService>((ref) {
  // Recreate view dependencies when the signed-in person changes.
  final account = ref.watch(pholyCommunityAccountProvider);
  final api = ref.watch(apiServiceProvider);
  var disposed = false;
  ref.onDispose(() => disposed = true);
  return PholyCommunityService(
    client: () {
      // A route can still hold an old service during logout. Never let its
      // delayed action use another person's newly authenticated client.
      if (disposed || !account.authenticated || ref.read(pholyCommunityAccountProvider) != account) {
        throw const CommunityRequestException(401, 'PHOLY session changed');
      }
      return api.apiClient.client;
    },
    endpoint: () => api.apiClient.basePath,
  );
});
