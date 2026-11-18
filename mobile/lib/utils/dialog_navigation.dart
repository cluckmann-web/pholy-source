import 'package:flutter/material.dart';

/// Close the profile dialog in its owning (possibly nested) Navigator before scheduling navigation.
///
/// [navigate] must capture the router before the dialog is dismissed: the
/// dialog's BuildContext will be unmounted after its exit transition.
void dismissDialogAndNavigate(BuildContext dialogContext, VoidCallback navigate) {
  Navigator.of(dialogContext).pop();
  WidgetsBinding.instance.addPostFrameCallback((_) => navigate());
}
