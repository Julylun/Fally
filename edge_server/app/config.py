from __future__ import annotations

from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    model_path: Path = Field(
        default=Path("../Resources/best.pt"),
        validation_alias="MODEL_PATH",
    )
    camera_index: int = Field(default=0, validation_alias="CAMERA_INDEX")
    confidence_threshold: float = Field(default=0.4, validation_alias="CONFIDENCE_THRESHOLD")
    fall_label: str = Field(default="Fall Detected", validation_alias="FALL_LABEL")
    fall_cooldown_seconds: float = Field(default=3.0, validation_alias="FALL_COOLDOWN_SECONDS")
    inference_every_n_frames: int = Field(default=2, validation_alias="INFERENCE_EVERY_N_FRAMES")

    camera_id: str = Field(default="cam-edge-01", validation_alias="CAMERA_ID")
    backend_url: str = Field(default="http://localhost:3000", validation_alias="BACKEND_URL")
    backend_shared_token: str = Field(default="devtoken", validation_alias="BACKEND_SHARED_TOKEN")

    local_db_path: Path = Field(default=Path("./data/edge.db"), validation_alias="LOCAL_DB_PATH")
    local_snapshot_dir: Path = Field(
        default=Path("./data/snapshots"),
        validation_alias="LOCAL_SNAPSHOT_DIR",
    )

    port: int = Field(default=8001, validation_alias="PORT")
    ui_index_path: Path = Field(default=Path("./ui/index.html"), validation_alias="UI_INDEX_PATH")

    @field_validator("model_path", "local_db_path", "local_snapshot_dir", "ui_index_path", mode="before")
    @classmethod
    def _coerce_path(cls, v: str | Path) -> Path:
        return Path(v).expanduser()
