class FallDetectionMetric {
  const FallDetectionMetric({
    required this.label,
    required this.value,
    required this.unit,
  });

  final String label;
  final String value;
  final String unit;
}

class FallAlertEvent {
  const FallAlertEvent({
    required this.time,
    required this.location,
    required this.severity,
    required this.resolved,
  });

  final String time;
  final String location;
  final String severity;
  final bool resolved;
}

class FallDetectionSnapshot {
  const FallDetectionSnapshot({
    required this.patientName,
    required this.systemStatus,
    required this.lastDetection,
    required this.metrics,
    required this.alerts,
  });

  final String patientName;
  final String systemStatus;
  final String lastDetection;
  final List<FallDetectionMetric> metrics;
  final List<FallAlertEvent> alerts;
}

const FallDetectionSnapshot mockFallDetectionSnapshot = FallDetectionSnapshot(
  patientName: 'Patient: Nguyen Van A',
  systemStatus: 'High Risk',
  lastDetection: 'Last detected: 2m ago',
  metrics: [
    FallDetectionMetric(label: 'Confidence', value: '96', unit: '%'),
    FallDetectionMetric(label: 'Heart Rate', value: '84', unit: 'bpm'),
    FallDetectionMetric(label: 'SpO2', value: '98', unit: '%'),
    FallDetectionMetric(label: 'Response', value: '42', unit: 'sec'),
  ],
  alerts: [
    FallAlertEvent(
      time: '00:09',
      location: 'Room A-03',
      severity: 'Critical',
      resolved: false,
    ),
    FallAlertEvent(
      time: '23:46',
      location: 'Room A-03',
      severity: 'Warning',
      resolved: true,
    ),
    FallAlertEvent(
      time: '20:12',
      location: 'Room B-11',
      severity: 'Warning',
      resolved: true,
    ),
  ],
);
