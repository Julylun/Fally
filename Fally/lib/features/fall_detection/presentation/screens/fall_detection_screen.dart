import 'dart:async';

import 'package:fally_app/features/fall_detection/domain/services/fall_inference_service.dart';
import 'package:flutter/material.dart';
import 'package:sensors_plus/sensors_plus.dart';

class FallDetectionScreen extends StatefulWidget {
  const FallDetectionScreen({super.key});

  @override
  State<FallDetectionScreen> createState() => _FallDetectionScreenState();
}

class _FallDetectionScreenState extends State<FallDetectionScreen> {
  static const _sampleCount = 31;
  static const _windowSize = 128;
  static const _windowStep = 64;
  static const _accelRange = 4.0;
  static const _gyroRange = 40.0;

  final List<double> _accelX = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );
  final List<double> _accelY = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );
  final List<double> _accelZ = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );
  final List<double> _gyroX = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );
  final List<double> _gyroY = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );
  final List<double> _gyroZ = List<double>.filled(
    _sampleCount,
    0,
    growable: true,
  );

  StreamSubscription<AccelerometerEvent>? _accelerometerSub;
  StreamSubscription<GyroscopeEvent>? _gyroscopeSub;
  AccelerometerEvent? _latestAccelerometer;
  GyroscopeEvent? _latestGyroscope;
  int _accelerometerHz = 0;
  int _gyroscopeHz = 0;
  int _accelerometerSamplesInWindow = 0;
  int _gyroscopeSamplesInWindow = 0;
  DateTime _accelerometerWindowStart = DateTime.now();
  DateTime _gyroscopeWindowStart = DateTime.now();
  final FallInferenceService _inferenceService = FallInferenceService();

  final List<_SensorSample> _sensorWindow = <_SensorSample>[];
  int _samplesSinceLastInference = 0;
  bool _modelReady = false;
  bool _isInferring = false;
  String _predictionLabel = 'Initializing model...';
  double _fallProbability = 0;
  int _inferenceCount = 0;
  String _modelOutputDebug = '';

  @override
  void initState() {
    super.initState();
    _initModel();
    _accelerometerSub =
        accelerometerEventStream(
          samplingPeriod: SensorInterval.gameInterval,
        ).listen((event) {
          setState(() {
            _latestAccelerometer = event;
            _push(_accelX, event.x, _accelRange);
            _push(_accelY, event.y, _accelRange);
            _push(_accelZ, event.z, _accelRange);
            _updateAccelerometerHz();
          });
          _pushSensorSample();
        });
    _gyroscopeSub =
        gyroscopeEventStream(
          samplingPeriod: SensorInterval.gameInterval,
        ).listen((event) {
          setState(() {
            _latestGyroscope = event;
            _push(_gyroX, event.x * 10, _gyroRange);
            _push(_gyroY, event.y * 10, _gyroRange);
            _push(_gyroZ, event.z * 10, _gyroRange);
            _updateGyroscopeHz();
          });
        });
  }

  @override
  void dispose() {
    _accelerometerSub?.cancel();
    _gyroscopeSub?.cancel();
    _inferenceService.dispose();
    super.dispose();
  }

  Future<void> _initModel() async {
    try {
      await _inferenceService.init();
      if (!mounted) {
        return;
      }
      setState(() {
        _modelReady = true;
        _predictionLabel = 'Waiting for sensor window...';
      });
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _modelReady = false;
        _predictionLabel = 'Model init failed: $e';
      });
    }
  }

  void _push(List<double> list, double value, double clampRange) {
    list.removeAt(0);
    list.add(value.clamp(-clampRange, clampRange));
  }

  void _updateAccelerometerHz() {
    _accelerometerSamplesInWindow++;
    final now = DateTime.now();
    final elapsedMs = now.difference(_accelerometerWindowStart).inMilliseconds;
    if (elapsedMs >= 1000) {
      _accelerometerHz = ((_accelerometerSamplesInWindow * 1000) / elapsedMs)
          .round();
      _accelerometerSamplesInWindow = 0;
      _accelerometerWindowStart = now;
    }
  }

  void _updateGyroscopeHz() {
    _gyroscopeSamplesInWindow++;
    final now = DateTime.now();
    final elapsedMs = now.difference(_gyroscopeWindowStart).inMilliseconds;
    if (elapsedMs >= 1000) {
      _gyroscopeHz = ((_gyroscopeSamplesInWindow * 1000) / elapsedMs).round();
      _gyroscopeSamplesInWindow = 0;
      _gyroscopeWindowStart = now;
    }
  }

  void _pushSensorSample() {
    if (_latestAccelerometer == null || _latestGyroscope == null) {
      return;
    }

    _sensorWindow.add(
      _SensorSample(
        ax: _latestAccelerometer!.x,
        ay: _latestAccelerometer!.y,
        az: _latestAccelerometer!.z,
        gx: _latestGyroscope!.x,
        gy: _latestGyroscope!.y,
        gz: _latestGyroscope!.z,
      ),
    );

    if (_sensorWindow.length > _windowSize) {
      _sensorWindow.removeAt(0);
    }

    if (_sensorWindow.length < _windowSize) {
      return;
    }

    _samplesSinceLastInference++;
    if (_samplesSinceLastInference >= _windowStep) {
      _samplesSinceLastInference = 0;
      _runInferenceOnCurrentWindow();
    }
  }

  void _runInferenceOnCurrentWindow() {
    if (!_modelReady || _isInferring || _sensorWindow.length < _windowSize) {
      return;
    }

    _isInferring = true;
    try {
      final accX = _sensorWindow.map((s) => s.ax).toList(growable: false);
      final accY = _sensorWindow.map((s) => s.ay).toList(growable: false);
      final accZ = _sensorWindow.map((s) => s.az).toList(growable: false);
      final gyroX = _sensorWindow.map((s) => s.gx).toList(growable: false);
      final gyroY = _sensorWindow.map((s) => s.gy).toList(growable: false);
      final gyroZ = _sensorWindow.map((s) => s.gz).toList(growable: false);

      final result = _inferenceService.predictFromWindow(
        accX: accX,
        accY: accY,
        accZ: accZ,
        gyroX: gyroX,
        gyroY: gyroY,
        gyroZ: gyroZ,
      );

      if (!mounted) {
        return;
      }
      setState(() {
        _fallProbability = result.fallProbability;
        _predictionLabel = result.isFallDetected ? 'FALL DETECTED' : 'NO FALL';
        _inferenceCount++;
        _modelOutputDebug = result.outputDebug;
      });
    } catch (e) {
      if (!mounted) {
        return;
      }
      setState(() {
        _predictionLabel = 'Inference error: $e';
      });
    } finally {
      _isInferring = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 4),
              Row(
                children: [
                  const _StatusDot(),
                  const SizedBox(width: 8),
                  const Text(
                    'Monitoring',
                    style: TextStyle(fontSize: 36, fontWeight: FontWeight.w400),
                  ),
                  const Spacer(),
                  SizedBox(
                    width: 84,
                    height: 84,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        CircularProgressIndicator(
                          value: _fallProbability.clamp(0, 1),
                          strokeWidth: 3,
                          color: Colors.black87,
                          backgroundColor: const Color(0xFFD7D7D7),
                        ),
                        Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${(_fallProbability * 100).round()}%',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                              const Text(
                                'Fall Probability',
                                style: TextStyle(fontSize: 9),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 18),
              _PredictionBanner(
                modelReady: _modelReady,
                label: _predictionLabel,
                probability: _fallProbability,
                inferenceCount: _inferenceCount,
                outputDebug: _modelOutputDebug,
              ),
              const SizedBox(height: 10),
              _DebugSensorValues(
                accelerometer: _latestAccelerometer,
                gyroscope: _latestGyroscope,
              ),
              const SizedBox(height: 10),
              _SensorChartSection(
                title: 'Accelerometer (X, Y, Z)',
                yMin: -4,
                yMax: 4,
                series: [_accelX, _accelY, _accelZ],
                hz: _accelerometerHz,
              ),
              const SizedBox(height: 14),
              _SensorChartSection(
                title: 'Gyroscope (X, Y, Z)',
                yMin: -40,
                yMax: 40,
                series: [_gyroX, _gyroY, _gyroZ],
                hz: _gyroscopeHz,
              ),
              const SizedBox(height: 96),
            ],
          ),
        ),
      ),
      bottomNavigationBar: const SafeArea(
        top: false,
        child: _ControlActionBar(),
      ),
    );
  }
}

