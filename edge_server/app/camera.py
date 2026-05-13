from __future__ import annotations

import asyncio
import logging
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

import cv2
import numpy as np

from app.config import Settings
from app.detector import Detection, YoloFallDetector

logger = logging.getLogger(__name__)


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _placeholder_frame(text: str = "No camera") -> np.ndarray:
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    img[:] = (48, 48, 48)
    cv2.putText(
        img,
        text,
        (120, 240),
        cv2.FONT_HERSHEY_SIMPLEX,
        1.0,
        (200, 200, 200),
        2,
        cv2.LINE_AA,
    )
    return img


def _encode_jpeg(frame: np.ndarray, quality: int = 80) -> bytes:
    ok, buf = cv2.imencode(
        ".jpg",
        frame,
        [int(cv2.IMWRITE_JPEG_QUALITY), quality],
    )
    if not ok:
        raise RuntimeError("cv2.imencode failed")
    return bytes(buf)


class CameraWorker:
    """Background thread: capture, optional YOLO, MJPEG buffer, fall handling."""

    def __init__(
        self,
        settings: Settings,
        detector: YoloFallDetector,
        loop: asyncio.AbstractEventLoop,
        persist_fall: Callable[[str, str, float, tuple[float, float, float, float] | None, str], Awaitable[int]],
        snapshot_dir: Path,
    ) -> None:
        self._settings = settings
        self._detector = detector
        self._loop = loop
        self._persist_fall = persist_fall
        self._snapshot_dir = snapshot_dir.resolve()

        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._cap: cv2.VideoCapture | None = None
        self._camera_open = False

        self._jpeg_lock = threading.Lock()
        self._latest_jpeg: bytes = _encode_jpeg(_placeholder_frame("Starting..."))

        self._last_detections: list[Detection] = []
        self._frame_index = 0
        self._last_fall_monotonic: float = 0.0
        self._last_fall_at_iso: str | None = None

        self._fps_times: deque[float] = deque(maxlen=30)

    @property
    def camera_open(self) -> bool:
        return self._camera_open

    @property
    def last_fall_at(self) -> str | None:
        return self._last_fall_at_iso

    def latest_jpeg(self) -> bytes:
        with self._jpeg_lock:
            return self._latest_jpeg

    def approx_fps(self) -> float:
        if len(self._fps_times) < 2:
            return 0.0
        span = self._fps_times[-1] - self._fps_times[0]
        if span <= 0:
            return 0.0
        return (len(self._fps_times) - 1) / span

    def _schedule_persist(
        self,
        snapshot_rel: str,
        label: str,
        confidence: float,
        bbox: tuple[float, float, float, float] | None,
        detected_at: str,
    ) -> None:
        coro = self._persist_fall(snapshot_rel, label, confidence, bbox, detected_at)

        def _done(fut: asyncio.Future[int]) -> None:
            try:
                fut.result()
            except Exception as e:  # noqa: BLE001
                logger.exception("persist_fall failed: %s", e)

        fut = asyncio.run_coroutine_threadsafe(coro, self._loop)
        fut.add_done_callback(_done)

    def _handle_fall(
        self,
        annotated: np.ndarray,
        det: Detection,
    ) -> None:
        now_m = time.monotonic()
        if now_m - self._last_fall_monotonic < self._settings.fall_cooldown_seconds:
            return
        self._last_fall_monotonic = now_m
        detected_at = _utc_iso()
        self._last_fall_at_iso = detected_at

        self._snapshot_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{uuid.uuid4().hex}.jpg"
        out_path = self._snapshot_dir / fname
        jpeg_bytes = _encode_jpeg(annotated, quality=80)
        out_path.write_bytes(jpeg_bytes)

        # Store path relative to cwd for portability in DB
        try:
            rel = str(out_path.relative_to(Path.cwd()))
        except ValueError:
            rel = str(out_path)

        self._schedule_persist(rel, det.label, det.confidence, det.bbox, detected_at)

    def _run_loop(self) -> None:
        idx = self._settings.camera_index
        self._cap = cv2.VideoCapture(idx)
        self._camera_open = bool(self._cap and self._cap.isOpened())
        if not self._camera_open:
            logger.warning("Webcam index %s not available; MJPEG will show placeholder.", idx)
            if self._cap:
                self._cap.release()
                self._cap = None

        while not self._stop.is_set():
            t0 = time.perf_counter()
            if self._camera_open and self._cap is not None:
                ok, frame = self._cap.read()
                if not ok or frame is None:
                    frame = _placeholder_frame("Frame error")
            else:
                frame = _placeholder_frame("No camera")

            self._frame_index += 1
            infer = (
                self._detector.model_loaded
                and (self._frame_index % max(1, self._settings.inference_every_n_frames) == 0)
            )
            if infer:
                self._last_detections = self._detector.predict(frame)

            display = self._detector.annotate(frame, self._last_detections)

            for det in self._last_detections:
                if det.label == self._settings.fall_label and det.confidence >= self._settings.confidence_threshold:
                    self._handle_fall(display, det)
                    break

            try:
                jpeg = _encode_jpeg(display, quality=80)
            except Exception as e:  # noqa: BLE001
                logger.warning("JPEG encode failed: %s", e)
                jpeg = self.latest_jpeg()

            with self._jpeg_lock:
                self._latest_jpeg = jpeg

            self._fps_times.append(time.perf_counter())
            elapsed = time.perf_counter() - t0
            target = 1.0 / 30.0
            if elapsed < target:
                time.sleep(target - elapsed)

        if self._cap is not None:
            self._cap.release()
            self._cap = None
        self._camera_open = False
        logger.info("Camera worker stopped.")

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run_loop, name="CameraWorker", daemon=True)
        self._thread.start()
        logger.info("Camera worker thread started.")

    def stop(self) -> None:
        self._stop.set()
        if self._thread is not None:
            self._thread.join(timeout=5.0)
            self._thread = None
