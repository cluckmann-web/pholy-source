import 'package:flutter/material.dart';
import 'package:immich_mobile/constants/pholy_brand.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';

/// Returns whether the member wants to grant access to device photos now.
/// Automatic upload remains off until they explicitly choose backup albums.
Future<bool> showPholyIntroduction(BuildContext context) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => PopScope(
        canPop: false,
        child: AlertDialog(
          title: const PholyWordmark(width: 160),
          content: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  pholyText(context, 'Deine Fotos, überall dabei.', 'Your photos, wherever you go.'),
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 20),
                _IntroductionItem(
                  icon: Icons.photo_library_outlined,
                  title: pholyText(context, 'Deine vorhandene Mediathek', 'Your existing library'),
                  description: pholyText(
                    context,
                    'Fotos und Alben aus deinem PHOLY-Konto sind auch hier verfügbar.',
                    'Photos and albums from your PHOLY account are available here too.',
                  ),
                ),
                _IntroductionItem(
                  icon: Icons.lock_outline,
                  title: pholyText(context, 'Du bestimmst, was sichtbar ist', 'You choose what is visible'),
                  description: pholyText(
                    context,
                    'Private Fotos bleiben privat. Du wählst selbst, was du teilst oder in der Community veröffentlichst.',
                    'Private photos stay private. You choose what to share or publish to the community.',
                  ),
                ),
                _IntroductionItem(
                  icon: Icons.backup_outlined,
                  title: pholyText(context, 'Fotos vom Gerät hinzufügen', 'Add photos from your device'),
                  description: pholyText(
                    context,
                    'Erlaube den Fotozugriff, um Bilder hochzuladen. Automatische Sicherung aktivierst du später für ausgewählte Alben. '
                        'Für Hintergrunduploads können zusätzliche Systemberechtigungen erforderlich sein.',
                    'Allow photo access to upload pictures. You can enable automatic backup later for selected albums. '
                        'Background uploads may require additional system permissions.',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(pholyText(context, 'Später', 'Later')),
            ),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: Text(pholyText(context, 'Fotozugriff wählen', 'Choose photo access')),
            ),
          ],
        ),
      ),
    ) ??
    false;

class _IntroductionItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;

  const _IntroductionItem({required this.icon, required this.title, required this.description});

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 18),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, color: Theme.of(context).colorScheme.primary),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(description),
            ],
          ),
        ),
      ],
    ),
  );
}
