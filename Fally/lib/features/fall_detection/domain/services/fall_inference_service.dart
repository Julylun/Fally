import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:onnxruntime/onnxruntime.dart';

class FallPredictionResult {
  const FallPredictionResult({
    required this.fallProbability,
    required this.isFallDetected,
    required this.outputDebug,
  });

  final double fallProbability;
  final bool isFallDetected;
  final String outputDebug;
}

class FallInferenceService {
  FallInferenceService();

  OrtSession? _session;
  String? _inputName;
  List<String> _outputNames = const [];
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) {
      return;
    }

    OrtEnv.instance.init();
    final sessionOptions = OrtSessionOptions()
      ..setIntraOpNumThreads(1)
      ..setInterOpNumThreads(1)
      ..setSessionGraphOptimizationLevel(GraphOptimizationLevel.ortEnableBasic);

    try {
      sessionOptions.appendCPUProvider(CPUFlags.useNone);
    } catch (_) {
      // CPU provider is generally default; ignore if unsupported by platform.
    }

    final modelData = await rootBundle.load('fall_model.onnx');
    final modelBytes = modelData.buffer.asUint8List();
    final session = OrtSession.fromBuffer(modelBytes, sessionOptions);

    _session = session;
    _inputName = session.inputNames.first;
    _outputNames = List<String>.from(session.outputNames);
    _initialized = true;
  }

  FallPredictionResult predictFromWindow({
    required List<double> accX,
    required List<double> accY,
    required List<double> accZ,
    required List<double> gyroX,
    required List<double> gyroY,
    required List<double> gyroZ,
  }) {
    if (!_initialized || _session == null || _inputName == null) {
      throw StateError('FallInferenceService.init() must be called first.');
    }

    final features = _extractStatisticalFeatures(
      accX: accX,
      accY: accY,
      accZ: accZ,
      gyroX: gyroX,
      gyroY: gyroY,
      gyroZ: gyroZ,
    );

    final inputTensor = OrtValueTensor.createTensorWithDataList(
      Float32List.fromList(features),
      [1, 27],
    );
    final runOptions = OrtRunOptions();
    try {
      final outputs = _session!.run(runOptions, <String, OrtValue>{
        _inputName!: inputTensor,
      });
      final outputVectors = <List<double>>[];
      final outputKinds = <String>[];
      for (final output in outputs) {
        outputKinds.add('${output.runtimeType}/${output?.value.runtimeType}');
        outputVectors.add(_flattenNumbers(output?.value));
      }
      final probability = _deriveFallProbabilityFromOutputs(outputVectors);
      final debug = _buildOutputDebug(outputVectors, outputKinds, probability);
      for (final output in outputs) {
        output?.release();
      }
      return FallPredictionResult(
        fallProbability: probability,
        isFallDetected: probability >= 0.5,
        outputDebug: debug,
      );
    } finally {
      inputTensor.release();
      runOptions.release();
    }
  }

  List<double> _extractStatisticalFeatures({
    required List<double> accX,
    required List<double> accY,
    required List<double> accZ,
    required List<double> gyroX,
    required List<double> gyroY,
    required List<double> gyroZ,
  }) {
    final channels = [accX, accY, accZ, gyroX, gyroY, gyroZ];
    final features = <double>[];

    // Compute means
    for (final channel in channels) {
      features.add(_mean(channel));
    }
    // Compute stds
    for (final channel in channels) {
      features.add(_std(channel));
    }
    // Compute maxs
    for (final channel in channels) {
      features.add(_max(channel));
    }
    // Compute mins
    for (final channel in channels) {
      features.add(_min(channel));
    }

    final smv = List<double>.generate(accX.length, (i) {
      final x = accX[i];
      final y = accY[i];
      final z = accZ[i];
      return math.sqrt((x * x) + (y * y) + (z * z));
    });

    features
      ..add(_mean(smv))
      ..add(_std(smv))
      ..add(_max(smv));

    return features;
  }

  List<double> _flattenNumbers(dynamic value) {
    final result = <double>[];

    void walk(dynamic node) {
      if (node == null) {
        return;
      }
      if (node is OrtValue) {
        walk(node.value);
        return;
      }
      if (node is num) {
        result.add(node.toDouble());
        return;
      }
      if (node is Map) {
        for (final entry in node.entries) {
          walk(entry.value);
        }
        return;
      }
      if (node is Iterable) {
        for (final child in node) {
          walk(child);
        }
        return;
      }

      // Some ONNX outputs come as custom objects (e.g. map-like tensors)
      // that are not Iterable/Map in Dart. Parse their textual representation.
      final text = node.toString();
      if (text.isNotEmpty) {
        // Prefer value-like tokens after ":" or "=" to avoid capturing map keys.
        final valueMatches = RegExp(
          r'[:=]\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)',
        ).allMatches(text);
        for (final m in valueMatches) {
          final parsed = double.tryParse(m.group(1)!);
          if (parsed != null) {
            result.add(parsed);
          }
        }
      }
    }

    walk(value);
    return result;
  }

  double _deriveFallProbabilityFromOutputs(List<List<double>> outputVectors) {
    if (outputVectors.isEmpty) {
      return 0;
    }

    // Python reference: outputs are [label, probability].
    // Prefer output index 1 as the probability vector/scalar.
    if (outputVectors.length > 1 && outputVectors[1].isNotEmpty) {
      return _deriveFallProbabilityFromVector(outputVectors[1]);
    }

    // If probability output missing, try any output with >=2 values.
    for (final values in outputVectors) {
      if (values.length >= 2) {
        return _deriveFallProbabilityFromVector(values);
      }
    }

    // Fall back to scalar output (often label-only).
    for (final values in outputVectors) {
      if (values.length == 1) {
        final v = values.first;
        // Binary label fallback: keep UI probability conservative.
        if (v == 0) {
          return 0;
        }
        if (v == 1) {
          return 1;
        }
        if (v >= 0 && v <= 1) {
          return v.clamp(0, 1);
        }
        return 1 / (1 + math.exp(-v));
      }
    }

    // Last resort: flatten first non-empty output.
    for (final values in outputVectors) {
      if (values.isNotEmpty) {
        return _deriveFallProbabilityFromVector(values);
      }
    }
    return 0;
  }

  double _deriveFallProbabilityFromVector(List<double> values) {
    if (values.isEmpty) {
      return 0;
    }
    final classIndex = values.length > 1 ? 1 : 0;
    final allProbabilities = values.every((v) => v >= 0 && v <= 1);
    if (allProbabilities) {
      return values[classIndex].clamp(0, 1);
    }

    final maxLogit = values.reduce(math.max);
    final exps = values.map((v) => math.exp(v - maxLogit)).toList();
    final sumExp = exps.fold<double>(0, (sum, e) => sum + e);
    final probs = exps.map((e) => e / sumExp).toList();
    return probs[classIndex].clamp(0, 1);
  }

  String _buildOutputDebug(
    List<List<double>> outputs,
    List<String> outputKinds,
    double probability,
  ) {
    final parts = <String>[];
    for (var i = 0; i < outputs.length; i++) {
      final vec = outputs[i];
      final name = i < _outputNames.length ? _outputNames[i] : 'out$i';
      final kind = i < outputKinds.length ? outputKinds[i] : 'unknown';
      if (vec.isEmpty) {
        parts.add('o$i{$name,$kind}=[]');
      } else {
        final shown = vec.take(4).map((v) => v.toStringAsFixed(3)).join(',');
        final suffix = vec.length > 4 ? ',...' : '';
        parts.add('o$i{$name,$kind}=[$shown$suffix]');
      }
    }
    parts.add('p=${probability.toStringAsFixed(3)}');
    return parts.join(' ');
  }

  double _mean(List<double> values) {
    if (values.isEmpty) {
      return 0;
    }
    final sum = values.fold<double>(0, (acc, v) => acc + v);
    return sum / values.length;
  }

  double _std(List<double> values) {
    if (values.length <= 1) {
      return 0;
    }
    final m = _mean(values);
    final variance =
        values.fold<double>(0, (acc, v) {
          final diff = v - m;
          return acc + (diff * diff);
        }) /
        values.length;
    return math.sqrt(variance);
  }

  double _max(List<double> values) {
    if (values.isEmpty) {
      return 0;
    }
    return values.reduce(math.max);
  }

  double _min(List<double> values) {
    if (values.isEmpty) {
      return 0;
    }
    return values.reduce(math.min);
  }

  void dispose() {
    _session?.release();
    _session = null;
    _initialized = false;
  }
}
