import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:http/http.dart' as http;

import 'backend_config.dart';

/// Best-effort POST of a mobile fall to the Nest API.
///
/// Offline persistence / retry queue is intentionally **not** implemented (phase 2).
class FallBackendClient {
  FallBackendClient({
    FallBackendConfig? config,
    http.Client? httpClient,
  }) : _config = config ?? FallBackendConfig.fromEnvironment(),
       _client = httpClient ?? http.Client(),
       _ownsClient = httpClient == null;

  final FallBackendConfig _config;
  final http.Client _client;
  final bool _ownsClient;

  static const _timeout = Duration(seconds: 5);

  /// Reports a fall; returns `true` only for HTTP 2xx. Never throws.
  Future<bool> reportMobileFall({
    required double confidence,
    required DateTime detectedAtUtc,
  }) async {
    final trimmedBase = _config.baseUrl.trim();
    if (trimmedBase.isEmpty) {
      developer.log(
        'Mobile fall reporting disabled (BACKEND_BASE_URL is empty).',
        name: 'FallBackendClient',
      );
      return false;
    }

    try {
      final baseUri = Uri.parse(trimmedBase);
      final uri = baseUri.resolve('api/v1/incidents/mobile-fall');

      final bodyMap = <String, dynamic>{
        'detectedAt': detectedAtUtc.toUtc().toIso8601String(),
        'confidence': confidence,
        'scopeId': _config.scopeId,
      };

      final response = await _client
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'X-Edge-Token': _config.sharedToken,
            },
            body: jsonEncode(bodyMap),
          )
          .timeout(_timeout);

      if (response.statusCode < 200 || response.statusCode >= 300) {
        developer.log(
          'mobile-fall failed: status=${response.statusCode} body=${response.body}',
          name: 'FallBackendClient',
        );
        return false;
      }

      return true;
    } on Object catch (e, st) {
      developer.log(
        'mobile-fall error: $e',
        name: 'FallBackendClient',
        error: e,
        stackTrace: st,
      );
      return false;
    }
  }

  void close() {
    if (_ownsClient) {
      _client.close();
    }
  }
}
