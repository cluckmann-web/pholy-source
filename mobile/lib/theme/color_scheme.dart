import 'package:flutter/material.dart';
import 'package:immich_mobile/constants/colors.dart';
import 'package:immich_mobile/theme/theme_data.dart';

final Map<ImmichColorPreset, ImmichTheme> _themePresets = {
  // Keep the upstream preset key so existing saved preferences remain compatible.
  ImmichColorPreset.indigo: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: immichBrandColorLight).copyWith(
      primary: immichBrandColorLight,
      onPrimary: Colors.white,
      primaryContainer: const Color(0xFFDCE6DC),
      onPrimaryContainer: const Color(0xFF10372E),
      secondary: const Color(0xFF50886C),
      surface: const Color(0xFFF7F7F2),
      onSurface: const Color(0xFF1F332B),
      onSurfaceVariant: const Color(0xFF637168),
      surfaceContainerLowest: Colors.white,
      surfaceContainerLow: const Color(0xFFF7F7F2),
      surfaceContainer: Colors.white,
      surfaceContainerHigh: const Color(0xFFEDF0E8),
      surfaceContainerHighest: const Color(0xFFDCE6DC),
      outline: const Color(0xFF637168),
      outlineVariant: const Color(0xFFD8DED4),
    ),
    dark: ColorScheme.fromSeed(seedColor: immichBrandColorDark, brightness: Brightness.dark).copyWith(
      primary: immichBrandColorDark,
      onPrimary: const Color(0xFF0B221D),
      primaryContainer: const Color(0xFF173D3E),
      onPrimaryContainer: const Color(0xFFDCF3EC),
      secondary: const Color(0xFF9BD9C8),
      surface: const Color(0xFF101B17),
      onSurface: const Color(0xFFE2EEEA),
      onSurfaceVariant: const Color(0xFFA5BCB6),
      surfaceContainerLowest: const Color(0xFF0E1F21),
      surfaceContainerLow: const Color(0xFF101B17),
      surfaceContainer: const Color(0xFF172C2E),
      surfaceContainerHigh: const Color(0xFF1C3535),
      surfaceContainerHighest: const Color(0xFF2A4242),
      outline: const Color(0xFFA5BCB6),
      outlineVariant: const Color(0xFF2A4242),
    ),
  ),
  ImmichColorPreset.deepPurple: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFF6F43C0)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFFD3BBFF), brightness: Brightness.dark),
  ),
  ImmichColorPreset.pink: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFFED79B5)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFFED79B5), brightness: Brightness.dark),
  ),
  ImmichColorPreset.red: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFFC51C16)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFFD3302F), brightness: Brightness.dark),
  ),
  ImmichColorPreset.orange: ImmichTheme(
    light: ColorScheme.fromSeed(
      seedColor: const Color(0xffff5b01),
      dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
    ),
    dark: ColorScheme.fromSeed(
      seedColor: const Color(0xFFCC6D08),
      brightness: Brightness.dark,
      dynamicSchemeVariant: DynamicSchemeVariant.fidelity,
    ),
  ),
  ImmichColorPreset.yellow: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFFFFB400)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFFFFB400), brightness: Brightness.dark),
  ),
  ImmichColorPreset.lime: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFFCDDC39)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFFCDDC39), brightness: Brightness.dark),
  ),
  ImmichColorPreset.green: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFF18C249)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFF18C249), brightness: Brightness.dark),
  ),
  ImmichColorPreset.cyan: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFF00BCD4)),
    dark: ColorScheme.fromSeed(seedColor: const Color(0xFF00BCD4), brightness: Brightness.dark),
  ),
  ImmichColorPreset.slateGray: ImmichTheme(
    light: ColorScheme.fromSeed(seedColor: const Color(0xFF696969), dynamicSchemeVariant: DynamicSchemeVariant.neutral),
    dark: ColorScheme.fromSeed(
      seedColor: const Color(0xff696969),
      brightness: Brightness.dark,
      dynamicSchemeVariant: DynamicSchemeVariant.neutral,
    ),
  ),
};

extension ImmichColorModeExtension on ImmichColorPreset {
  ImmichTheme get themeOfPreset => _themePresets[this]!;
}
