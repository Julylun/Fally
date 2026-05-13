# Fally Backend (NestJS)

REST API and static dashboard for fall events from edge CCTV devices. Stack: **NestJS 10**, **MongoDB** (Mongoose), **class-validator**, **multer** (memory storage, files written under `SNAPSHOT_DIR`), **@nestjs/serve-static** for the UI at `/`.

## Requirements

- **Node.js ≥ 20** (Nest 10 and tooling assume a current LTS-style runtime).
- **MongoDB** reachable at the URI you configure (default `mongodb://localhost:27017/fally`).
- **pnpm** (preferred) or npm.

## Install

From this directory:

```bash
pnpm install
```

If you do not use pnpm:

```bash
npm install
```

## Configuration

Copy the example env file and adjust paths or secrets as needed:

```bash
cp .env.example .env
```

| Variable            | Description                                      |
| ------------------- | ------------------------------------------------ |
| `MONGODB_URI`       | Mongo connection string (not hardcoded in code). |
| `SNAPSHOT_DIR`      | Directory for uploaded JPEG snapshots.           |
| `EDGE_SHARED_TOKEN` | Shared secret; edge clients send `X-Edge-Token`. |
| `PORT`              | HTTP port (default `3000`).                      |

Runtime snapshot files live under `data/` (ignored by git); the repo ships `data/snapshots/.gitkeep` so the folder exists.

## Run

Development (watch mode):

```bash
pnpm run start:dev
```

Production build + run:

```bash
pnpm run build
pnpm run start:prod
```

- API base path: **`/api/v1`**
- Health: **`GET /healthz`** → `{ "status": "ok" }` (not under `/api/v1`)
- Dashboard: **`http://localhost:3000/`** (static UI; data loads via `fetch` on load, **Refresh**, or filter **Apply** only — no polling, no WebSocket)

## API summary

| Method | Path | Notes |
| ------ | ---- | ----- |
| `POST` | `/api/v1/events` | Multipart: file field `snapshot`, form field `payload` (JSON string). Header `X-Edge-Token` required. Returns `{ id, snapshotUrl }` (201). |
| `GET` | `/api/v1/events` | Query: `limit`, `page`, `cameraId`, `label`, `from`, `to`, `resolved`. |
| `GET` | `/api/v1/events/:id` | Event detail. |
| `PATCH` | `/api/v1/events/:id` | Body `{ "resolved": boolean }`. |
| `GET` | `/api/v1/snapshots/:eventId` | JPEG from disk. |
| `GET` | `/api/v1/cameras` | Per-camera aggregates: `lastSeen`, `eventsLast24h`, `fallsLast24h`. |

## Docker prep

Ports, Mongo URI, snapshot directory, and the edge token are all read from the environment via `@nestjs/config` — suitable for container overrides and volume mounts later without code changes.
