import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/theme_extensions.dart';
import 'package:immich_mobile/pages/common/pholy_imprint.page.dart';
import 'package:immich_mobile/pages/common/pholy_updates.page.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/widgets/forms/login/login_form.dart';
import 'package:package_info_plus/package_info_plus.dart';

@RoutePage()
class LoginPage extends HookWidget {
  const LoginPage({super.key});

  @override
  Widget build(BuildContext context) {
    final appVersion = useState('0.0.0');

    Future<void> getAppInfo() async {
      final PackageInfo packageInfo = await PackageInfo.fromPlatform();
      if (context.mounted) {
        appVersion.value = packageInfo.version;
      }
    }

    useEffect(() {
      unawaited(getAppInfo());
      return null;
    }, const []);

    return Scaffold(
      body: LoginForm(),
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
          child: Wrap(
            alignment: WrapAlignment.center,
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 10,
            children: [
              Text(
                'PHOLY · ${appVersion.value}',
                style: context.textTheme.bodySmall?.copyWith(color: context.colorScheme.onSurfaceSecondary),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    settings: const RouteSettings(name: 'PholyUpdatesPage'),
                    builder: (_) => const PholyUpdatesPage(),
                  ),
                ),
                child: Text(pholyText(context, 'App-Updates', 'App updates')),
              ),
              TextButton(
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute<void>(
                    settings: const RouteSettings(name: 'PholyImprintPage'),
                    builder: (_) => const PholyImprintPage(),
                  ),
                ),
                child: Text(pholyText(context, 'Impressum', 'Legal notice')),
              ),
              TextButton(
                onPressed: () => context.pushRoute(const AppLogRoute()),
                child: Text(pholyText(context, 'Diagnose', 'Diagnostics')),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
