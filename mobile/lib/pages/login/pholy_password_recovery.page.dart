import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/providers/pholy_auth.provider.dart';
import 'package:immich_mobile/services/pholy_auth.service.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';
import 'package:immich_ui/immich_ui.dart';

class PholyPasswordRecoveryPage extends HookConsumerWidget {
  final String initialEmail;

  const PholyPasswordRecoveryPage({super.key, this.initialEmail = ''});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final controller = useTextEditingController(text: initialEmail);
    final sent = useState(false);
    final error = useState<String?>(null);
    final attempt = useState(0);
    final service = ref.watch(pholyAuthServiceProvider);
    final status = useFuture(useMemoized(service.availability, [service, attempt.value]));
    final title = pholyText(context, 'Passwort vergessen?', 'Forgot your password?');

    Future<void> submit() async {
      error.value = null;
      try {
        await service.requestPasswordReset(controller.text);
        if (context.mounted) {
          sent.value = true;
        }
      } catch (e) {
        if (!context.mounted) {
          return;
        }
        error.value = e is PholyRecoveryException && e.statusCode == 429
            ? pholyText(
                context,
                'Bitte warte einen Moment, bevor du es erneut versuchst.',
                'Please wait a moment before trying again.',
              )
            : pholyText(
                context,
                'Die Anfrage konnte nicht gesendet werden. Bitte versuche es erneut.',
                'The request could not be sent. Please try again.',
              );
      }
    }

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: PholyWordmark()),
                  const SizedBox(height: 32),
                  if (sent.value) ...[
                    Icon(Icons.mark_email_read_outlined, size: 48, color: Theme.of(context).colorScheme.primary),
                    const SizedBox(height: 16),
                    Semantics(
                      liveRegion: true,
                      child: Text(
                        pholyText(
                          context,
                          'Wenn ein passendes Konto vorhanden ist, erhältst du eine E-Mail mit einem Link. '
                              'Öffne ihn, lege dein neues Passwort fest und melde dich anschließend hier an.',
                          'If a matching account exists, you will receive an email with a link. '
                              'Open it, choose a new password, then return here to sign in.',
                        ),
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ),
                    const SizedBox(height: 24),
                    FilledButton(
                      onPressed: () => Navigator.of(context).pop(),
                      child: Text(pholyText(context, 'Zur Anmeldung', 'Back to sign in')),
                    ),
                  ] else if (status.connectionState != ConnectionState.done) ...[
                    const Center(child: CircularProgressIndicator()),
                    const SizedBox(height: 16),
                    Text(
                      pholyText(context, 'Verbindung zu PHOLY wird geprüft …', 'Checking connection to PHOLY …'),
                      textAlign: TextAlign.center,
                    ),
                  ] else if (status.hasError) ...[
                    Text(
                      pholyText(
                        context,
                        'PHOLY ist gerade nicht erreichbar. Prüfe deine Verbindung.',
                        'PHOLY is currently unreachable. Check your connection.',
                      ),
                    ),
                    const SizedBox(height: 16),
                    OutlinedButton.icon(
                      onPressed: () => attempt.value++,
                      icon: const Icon(Icons.refresh),
                      label: Text(pholyText(context, 'Erneut versuchen', 'Try again')),
                    ),
                  ] else if (status.data?.canRecoverPassword != true) ...[
                    Text(
                      pholyText(
                        context,
                        'Die Wiederherstellung per E-Mail ist zurzeit nicht verfügbar. '
                            'Bitte wende dich an die Person, die dich zu PHOLY eingeladen hat.',
                        'Email recovery is currently unavailable. Please contact the person who invited you to PHOLY.',
                      ),
                    ),
                  ] else ...[
                    Text(
                      pholyText(
                        context,
                        'Gib die E-Mail-Adresse deines PHOLY-Kontos ein. '
                            'Wir senden dir einen Link zum Zurücksetzen deines Passworts.',
                        'Enter the email address of your PHOLY account. We will send you a password reset link.',
                      ),
                      style: Theme.of(context).textTheme.bodyLarge,
                    ),
                    const SizedBox(height: 24),
                    ImmichForm(
                      onSubmit: submit,
                      submitText: pholyText(context, 'Link anfordern', 'Request reset link'),
                      submitIcon: Icons.mail_outline,
                      builder: (_, form) => ImmichEmailInput(
                        controller: controller,
                        label: pholyText(context, 'E-Mail-Adresse', 'Email address'),
                        keyboardAction: TextInputAction.send,
                        onSubmit: (_) => form.submit(),
                        validator: (value) =>
                            value != null && RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(value.trim())
                            ? null
                            : pholyText(
                                context,
                                'Bitte gib eine gültige E-Mail-Adresse ein.',
                                'Please enter a valid email address.',
                              ),
                      ),
                    ),
                    if (error.value != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 16),
                        child: Semantics(
                          liveRegion: true,
                          child: Text(error.value!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
