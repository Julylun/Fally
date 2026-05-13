from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

import aiosqlite
import uvicorn
from fastapi import FastAPI

from app.camera import CameraWorker
from app.config import Settings
from app.detector import YoloFallDetector
from app import db
from app import events_repo
from app.events_repo import LocalEventInsert
from app.publisher import publisher_loop
from app.routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = Settings()
    app.state.settings = settings
    await db.init_db(settings)

    publisher_queue: asyncio.Queue[int] = asyncio.Queue()
    app.state.publisher_queue = publisher_queue

    detector = YoloFallDetector(
        settings.model_path,
        settings.confidence_threshold,
        settings.fall_label,
    )
    app.state.detector = detector

    logger.info("Loading YOLO model from %s ...", settings.model_path)
    loaded = await asyncio.to_thread(detector.load)
    if loaded:
        logger.info("YOLO model ready; inference will run on captured frames.")
    else:
        logger.warning(
            "YOLO model NOT loaded (%s); camera will stream without bounding boxes.",
            detector.load_error or "unknown error",
        )

    async def persist_and_enqueue(
        snapshot_rel: str,
        label: str,
        confidence: float,
        bbox: tuple[float, float, float, float] | None,
        detected_at: str,
    ) -> int:
        db_path = settings.local_db_path.resolve()
        async with aiosqlite.connect(db_path) as conn:
            conn.row_factory = aiosqlite.Row
            eid = await events_repo.insert_event(
                conn,
                LocalEventInsert(
                    camera_id=settings.camera_id,
                    label=label,
                    confidence=confidence,
                    bbox=bbox,
                    detected_at=detected_at,
                    snapshot_path=snapshot_rel,
                ),
            )
        await publisher_queue.put(eid)
        return eid

    app.state.persist_and_enqueue = persist_and_enqueue

    loop = asyncio.get_running_loop()
    camera = CameraWorker(
        settings,
        detector,
        loop,
        persist_and_enqueue,
        settings.local_snapshot_dir,
    )
    app.state.camera_worker = camera
    camera.start()

    pub_task = asyncio.create_task(
        publisher_loop(settings, publisher_queue),
        name="publisher",
    )
    app.state.publisher_task = pub_task

    logger.info("Edge server listening (configure PORT=%s)", settings.port)
    yield

    logger.info("Shutting down edge server...")
    camera.stop()
    pub_task.cancel()
    try:
        await pub_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete.")


app = FastAPI(title="Fally Edge", lifespan=lifespan)
app.include_router(router)


def create_app() -> FastAPI:
    return app


if __name__ == "__main__":
    s = Settings()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=s.port,
        factory=False,
        log_level="info",
    )
