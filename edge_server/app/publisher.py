from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path
from typing import Any

import aiosqlite
import httpx

from app.config import Settings
from app import events_repo

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BACKOFF_SECONDS = 2.0
POST_TIMEOUT = 5.0


def _backend_payload_row(row: dict[str, Any], settings: Settings) -> dict[str, Any]:
    bbox = row.get("bbox")
    cam_payload = {
        "cameraId": row["camera_id"],
        "label": row["label"],
        "confidence": float(row["confidence"]),
        "bbox": bbox
        if bbox
        else {"x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 0.0},
        "detectedAt": row["detected_at"],
    }
    return cam_payload


def _parse_backend_event_id(data: Any) -> str | None:
    if isinstance(data, dict):
        if "id" in data and data["id"] is not None:
            return str(data["id"])
        if "_id" in data and data["_id"] is not None:
            return str(data["_id"])
        inner = data.get("data")
        if isinstance(inner, dict) and inner.get("id") is not None:
            return str(inner["id"])
    return None


async def publisher_loop(settings: Settings, queue: asyncio.Queue[int]) -> None:
    url = settings.backend_url.rstrip("/") + "/api/v1/events"
    headers = {"X-Edge-Token": settings.backend_shared_token}

    async with httpx.AsyncClient(timeout=POST_TIMEOUT) as client:
        while True:
            local_id = await queue.get()
            try:
                db_path = settings.local_db_path.resolve()
                async with aiosqlite.connect(db_path) as conn:
                    conn.row_factory = aiosqlite.Row
                    row = await events_repo.get_by_id(conn, local_id)
                    if row is None:
                        logger.warning("Publisher: local event %s missing", local_id)
                        continue
                    snap = row.get("snapshot_path")
                    if not snap:
                        logger.warning("Publisher: no snapshot for event %s", local_id)
                        continue
                    path = Path(snap)
                    if not path.is_file():
                        logger.warning("Publisher: snapshot file missing %s", path)
                        continue
                    image_bytes = path.read_bytes()
                    payload = _backend_payload_row(row, settings)
                    payload_json = json.dumps(payload)

                last_error: str | None = None
                for attempt in range(1, MAX_RETRIES + 1):
                    try:
                        resp = await client.post(
                            url,
                            headers=headers,
                            files={"snapshot": ("snapshot.jpg", image_bytes, "image/jpeg")},
                            data={"payload": payload_json},
                        )
                        if resp.status_code == 201:
                            backend_id = _parse_backend_event_id(resp.json())
                            if backend_id:
                                async with aiosqlite.connect(db_path) as conn2:
                                    conn2.row_factory = aiosqlite.Row
                                    await events_repo.mark_synced(conn2, local_id, backend_id)
                                logger.info("Synced local event %s -> backend %s", local_id, backend_id)
                            else:
                                logger.warning(
                                    "POST 201 but no id in body for local %s: %s",
                                    local_id,
                                    resp.text[:500],
                                )
                            break
                        last_error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                        logger.warning(
                            "Backend POST failed (attempt %s/%s): %s",
                            attempt,
                            MAX_RETRIES,
                            last_error,
                        )
                    except Exception as e:  # noqa: BLE001
                        last_error = str(e)
                        logger.warning(
                            "Backend POST error (attempt %s/%s): %s",
                            attempt,
                            MAX_RETRIES,
                            e,
                        )
                    if attempt < MAX_RETRIES:
                        await asyncio.sleep(BACKOFF_SECONDS)
                else:
                    logger.warning(
                        "Giving up sync for local event %s after %s tries. Last: %s",
                        local_id,
                        MAX_RETRIES,
                        last_error,
                    )
            finally:
                queue.task_done()
