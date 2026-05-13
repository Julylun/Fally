import 'package:fally_app/app/theme/app_theme.dart';
import 'package:fally_app/features/fall_detection/domain/models/fall_detection_data.dart';
import 'package:flutter/material.dart';

class AlertItemTile extends StatelessWidget {
  const AlertItemTile({
    super.key,
    required this.event,
  });

  final FallAlertEvent event;

  @override
  Widget build(BuildContext context) {
    final severityColor = event.severity == 'Critical'
        ? AppColors.critical
        : AppColors.warning;

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpace.md,
        vertical: AppSpace.sm,
      ),
      decoration: BoxDecoration(
        color: AppColors.card,
        borderRadius: AppRadius.md,
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: severityColor,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: AppSpace.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${event.time} - ${event.location}',
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontSize: 14,
                      ),
                ),
                const SizedBox(height: AppSpace.xxs),
                Text(
                  event.severity,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: severityColor,
                      ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpace.sm,
              vertical: AppSpace.xs,
            ),
            decoration: BoxDecoration(
              color: event.resolved
                  ? AppColors.success.withValues(alpha: 0.12)
                  : AppColors.critical.withValues(alpha: 0.12),
              borderRadius: const BorderRadius.all(Radius.circular(999)),
            ),
            child: Text(
              event.resolved ? 'Resolved' : 'Open',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: event.resolved ? AppColors.success : AppColors.critical,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}
