from __future__ import annotations

import logging
from pathlib import Path

import aiosqlite

from app.config import Settings

logger = logging.getLogger(__name__)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS local_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT NOT NULL,
  label TEXT NOT NULL,
  confidence REAL NOT NULL,
  bbox_x1 REAL, bbox_y1 REAL, bbox_x2 REAL, bbox_y2 REAL,
  detected_at TEXT NOT NULL,
  snapshot_path TEXT,
  synced INTEGER NOT NULL DEFAULT 0,
  backend_event_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_local_events_detected_at ON local_events(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_local_events_synced ON local_events(synced);
"""


def _ensure_parent_dir(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


async def init_db(settings: Settings) -> None:
    db_path = settings.local_db_path.resolve()
    snap_dir = settings.local_snapshot_dir.resolve()
    _ensure_parent_dir(db_path)
    snap_dir.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.executescript(SCHEMA_SQL)
        await db.commit()
    logger.info("SQLite initialized at %s", db_path)
