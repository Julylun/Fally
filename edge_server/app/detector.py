from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class Detection:
    label: str
    confidence: float
    bbox: tuple[float, float, float, float]  # x1, y1, x2, y2


class YoloFallDetector:
    """Wraps Ultralytics YOLO with lazy load and graceful degradation."""

    def __init__(self, model_path: Path, conf: float, fall_label: str = "Fall Detected") -> None:
        self._model_path = model_path
        self._conf = conf
        self._fall_label = fall_label
        self._model: Any = None
        self._load_error: str | None = None
        self._names: dict[int, str] = {}

    @property
    def model_loaded(self) -> bool:
        return self._model is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    def _ensure_model(self) -> None:
        if self._model is not None or self._load_error is not None:
            return
        resolved = self._model_path.expanduser()
        if not resolved.is_file():
            self._load_error = f"MODEL_PATH not found: {resolved}"
            logger.warning(self._load_error)
            return
        try:
            from ultralytics import YOLO

            self._model = YOLO(str(resolved))
            self._names = dict(self._model.names) if hasattr(self._model, "names") else {}
            logger.info("YOLO model loaded from %s", resolved)
        except Exception as e:  # noqa: BLE001 — surface any torch/import failure
            self._load_error = str(e)
            logger.warning("Failed to load YOLO model: %s", e)

    def load(self) -> bool:
        """Eagerly load the YOLO model. Call once at startup.

        Returns True if the model is loaded, False if loading failed (the
        detector will still operate but `predict()` will return no detections).
        """
        self._ensure_model()
        return self._model is not None

    def predict(self, frame: np.ndarray) -> list[Detection]:
        self._ensure_model()
        if self._model is None:
            return []
        try:
            results = self._model.predict(frame, conf=self._conf, verbose=False)
            if not results:
                return []
            r0 = results[0]
            names = self._names or (dict(r0.names) if hasattr(r0, "names") and r0.names else {})
            out: list[Detection] = []
            if r0.boxes is None or len(r0.boxes) == 0:
                return out
            xyxy = r0.boxes.xyxy.cpu().numpy()
            confs = r0.boxes.conf.cpu().numpy()
            cls_ids = r0.boxes.cls.cpu().numpy().astype(int)
            for i in range(len(xyxy)):
                cid = int(cls_ids[i])
                label = names.get(cid, str(cid))
                x1, y1, x2, y2 = (float(v) for v in xyxy[i])
                out.append(
                    Detection(
                        label=label,
                        confidence=float(confs[i]),
                        bbox=(x1, y1, x2, y2),
                    )
                )
            return out
        except Exception as e:  # noqa: BLE001
            logger.warning("YOLO predict failed: %s", e)
            return []

    def annotate(self, frame: np.ndarray, detections: list[Detection]) -> np.ndarray:
        import cv2

        img = frame.copy()
        for d in detections:
            x1, y1, x2, y2 = (int(round(v)) for v in d.bbox)
            if d.label == self._fall_label:
                color = (0, 0, 255)  # BGR red
            else:
                color = (128, 128, 128)  # gray for Walking/Sitting
            cv2.rectangle(img, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                img,
                f"{d.label} {d.confidence:.2f}",
                (x1, max(y1 - 8, 16)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                color,
                1,
                cv2.LINE_AA,
            )
        return img
