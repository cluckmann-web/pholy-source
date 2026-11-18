import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/utils/dialog_navigation.dart';

void main() {
  testWidgets('navigation from a profile dialog dismisses its modal barrier', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (homeContext) => Scaffold(
            body: TextButton(
              onPressed: () => showDialog<void>(
                context: homeContext,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Profile menu'),
                  actions: [
                    TextButton(
                      onPressed: () => dismissDialogAndNavigate(
                        dialogContext,
                        () => Navigator.of(homeContext).push<void>(
                          MaterialPageRoute<void>(
                            builder: (_) => const Scaffold(body: Text('Settings loaded')),
                          ),
                        ),
                      ),
                      child: const Text('Settings'),
                    ),
                  ],
                ),
              ),
              child: const Text('Open profile menu'),
            ),
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open profile menu'));
    await tester.pumpAndSettle();
    expect(find.text('Profile menu'), findsOneWidget);

    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();

    expect(find.text('Settings loaded'), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.byType(ModalBarrier), findsNothing);
  });
}
