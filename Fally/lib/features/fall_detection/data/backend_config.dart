import 'package:shared_preferences/shared_preferences.dart';

/// Runtime settings for the app.
class FallBackendConfig {
  const FallBackendConfig({
    required this.baseUrl,
    required this.sharedToken,
    required this.scopeId,
    required this.fallCooldownSeconds,
  });

  final String baseUrl;
  final String sharedToken;
  final String scopeId;
  final int fallCooldownSeconds;

  /// Loads from SharedPreferences, falling back to Dart-define environment variables.
  static Future<FallBackendConfig> load() async {
    final prefs = await SharedPreferences.getInstance();

    // Read from env first
    const envBaseUrl = String.fromEnvironment('BACKEND_BASE_URL');

    return FallBackendConfig(
      baseUrl: prefs.getString('BACKEND_BASE_URL') ?? envBaseUrl,
      sharedToken: const String.fromEnvironment(
        'BACKEND_SHARED_TOKEN',
        defaultValue: 'devtoken',
      ),
      scopeId: const String.fromEnvironment(
        'MOBILE_SCOPE_ID',
        defaultValue: 'default',
      ),
      fallCooldownSeconds: const int.fromEnvironment(
        'MOBILE_FALL_COOLDOWN_SECONDS',
        defaultValue: 5,
      ),
    );
  }

  static Future<void> saveBaseUrl(String url) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('BACKEND_BASE_URL', url);
  }
}
