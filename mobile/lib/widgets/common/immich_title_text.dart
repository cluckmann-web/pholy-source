import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';

class ImmichTitleText extends StatelessWidget {
  final double fontSize;

  const ImmichTitleText({super.key, this.fontSize = 48});

  @override
  Widget build(BuildContext context) => Text(
    'PHOLY',
    style: TextStyle(fontSize: fontSize, fontWeight: FontWeight.w500, letterSpacing: 3, color: context.primaryColor),
  );
}
