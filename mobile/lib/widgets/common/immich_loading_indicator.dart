import 'package:flutter/material.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';

class ImmichLoadingIndicator extends StatelessWidget {
  final double? borderRadius;

  const ImmichLoadingIndicator({super.key, this.borderRadius});

  @override
  Widget build(BuildContext context) => const SizedBox(
    height: 80,
    width: 80,
    child: Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(child: CircularProgressIndicator(strokeWidth: 2)),
        Padding(padding: EdgeInsets.all(14), child: ImmichLogo()),
      ],
    ),
  );
}
