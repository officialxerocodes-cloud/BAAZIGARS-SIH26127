"""Event contract — every camera type speaks this. ARCHITECTURE.md §6"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field

class EdgeEventIn(BaseModel):
    camera_id: str = Field(..., examples=["CAM_017"])
    ts: datetime = Field(..., description="ISO8601 with tz")
    plate_raw: str = Field(..., examples=["DL 8C AB 1234"])
    canonical: Optional[str] = None
    confidence: float = Field(ge=0, le=1, default=0.9)
    vehicle_class: Optional[str] = Field(default="private", examples=["private"])
    crop_b64: Optional[str] = None
    ground_truth: Optional[str] = Field(default=None, description="sim-only GT, used by stub ANPR")
    # optional extras from ANPR service
    box: Optional[list[float]] = None
    corners: Optional[list[list[float]]] = None

    def normalized_canonical(self) -> str:
        from .plate import canonicalize
        if self.canonical:
            return canonicalize(self.canonical)
        return canonicalize(self.plate_raw)

class EdgeEventOut(BaseModel):
    camera_id: str
    ts: datetime
    raw_plate: str
    canonical: str
    confidence: float
    vehicle_class: Optional[str] = None
    crop_b64: Optional[str] = None
    ground_truth: Optional[str] = None

class IngestResponse(BaseModel):
    status: str = "ok"
    canonical: str
    stream: str
    seq: str

class HealthResponse(BaseModel):
    status: str = "ok"
    service: str
