import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:auto_route/auto_route.dart';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart' hide Store;
import 'package:fluttertoast/fluttertoast.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/data/store/passkey.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/infrastructure/repositories/settings.repository.dart';
import 'package:immich_mobile/models/auth/login_response.model.dart';
import 'package:immich_mobile/pages/login/pholy_password_recovery.page.dart';
import 'package:immich_mobile/providers/auth.provider.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/feature_message.provider.dart';
import 'package:immich_mobile/providers/gallery_permission.provider.dart';
import 'package:immich_mobile/providers/oauth.provider.dart';
import 'package:immich_mobile/providers/server_info.provider.dart';
import 'package:immich_mobile/providers/view_intent/view_intent_handler.provider.dart';
import 'package:immich_mobile/providers/websocket.provider.dart';
import 'package:immich_mobile/repositories/permission.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/error_handler.dart';
import 'package:immich_mobile/utils/provider_utils.dart';
import 'package:immich_mobile/utils/semver.dart';
import 'package:immich_mobile/utils/url_helper.dart';
import 'package:immich_mobile/utils/version_compatibility.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';
import 'package:immich_mobile/widgets/forms/login/pholy_introduction.dart';
import 'package:immich_ui/immich_ui.dart';
import 'package:logging/logging.dart';
import 'package:package_info_plus/package_info_plus.dart';

class LoginForm extends HookConsumerWidget {
  LoginForm({super.key});

  final log = Logger('LoginForm');

