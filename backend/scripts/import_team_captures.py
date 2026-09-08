"""Import six reviewed, team-captured package photographs into the eval dataset."""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import sys
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Literal

from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

from app.evaluation import (
    KNOWN_RULE_IDS,
    MANIFEST_COLUMNS,
    DatasetError,
    GroundTruthVerdict,
)
from app.models import OCRLineIn, OCRWordIn


@dataclass(frozen=True)
class CaptureRequirement:
    product_id: str
    condition: str


CAPTURE_MATRIX = {
    "PHO-001": CaptureRequirement("PHOTO-A", "clear-front-panel-photo"),
    "PHO-002": CaptureRequirement("PHOTO-A", "blur-low-light-photo"),
    "PHO-003": CaptureRequirement("PHOTO-B", "clear-front-panel-photo"),
    "PHO-004": CaptureRequirement("PHOTO-B", "glare-perspective-photo"),
    "PHO-005": CaptureRequirement("PHOTO-C", "clear-front-panel-photo"),
    "PHO-006": CaptureRequirement("PHOTO-C", "edge-clipped-photo"),
}
_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}


class CaptureRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    example_id: str
    product_id: str
    source_file: str
    condition: str
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"]
    imported: bool | None
    source_note: str = Field(min_length=1)
    redistribution_approved: Literal[True]
    personal_data_reviewed: Literal[True]
    annotator: str = Field(min_length=1)
    reviewer: str = Field(min_length=1)
    annotation_date: date
    notes: str
    quality_status: Literal[
        "acceptable", "usable_with_warnings", "retake_recommended", "unreadable"
    ]
    words: list[OCRWordIn]
    lines: list[OCRLineIn]
    verdicts: dict[str, GroundTruthVerdict] = Field(min_length=1)

    @field_validator("source_file")
    @classmethod
    def source_is_single_image_name(cls, value: str) -> str:
        path = Path(value)
        if path.name != value or path.suffix.lower() not in _IMAGE_SUFFIXES:
            raise ValueError("source_file must be a JPEG, PNG, or WebP filename")
        return value

    @field_validator("verdicts")
    @classmethod
    def exact_rule_coverage(
        cls, value: dict[str, GroundTruthVerdict]
    ) -> dict[str, GroundTruthVerdict]:
        if value.keys() != KNOWN_RULE_IDS:
            missing = sorted(KNOWN_RULE_IDS - value.keys())
            extra = sorted(value.keys() - KNOWN_RULE_IDS)
            raise ValueError(
                f"verdicts must cover every known rule; missing={missing}, extra={extra}"
            )
        return value

    @model_validator(mode="after")
    def validate_review_and_lines(self) -> CaptureRecord:
        if self.annotator.casefold() == self.reviewer.casefold():
            raise ValueError("annotator and reviewer must be distinct")
        seen: set[int] = set()
        for line in self.lines:
            if any(index >= len(self.words) for index in line.word_indexes):
                raise ValueError("OCR line references a missing word")
            if seen.intersection(line.word_indexes):
                raise ValueError("OCR words cannot appear in multiple lines")
            seen.update(line.word_indexes)
        return self


def _load_records(input_dir: Path) -> list[CaptureRecord]:
    captures_path = input_dir / "captures.json"
    try:
        raw = json.loads(captures_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise DatasetError(f"cannot read captures.json: {error}") from error
    if isinstance(raw, dict):
        raw = raw.get("captures")
    if not isinstance(raw, list):
        raise DatasetError("captures.json must contain a list of six capture records")
    try:
        records = [CaptureRecord.model_validate(record) for record in raw]
    except ValidationError as error:
        raise DatasetError(f"invalid capture metadata: {error}") from error

    ids = [record.example_id for record in records]
    if set(ids) != CAPTURE_MATRIX.keys() or len(ids) != len(CAPTURE_MATRIX):
        raise DatasetError(f"capture IDs must exactly match: {', '.join(CAPTURE_MATRIX)}")
    sources = [record.source_file for record in records]
    if len(sources) != len(set(sources)):
        raise DatasetError("source_file must be unique for every capture")
    for record in records:
        requirement = CAPTURE_MATRIX[record.example_id]
        if record.product_id != requirement.product_id:
            raise DatasetError(f"{record.example_id} product_id must be {requirement.product_id}")
        if record.condition != requirement.condition:
            raise DatasetError(f"{record.example_id} condition must be {requirement.condition}")

    actual_images = {
        path.name
        for path in input_dir.iterdir()
        if path.is_file() and path.suffix.lower() in _IMAGE_SUFFIXES
    }
    if actual_images != set(sources):
        missing = sorted(set(sources) - actual_images)
        extra = sorted(actual_images - set(sources))
        raise DatasetError(
            f"input directory must contain exactly the six referenced images; "
            f"missing={missing}, extra={extra}"
        )
    return sorted(records, key=lambda record: record.example_id)


def _clean_png(source: Path) -> bytes:
    try:
        with Image.open(source) as opened:
            if opened.format not in _IMAGE_FORMATS:
                raise DatasetError(f"unsupported image content in {source.name}: {opened.format}")
            opened.load()
            oriented = ImageOps.exif_transpose(opened)
            has_alpha = "A" in oriented.getbands() or "transparency" in oriented.info
            converted = oriented.convert("RGBA" if has_alpha else "RGB")
            clean = Image.frombytes(converted.mode, converted.size, converted.tobytes())
    except (OSError, UnidentifiedImageError) as error:
        raise DatasetError(f"cannot decode capture image {source.name}: {error}") from error
    output = io.BytesIO()
    clean.save(output, format="PNG", compress_level=9, optimize=False)
    return output.getvalue()


def _read_dataset_rows(dataset: Path) -> tuple[list[dict[str, str]], list[dict]]:
    manifest_path = dataset / "manifest.csv"
    truth_path = dataset / "ground_truth.jsonl"
    if not manifest_path.exists() and not truth_path.exists():
        return [], []
    if not manifest_path.is_file() or not truth_path.is_file():
        raise DatasetError("dataset must contain both manifest.csv and ground_truth.jsonl")
    with manifest_path.open(newline="", encoding="utf-8") as stream:
        reader = csv.DictReader(stream)
        if tuple(reader.fieldnames or ()) != MANIFEST_COLUMNS:
            raise DatasetError("existing manifest has unexpected columns")
        rows = list(reader)
    try:
        truths = [
            json.loads(line)
            for line in truth_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    except (OSError, json.JSONDecodeError) as error:
        raise DatasetError(f"cannot read existing ground truth: {error}") from error
    return rows, truths


def _imported_value(value: bool | None) -> str:
    if value is None:
        return "unknown"
    return "true" if value else "false"


def _atomic_write_dataset(
    dataset: Path, manifest_rows: list[dict[str, str]], truths: list[dict]
) -> None:
    manifest_tmp = dataset / ".manifest.csv.tmp"
    truth_tmp = dataset / ".ground_truth.jsonl.tmp"
    with manifest_tmp.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(manifest_rows)
    truth_tmp.write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
            for record in truths
        ),
        encoding="utf-8",
    )
    manifest_tmp.replace(dataset / "manifest.csv")
    truth_tmp.replace(dataset / "ground_truth.jsonl")


