import 'dart:convert';

import 'package:fally_app/features/fall_detection/data/backend_config.dart';
import 'package:fally_app/features/fall_detection/data/fall_backend_client.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('FallBackendClient', () {
    const config = FallBackendConfig(
      baseUrl: 'http://localhost:3000',
      sharedToken: 'test-token',
      scopeId: 'scope-1',
      fallCooldownSeconds: 5,
    );

    test('POSTs expected URL, headers, and JSON body on success', () async {
      http.Request? captured;
      final client = MockClient((request) async {
        captured = request;
        return http.Response(
          '{"incidentId":"id1","state":"OPEN","notifyType":"MOBILE_ONLY"}',
          201,
        );
      });

      final sut = FallBackendClient(config: config, httpClient: client);
      final at = DateTime.utc(2026, 5, 14, 3);
      final ok = await sut.reportMobileFall(confidence: 0.93, detectedAtUtc: at);

      expect(ok, isTrue);
      expect(captured, isNotNull);
      expect(captured!.method, 'POST');
      expect(
        captured!.url.toString(),
        'http://localhost:3000/api/v1/incidents/mobile-fall',
      );
      expect(captured!.headers['content-type'], contains('application/json'));
      expect(captured!.headers['x-edge-token'], 'test-token');

      final decoded = jsonDecode(captured!.body) as Map<String, dynamic>;
      expect(decoded['confidence'], 0.93);
      expect(decoded['scopeId'], 'scope-1');
      expect(decoded['detectedAt'], at.toUtc().toIso8601String());

      sut.close();
    });

    test('returns false on non-2xx without throwing', () async {
      final client = MockClient(
        (_) async => http.Response('bad', 500),
      );
      final sut = FallBackendClient(config: config, httpClient: client);

      final ok = await sut.reportMobileFall(
        confidence: 0.5,
        detectedAtUtc: DateTime.utc(2026, 1, 1),
      );

      expect(ok, isFalse);
      sut.close();
    });

    test('returns false on transport error without throwing', () async {
      final client = MockClient((_) async {
        throw Exception('network down');
      });
      final sut = FallBackendClient(config: config, httpClient: client);

      final ok = await sut.reportMobileFall(
        confidence: 0.5,
        detectedAtUtc: DateTime.utc(2026, 1, 1),
      );

      expect(ok, isFalse);
      sut.close();
    });
  });
}
