import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/pholy/comments/photo_comment.service.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/providers/auth.provider.dart';

final photoCommentServiceProvider = Provider<PhotoCommentService>((ref) {
  final api = ref.watch(apiServiceProvider);
  return PhotoCommentService(client: () => api.apiClient.client, apiEndpoint: () => api.apiClient.basePath);
});

/// User identity is part of the widget key, so no discussion or draft survives
/// logging out or switching to another PHOLY account.
final photoCommentSessionProvider = Provider<({String userId, bool authenticated})>((ref) {
  final auth = ref.watch(authProvider);
  return (userId: auth.userId, authenticated: auth.isAuthenticated);
});
