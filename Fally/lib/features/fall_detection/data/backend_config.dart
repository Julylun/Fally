/// Compile-time mobile ↔ backend settings from `--dart-define`.
///
/// No runtime `.env` file — keeps dependencies minimal.
class FallBackendConfig {
  const FallBackendConfig({
    required this.baseUrl,
    required this.sharedToken,
    required this.scopeId,
    required this.fallCooldownSeconds,
  });

  /// Empty [baseUrl] disables HTTP reporting (no error, no network).
  factory FallBackendConfig.fromEnvironment() => const FallBackendConfig(
    baseUrl: String.fromEnvironment('BACKEND_BASE_URL'),
    sharedToken: String.fromEnvironment(
      'BACKEND_SHARED_TOKEN',
      defaultValue: 'devtoken',
    ),
    scopeId: String.fromEnvironment(
      'MOBILE_SCOPE_ID',
      defaultValue: 'default',
    ),
    fallCooldownSeconds: int.fromEnvironment(
      'MOBILE_FALL_COOLDOWN_SECONDS',
      defaultValue: 5,
    ),
  );

  final String baseUrl;
  final String sharedToken;
  final String scopeId;
  final int fallCooldownSeconds;
}
