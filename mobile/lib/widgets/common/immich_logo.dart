import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

/// Retain the upstream widget identifier used throughout the mobile codebase.
class ImmichLogo extends StatelessWidget {
  final double size;

  const ImmichLogo({super.key, this.size = 100});

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/pholy-mark.svg',
    width: size,
    height: size,
    colorFilter: ColorFilter.mode(Theme.of(context).colorScheme.primary, BlendMode.srcIn),
    semanticsLabel: 'PHOLY',
  );
}

class PholyWordmark extends StatelessWidget {
  final double width;

  const PholyWordmark({super.key, this.width = 208});

  @override
  Widget build(BuildContext context) => SvgPicture.asset(
    'assets/pholy-logo.svg',
    width: width,
    colorFilter: ColorFilter.mode(Theme.of(context).colorScheme.primary, BlendMode.srcIn),
    semanticsLabel: 'PHOLY',
  );
}