class _PredictionBanner extends StatelessWidget {
  const _PredictionBanner({
    required this.modelReady,
    required this.label,
    required this.probability,
    required this.inferenceCount,
    required this.outputDebug,
  });

  final bool modelReady;
  final String label;
  final double probability;
  final int inferenceCount;
  final String outputDebug;

  @override
  Widget build(BuildContext context) {
    final isFall = label == 'FALL DETECTED';
    final bgColor = !modelReady
        ? const Color(0xFFE9E9E9)
        : (isFall ? const Color(0xFFFFE5E5) : const Color(0xFFE8F8EA));
    final fgColor = !modelReady
        ? Colors.black54
        : (isFall ? const Color(0xFFC62828) : const Color(0xFF2E7D32));

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Model: $label',
            style: TextStyle(
              fontWeight: FontWeight.w700,
              color: fgColor,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Fall probability: ${(probability * 100).toStringAsFixed(1)}% | Inferences: $inferenceCount',
            style: const TextStyle(fontSize: 12),
          ),
          if (outputDebug.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              outputDebug,
              style: const TextStyle(fontSize: 11, color: Colors.black54),
            ),
          ],
        ],
      ),
    );
  }
}

class _DebugSensorValues extends StatelessWidget {
  const _DebugSensorValues({
    required this.accelerometer,
    required this.gyroscope,
  });

