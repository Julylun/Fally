# Fally Edge Server

Python service that reads a webcam (optional), runs YOLOv8 fall detection when a model is available, stores events in local SQLite, and POSTs snapshots to the central backend with retries.

## Python version

This stack depends on **PyTorch** and **Ultralytics**, which typically ship wheels for **CPython 3.10–3.12**. Many systems already ship **3.13+** (e.g. 3.14) where prebuilt wheels may be missing.

**Recommendation:** use [pyenv](https://github.com/pyenv/pyenv) (or similar) inside this repo:

```bash
cd edge_server
pyenv install 3.12.8
pyenv local 3.12.8
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configuration

Copy `.env.example` to `.env` and adjust paths relative to the directory from which you start the server (usually `edge_server/`):

| Variable | Purpose |
|----------|---------|
| `MODEL_PATH` | YOLO weights file (default `../Resources/best.pt`) |
| `CAMERA_INDEX` | `cv2.VideoCapture` device index |
| `CONFIDENCE_THRESHOLD` | YOLO confidence (default `0.4`, matches `Resources/fally_cctv.py`) |
| `FALL_LABEL` | Label treated as a fall (default `Fall Detected`) |
| `FALL_COOLDOWN_SECONDS` | Minimum seconds between forwarded fall events |
| `INFERENCE_EVERY_N_FRAMES` | Run inference every *n* captured frames |
| `CAMERA_ID` | Edge camera identifier sent to the backend |
| `BACKEND_URL` | Base URL of the Nest backend (no trailing slash required) |
| `BACKEND_SHARED_TOKEN` | Value for `X-Edge-Token` on outbound requests |
| `SCOPE_ID` | Sent as `scopeId` in the event JSON payload for backend correlation (default `default`) |
| `LOCAL_DB_PATH` | SQLite database file |
| `LOCAL_SNAPSHOT_DIR` | Directory for JPEG snapshots |
| `PORT` | HTTP port (default `8001`) |
| `UI_INDEX_PATH` | Path to the Edge UI HTML file |

All filesystem paths are read from the environment so they can be remapped in Docker later.

## Run

From `edge_server/` with the virtualenv activated:

```bash
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

Or:

```bash
python -m app.main
```

Open **http://localhost:8001** for the Edge UI (live MJPEG, local event list, Refresh, and “Send test event”).

## Behavior notes

- **Camera:** if the configured device does not open, the service keeps running; MJPEG shows a placeholder and `/api/status` reports `camera_open: false`.
- **Model:** weights load lazily on first inference. If the file is missing or import/load fails, inference is skipped and `/api/status` reports `model_loaded: false` (with `model_load_error` when known). **Send test event** still exercises SQLite + publisher.
- **Publisher:** `POST {BACKEND_URL}/api/v1/events` with multipart `snapshot` + form field `payload` (JSON string), header `X-Edge-Token`. Up to **3** attempts with **2 s** backoff; on HTTP **201** the row is marked `synced=1` and `backend_event_id` is stored when the JSON body includes an `id`.

## Project layout

```
edge_server/
  app/           # FastAPI application package
  ui/            # Edge dashboard (Tailwind CDN, vanilla JS)
  data/          # runtime: edge.db + snapshots/ (created on startup)
  requirements.txt
  .env.example
  README.md
```

## API (summary)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Edge UI |
| GET | `/video_feed` | MJPEG stream |
| GET | `/api/status` | Camera, FPS, model, backend URL, unsynced count, etc. |
| GET | `/api/events?limit=50` | Newest rows from `local_events` |
| GET | `/api/snapshots/{id}` | JPEG for local event `id` |
| POST | `/api/test-event` | Placeholder snapshot + DB row + publish queue |
