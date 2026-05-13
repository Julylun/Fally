import 'package:flutter/material.dart';

class AppColors {
  static const Color background = Color(0xFFF3F4F8);
  static const Color card = Color(0xFFFFFFFF);
  static const Color textPrimary = Color(0xFF171A26);
  static const Color textSecondary = Color(0xFF6B7080);
  static const Color critical = Color(0xFFEC1313);
  static const Color warning = Color(0xFFFFA333);
  static const Color success = Color(0xFF18A164);
  static const Color primaryAction = Color(0xFF1F5FFF);
  static const Color info = Color(0xFF5272FF);
  static const Color border = Color(0xFFE7E9F2);
}

class AppSpace {
  static const double xxs = 4;
  static const double xs = 8;
  static const double sm = 12;
  static const double md = 16;
  static const double lg = 20;
  static const double xl = 24;
}

class AppRadius {
  static const BorderRadius md = BorderRadius.all(Radius.circular(12));
  static const BorderRadius lg = BorderRadius.all(Radius.circular(16));
  static const BorderRadius xl = BorderRadius.all(Radius.circular(20));
}

class AppTheme {
  static ThemeData light() {
    final textTheme = Typography.blackCupertino.copyWith(
      headlineSmall: const TextStyle(
        fontSize: 24,
        fontWeight: FontWeight.w700,
        color: AppColors.textPrimary,
      ),
      titleMedium: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      bodyMedium: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.w400,
        color: AppColors.textSecondary,
      ),
      bodySmall: const TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w500,
        color: AppColors.textSecondary,
      ),
    );

    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: AppColors.background,
      colorScheme: const ColorScheme.light(
        primary: AppColors.primaryAction,
        surface: AppColors.card,
        error: AppColors.critical,
      ),
      textTheme: textTheme,
      cardTheme: const CardThemeData(
        color: AppColors.card,
        elevation: 0,
        shape: RoundedRectangleBorder(borderRadius: AppRadius.lg),
      ),
      appBarTheme: const AppBarTheme(
        elevation: 0,
        scrolledUnderElevation: 0,
        backgroundColor: AppColors.background,
        foregroundColor: AppColors.textPrimary,
      ),
    );
  }
}