  final AccelerometerEvent? accelerometer;
  final GyroscopeEvent? gyroscope;

  String _formatTriple(double x, double y, double z) {
    return 'x:${x.toStringAsFixed(2)}  y:${y.toStringAsFixed(2)}  z:${z.toStringAsFixed(2)}';
  }

  @override
  Widget build(BuildContext context) {
    final accText = accelerometer == null
        ? 'waiting...'
        : _formatTriple(accelerometer!.x, accelerometer!.y, accelerometer!.z);
    final gyroText = gyroscope == null
        ? 'waiting...'
        : _formatTriple(gyroscope!.x, gyroscope!.y, gyroscope!.z);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: const Color(0xFFE0E0E0)),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('DEBUG ACC: $accText', style: const TextStyle(fontSize: 11)),
          const SizedBox(height: 4),
          Text('DEBUG GYRO: $gyroText', style: const TextStyle(fontSize: 11)),
        ],
      ),
    );
  }
}

class _StatusDot extends StatelessWidget {
  const _StatusDot();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 12,
      height: 12,
      decoration: const BoxDecoration(
        color: Color(0xFF58BD6A),
        shape: BoxShape.circle,
      ),
    );
  }
}

class _SensorChartSection extends StatelessWidget {
  const _SensorChartSection({
    required this.title,
    required this.yMin,
    required this.yMax,
    required this.series,
    required this.hz,
  });

  final String title;
  final int yMin;
  final int yMax;
  final List<List<double>> series;
  final int hz;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w400,
                ),
              ),
            ),
            Text(
              '$hz Hz',
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: Colors.black54,
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          height: 230,
          child: CustomPaint(
            painter: _ChartPainter(yMin: yMin, yMax: yMax, series: series),
            child: const SizedBox.expand(),
          ),
        ),
      ],
    );
  }
}