  String? _validateEmail(String? email) {
    if (email == null || email == '') {
      return StaticTranslations.instance.login_form_err_invalid_email;
    }
    if (email.endsWith(' ')) {
      return StaticTranslations.instance.login_form_err_trailing_whitespace;
    }
    if (email.startsWith(' ')) {
      return StaticTranslations.instance.login_form_err_leading_whitespace;
    }
    if (email.contains(' ') || !email.contains('@')) {
      return StaticTranslations.instance.login_form_err_invalid_email;
    }
    return null;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final emailController = useTextEditingController.fromValue(TextEditingValue.empty);
    final passwordController = useTextEditingController.fromValue(TextEditingValue.empty);
    final serverEndpointController = useTextEditingController(text: PholyBrand.serverUrl);
    final passwordFocusNode = useFocusNode();
    final isOauthEnable = useState<bool>(false);
    final isPasswordLoginEnable = useState<bool>(false);
    final isPasskeyEnable = useState<bool>(false);
    final oAuthButtonLabel = useState<String>('OAuth');
    final warningMessage = useState<String?>(null);
    final isConnecting = useState(true);
    final connectionError = useState<String?>(null);
    final ValueNotifier<String?> serverEndpoint = useState<String?>(null);

    Future<void> checkVersionMismatch() async {
      try {
        final packageInfo = await PackageInfo.fromPlatform();
        final appSemVer = SemVer.fromString(packageInfo.version);
        final serverSemVer = ref.read(serverInfoProvider).serverVersion;
        if (!context.mounted) {
          return;
        }
        warningMessage.value = getVersionCompatibilityMessage(serverVersion: serverSemVer, appVersion: appSemVer);
      } catch (error) {
        if (!context.mounted) {
          return;
        }
        warningMessage.value = pholyText(
          context,
          'Die Versionsprüfung ist gerade nicht verfügbar.',
          'Version checking is currently unavailable.',
        );
      }
    }

    // PHOLY is a hosted platform. Resolve the fixed endpoint with the original
    // Immich client so uploads, sync and background workers share its session.
    Future<void> getServerAuthSettings() async {
      isConnecting.value = true;
      connectionError.value = null;
      try {
        final endpoint = await ref.read(authProvider.notifier).validateServerUrl(PholyBrand.serverUrl);
        if (!context.mounted) {
          return;
        }
        await ref.read(serverInfoProvider.notifier).getServerInfo();
        if (!context.mounted) {
          return;
        }
        final serverInfo = ref.read(serverInfoProvider);
        final passkeyEnabled = await ref.read(PasskeyStore.instance.enabled().future);
        if (!context.mounted) {
          return;
        }
        isOauthEnable.value = serverInfo.serverFeatures.oauthEnabled;
        isPasswordLoginEnable.value = serverInfo.serverFeatures.passwordLogin;
        isPasskeyEnable.value = passkeyEnabled;
        final oauthLabel = serverInfo.serverConfig.oauthButtonText;
        oAuthButtonLabel.value = oauthLabel.isNotEmpty ? oauthLabel : 'OAuth';
        serverEndpoint.value = endpoint;
        await checkVersionMismatch();
      } catch (error, stack) {
        log.warning('PHOLY connection could not be established', error, stack);
        if (!context.mounted) {
          return;
        }
        connectionError.value = pholyText(
          context,
          'PHOLY ist gerade nicht erreichbar. Prüfe deine Internetverbindung und versuche es erneut.',
          'PHOLY is currently unreachable. Check your internet connection and try again.',
        );
      } finally {
        if (context.mounted) {
          isConnecting.value = false;
        }
      }
    }

    useEffect(() {
      unawaited(getServerAuthSettings());
      return null;
    }, const []);

    Future<void> handleSyncFlow() async {
      final backgroundManager = ref.read(backgroundSyncProvider);
      final viewIntentHandler = ref.read(viewIntentHandlerProvider);

      await backgroundManager.syncLocal(full: true);
      await backgroundManager.syncRemote();
      await viewIntentHandler.flushDeferredViewIntent();
      await backgroundManager.hashAssets();

      if (SettingsRepository.instance.appConfig.backup.syncAlbums) {
        await backgroundManager.syncLinkedAlbum();
      }
    }

    Future<void> getManageMediaPermission() async {
      final hasPermission = await ref.read(permissionRepositoryProvider).hasManageMediaPermission();
      if (!context.mounted) {
        return;
      }

      if (!hasPermission) {
        await showDialog(
          context: context,
          builder: (BuildContext context) {
            return AlertDialog(
              shape: const RoundedRectangleBorder(),
              elevation: 5,
              title: Text(
                context.t.manage_media_access_title,
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: context.primaryColor),
              ),
              content: SingleChildScrollView(
                child: ListBody(
                  children: [
                    Text(context.t.manage_media_access_subtitle, style: const TextStyle(fontSize: 14)),
                    const SizedBox(height: 4),
                    Text(context.t.manage_media_access_rationale, style: const TextStyle(fontSize: 12)),
                  ],
                ),
              ),
              actions: [
                TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  child: Text(
                    context.t.cancel,
                    style: TextStyle(fontWeight: FontWeight.w600, color: context.primaryColor),
                  ),
                ),
                TextButton(
                  onPressed: () {
                    unawaited(ref.read(permissionRepositoryProvider).requestManageMediaPermission());
                    Navigator.of(context).pop();
                  },
                  child: Text(
                    context.t.manage_media_access_settings,
                    style: TextStyle(fontWeight: FontWeight.w600, color: context.primaryColor),
                  ),
                ),
              ],
            );
          },
        );
      }
    }

    bool isSyncRemoteDeletionsMode() => Platform.isAndroid && Store.get(StoreKey.manageLocalMediaAndroid, false);

    Future<void> finishLogin() async {
      final permission = ref.read(galleryPermissionNotifier.notifier);
      if (!Store.get(StoreKey.pholyIntroductionSeen, false)) {
        final allowPhotos = await showPholyIntroduction(context);
        if (!context.mounted) {
          return;
        }
        await Store.put(StoreKey.pholyIntroductionSeen, true);
        if (allowPhotos) {
          await permission.requestGalleryPermission();
        }
      } else {
        await permission.getGalleryPermissionStatus();
      }
      if (isSyncRemoteDeletionsMode()) {
        await getManageMediaPermission();
      }
      unawaited(handleSyncFlow());
      if (!context.mounted) {
        return;
      }

      ref.read(websocketProvider.notifier).connect();
      unawaited(ref.read(featureMessageServiceProvider).markSeen());
      unawaited(context.router.replaceAll([const TabShellRoute()]));
    }

    Future<void> onLogin(LoginResponse result) async {
      if (result.shouldChangePassword && !result.isAdmin && isPasswordLoginEnable.value) {
        unawaited(context.pushRoute(const ChangePasswordRoute()));
        passwordController.clear();
        return;
      }

      await finishLogin();
    }

    Future<void> login() async {
      TextInput.finishAutofillContext();

      // Invalidate all api repository provider instance to take into account new access token
      invalidateAllApiRepositoryProviders(ref);

      try {
        final result = await ref.read(authProvider.notifier).login(emailController.text, passwordController.text);

        if (!context.mounted) {
          return;
        }

        await onLogin(result);
      } catch (error) {
        if (!context.mounted) {
          return;
        }

        ImmichToast.show(
          context: context,
          msg: pholyText(
            context,
            'Anmeldung fehlgeschlagen. Prüfe E-Mail-Adresse und Passwort.',
            'Sign-in failed. Check your email address and password.',
          ),
          toastType: ToastType.error,
          gravity: ToastGravity.TOP,
        );
      }
    }

    String generateRandomString(int length) {
      const chars = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890';
      final random = Random.secure();
      return String.fromCharCodes(Iterable.generate(length, (_) => chars.codeUnitAt(random.nextInt(chars.length))));
    }

    List<int> randomBytes(int length) {
      final random = Random.secure();
      return List<int>.generate(length, (i) => random.nextInt(256));
    }

    /// Per specification, the code verifier must be 43-128 characters long
    /// and consist of characters [A-Z, a-z, 0-9, "-", ".", "_", "~"]
    /// https://datatracker.ietf.org/doc/html/rfc7636#section-4.1
    String randomCodeVerifier() {
      return base64Url.encode(randomBytes(42));
    }

    Future<String> generatePKCECodeChallenge(String codeVerifier) async {
      final bytes = utf8.encode(codeVerifier);
      final digest = sha256.convert(bytes);
      return base64Url.encode(digest.bytes).replaceAll('=', '');
    }

    Future<void> oAuthLogin() async {
      final oAuthService = ref.read(oAuthServiceProvider);
      String? oAuthServerUrl;

      final state = generateRandomString(32);

      final codeVerifier = randomCodeVerifier();
      final codeChallenge = await generatePKCECodeChallenge(codeVerifier);

      try {
        oAuthServerUrl = await oAuthService.getOAuthServerUrl(
          normalizeServerUrl(serverEndpointController.text),
          state,
          codeChallenge,
        );

        // Invalidate all api repository provider instance to take into account new access token
        invalidateAllApiRepositoryProviders(ref);
      } catch (error, stack) {
        log.severe('Error getting OAuth server Url: $error', stack);

        if (!context.mounted) {
          return;
        }

        ImmichToast.show(
          context: context,
          msg: pholyText(
            context,
            'Die externe Anmeldung ist gerade nicht verfügbar.',
            'External sign-in is currently unavailable.',
          ),
          toastType: ToastType.error,
          gravity: ToastGravity.TOP,
        );
        return;
      }

      if (oAuthServerUrl != null) {
        try {
          final loginResponseDto = await oAuthService.oAuthLogin(oAuthServerUrl, state, codeVerifier);

          if (loginResponseDto == null || !context.mounted) {
            return;
          }

          log.info('Finished OAuth login');

          final isSuccess = await ref
              .read(authProvider.notifier)
              .saveAuthInfo(accessToken: loginResponseDto.accessToken);

          if (isSuccess && context.mounted) {
            await finishLogin();
            return;
          }
        } catch (error, stack) {
          log.severe('Error logging in with OAuth: $error', stack);

          if (!context.mounted) {
            return;
          }

          ImmichToast.show(
            context: context,
            msg: error.toString(),
            toastType: ToastType.error,
            gravity: ToastGravity.TOP,
          );
        } finally {}
      } else {
        if (!context.mounted) {
          return;
        }

        ImmichToast.show(
          context: context,
          msg: context.t.login_form_failed_get_oauth_server_disable,
          toastType: ToastType.info,
          gravity: ToastGravity.TOP,
        );
        return;
      }
    }

    Future<void> passkeyLogin() async {
      invalidateAllApiRepositoryProviders(ref);

      try {
        final result = await ref.read(authProvider.notifier).passkeyLogin();
        if (result != null && context.mounted) {
          await onLogin(result);
        }
      } catch (error, stack) {
        log.severe('Error logging in with passkey', error, stack);

        if (!context.mounted) {
          return;
        }

        ImmichToast.show(
          context: context,
          msg: serverErrorMessage(error) ?? context.t.errors.something_went_wrong,
          toastType: ToastType.error,
          gravity: ToastGravity.TOP,
        );
      }
    }

    SingleChildRenderObjectWidget buildVersionCompatWarning() {
      if (warningMessage.value == null) {
        return const SizedBox.shrink();
      }

      return Padding(
        padding: const EdgeInsets.only(bottom: 8.0),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: context.isDarkTheme ? Colors.amber.shade700 : Colors.amber.shade100,
            borderRadius: BorderRadius.zero,
            border: Border.all(color: context.isDarkTheme ? Colors.amber.shade800 : Colors.amber[200]!, width: 2),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.warning_amber_rounded, color: Colors.amber.shade800),
              const SizedBox(width: 8),
              Expanded(
                child: Padding(padding: const EdgeInsets.only(top: 2), child: Text(warningMessage.value!)),
              ),
            ],
          ),
        ),
      );
    }

    final serverSelectionOrLogin = serverEndpoint.value == null
        ? Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Column(
              children: [
                if (isConnecting.value) ...[
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text(pholyText(context, 'PHOLY wird verbunden …', 'Connecting to PHOLY …')),
                ] else ...[
                  Semantics(liveRegion: true, child: Text(connectionError.value ?? '', textAlign: TextAlign.center)),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: getServerAuthSettings,
                    icon: const Icon(Icons.refresh),
                    label: Text(pholyText(context, 'Erneut versuchen', 'Try again')),
                  ),
                ],
              ],
            ),
          )
        : AutofillGroup(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.max,
              children: [
                buildVersionCompatWarning(),
                if (isPasswordLoginEnable.value)
                  ImmichForm(
                    onSubmit: login,
                    submitText: context.t.login,
                    submitIcon: Icons.login_rounded,
                    builder: (context, form) => Column(
                      spacing: ImmichSpacing.md,
                      children: [
                        ImmichEmailInput(
                          controller: emailController,
                          label: context.t.email,
                          hintText: context.t.login_form_email_hint,
                          validator: _validateEmail,
                          keyboardAction: TextInputAction.next,
                          onSubmit: (_) => passwordFocusNode.requestFocus(),
                        ),
                        ImmichPasswordInput(
                          controller: passwordController,
                          focusNode: passwordFocusNode,
                          label: context.t.password,
                          validator: (value) => value == null || value.isEmpty ? context.t.password_required : null,
                          hintText: context.t.login_form_password_hint,
                          keyboardAction: TextInputAction.go,
                          onSubmit: (_) => form.submit(),
                        ),
                      ],
                    ),
                  ),
                if (isPasswordLoginEnable.value)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: () => Navigator.of(context).push(
                        MaterialPageRoute<void>(
                          builder: (_) => PholyPasswordRecoveryPage(initialEmail: emailController.text),
                        ),
                      ),
                      child: Text(pholyText(context, 'Passwort vergessen?', 'Forgot your password?')),
                    ),
                  ),
                if (isOauthEnable.value)
                  ImmichForm(
                    onSubmit: oAuthLogin,
                    submitText: oAuthButtonLabel.value,
                    submitIcon: Icons.pin_outlined,
                    builder: (context, _) => isPasswordLoginEnable.value
                        ? Padding(
                            padding: const EdgeInsets.only(left: 18.0, right: 18.0, top: 12.0),
                            child: Divider(color: context.isDarkTheme ? Colors.white : Colors.black, height: 5),
                          )
                        : const SizedBox.shrink(),
                  ),
                if (isPasskeyEnable.value)
                  ImmichForm(
                    onSubmit: passkeyLogin,
                    submitText: context.t.login_with_passkey,
                    submitIcon: Icons.key_outlined,
                    builder: (context, _) => isPasswordLoginEnable.value || isOauthEnable.value
                        ? Padding(
                            padding: const EdgeInsets.only(left: 18.0, right: 18.0, top: 12.0),
                            child: Divider(color: context.colorScheme.onSurface, height: 5),
                          )
                        : const SizedBox.shrink(),
                  ),
                if (!isOauthEnable.value && !isPasswordLoginEnable.value && !isPasskeyEnable.value)
                  Center(child: Text(context.t.login_disabled)),
              ],
            ),
          );

    return SafeArea(
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          padding: EdgeInsets.symmetric(horizontal: 20, vertical: (constraints.maxHeight * .06).clamp(24.0, 64.0)),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: PholyWordmark(width: 232)),
                  const SizedBox(height: 28),
                  Text(
                    pholyText(context, 'Deine Fotos.\nDeine Erinnerungen.', 'Your photos.\nYour memories.'),
                    textAlign: TextAlign.center,
                    style: context.textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w600, height: 1.15),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    pholyText(context, 'Melde dich mit deinem PHOLY-Konto an.', 'Sign in with your PHOLY account.'),
                    textAlign: TextAlign.center,
                    style: context.textTheme.bodyLarge,
                  ),
                  const SizedBox(height: 28),
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: context.colorScheme.surfaceContainer,
                      border: Border.all(color: context.colorScheme.outlineVariant),
                    ),
                    child: serverSelectionOrLogin,
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.lock_outline, size: 16, color: context.colorScheme.onSurfaceVariant),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(
                          pholyText(context, 'Kostenlos. Nur mit Einladung.', 'Free. By invitation only.'),
                          style: context.textTheme.bodySmall?.copyWith(color: context.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
