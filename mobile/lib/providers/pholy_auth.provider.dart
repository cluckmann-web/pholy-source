import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/infrastructure/repositories/network.repository.dart';
import 'package:immich_mobile/services/pholy_auth.service.dart';

final pholyAuthServiceProvider = Provider((ref) => PholyAuthService(client: NetworkRepository.client));