class _ControlActionBar extends StatelessWidget {
  const _ControlActionBar();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: const [
          _ControlActionItem(icon: Icons.pause, label: 'Pause/Resume'),
          _ControlActionItem(
            icon: Icons.volume_up_outlined,
            label: 'Mute/Unmute',
          ),
          _ControlActionItem(icon: Icons.access_time, label: 'History'),
          _ControlActionItem(icon: Icons.tune, label: 'Mode Switch'),
        ],
      ),
    );
  }
}

class _ControlActionItem extends StatelessWidget {
  const _ControlActionItem({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 30, color: Colors.black87),
        const SizedBox(height: 4),
        Text(label, style: const TextStyle(fontSize: 12)),
      ],
    );
  }
}

class _ChartPainter extends CustomPainter {
  const _ChartPainter({
    required this.yMin,
    required this.yMax,
    required this.series,
  });

  final int yMin;
  final int yMax;
  final List<List<double>> series;

  @override
  void paint(Canvas canvas, Size size) {
    const leftPad = 24.0;
    const rightPad = 8.0;
    const topPad = 8.0;
    const bottomPad = 22.0;
    final plot = Rect.fromLTWH(
      leftPad,
      topPad,
      size.width - leftPad - rightPad,
      size.height - topPad - bottomPad,
    );

    final gridPaint = Paint()
      ..color = const Color(0xFFD2D2D2)
      ..strokeWidth = 1;
    final axisLabelStyle = const TextStyle(
      fontSize: 11,
      color: Color(0xFF9A9A9A),
    );

    const xTicks = [0, 5, 10, 15, 20, 25, 30];
    for (var i = 0; i < xTicks.length; i++) {
      final x = plot.left + (plot.width * i / (xTicks.length - 1));
      canvas.drawLine(Offset(x, plot.top), Offset(x, plot.bottom), gridPaint);
      _drawText(
        canvas,
        '${xTicks[i]}',
        Offset(x - 5, plot.bottom + 4),
        axisLabelStyle,
      );
    }

    for (var i = 0; i <= 4; i++) {
      final y = plot.top + (plot.height * i / 4);
      canvas.drawLine(Offset(plot.left, y), Offset(plot.right, y), gridPaint);
      final value = yMax - ((yMax - yMin) * i / 4).round();
      _drawText(canvas, '$value', Offset(0, y - 5), axisLabelStyle);
    }

    final borderPaint = Paint()
      ..color = const Color(0xFFD2D2D2)
      ..strokeWidth = 1
      ..style = PaintingStyle.stroke;
    canvas.drawRect(plot, borderPaint);

    const colors = [
      Color(0xFF111111),
      Color(0xFFE68A2E),
      Color(0xFF7BB87A),
      Color(0xFF4A8FDB),
      Color(0xFF53B5B3),
    ];

    for (var lineIndex = 0; lineIndex < series.length; lineIndex++) {
      final points = series[lineIndex];
      final path = Path();
      for (var i = 0; i < points.length; i++) {
        final t = i / (points.length - 1);
        final x = plot.left + t * plot.width;
        final normalized = (points[i] - yMin) / (yMax - yMin);
        final y = plot.bottom - (normalized * plot.height);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }

      canvas.drawPath(
        path,
        Paint()
          ..color = colors[lineIndex % colors.length]
          ..strokeWidth = 2
          ..style = PaintingStyle.stroke
          ..strokeCap = StrokeCap.round,
      );
    }
  }

  void _drawText(Canvas canvas, String text, Offset offset, TextStyle style) {
    final textPainter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: TextDirection.ltr,
    )..layout();
    textPainter.paint(canvas, offset);
  }

  @override
  bool shouldRepaint(covariant _ChartPainter oldDelegate) {
    // Sensor buffers are updated continuously and reused by reference, so
    // the painter must always repaint to reflect the newest samples.
    return true;
  }
}

class _SensorSample {
  const _SensorSample({
    required this.ax,
    required this.ay,
    required this.az,
    required this.gx,
    required this.gy,
    required this.gz,
  });

  final double ax;
  final double ay;
  final double az;
  final double gx;
  final double gy;
  final double gz;
}
