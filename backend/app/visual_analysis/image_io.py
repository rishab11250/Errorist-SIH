"""Safely decode supported label images into OpenCV arrays."""

from __future__ import annotations

import base64
import binascii
import io
import re
import warnings
from typing import Any

import cv2
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.domain import DecodedImage

_DATA_URL = re.compile(
    r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]*={0,2})$",
    re.IGNORECASE,
)
_FORMAT_TO_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


class ImageDecodeError(ValueError):
    """A stable, API-safe image decoding failure."""

    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


def split_data_url(value: str) -> tuple[str | None, str]:
    """Return a declared MIME type and strict base64 payload."""

    if not isinstance(value, str):
        raise ImageDecodeError("image_decode_failed")
    if not value.startswith("data:"):
        return None, value
    match = _DATA_URL.fullmatch(value)
    if match is None:
        raise ImageDecodeError("invalid_image")
    return match.group(1).lower(), match.group(2)


def mime_for(image_format: str) -> str:
    """Map a supported Pillow format to its media type."""

    try:
        return _FORMAT_TO_MIME[image_format.upper()]
    except KeyError as exc:
        raise ImageDecodeError("invalid_image") from exc


def _number(value: object) -> float | None:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, (tuple, list)) and value and isinstance(value[0], (int, float)):
        return float(value[0])
    return None


def _read_probe_metadata(probe: Image.Image, image_format: str) -> dict[str, object]:
    metadata: dict[str, object] = {
        "format": image_format,
        "orientation": 1,
        "capture_device": "unknown",
    }
    dpi = probe.info.get("dpi")
    if isinstance(dpi, (tuple, list)) and len(dpi) >= 2:
        x_dpi = _number(dpi[0])
        y_dpi = _number(dpi[1])
        if x_dpi is not None and y_dpi is not None:
            metadata["dpi"] = (x_dpi, y_dpi)
    else:
        scalar_dpi = _number(dpi)
        if scalar_dpi is not None:
            metadata["dpi"] = (scalar_dpi, scalar_dpi)

    try:
        exif: Any = probe.getexif()
    except (AttributeError, OSError, ValueError):
        exif = {}
    orientation = exif.get(274)
    if isinstance(orientation, int) and 1 <= orientation <= 8:
        metadata["orientation"] = orientation

    software = str(exif.get(305) or probe.info.get("software") or "").strip()
    make = str(exif.get(271) or "").strip()
    model = str(exif.get(272) or "").strip()
    if software:
        metadata["software"] = software
    if make:
        metadata["device_make"] = make
    if model:
        metadata["device_model"] = model

    device_cues = " ".join((software, make, model)).lower()
    if "scan" in device_cues:
        metadata["capture_device"] = "scanner"
    elif make or model:
        metadata["capture_device"] = "camera"
    # DPI is retained only as source metadata. Callers must not use camera DPI
    # as a physical package scale.
    metadata["dpi_is_physical_scale"] = metadata["capture_device"] == "scanner"
    return metadata


def decode_image(image_b64: str, *, max_bytes: int, max_pixels: int) -> DecodedImage:
    """Decode a JPEG, PNG, or WebP after enforcing encoded and pixel limits."""

    if max_bytes <= 0 or max_pixels <= 0:
        raise ValueError("image limits must be positive")

    declared_type, payload = split_data_url(image_b64)
    try:
        raw = base64.b64decode(payload, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise ImageDecodeError("image_decode_failed") from exc
    if not raw:
        raise ImageDecodeError("image_decode_failed")
    if len(raw) > max_bytes:
        raise ImageDecodeError("image_too_large")

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as probe:
                actual_type = str(probe.format or "").upper()
                if actual_type not in _FORMAT_TO_MIME:
                    raise ImageDecodeError("invalid_image")
                if declared_type is not None and declared_type != mime_for(actual_type):
                    raise ImageDecodeError("invalid_image")
                width, height = probe.size
                if width <= 0 or height <= 0:
                    raise ImageDecodeError("invalid_image")
                if width * height > max_pixels:
                    raise ImageDecodeError("image_too_large")
                probe.verify()
            with Image.open(io.BytesIO(raw)) as metadata_probe:
                metadata = _read_probe_metadata(metadata_probe, actual_type)
                try:
                    transposed = ImageOps.exif_transpose(metadata_probe)
                    if transposed is not None:
                        metadata_probe = transposed
                except Exception:
                    pass
                if metadata_probe.mode != "RGB":
                    metadata_probe = metadata_probe.convert("RGB")
                width, height = metadata_probe.size
                rgb_array = np.array(metadata_probe)
                image = cv2.cvtColor(rgb_array, cv2.COLOR_RGB2BGR)
    except ImageDecodeError:
        raise
    except (
        UnidentifiedImageError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise ImageDecodeError("invalid_image") from exc
    except (OSError, SyntaxError, ValueError) as exc:
        raise ImageDecodeError("invalid_image") from exc

    if image is None:
        raise ImageDecodeError("image_decode_failed")
    return DecodedImage(
        image=image,
        width=width,
        height=height,
        metadata=metadata,
    )
