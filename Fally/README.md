# fally_app

A new Flutter project.

## Backend integration

When a fall is detected on-device, the app can `POST` to the backend
`POST {BACKEND_BASE_URL}/api/v1/incidents/mobile-fall` (see `FallBackendClient`).
Reporting is **off** if `BACKEND_BASE_URL` is empty (default).

Run with compile-time defines, for example:

```bash
flutter run \
  --dart-define=BACKEND_BASE_URL=http://10.0.2.2:3000 \
  --dart-define=BACKEND_SHARED_TOKEN=devtoken
```

On the **Android emulator**, `10.0.2.2` reaches the host machine’s `localhost`.
On **iOS simulator**, use `http://127.0.0.1:PORT` (or your machine’s LAN IP for a physical device).

Optional defines: `MOBILE_SCOPE_ID` (default `default`),
`MOBILE_FALL_COOLDOWN_SECONDS` (default `5`).

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
