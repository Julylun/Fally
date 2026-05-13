import 'package:fally_app/app/theme/app_theme.dart';
import 'package:flutter/material.dart';

class StatusCard extends StatelessWidget {
  const StatusCard({
    super.key,
    required this.patientName,
    required this.systemStatus,
    required this.lastDetection,
  });

  final String patientName;
  final String systemStatus;
  final String lastDetection;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(AppSpace.md),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadius.lg,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            patientName,
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: AppSpace.sm),
          Row(
            children: [
              Container(
                width: 10,
                height: 10,
                decoration: const BoxDecoration(
                  color: AppColors.critical,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: AppSpace.xs),
              Text(
                systemStatus,
                style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppColors.critical,
                    ),
              ),
            ],
          ),
          const SizedBox(height: AppSpace.xs),
          Text(
            lastDetection,
            style: Theme.of(context).textTheme.bodySmall,
          ),
        ],
      ),
    );
  }
}
