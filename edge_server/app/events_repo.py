from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import aiosqlite


@dataclass
class LocalEventInsert:
    camera_id: str
    label: str
    confidence: float
    bbox: tuple[float, float, float, float] | None
    detected_at: str
    snapshot_path: str | None


async def insert_event(conn: aiosqlite.Connection, event: LocalEventInsert) -> int:
    x1, y1, x2, y2 = (None, None, None, None)
    if event.bbox is not None:
        x1, y1, x2, y2 = event.bbox
    cur = await conn.execute(
        """
        INSERT INTO local_events (
          camera_id, label, confidence,
          bbox_x1, bbox_y1, bbox_x2, bbox_y2,
          detected_at, snapshot_path, synced
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            event.camera_id,
            event.label,
            event.confidence,
            x1,
            y1,
            x2,
            y2,
            event.detected_at,
            event.snapshot_path,
        ),
    )
    await conn.commit()
    return int(cur.lastrowid)


async def list_events(conn: aiosqlite.Connection, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    cur = await conn.execute(
        """
        SELECT id, camera_id, label, confidence,
               bbox_x1, bbox_y1, bbox_x2, bbox_y2,
               detected_at, snapshot_path, synced, backend_event_id, created_at
        FROM local_events
        ORDER BY detected_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    rows = await cur.fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        d = dict(r)
        d["synced"] = bool(d["synced"])
        if d["bbox_x1"] is not None:
            d["bbox"] = {
                "x1": d["bbox_x1"],
                "y1": d["bbox_y1"],
                "x2": d["bbox_x2"],
                "y2": d["bbox_y2"],
            }
        else:
            d["bbox"] = None
        for k in ("bbox_x1", "bbox_y1", "bbox_x2", "bbox_y2"):
            d.pop(k, None)
        out.append(d)
    return out


async def mark_synced(conn: aiosqlite.Connection, local_id: int, backend_event_id: str) -> None:
    await conn.execute(
        """
        UPDATE local_events
        SET synced = 1, backend_event_id = ?
        WHERE id = ?
        """,
        (backend_event_id, local_id),
    )
    await conn.commit()


async def list_unsynced(conn: aiosqlite.Connection) -> list[dict[str, Any]]:
    cur = await conn.execute(
        """
        SELECT id, snapshot_path FROM local_events
        WHERE synced = 0 AND snapshot_path IS NOT NULL
        ORDER BY id ASC
        """
    )
    rows = await cur.fetchall()
    return [dict(r) for r in rows]


async def get_by_id(conn: aiosqlite.Connection, event_id: int) -> dict[str, Any] | None:
    cur = await conn.execute(
        """
        SELECT id, camera_id, label, confidence,
               bbox_x1, bbox_y1, bbox_x2, bbox_y2,
               detected_at, snapshot_path, synced, backend_event_id, created_at
        FROM local_events WHERE id = ?
        """,
        (event_id,),
    )
    r = await cur.fetchone()
    if r is None:
        return None
    d = dict(r)
    d["synced"] = bool(d["synced"])
    if d.get("bbox_x1") is not None:
        d["bbox"] = {
            "x1": d["bbox_x1"],
            "y1": d["bbox_y1"],
            "x2": d["bbox_x2"],
            "y2": d["bbox_y2"],
        }
    else:
        d["bbox"] = None
    for k in ("bbox_x1", "bbox_y1", "bbox_x2", "bbox_y2"):
        d.pop(k, None)
    return d


async def count_unsynced(conn: aiosqlite.Connection) -> int:
    cur = await conn.execute("SELECT COUNT(*) FROM local_events WHERE synced = 0")
    row = await cur.fetchone()
    return int(row[0]) if row else 0
