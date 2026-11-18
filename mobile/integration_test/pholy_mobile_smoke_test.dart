import 'dart:convert';
import 'dart:io';
import 'dart:ui';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/data/store.dart' as app_store;
import 'package:immich_mobile/domain/models/settings_key.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/background_worker.service.dart';
import 'package:immich_mobile/entities/store.entity.dart' as db_store;
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/infrastructure/repositories/settings.repository.dart';
import 'package:immich_mobile/main.dart' as app;
import 'package:immich_mobile/pages/common/tab_shell.page.dart';
import 'package:immich_mobile/pages/login/pholy_password_recovery.page.dart';
import 'package:immich_mobile/pholy/comments/photo_comments.widget.dart';
import 'package:immich_mobile/pholy/community/community.page.dart';
import 'package:immich_mobile/pholy/community/community_profile.page.dart';
import 'package:immich_mobile/platform/background_worker_api.g.dart';
import 'package:immich_mobile/presentation/widgets/asset_viewer/asset_viewer.page.dart';
import 'package:immich_mobile/presentation/widgets/images/thumbnail_tile.widget.dart';
import 'package:immich_mobile/providers/auth.provider.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';
import 'package:immich_mobile/providers/websocket.provider.dart';
import 'package:immich_mobile/services/foreground_upload.service.dart';
import 'package:immich_mobile/utils/bootstrap.dart';
import 'package:immich_mobile/widgets/forms/login/login_form.dart';
import 'package:immich_mobile/wm_executor.dart';
import 'package:integration_test/integration_test.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import 'test_utils/pholy_smoke_fixture.dart';

