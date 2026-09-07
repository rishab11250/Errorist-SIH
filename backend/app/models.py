"""Pydantic DTOs for HTTP request/response."""
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "ok"
    rules_version: str


class ScanContextIn(BaseModel):
    mode: str = Field(default="retail_image", pattern="^(retail_image|ecommerce_listing)$")
    category: str = Field(
        default="unknown",
        pattern="^(food|non_food|cosmetics|seeds|unknown)$",
    )


class ImageMetaIn(BaseModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    dpi: int | None = None
    orientation: int = 1


class OCRWordIn(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: tuple[float, float, float, float]  # x, y, w, h normalised 0..1


class ScanRequest(BaseModel):
    image_b64: str
    image_meta: ImageMetaIn
    ocr_payload: list[OCRWordIn]
    scan_context: ScanContextIn = ScanContextIn()
