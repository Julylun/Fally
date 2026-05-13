from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

import aiosqlite
import cv2
import httpx
import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

from app import events_repo

router = APIRouter()


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


@router.get("/")
async def index(request: Request) -> FileResponse:
    settings = request.app.state.settings
    path = settings.ui_index_path
    if not path.is_file():
        raise HTTPException(status_code=500, detail=f"UI file missing: {path.resolve()}")
    return FileResponse(path.resolve(), media_type="text/html")


async def _mjpeg_stream(request: Request) -> asyncio.AsyncIterator[bytes]:
    boundary = b"frame"
    while True:
        if await request.is_disconnected():
            break
        cam = request.app.state.camera_worker
        jpeg = cam.latest_jpeg()
        yield b"--" + boundary + b"\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        await asyncio.sleep(0.033)


@router.get("/video_feed")
async def video_feed(request: Request) -> StreamingResponse:
    gen = _mjpeg_stream(request)
    return StreamingResponse(
        gen,
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


@router.get("/api/status")
async def api_status(request: Request) -> dict:
    settings = request.app.state.settings
    cam = request.app.state.camera_worker
    det = request.app.state.detector

    unsynced = 0
    db_path = settings.local_db_path.resolve()
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        unsynced = await events_repo.count_unsynced(conn)

    backend_reachable: bool | None = None
    try:
        health_url = settings.backend_url.rstrip("/") + "/api/v1/healthz"
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get(health_url)
            backend_reachable = r.status_code == 200
    except Exception:  # noqa: BLE001
        backend_reachable = False

    return {
        "camera_open": cam.camera_open,
        "camera_id": settings.camera_id,
        "fps": round(cam.approx_fps(), 2),
        "last_fall_at": cam.last_fall_at,
        "backend_url": settings.backend_url,
        "unsynced_count": unsynced,
        "model_loaded": det.model_loaded,
        "model_load_error": det.load_error,
        "backend_reachable": backend_reachable,
    }


@router.get("/api/events")
async def api_events(request: Request, limit: int = 50) -> list[dict]:
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be 1..200")
    settings = request.app.state.settings
    db_path = settings.local_db_path.resolve()
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        return await events_repo.list_events(conn, limit=limit, offset=0)


@router.get("/api/snapshots/{event_id}")
async def api_snapshot(request: Request, event_id: int) -> FileResponse:
    settings = request.app.state.settings
    db_path = settings.local_db_path.resolve()
    async with aiosqlite.connect(db_path) as conn:
        conn.row_factory = aiosqlite.Row
        row = await events_repo.get_by_id(conn, event_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Event not found")
    snap = row.get("snapshot_path")
    if not snap:
        raise HTTPException(status_code=404, detail="No snapshot for event")
    path = Path(snap)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Snapshot file missing")
    return FileResponse(path.resolve(), media_type="image/jpeg")


def _make_test_placeholder_jpeg() -> bytes:
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (64, 64, 64)
    cv2.putText(
        img,
        "TEST EVENT",
        (140, 260),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.2,
        (220, 220, 220),
        2,
        cv2.LINE_AA,
    )
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
    if not ok:
        raise RuntimeError("imencode failed")
    return bytes(buf)


@router.post("/api/test-event")
async def api_test_event(request: Request) -> dict:
    settings = request.app.state.settings
    persist = request.app.state.persist_and_enqueue

    snap_dir = settings.local_snapshot_dir.resolve()
    snap_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}.jpg"
    out_path = snap_dir / fname
    out_path.write_bytes(_make_test_placeholder_jpeg())
    try:
        rel = str(out_path.relative_to(Path.cwd()))
    except ValueError:
        rel = str(out_path)

    detected_at = _utc_iso()
    local_id = await persist(
        rel,
        settings.fall_label,
        1.0,
        (50.0, 50.0, 400.0, 400.0),
        detected_at,
    )
    return {"ok": True, "local_event_id": local_id}