/// Run only on a dedicated Android emulator, with the loopback compile-time URL:
/// flutter test -d emulator-5554 integration_test/pholy_mobile_smoke_test.dart \
///   --dart-define=PHOLY_SERVER_URL=http://127.0.0.1:17415
///
/// The HTTP server lives inside the test process. The real MainWidget, native
/// HTTP transport, auth/session state, SQLite/Drift sync, uploader and routing
/// are used. There is no fixture override of those application providers.
/// Real-device permission pickers, SMTP delivery and OS-scheduled/killed-app
/// background uploads are deliberately outside this synthetic smoke test.
void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  binding.framePolicy = LiveTestWidgetsFlutterBindingFramePolicy.fullyLive;

  testWidgets('PHOLY Android: login, sync, photo upload and isolated photo discussions', (tester) async {
    // Fail before initializing or clearing any app data if launched incorrectly.
    expect(
      PholyBrand.serverUrl,
      PholySmokeFixture.baseUrl,
      reason: 'A production server must never be used by this test',
    );
    expect(Platform.isAndroid, isTrue, reason: 'This smoke harness is for the isolated Android emulator');
    final package = await PackageInfo.fromPlatform();
    expect(
      package.packageName == 'de.pholy.app.debug' || package.packageName == 'de.pholy.app.test',
      isTrue,
      reason: 'Install a separate PHOLY test application; never run against the production package',
    );
    expect(
      (await DeviceInfoPlugin().androidInfo).isPhysicalDevice,
      isFalse,
      reason: 'Use a dedicated emulator with synthetic media only',
    );

    final fixture = await PholySmokeFixture.start();
    final checks = <String>[];
    final screenshots = <String>[];
    final screenshotDetails = <Map<String, Object?>>[];
    final external = await getExternalStorageDirectory();
    final evidence = await Directory('${external!.path}/pholy-smoke-evidence').create(recursive: true);
    ProviderContainer? container;
    bool surfaceConverted = false;
    bool completed = false;
    Size? logicalSurfaceSize;

    Future<void> saveEvidence() async {
      final report = <String, dynamic>{
        'passed': completed,
        'applicationId': package.packageName,
        'appVersion': '${package.version}+${package.buildNumber}',
        'fixtureUrl': PholySmokeFixture.baseUrl,
        'checks': checks,
        'screenshots': screenshots,
        'screenshotDetails': screenshotDetails,
        ...fixture.evidence,
        'notCovered': [
          'A real PHOLY account or production data',
          'SMTP delivery / opening a real password-reset email',
          'Native photo picker permissions and background execution after process death',
          'iOS build, signing and device behavior',
        ],
      };
      // flutter drive receives the same evidence as adb pulls. Keep its own
      // screenshot payload intact for the extended driver's onScreenshot hook.
      binding.reportData ??= <String, dynamic>{};
      binding.reportData!['pholySmoke'] = report;
      final pendingReport = File('${evidence.path}/result.json.tmp');
      await pendingReport.writeAsString(const JsonEncoder.withIndent('  ').convert(report), flush: true);
      await pendingReport.rename('${evidence.path}/result.json');
    }

    Future<void> capture(String name, {Duration timeout = const Duration(seconds: 20)}) async {
      final nativeSize = tester.view.physicalSize;
      final logicalSize = logicalSurfaceSize ?? nativeSize / tester.view.devicePixelRatio;
      final detail = <String, Object?>{
        'file': '$name.png',
        'source': 'native Android Flutter surface',
        'layout': logicalSurfaceSize == null ? 'native device' : 'simulated logical layout fitted to native surface',
        'logicalWidth': logicalSize.width,
        'logicalHeight': logicalSize.height,
        'nativePhysicalWidth': nativeSize.width,
        'nativePhysicalHeight': nativeSize.height,
        'nativeDevicePixelRatio': tester.view.devicePixelRatio,
        'mediaQueryMetrics': 'native device',
        'captureTimeoutSeconds': timeout.inSeconds,
        'status': 'started',
      };
      screenshotDetails.add(detail);
      // Persist completed checks before requesting a screenshot, so the host
      // can retain progress even if the emulator or graphics backend stops.
      await saveEvidence();
      debugPrint('PHOLY_SMOKE_PROGRESS capture=$name checks=${checks.length} screenshots=${screenshots.length}');
      try {
        await _hideKeyboard(tester);
        if (!surfaceConverted) {
          await binding.convertFlutterSurfaceToImage().timeout(timeout);
          surfaceConverted = true;
        }
        await tester.pump(const Duration(milliseconds: 250));
        final bytes = await binding.takeScreenshot(name).timeout(timeout);
        expect(bytes.length, greaterThanOrEqualTo(24), reason: 'A complete PNG header is required for $name');
        expect(bytes.take(8), orderedEquals([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
        final header = ByteData.sublistView(Uint8List.fromList(bytes));
        detail['pngWidth'] = header.getUint32(16);
        detail['pngHeight'] = header.getUint32(20);
        await File('${evidence.path}/$name.png').writeAsBytes(bytes, flush: true);
        screenshots.add('$name.png');
        detail['status'] = 'complete';
        await saveEvidence();
      } catch (error) {
        detail['status'] = 'failed';
        detail['failure'] = error.toString();
        await saveEvidence();
        rethrow;
      }
    }

    addTearDown(() async {
      // Failed widget tests retain their tree until binding.postTest. Capture
      // it before closing the fixture/providers and before flutter drive exits
      // the app; the host's later screenshot would only show the launcher.
      try {
        if (!completed && container != null) {
          try {
            await capture('99-failure', timeout: const Duration(seconds: 5)).timeout(const Duration(seconds: 10));
          } catch (_) {
            debugPrint('PHOLY_SMOKE_FAILURE_SCREENSHOT_UNAVAILABLE');
          }
        }
        await saveEvidence();
        if (container case final current?) {
          current.read(websocketProvider.notifier).disconnect();
          await current.read(backgroundSyncProvider).cancel();
        }
        await BackgroundWorkerFgService(BackgroundWorkerFgHostApi()).disable();
        await fixture.close();
        await workerManagerPatch.dispose();
      } finally {
        await binding.setSurfaceSize(null);
        logicalSurfaceSize = null;
      }
    });

    await EasyLocalization.ensureInitialized();
    final (dataController, apiService) = await Bootstrap.initDomain();
    final previousToken = db_store.Store.tryGet(StoreKey.accessToken);
    final previousEndpoint = db_store.Store.tryGet(StoreKey.serverEndpoint);
    expect(
      previousToken == null || previousToken == PholySmokeFixture.sessionToken,
      isTrue,
      reason: 'The emulator contains a non-fixture session; uninstall its test app before running this test',
    );
    expect(
      previousEndpoint == null || previousEndpoint == '${PholySmokeFixture.baseUrl}/api',
      isTrue,
      reason: 'The emulator contains non-fixture server state; do not clear user data',
    );
    await db_store.Store.clear();
    await SettingsRepository.instance.clear(SettingsKey.values);
    // Ensure even the startup logout uses loopback, before the normal login
    // form discovers the same endpoint through /.well-known/immich.
    await apiService.resolveAndSetEndpoint(PholySmokeFixture.baseUrl);

    final originalFlutterErrorHandler = FlutterError.onError;
    final originalPlatformErrorHandler = PlatformDispatcher.instance.onError;
    await app.initApp();
    FlutterError.onError = originalFlutterErrorHandler;
    PlatformDispatcher.instance.onError = originalPlatformErrorHandler;
    await workerManagerPatch.init(dynamicSpawning: true, isolatesCount: 5);
    await BackgroundWorkerFgService(BackgroundWorkerFgHostApi()).disable();
    await tester.pumpWidget(
      ProviderScope(
        overrides: app_store.Store.overrideWith(dataController: dataController, apiService: apiService),
        child: const app.MainWidget(),
      ),
    );
    await _until(tester, () => find.byType(LoginForm).evaluate().isNotEmpty, 'PHOLY login screen');
    await tester.element(find.byType(LoginForm)).setLocale(const Locale('en'));
    await _until(tester, () => find.byType(TextFormField).evaluate().length == 2, 'fixed-server credentials form');
    container = ProviderScope.containerOf(tester.element(find.byType(LoginForm)));
    final providers = container;
    await BackgroundWorkerFgService(BackgroundWorkerFgHostApi()).disable();
    expect(db_store.Store.get(StoreKey.serverEndpoint), '${PholySmokeFixture.baseUrl}/api');
    expect(find.byType(TextFormField), findsNWidgets(2), reason: 'The normal login must not ask for a server URL');
    checks.add('Automatic PHOLY endpoint discovery; only email/password fields');
    await tester.element(find.byType(LoginForm)).setLocale(const Locale('de'));
    await _until(
      tester,
      () =>
          Localizations.localeOf(tester.element(find.byType(LoginForm))).languageCode == 'de' &&
          find.text('Deine Fotos.\nDeine Erinnerungen.').evaluate().isNotEmpty &&
          find.byType(TextFormField).evaluate().length == 2,
      'German PHOLY login rendering',
    );
    await capture('01-login-de');
    await tester.element(find.byType(LoginForm)).setLocale(const Locale('en'));
    await _until(
      tester,
      () =>
          Localizations.localeOf(tester.element(find.byType(LoginForm))).languageCode == 'en' &&
          find.text('Your photos.\nYour memories.').evaluate().isNotEmpty &&
          find.byType(TextFormField).evaluate().length == 2,
      'English PHOLY login restored for interaction checks',
    );
    await capture('01-login-light');

    // Empty fields are rejected before any request reaches the server.
    final loginLabel = StaticTranslations.instance.login;
    final loginButton = find.descendant(
      of: find.byType(LoginForm),
      matching: find.widgetWithText(ElevatedButton, loginLabel),
    );
    _expectLoginValues(tester, email: '', password: '');
    await _tap(tester, loginButton);
    expect(find.text(StaticTranslations.instance.login_form_err_invalid_email), findsOneWidget);
    expect(find.text(StaticTranslations.instance.password_required), findsOneWidget);
    expect(fixture.loginAttempts, 0);
    checks.add('Empty email and password validation blocks HTTP login');

    // This is a request to the in-memory fixture, not an actual email send.
    await _tap(tester, find.text('Forgot your password?'));
    await _until(
      tester,
      () =>
          find.byType(PholyPasswordRecoveryPage).evaluate().isNotEmpty &&
          find.byType(TextFormField).evaluate().length == 1,
      'password-recovery form',
    );
    await tester.enterText(find.byType(TextFormField), PholySmokeFixture.email);
    await _hideKeyboard(tester);
    await _tap(tester, find.text('Request reset link'));
    await _until(tester, () => find.text('Back to sign in').evaluate().isNotEmpty, 'generic reset acceptance');
    expect(fixture.passwordResetRequests, 1);
    await capture('02-password-recovery');
    await _tap(tester, find.text('Back to sign in'));
    checks.add('Password recovery availability and generic acceptance; synthetic request only');

    await _until(tester, () => find.byType(TextFormField).evaluate().length == 2, 'login fields after recovery');
    await tester.enterText(find.byType(TextFormField).at(0), PholySmokeFixture.email);
    await tester.enterText(find.byType(TextFormField).at(1), 'wrong-synthetic-password');
    await _hideKeyboard(tester);
    _expectLoginValues(tester, email: PholySmokeFixture.email, password: 'wrong-synthetic-password');
    await _tap(tester, loginButton);
    await _until(tester, () => fixture.loginAttempts == 1, 'wrong-password HTTP response');
    await _until(
      tester,
      () => loginButton.evaluate().length == 1 && tester.widget<ElevatedButton>(loginButton).onPressed != null,
      'login form completes the rejected request and enables its submit button',
    );
    expect(providers.read(authProvider).isAuthenticated, isFalse);
    expect(find.byType(LoginForm), findsOneWidget);
    checks.add('Wrong password rejected without an authenticated session');

    await tester.enterText(find.byType(TextFormField).at(1), PholySmokeFixture.password);
    await _hideKeyboard(tester);
    _expectLoginValues(tester, email: PholySmokeFixture.email, password: PholySmokeFixture.password);
    await _tap(tester, loginButton);
    await _until(tester, () => fixture.loginAttempts >= 2, 'second login HTTP request');
    expect(fixture.loginAttempts, 2, reason: 'Exactly one rejected and one corrected login must be sent');
    expect(
      fixture.successfulLogins,
      1,
      reason: 'The intended synthetic credentials must be accepted; inspect the value-free login diagnostics',
    );
    await _until(tester, () => providers.read(authProvider).isAuthenticated, 'authenticated application session');
    expect(providers.read(authProvider).userId, PholySmokeFixture.userId);
    await _until(tester, () => find.text('Later').evaluate().isNotEmpty, 'PHOLY permission introduction');
    await capture('03-introduction');
    await _tap(tester, find.text('Later'));
    await _until(tester, () => find.byType(TabShellPage).evaluate().isNotEmpty, 'authenticated library');
    expect(providers.read(authProvider).isAuthenticated, isTrue);
    expect(providers.read(appConfigProvider).backup.enabled, isFalse);
    expect(db_store.Store.get(StoreKey.pholyIntroductionSeen, false), isTrue);
    checks.add('Successful existing-account login and optional photo-access introduction; automatic backup stays off');

    // Observe real Drift insertion and an actual visible thumbnail after the
    // standard isolate-based Immich sync, rather than seeding a UI provider.
    // Join the login flow's local sync first so its remote sync cannot start
    // later and overlap the fresh sync requested after the upload below.
    await providers.read(backgroundSyncProvider).syncLocal(full: true).timeout(const Duration(seconds: 90));
    expect(await providers.read(backgroundSyncProvider).syncRemote().timeout(const Duration(seconds: 90)), isTrue);
    final firstAsset = await providers.read(assetServiceProvider).getRemoteAsset(PholySmokeFixture.photoId);
    expect(firstAsset?.id, PholySmokeFixture.photoId);
    await _until(tester, () => _photoTile(PholySmokeFixture.photoId).evaluate().isNotEmpty, 'synced gallery thumbnail');
    // The existing first-launch release notes are a modal route. A thumbnail
    // can be built behind them, so close their real action before tapping it.
    final releaseNotes = find.widgetWithText(Dialog, StaticTranslations.instance.whats_new);
    if (releaseNotes.evaluate().isNotEmpty) {
      await _tap(
        tester,
        find.descendant(of: releaseNotes, matching: find.widgetWithText(TextButton, StaticTranslations.instance.skip)),
      );
      await _until(tester, () => releaseNotes.evaluate().isEmpty, 'dismissed first-launch release notes');
      checks.add('Existing first-launch release notes dismissed through the visible Skip action');
    }
    await tester.ensureVisible(_photoTile(PholySmokeFixture.photoId).first);
    await _until(
      tester,
      () => _photoTile(PholySmokeFixture.photoId).hitTestable().evaluate().isNotEmpty,
      'visible, unobscured gallery thumbnail',
    );
    expect(fixture.syncRequests, greaterThan(0));
    expect(fixture.syncAcks, greaterThan(0));
    await capture('04-gallery');
    checks.add('Real remote sync stream acknowledged and stored in Drift; gallery thumbnail rendered');

    await _tap(tester, _photoTile(PholySmokeFixture.photoId).hitTestable().first);
    await _until(
      tester,
      () =>
          find.byType(AssetViewerPage).evaluate().isNotEmpty &&
          find.text('A synthetic private comment').evaluate().isNotEmpty,
      'photo viewer with private discussion',
    );
    await _draftSurvivesToggle(tester, 'A private draft that stays private');
    expect(fixture.commentRequests.where((request) => request['kind'] == 'private'), isNotEmpty);
    await capture('05-private-photo-comments');
    checks.add('Existing photo viewer loads media and private comments; collapsed draft is preserved');
    await _back(tester);
    await _until(tester, () => find.byType(AssetViewerPage).evaluate().isEmpty, 'return from private viewer');

    // The exact application upload path sends a multipart body through the
    // native HTTP client, using a generated image in the test app's own storage.
    final syntheticFile = File('${(await getApplicationSupportDirectory()).path}/pholy-synthetic-upload.png');
    expect(
      fixture.uploadPhotoChecksum,
      isNot(fixture.photoChecksum),
      reason: 'A newly created asset must contain different bytes from the existing photo',
    );
    await syntheticFile.writeAsBytes(fixture.uploadPhoto, flush: true);
    final uploadedIds = <String>[];
    final uploadErrors = <String>[];
    await providers
        .read(foregroundUploadServiceProvider)
        .uploadShareIntent(
          [syntheticFile],
          onSuccess: (_, remoteId) => uploadedIds.add(remoteId),
          onError: (_, error) => uploadErrors.add(error),
        )
        .timeout(const Duration(seconds: 60));
    expect(uploadErrors, isEmpty);
    expect(uploadedIds, [PholySmokeFixture.uploadedPhotoId]);
    expect(fixture.uploadRequests, 1);
    expect(fixture.uploadIncludedAssetData, isTrue);
    expect(fixture.uploadIncludedDates, isTrue);
    expect(fixture.uploadMatchesExpectedPhoto, isTrue);
    expect(fixture.uploadedBytes, greaterThan(fixture.uploadPhoto.length));
    // Every pass must succeed. Replaying the fixture's complete stream twice
    // verifies that the new asset does not replace the existing checksum row
    // or invalidate the album thumbnail; this is not a retry after failure.
    for (var pass = 0; pass < 2; pass++) {
      expect(
        await providers.read(backgroundSyncProvider).syncRemote().timeout(const Duration(seconds: 90)),
        isTrue,
        reason: 'Post-upload sync pass ${pass + 1} must complete without a database/stream error',
      );
      for (final (id, checksum) in [
        (PholySmokeFixture.photoId, fixture.photoChecksum),
        (PholySmokeFixture.uploadedPhotoId, fixture.uploadPhotoChecksum),
      ]) {
        final asset = await providers.read(assetServiceProvider).getRemoteAsset(id);
        expect(asset?.id, id);
        expect(asset?.checksum, checksum);
      }
    }
    await _until(
      tester,
      () => _photoTile(PholySmokeFixture.uploadedPhotoId).hitTestable().evaluate().isNotEmpty,
      'uploaded image visible in the real gallery after sync',
    );
    await syntheticFile.delete();
    checks.add(
      'Real multipart upload with distinct PNG bytes and dates; both original and uploaded assets survive repeated sync and the upload appears in the gallery',
    );
    await capture('05-uploaded-gallery');

    // Open the same asset via an album: it must use the separate album scope,
    // and never reuse the private draft or the original Immich activity API.
    await _tap(tester, find.widgetWithText(NavigationDestination, StaticTranslations.instance.albums));
    await _until(tester, () => find.text('Synthetic album').evaluate().isNotEmpty, 'synced album');
    await _tap(tester, find.text('Synthetic album').first);
    await _until(tester, () => _photoTile(PholySmokeFixture.photoId).evaluate().isNotEmpty, 'album photo');
    await _tap(tester, _photoTile(PholySmokeFixture.photoId).first);
    await _until(
      tester,
      () => find.text('A synthetic album comment').evaluate().isNotEmpty,
      'album-scoped photo discussion',
    );
    expect(_draftValue(tester), isEmpty);
    expect(find.text('A synthetic private comment'), findsNothing);
    expect(
      fixture.commentRequests.where(
        (request) =>
            request['kind'] == 'album' &&
            request['albumId'] == PholySmokeFixture.albumId &&
            !request.containsKey('profileSlug'),
      ),
      isNotEmpty,
    );
    await capture('06-album-photo-comments');
    checks.add('Album discussion isolated from private discussion and draft');
    await _back(tester);
    await _back(tester);
    await _until(
      tester,
      () => find.widgetWithText(NavigationDestination, 'Community').evaluate().isNotEmpty,
      'bottom navigation after album',
    );

    await _tap(tester, find.widgetWithText(NavigationDestination, 'Community'));
    await _until(
      tester,
      () =>
          find.byType(PholyCommunityPage).evaluate().isNotEmpty && find.text('Synthetic Gallery').evaluate().isNotEmpty,
      'community directory',
    );
    await capture('07-community');
    await _tap(tester, find.text('Synthetic Gallery').first);
    await _until(
      tester,
      () =>
          find.byType(CommunityProfilePage).evaluate().isNotEmpty &&
          find
              .byKey(const ValueKey('${PholySmokeFixture.profileSlug}:${PholySmokeFixture.photoId}'))
              .evaluate()
              .isNotEmpty,
      'public community profile',
    );
    await _tap(tester, find.text('Follow'));
    await _until(tester, () => fixture.followsProfile, 'synthetic follow relation');
    await _tap(tester, find.byKey(const ValueKey('${PholySmokeFixture.profileSlug}:${PholySmokeFixture.photoId}')));
    await _until(
      tester,
      () =>
          find.byType(CommunityPhotoViewerPage).evaluate().isNotEmpty &&
          find.text('A synthetic community comment').evaluate().isNotEmpty,
      'public photo with community comments',
    );
    expect(_draftValue(tester), isEmpty);
    expect(find.text('A synthetic private comment'), findsNothing);
    expect(find.text('A synthetic album comment'), findsNothing);
    expect(fixture.publicImageRequests, greaterThan(0));
    expect(find.byKey(const ValueKey('pholy-comment-menu-${PholySmokeFixture.otherCommentId}')), findsNothing);
    expect(find.byKey(const ValueKey('pholy-comment-menu-${PholySmokeFixture.ownCommentId}')), findsOneWidget);
    checks.add('Community discovery, profile, follow and public preview; only the author has edit/delete controls');

    await _draftSurvivesToggle(tester, 'A synthetic community message');
    await _tap(tester, find.byKey(const ValueKey('pholy-comment-send')));
    await _until(
      tester,
      () => fixture.commentRequests.any(
        (request) => request['method'] == 'POST' && request['body'] == 'A synthetic community message',
      ),
      'public comment creation',
    );
    await _until(tester, () => _draftValue(tester).isEmpty, 'composer clears after successful submission');
    await _readyComposer(tester);
    await _hideKeyboard(tester);

    final otherEntry = find.byKey(const ValueKey('pholy-comment-${PholySmokeFixture.otherCommentId}'));
    await _tap(tester, find.descendant(of: otherEntry, matching: find.text('Reply')));
    await tester.enterText(find.byKey(const ValueKey('pholy-comment-draft')), 'A synthetic threaded reply');
    await _tap(tester, find.byKey(const ValueKey('pholy-comment-send')));
    await _until(
      tester,
      () => fixture.commentRequests.any(
        (request) =>
            request['method'] == 'POST' &&
            request['parentId'] == PholySmokeFixture.otherCommentId &&
            request['body'] == 'A synthetic threaded reply',
      ),
      'threaded reply carries parent ID',
    );
    await _readyComposer(tester);
    await _hideKeyboard(tester);

    await _tap(tester, find.byKey(const ValueKey('pholy-comment-like-${PholySmokeFixture.otherCommentId}')));
    await _until(
      tester,
      () => fixture.commentRequests.any(
        (request) =>
            request['method'] == 'PUT' &&
            (request['path']! as String).endsWith('/${PholySmokeFixture.otherCommentId}/like'),
      ),
      'comment like',
    );
    await _until(
      tester,
      () => find.descendant(of: otherEntry, matching: find.text('Like · 1')).evaluate().isNotEmpty,
      'updated like count',
    );
    checks.add('Community comment, threaded reply and like use the existing PHOLY HTTP contracts');

    // Exercise only the fixture author's permitted actions.
    final ownMenu = find.byKey(const ValueKey('pholy-comment-menu-${PholySmokeFixture.ownCommentId}'));
    await _scrollDiscussionTo(tester, ownMenu);
    await _tap(tester, ownMenu);
    await _tap(tester, find.text('Edit').last);
    expect(_draftValue(tester), 'My synthetic public comment');
    await tester.enterText(find.byKey(const ValueKey('pholy-comment-draft')), 'My edited synthetic public comment');
    await _tap(tester, find.byKey(const ValueKey('pholy-comment-send')));
    await _until(
      tester,
      () => fixture.commentRequests.any(
        (request) => request['method'] == 'PATCH' && request['body'] == 'My edited synthetic public comment',
      ),
      'allowed comment edit',
    );
    await _readyComposer(tester);
    await _hideKeyboard(tester);
    await _scrollDiscussionTo(tester, ownMenu);
    await _tap(tester, ownMenu);
    await _tap(tester, find.text('Delete').last);
    await _until(tester, () => find.byType(AlertDialog).evaluate().isNotEmpty, 'delete confirmation');
    await _tap(tester, find.widgetWithText(FilledButton, 'Delete'));
    await _until(
      tester,
      () => fixture.commentRequests.any(
        (request) =>
            request['method'] == 'DELETE' &&
            (request['path']! as String).endsWith('/${PholySmokeFixture.ownCommentId}'),
      ),
      'allowed comment deletion',
    );
    await _readyComposer(tester);
    await _until(tester, () => ownMenu.evaluate().isEmpty, 'deleted comment disappears');
    checks.add('Author can edit and delete after confirmation; other-author controls are absent');
    await capture('08-community-comments');

    // The same widget must adapt without discarding an unsubmitted draft.
    await tester.enterText(find.byKey(const ValueKey('pholy-comment-draft')), 'Responsive draft');
    await _hideKeyboard(tester);
    await providers.read(settingsProvider).write(SettingsKey.themeMode, ThemeMode.dark);
    await _until(
      tester,
      () => Theme.of(tester.element(find.byType(CommunityPhotoViewerPage))).brightness == Brightness.dark,
      'dark theme',
    );
    // The live integration binding fits logical layouts into the unchanged
    // Android surface. Faking physicalSize instead mismatches the native
    // ImageView and can leave its screenshot frame acquisition waiting forever.
    logicalSurfaceSize = const Size(360, 740);
    await binding.setSurfaceSize(logicalSurfaceSize);
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.getSize(find.byType(CommunityPhotoViewerPage)), logicalSurfaceSize);
    expect(_draftValue(tester), 'Responsive draft');
    expect(tester.takeException(), isNull, reason: 'No overflow at a narrow phone size');
    await _readyDarkCommentColors(tester);
    await capture('09-community-dark-small');
    logicalSurfaceSize = const Size(1000, 700);
    await binding.setSurfaceSize(logicalSurfaceSize);
    await tester.pump(const Duration(milliseconds: 400));
    expect(tester.getSize(find.byType(CommunityPhotoViewerPage)), logicalSurfaceSize);
    expect(_draftValue(tester), 'Responsive draft');
    expect(tester.takeException(), isNull, reason: 'No overflow in the wide split view');
    await _readyDarkCommentColors(tester);
    await capture('10-community-dark-wide');
    await binding.setSurfaceSize(null);
    logicalSurfaceSize = null;
    await providers.read(settingsProvider).write(SettingsKey.themeMode, ThemeMode.light);
    await tester.pump(const Duration(milliseconds: 400));
    checks.add(
      'Dark theme and simulated logical layouts at 360×740 and 1000×700 render without overflow on the native surface; draft survives layout changes',
    );

    // Switching photos changes the discussion and clears its previous draft.
    await _tap(tester, find.byTooltip('Next photo'));
    await _until(
      tester,
      () =>
          find.text('2 / 2').evaluate().isNotEmpty &&
          find.byKey(const ValueKey('pholy-comment-draft')).evaluate().isEmpty &&
          find.byKey(const ValueKey('pholy-comment-like-${PholySmokeFixture.otherCommentId}')).evaluate().isNotEmpty,
      'read-only discussion on next photo',
    );
    expect(find.byKey(const ValueKey('pholy-comment-menu-${PholySmokeFixture.otherCommentId}')), findsNothing);
    final readOnlyLike = tester.widget<TextButton>(
      find.byKey(const ValueKey('pholy-comment-like-${PholySmokeFixture.otherCommentId}')),
    );
    expect(readOnlyLike.onPressed, isNull);
    await capture('11-read-only-discussion');
    await _tap(tester, find.byTooltip('Previous photo'));
    await _until(
      tester,
      () => find.byKey(const ValueKey('pholy-comment-draft')).evaluate().isNotEmpty,
      'return to writable discussion',
    );
    expect(_draftValue(tester), isEmpty);
    expect(fixture.deniedMutationRequests, 0, reason: 'Disabled actions must not emit a forbidden HTTP mutation');
    checks.add('Read-only permissions hide composer and disable likes; switching photos resets the previous draft');

    final scopes = fixture.commentRequests.map((request) => request['kind']).toSet();
    expect(scopes, containsAll(['private', 'album', 'community']));
    expect(fixture.commentRequests.any((request) => request.containsKey('slug')), isFalse);
    expect(
      fixture.commentRequests
          .where((request) => request['kind'] == 'community')
          .every(
            (request) => request['profileSlug'] == PholySmokeFixture.profileSlug && !request.containsKey('albumId'),
          ),
      isTrue,
    );
    expect(fixture.invalidContextRequests, 0);
    expect(fixture.errors, isEmpty);
    expect(fixture.unexpectedRequests, isEmpty);
    expect(tester.takeException(), isNull);
    checks.add('Private, album and community requests are strictly separate; community always uses profileSlug');
    completed = true;
    await saveEvidence();
    // Accessible through adb pull from this isolated application's external files.
    // No session token or password is included in the evidence document.
    debugPrint('PHOLY_SMOKE_EVIDENCE=${evidence.path}');
  }, timeout: const Timeout(Duration(minutes: 12)));
}

Finder _photoTile(String id) => find.byWidgetPredicate((widget) => widget is ThumbnailTile && widget.asset?.id == id);

Future<void> _readyDarkCommentColors(WidgetTester tester) async {
  final toggle = find.byKey(const ValueKey('pholy-comments-toggle'));
  final send = find.byKey(const ValueKey('pholy-comment-send'));
  Color? renderedIconColor(Finder control) {
    final icon = find.descendant(of: control, matching: find.byType(Icon));
    final glyph = find.descendant(of: icon, matching: find.byType(RichText));
    return glyph.evaluate().length == 1 ? tester.widget<RichText>(glyph).text.style?.color : null;
  }

  ({Color primary, Color onPrimary})? previousColors;
  var stableFrames = 0;
  await _until(
    tester,
    () {
      final theme = Theme.of(tester.element(find.byType(CommunityPhotoViewerPage)));
      final colors = (primary: theme.colorScheme.primary, onPrimary: theme.colorScheme.onPrimary);
      // Theme.brightness changes before animated control colors necessarily
      // finish. Check the actual painted icon glyphs, with an enabled draft.
      final ready =
          theme.brightness == Brightness.dark &&
          send.evaluate().length == 1 &&
          tester.widget<IconButton>(send).onPressed != null &&
          renderedIconColor(toggle) == colors.primary &&
          renderedIconColor(send) == colors.onPrimary;
      stableFrames = ready ? (colors == previousColors ? stableFrames + 1 : 1) : 0;
      previousColors = ready ? colors : null;
      return stableFrames >= 2;
    },
    'settled rendered dark comment-control colors',
    timeout: const Duration(seconds: 5),
  );
}

Future<void> _scrollDiscussionTo(WidgetTester tester, Finder target) async {
  final list = find.descendant(of: find.byType(PholyPhotoComments), matching: find.byType(ListView));
  final scrollable = find.descendant(of: list, matching: find.byType(Scrollable));
  await _until(tester, () => scrollable.evaluate().length == 1, 'photo discussion list scrollable');
  // Replies are inserted before later root comments. Their menu may therefore
  // not have an element yet. Scroll the actual discussion list to build it;
  // the photo PageView and the composer's separate Scrollables stay untouched.
  await tester.scrollUntilVisible(
    target,
    140,
    scrollable: scrollable,
    maxScrolls: 12,
    duration: const Duration(milliseconds: 100),
    continuous: true,
  );
}

Future<void> _until(
  WidgetTester tester,
  bool Function() condition,
  String description, {
  Duration timeout = const Duration(seconds: 45),
}) async {
  final timer = Stopwatch()..start();
  while (!condition()) {
    if (timer.elapsed > timeout) {
      fail('Timed out waiting for $description');
    }
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await _until(tester, () => finder.evaluate().isNotEmpty, 'tap target $finder');
  final timer = Stopwatch()..start();
  ({Rect rect, double bottomInset})? previousGeometry;
  var stableSamples = 0;
  while (timer.elapsed < const Duration(seconds: 45)) {
    // Native IME animations can arrive after TextInput.hide completes. Observe
    // the actual target and viewport after each frame, rather than checking a
    // finder, pumping another unchecked frame and resolving it again in tap().
    final target = finder.hitTestable();
    final matches = target.evaluate().length;
    if (matches == 1) {
      final geometry = (rect: tester.getRect(target), bottomInset: tester.view.viewInsets.bottom);
      stableSamples = geometry == previousGeometry ? stableSamples + 1 : 1;
      previousGeometry = geometry;
      if (stableSamples >= 3) {
        // No further pump or asynchronous finder lookup before this single
        // gesture. The coordinate belongs to the currently hit-testable target.
        await tester.tapAt(geometry.rect.center);
        await tester.pump(const Duration(milliseconds: 200));
        return;
      }
    } else {
      stableSamples = 0;
      previousGeometry = null;
      if (finder.evaluate().length == 1) {
        await tester.ensureVisible(finder);
      }
    }
    await tester.pump(const Duration(milliseconds: 100));
  }
  fail('Timed out waiting for a stable, unobscured tap target $finder');
}

Future<void> _hideKeyboard(WidgetTester tester) async {
  FocusManager.instance.primaryFocus?.unfocus();
  // IntegrationTest keeps the real IME, so TestTextInput.onCleared does not
  // reset this cached state. Without the reset, enterText on the same field
  // skips requestKeyboard and sends its value to a closed TextInputConnection.
  tester.binding.focusedEditable = null;
  await SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
  await tester.pump(const Duration(milliseconds: 350));
}

void _expectLoginValues(WidgetTester tester, {required String email, required String password}) {
  final fields = find.byType(TextFormField);
  expect(fields, findsNWidgets(2));
  // Compare booleans so a failing assertion never prints credential contents.
  expect(
    tester.widget<TextFormField>(fields.at(0)).controller?.text == email,
    isTrue,
    reason: 'The email controller must contain the intended synthetic value before login',
  );
  expect(
    tester.widget<TextFormField>(fields.at(1)).controller?.text == password,
    isTrue,
    reason: 'The password controller must contain the intended synthetic value before login',
  );
}

Future<void> _back(WidgetTester tester) async {
  await _hideKeyboard(tester);
  // Immich's photo viewer uses its own ElevatedButton rather than a Flutter
  // BackButton. Exercise Android's real router back path for both viewers.
  await tester.binding.handlePopRoute();
  await tester.pump(const Duration(milliseconds: 400));
}

String _draftValue(WidgetTester tester) =>
    tester.widget<TextField>(find.byKey(const ValueKey('pholy-comment-draft'))).controller!.text;

Future<void> _readyComposer(WidgetTester tester) => _until(tester, () {
  final draft = find.byKey(const ValueKey('pholy-comment-draft'));
  return draft.evaluate().isNotEmpty && tester.widget<TextField>(draft).enabled == true;
}, 'comment mutation and refresh finish');

Future<void> _draftSurvivesToggle(WidgetTester tester, String draft) async {
  final input = find.byKey(const ValueKey('pholy-comment-draft'));
  await tester.enterText(input, draft);
  await _hideKeyboard(tester);
  await _tap(tester, find.byKey(const ValueKey('pholy-comments-toggle')));
  expect(input, findsNothing);
  await _tap(tester, find.byKey(const ValueKey('pholy-comments-toggle')));
  await _until(tester, () => input.evaluate().isNotEmpty, 'expanded comment composer');
  expect(_draftValue(tester), draft);
}
