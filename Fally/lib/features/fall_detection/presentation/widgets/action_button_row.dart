import 'package:fally_app/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

class ActionButtonRow extends StatelessWidget {
  const ActionButtonRow({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.primaryAction,
              padding: const EdgeInsets.symmetric(vertical: AppSpace.md),
              shape: const RoundedRectangleBorder(borderRadius: AppRadius.md),
            ),
            onPressed: () {},
            icon: const Icon(Icons.emergency),
            label: const Text('Call Nurse'),
          ),
        ),
        const SizedBox(width: AppSpace.sm),
        Expanded(
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: AppColors.info,
              side: const BorderSide(color: AppColors.border),
              padding: const EdgeInsets.symmetric(vertical: AppSpace.md),
              shape: const RoundedRectangleBorder(borderRadius: AppRadius.md),
            ),
            onPressed: () {},
            icon: const Icon(Icons.videocam_outlined),
            label: const Text('Live Camera'),
          ),
        ),
      ],
    );
  }
}
