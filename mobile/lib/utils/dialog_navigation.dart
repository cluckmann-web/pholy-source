import 'package:flutter/material.dart';

/// Close a root-level profile dialog before scheduling navigation.
///
/// [navigate] must capture the router before the dialog is dismissed: the
/// dialog's BuildContext will be unmounted after its exit transition.
void dismissDialogAndNavigate(BuildContext dialogContext, VoidCallback navigate) {
  Navigator.of(dialogContext, rootNavigator: true).pop();
  WidgetsBinding.instance.addPostFrameCallback((_) => navigate());
}