def import_team_captures(input_dir: Path, dataset: Path) -> dict[str, str]:
    """Validate, sanitize, and idempotently import the required six captures."""

    input_root = Path(input_dir).resolve()
    dataset_root = Path(dataset).resolve()
    if not input_root.is_dir():
        raise DatasetError(f"capture input directory does not exist: {input_root}")
    dataset_root.mkdir(parents=True, exist_ok=True)
    records = _load_records(input_root)
    existing_rows, existing_truths = _read_dataset_rows(dataset_root)
    capture_ids = set(CAPTURE_MATRIX)
    retained_rows = [row for row in existing_rows if row.get("example_id") not in capture_ids]
    retained_truths = [
        truth for truth in existing_truths if truth.get("example_id") not in capture_ids
    ]
    existing_hashes = {row.get("sha256") for row in retained_rows}

    png_by_id = {
        record.example_id: _clean_png(input_root / record.source_file) for record in records
    }
    hashes = {
        example_id: hashlib.sha256(content).hexdigest() for example_id, content in png_by_id.items()
    }
    duplicates = sorted(set(hashes.values()).intersection(existing_hashes))
    if duplicates:
        raise DatasetError(f"capture image hash already exists in dataset: {duplicates[0]}")
    if len(set(hashes.values())) != len(hashes):
        raise DatasetError("capture image hashes must be unique")

    image_dir = dataset_root / "images" / "retail"
    ocr_dir = dataset_root / "ocr"
    image_dir.mkdir(parents=True, exist_ok=True)
    ocr_dir.mkdir(parents=True, exist_ok=True)
    new_rows: list[dict[str, str]] = []
    new_truths: list[dict] = []
    for record in records:
        image_relative = f"images/retail/{record.example_id}.png"
        ocr_relative = f"ocr/{record.example_id}.json"
        image_path = dataset_root / image_relative
        image_path.write_bytes(png_by_id[record.example_id])
        with Image.open(image_path) as image:
            width, height = image.size
        ocr_payload = {
            "schema_version": 2,
            "image_meta": {"width": width, "height": height, "dpi": None, "orientation": 1},
            "words": [word.model_dump(mode="json") for word in record.words],
            "lines": [line.model_dump(mode="json") for line in record.lines],
        }
        (dataset_root / ocr_relative).write_text(
            json.dumps(ocr_payload, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
        )
        new_rows.append(
            {
                "example_id": record.example_id,
                "product_id": record.product_id,
                "split": "test",
                "mode": "retail_image",
                "category": record.category,
                "imported": _imported_value(record.imported),
                "condition": record.condition,
                "image_path": image_relative,
                "sha256": hashes[record.example_id],
                "source_classification": "team_captured",
                "source_note": record.source_note,
                "ocr_path": ocr_relative,
            }
        )
        new_truths.append(
            {
                "example_id": record.example_id,
                "quality_status": record.quality_status,
                "verdicts": {
                    rule_id: verdict.model_dump(mode="json")
                    for rule_id, verdict in record.verdicts.items()
                },
                "annotator": record.annotator,
                "reviewer": record.reviewer,
                "annotation_date": record.annotation_date.isoformat(),
                "notes": record.notes,
            }
        )

    all_rows = sorted([*retained_rows, *new_rows], key=lambda row: row["example_id"])
    all_truths = sorted([*retained_truths, *new_truths], key=lambda truth: truth["example_id"])
    _atomic_write_dataset(dataset_root, all_rows, all_truths)
    return hashes


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, required=True)
    parser.add_argument("--dataset", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        hashes = import_team_captures(args.input_dir, args.dataset)
    except DatasetError as error:
        print(f"capture import failed: {error}", file=sys.stderr)
        return 2
    for example_id in sorted(hashes):
        print(f"{example_id}: {hashes[example_id]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
