import 'package:fally_app/app/theme/app_theme.dart';
import 'package:fally_app/features/fall_detection/presentation/screens/fall_detection_screen.dart';
import 'package:flutter/material.dart';

class FallyApp extends StatelessWidget {
  const FallyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'AI Fall Detection Test Lab',
      theme: AppTheme.light(),
      home: const FallDetectionScreen(),
    );
  }
}
