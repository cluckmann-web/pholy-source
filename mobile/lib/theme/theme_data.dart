import 'package:flutter/material.dart';

import 'package:immich_mobile/constants/locales.dart';
import 'package:immich_mobile/extensions/theme_extensions.dart';

class ImmichTheme {
  final ColorScheme light;
  final ColorScheme dark;

  const ImmichTheme({required this.light, required this.dark});
}

ThemeData getThemeData({required ColorScheme colorScheme, required Locale locale}) {
  final isDark = colorScheme.brightness == Brightness.dark;

  return ThemeData(
    useMaterial3: true,
    brightness: colorScheme.brightness,
    colorScheme: colorScheme,
    primaryColor: colorScheme.primary,
    hintColor: colorScheme.onSurfaceSecondary,
    focusColor: colorScheme.primary,
    scaffoldBackgroundColor: colorScheme.surface,
    splashColor: colorScheme.primary.withValues(alpha: 0.1),
    highlightColor: colorScheme.primary.withValues(alpha: 0.1),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      shape: const RoundedRectangleBorder(),
    ),
    cardTheme: const CardThemeData(shape: RoundedRectangleBorder(), elevation: 0),
    listTileTheme: const ListTileThemeData(shape: RoundedRectangleBorder()),
    drawerTheme: const DrawerThemeData(shape: RoundedRectangleBorder()),
    fontFamily: _getFontFamilyFromLocale(locale),
    snackBarTheme: SnackBarThemeData(
      shape: const RoundedRectangleBorder(),
      contentTextStyle: TextStyle(
        fontFamily: _getFontFamilyFromLocale(locale),
        color: colorScheme.primary,
        fontWeight: FontWeight.bold,
      ),
      backgroundColor: colorScheme.surfaceContainerHighest,
    ),
    appBarTheme: AppBarTheme(
      titleTextStyle: TextStyle(
        color: colorScheme.primary,
        fontFamily: _getFontFamilyFromLocale(locale),
        fontWeight: FontWeight.w600,
        fontSize: 18,
      ),
      backgroundColor: colorScheme.surface,
      foregroundColor: colorScheme.primary,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: true,
    ),
    textTheme: const TextTheme(
      displayLarge: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
      displayMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
      displaySmall: TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
      titleSmall: TextStyle(fontSize: 16.0, fontWeight: FontWeight.w600),
      titleMedium: TextStyle(fontSize: 18.0, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(fontSize: 26.0, fontWeight: FontWeight.w600),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: colorScheme.primary,
        foregroundColor: colorScheme.onPrimary,
        shape: const RoundedRectangleBorder(),
        minimumSize: const Size(48, 48),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(shape: const RoundedRectangleBorder(), minimumSize: const Size(48, 48)),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(shape: const RoundedRectangleBorder(), minimumSize: const Size(48, 48)),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(shape: const RoundedRectangleBorder(), minimumSize: const Size(48, 48)),
    ),
    chipTheme: const ChipThemeData(side: BorderSide.none, shape: RoundedRectangleBorder()),
    sliderTheme: const SliderThemeData(
      trackHeight: 12,
      // ignore: deprecated_member_use
      year2023: false,
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(type: BottomNavigationBarType.fixed),
    popupMenuTheme: const PopupMenuThemeData(shape: RoundedRectangleBorder()),
    navigationRailTheme: const NavigationRailThemeData(indicatorShape: RoundedRectangleBorder()),
    navigationBarTheme: NavigationBarThemeData(
      indicatorShape: const RoundedRectangleBorder(),
      backgroundColor: isDark ? colorScheme.surfaceContainer : colorScheme.surface,
      labelTextStyle: const WidgetStatePropertyAll(
        TextStyle(fontSize: 14, fontWeight: FontWeight.w500, overflow: TextOverflow.ellipsis),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: const OutlineInputBorder(borderRadius: BorderRadius.zero),
      errorBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorScheme.error),
        borderRadius: BorderRadius.zero,
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorScheme.error, width: 2),
        borderRadius: BorderRadius.zero,
      ),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorScheme.primary),
        borderRadius: BorderRadius.zero,
      ),
      enabledBorder: OutlineInputBorder(
        borderSide: BorderSide(color: colorScheme.outlineVariant),
        borderRadius: BorderRadius.zero,
      ),
      labelStyle: TextStyle(color: colorScheme.primary),
      hintStyle: const TextStyle(fontSize: 14.0, fontWeight: FontWeight.normal),
    ),
    textSelectionTheme: TextSelectionThemeData(cursorColor: colorScheme.primary),
    dropdownMenuTheme: DropdownMenuThemeData(
      menuStyle: const MenuStyle(shape: WidgetStatePropertyAll<OutlinedBorder>(RoundedRectangleBorder())),
      inputDecorationTheme: InputDecorationTheme(
        focusedBorder: OutlineInputBorder(borderSide: BorderSide(color: colorScheme.primary)),
        enabledBorder: OutlineInputBorder(
          borderSide: BorderSide(color: colorScheme.outlineVariant),
          borderRadius: BorderRadius.zero,
        ),
        labelStyle: TextStyle(color: colorScheme.primary),
        hintStyle: const TextStyle(fontSize: 14.0, fontWeight: FontWeight.normal),
      ),
    ),
    dialogTheme: DialogThemeData(backgroundColor: colorScheme.surfaceContainer, shape: const RoundedRectangleBorder()),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      // ignore: deprecated_member_use
      year2023: false,
      // TODO: Uncommented after upgrade to version later than 3.29.2
      // circularTrackColor: Colors.black12,
      trackGap: 3,
    ),
  );
}

// This method replaces all surface shades in ImmichTheme to a static ones
// as we are creating the colorscheme through seedColor the default surfaces are
// tinted with primary color
ImmichTheme decolorizeSurfaces({required ImmichTheme theme}) {
  return ImmichTheme(
    light: theme.light.copyWith(
      surface: const Color(0xFFf9f9f9),
      onSurface: const Color(0xFF1b1b1b),
      surfaceContainerLowest: const Color(0xFFffffff),
      surfaceContainerLow: const Color(0xFFf3f3f3),
      surfaceContainer: const Color(0xFFeeeeee),
      surfaceContainerHigh: const Color(0xFFe8e8e8),
      surfaceContainerHighest: const Color(0xFFe2e2e2),
      surfaceDim: const Color(0xFFdadada),
      surfaceBright: const Color(0xFFf9f9f9),
      onSurfaceVariant: const Color(0xFF4c4546),
      inverseSurface: const Color(0xFF303030),
      onInverseSurface: const Color(0xFFf1f1f1),
    ),
    dark: theme.dark.copyWith(
      surface: const Color(0xFF131313),
      onSurface: const Color(0xFFE2E2E2),
      surfaceContainerLowest: const Color(0xFF0E0E0E),
      surfaceContainerLow: const Color(0xFF1B1B1B),
      surfaceContainer: const Color(0xFF1F1F1F),
      surfaceContainerHigh: const Color(0xFF242424),
      surfaceContainerHighest: const Color(0xFF2E2E2E),
      surfaceDim: const Color(0xFF131313),
      surfaceBright: const Color(0xFF353535),
      onSurfaceVariant: const Color(0xFFCfC4C5),
      inverseSurface: const Color(0xFFE2E2E2),
      onInverseSurface: const Color(0xFF303030),
    ),
  );
}

String? _getFontFamilyFromLocale(Locale locale) {
  if (localesNotSupportedByAppFont.contains(locale)) {
    // Let Flutter use the default font
    return null;
  }
  return 'GoogleSans';
}
