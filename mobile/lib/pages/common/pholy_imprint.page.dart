import 'package:flutter/material.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:url_launcher/url_launcher.dart';

/// The published PHOLY imprint, bundled so it remains available without a
/// network connection or a signed-in account. Keep its German legal wording in
/// sync with web/src/routes/impressum/+page.svelte and https://pholy.de/impressum.
class PholyImprintPage extends StatelessWidget {
  const PholyImprintPage({super.key, this.openLink});

  /// Allows a host to handle external links. No link is opened while rendering.
  final Future<bool> Function(Uri uri)? openLink;

  static final imprintUri = Uri.https('pholy.de', '/impressum');
  static final privacyUri = Uri.https('pholy.de', '/datenschutz');
  static final sourceUri = Uri.https('pholy.de', '/source/');

  Future<void> _open(BuildContext context, Uri uri) async {
    var opened = false;
    try {
      opened = await (openLink?.call(uri) ?? launchUrl(uri, mode: LaunchMode.externalApplication));
    } catch (_) {
      // The installed device may not have a browser, mail app or dialler.
    }
    if (!opened && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            pholyText(
              context,
              'Der Link konnte nicht geöffnet werden. Du kannst die Adresse im Impressum kopieren.',
              'The link could not be opened. You can copy the address from the legal notice.',
            ),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isGerman = Localizations.localeOf(context).languageCode == 'de';

    Widget link({required String label, required Uri uri, required IconData icon}) => Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          OutlinedButton(
            onPressed: () async => _open(context, uri),
            style: OutlinedButton.styleFrom(
              shape: const RoundedRectangleBorder(),
              minimumSize: const Size(48, 48),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            ),
            child: Row(
              children: [
                Icon(icon, size: 20),
                const SizedBox(width: 12),
                Expanded(child: Text(label)),
                const SizedBox(width: 8),
                const Icon(Icons.open_in_new, size: 18),
              ],
            ),
          ),
          if (uri.scheme == 'https') ...[
            const SizedBox(height: 6),
            Text(uri.toString(), style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );

    return Scaffold(
      appBar: AppBar(centerTitle: false, title: Text(pholyText(context, 'Impressum', 'Legal notice'))),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 720),
              child: SelectionArea(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(
                      PholyBrand.name,
                      style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      pholyText(context, 'Wer hinter PHOLY steht.', 'Who is behind PHOLY.'),
                      style: theme.textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 20),
                    DecoratedBox(
                      decoration: BoxDecoration(color: theme.colorScheme.surfaceContainerHigh),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Text(
                          pholyText(
                            context,
                            'Diese Angaben sind auch ohne Internet verfügbar. Die aktuelle Fassung findest du auf pholy.de.',
                            'This information is available offline. The latest version is on pholy.de.',
                          ),
                          style: theme.textTheme.bodyMedium?.copyWith(height: 1.5),
                        ),
                      ),
                    ),
                    if (!isGerman) ...[
                      const SizedBox(height: 16),
                      const Text('The legal information below is shown in its published German wording.'),
                    ],
                    const _LegalSection(
                      title: 'Diensteanbieter',
                      paragraphs: ['Weblygo\nInhaber: Carsten Luckmann\nThomästr. 27\n59494 Soest\nDeutschland'],
                    ),
                    const _LegalSection(title: 'Kontakt', paragraphs: ['mail@weblygo.de\n02921 559 72 39']),
                    link(
                      label: pholyText(context, 'E-Mail öffnen', 'Open email app'),
                      uri: Uri(scheme: 'mailto', path: 'mail@weblygo.de'),
                      icon: Icons.mail_outline,
                    ),
                    link(
                      label: pholyText(context, 'Telefon öffnen', 'Open phone app'),
                      uri: Uri(scheme: 'tel', path: '+4929215597239'),
                      icon: Icons.phone_outlined,
                    ),
                    const _LegalSection(
                      title: 'Hinweise auf Rechtsverletzungen',
                      paragraphs: [
                        'Wenn du eine mögliche Verletzung deiner Rechte bemerkst, sende uns den betroffenen Link und eine Beschreibung. Hinweise werden geprüft und erforderliche Maßnahmen ergriffen. Gesetzliche Ansprüche werden dadurch nicht eingeschränkt.',
                      ],
                    ),
                    const _LegalSection(
                      title: 'Software und Bildnachweise',
                      paragraphs: [
                        'PHOLY basiert auf Immich. Der vollständige Quellcode der eingesetzten angepassten Version, Lizenzhinweise und die Bauanleitung sind öffentlich zugänglich.',
                        'Die Beispielbilder auf der Startseite stammen nicht aus privaten Nutzersammlungen. Ihre Herkunfts- und Lizenznachweise sind im Quellcode enthalten.',
                      ],
                    ),
                    link(
                      label: pholyText(context, 'Quellcode und Lizenzhinweise', 'Source code and licence notices'),
                      uri: sourceUri,
                      icon: Icons.code,
                    ),
                    const SizedBox(height: 24),
                    const Divider(),
                    link(
                      label: pholyText(context, 'Aktuelles Impressum auf pholy.de', 'Latest legal notice on pholy.de'),
                      uri: imprintUri,
                      icon: Icons.info_outline,
                    ),
                    link(
                      label: pholyText(context, 'Datenschutzhinweise auf pholy.de', 'Privacy notice on pholy.de'),
                      uri: privacyUri,
                      icon: Icons.privacy_tip_outlined,
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LegalSection extends StatelessWidget {
  const _LegalSection({required this.title, required this.paragraphs});

  final String title;
  final List<String> paragraphs;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Padding(
      padding: const EdgeInsets.only(top: 28),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(header: true, child: Text(title, style: textTheme.titleMedium)),
          for (final paragraph in paragraphs)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(paragraph, style: textTheme.bodyLarge?.copyWith(height: 1.5)),
            ),
        ],
      ),
    );
  }
}
