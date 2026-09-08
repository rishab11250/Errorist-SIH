"""Versioned, read-only contract for LMPC evaluation evidence datasets."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path, PurePosixPath
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

MANIFEST_COLUMNS = (
    "example_id",
    "product_id",
    "split",
    "mode",
    "category",
    "imported",
    "condition",
    "image_path",
    "sha256",
    "source_classification",
    "source_note",
    "ocr_path",
)
VALID_SPLITS = frozenset({"development", "test"})
VALID_MODES = frozenset({"retail_image", "ecommerce_listing"})
VALID_CATEGORIES = frozenset({"food", "non_food", "cosmetics", "seeds", "unknown"})
VALID_STATUSES = frozenset({"pass", "fail", "warn", "manual_review", "na"})
VALID_QUALITY_STATUSES = frozenset(
    {"acceptable", "usable_with_warnings", "retake_recommended", "unreadable"}
)
VALID_SOURCE_CLASSIFICATIONS = frozenset({"team_captured", "synthetic", "redistributable"})
KNOWN_RULE_IDS = frozenset(
    {
        "r6_1_e_mrp",
        "r6_1_c_net_quantity",
        "r6_1_a_address",
        "r6_2_consumer_care",
        "r6_1_d_mfg_date",
        "r6_1_b_common_name",
        "r6_1_aa_country_origin",
        "r6_1_a_importer_address",
        "r6_1_da_best_before",
        "r6_1_f_dimensions",
        "r6_11_unit_sale_price",
        "r6_10_ecommerce_declarations",
        "r7_font_size",
    }
)

_EXAMPLE_ID = re.compile(r"^[A-Z]{3}-[0-9]{3}$")
_PRODUCT_ID = re.compile(r"^[A-Z0-9]+(?:-[A-Z0-9]+)*$")
_CONDITION = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


class DatasetError(ValueError):
    """Raised when evaluation evidence does not satisfy the dataset contract."""


class ManifestRecord(BaseModel):
    """One immutable manifest row."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)

    example_id: str
    product_id: str
    split: Literal["development", "test"]
    mode: Literal["retail_image", "ecommerce_listing"]
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"]
    imported: Literal["true", "false", "unknown"]
    condition: str
    image_path: str
    sha256: str
    source_classification: Literal["team_captured", "synthetic", "redistributable"]
    source_note: str = Field(min_length=1)
    ocr_path: str

    @field_validator("example_id")
    @classmethod
    def valid_example_id(cls, value: str) -> str:
        if not _EXAMPLE_ID.fullmatch(value):
            raise ValueError("example_id must match AAA-000")
        return value

    @field_validator("product_id")
    @classmethod
    def valid_product_id(cls, value: str) -> str:
        if not _PRODUCT_ID.fullmatch(value):
            raise ValueError("product_id must be an uppercase identifier slug")
        return value

    @field_validator("condition")
    @classmethod
    def valid_condition(cls, value: str) -> str:
        if not _CONDITION.fullmatch(value):
            raise ValueError("condition must be a non-empty normalized slug")
        return value

    @field_validator("sha256")
    @classmethod
    def valid_sha256(cls, value: str) -> str:
        if not _SHA256.fullmatch(value):
            raise ValueError("sha256 must be 64 lowercase hexadecimal characters")
        return value


def _normalized_bbox(value: object) -> tuple[float, float, float, float]:
    message = "bbox must be normalized and fit inside image bounds"
    if not isinstance(value, (list, tuple)) or len(value) != 4:
        raise ValueError(message)
    if any(isinstance(part, bool) or not isinstance(part, (int, float)) for part in value):
        raise ValueError(message)
    box = tuple(float(part) for part in value)
    x, y, width, height = box
    if (
        not all(math.isfinite(part) for part in box)
        or x < 0
        or y < 0
        or width <= 0
        or height <= 0
        or x + width > 1
        or y + height > 1
    ):
        raise ValueError(message)
    return box


class GroundTruthVerdict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)

    status: Literal["pass", "fail", "warn", "manual_review", "na"]
    evidence: str
    bboxes: tuple[tuple[float, float, float, float], ...] = ()

    @field_validator("status", mode="before")
    @classmethod
    def valid_status(cls, value: object) -> object:
        if value not in VALID_STATUSES:
            raise ValueError(f"invalid verdict status: {value}")
        return value

    @field_validator("bboxes", mode="before")
    @classmethod
    def valid_bboxes(cls, value: object) -> tuple[tuple[float, float, float, float], ...]:
        if value is None:
            return ()
        if not isinstance(value, (list, tuple)):
            raise ValueError("bbox must be normalized and fit inside image bounds")
        return tuple(_normalized_bbox(box) for box in value)


class GroundTruthRecord(BaseModel):
    """Reviewer-approved expected output for one example."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, frozen=True)

    example_id: str
    quality_status: Literal[
        "acceptable", "usable_with_warnings", "retake_recommended", "unreadable"
    ]
    verdicts: dict[str, GroundTruthVerdict] = Field(min_length=1)
    annotator: str = Field(min_length=1)
    reviewer: str = Field(min_length=1)
    annotation_date: date
    notes: str

    @field_validator("example_id")
    @classmethod
    def valid_example_id(cls, value: str) -> str:
        if not _EXAMPLE_ID.fullmatch(value):
            raise ValueError("example_id must match AAA-000")
        return value

    @field_validator("quality_status", mode="before")
    @classmethod
    def valid_quality_status(cls, value: object) -> object:
        if value not in VALID_QUALITY_STATUSES:
            raise ValueError(f"invalid quality status: {value}")
        return value

    @field_validator("verdicts")
    @classmethod
    def valid_rule_ids(cls, value: dict[str, GroundTruthVerdict]) -> dict[str, GroundTruthVerdict]:
        unknown = value.keys() - KNOWN_RULE_IDS
        if unknown:
            raise ValueError(f"unknown rule IDs: {sorted(unknown)}")
        return value


@dataclass(frozen=True)
class EvalExample:
    manifest: ManifestRecord
    ground_truth: GroundTruthRecord
    image_file: Path
    ocr_file: Path
    ocr_sha256: str

    @property
    def example_id(self) -> str:
        return self.manifest.example_id


@dataclass(frozen=True)
class EvalDataset:
    root: Path
    split: str
    examples: tuple[EvalExample, ...]


def _file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _dataset_file(root: Path, relative: str, *, field: str, example_id: str) -> Path:
    pure_path = PurePosixPath(relative)
    if pure_path.is_absolute() or ".." in pure_path.parts or "." in pure_path.parts:
        raise DatasetError(f"{example_id} {field} path must stay inside dataset")
    candidate = (root / Path(*pure_path.parts)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as error:
        raise DatasetError(f"{example_id} {field} path must stay inside dataset") from error
    if not candidate.is_file():
        raise DatasetError(f"{example_id} {field} file does not exist: {relative}")
    return candidate


def _validate_nested_bboxes(value: object) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "bbox":
                _normalized_bbox(child)
            elif key in {"bboxes", "evidence_bboxes"}:
                if not isinstance(child, list):
                    raise ValueError("bbox must be normalized and fit inside image bounds")
                for box in child:
                    _normalized_bbox(box)
            else:
                _validate_nested_bboxes(child)
    elif isinstance(value, list):
        for child in value:
            _validate_nested_bboxes(child)


def _load_manifest(path: Path) -> list[ManifestRecord]:
    try:
        with path.open(newline="", encoding="utf-8-sig") as stream:
            reader = csv.DictReader(stream)
            if tuple(reader.fieldnames or ()) != MANIFEST_COLUMNS:
                raise DatasetError(
                    "manifest.csv columns must exactly match: " + ",".join(MANIFEST_COLUMNS)
                )
            rows = [ManifestRecord.model_validate(row) for row in reader]
    except OSError as error:
        raise DatasetError(f"cannot read manifest.csv: {error}") from error
    except ValidationError as error:
        raise DatasetError(f"invalid manifest row: {error}") from error
    ids = [row.example_id for row in rows]
    if len(ids) != len(set(ids)):
        raise DatasetError("manifest example_id values must be unique")
    return rows


def _load_ground_truth(path: Path) -> dict[str, GroundTruthRecord]:
    records: dict[str, GroundTruthRecord] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as error:
        raise DatasetError(f"cannot read ground_truth.jsonl: {error}") from error
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            record = GroundTruthRecord.model_validate_json(line)
        except (ValidationError, ValueError) as error:
            raise DatasetError(f"invalid ground truth at line {line_number}: {error}") from error
        if record.annotator.casefold() == record.reviewer.casefold():
            raise DatasetError(f"{record.example_id} annotator and reviewer must be distinct")
        if record.example_id in records:
            raise DatasetError(f"duplicate ground truth for {record.example_id}")
        records[record.example_id] = record
    return records


def _validate_product_splits(rows: list[ManifestRecord]) -> None:
    by_product: dict[str, set[str]] = {}
    for row in rows:
        by_product.setdefault(row.product_id, set()).add(row.split)
    crossing = sorted(product_id for product_id, splits in by_product.items() if len(splits) > 1)
    if crossing:
        raise DatasetError(f"product_id crosses splits: {', '.join(crossing)}")


def load_dataset(root: Path, split: str) -> EvalDataset:
    """Load and fully validate an evaluation dataset without modifying it."""

    if split not in {*VALID_SPLITS, "all"}:
        raise DatasetError(f"split must be one of: {', '.join(sorted(VALID_SPLITS))}, all")
    dataset_root = Path(root).resolve()
    if not dataset_root.is_dir():
        raise DatasetError(f"dataset root does not exist: {dataset_root}")

    rows = _load_manifest(dataset_root / "manifest.csv")
    truth_by_id = _load_ground_truth(dataset_root / "ground_truth.jsonl")
    manifest_ids = {row.example_id for row in rows}
    if manifest_ids != truth_by_id.keys():
        missing = sorted(manifest_ids - truth_by_id.keys())
        extra = sorted(truth_by_id.keys() - manifest_ids)
        raise DatasetError(
            f"ground truth IDs must exactly match manifest IDs; missing={missing}, extra={extra}"
        )
    _validate_product_splits(rows)

    examples: list[EvalExample] = []
    for row in rows:
        image_file = _dataset_file(
            dataset_root, row.image_path, field="image", example_id=row.example_id
        )
        actual_sha256 = _file_sha256(image_file)
        if actual_sha256 != row.sha256:
            raise DatasetError(
                f"{row.example_id} image sha256 mismatch: "
                f"expected {row.sha256}, got {actual_sha256}"
            )
        ocr_file = _dataset_file(dataset_root, row.ocr_path, field="ocr", example_id=row.example_id)
        try:
            ocr_payload: Any = json.loads(ocr_file.read_text(encoding="utf-8"))
            _validate_nested_bboxes(ocr_payload)
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise DatasetError(f"{row.example_id} invalid OCR fixture: {error}") from error
        if split == "all" or row.split == split:
            examples.append(
                EvalExample(
                    manifest=row,
                    ground_truth=truth_by_id[row.example_id],
                    image_file=image_file,
                    ocr_file=ocr_file,
                    ocr_sha256=_file_sha256(ocr_file),
                )
            )
    ordered_examples = tuple(sorted(examples, key=lambda item: item.example_id))
    return EvalDataset(dataset_root, split, ordered_examples)


def dataset_digest(dataset: EvalDataset) -> str:
    """Return the stable SHA-256 digest for the selected, validated evidence."""

    canonical_examples = []
    for example in sorted(dataset.examples, key=lambda item: item.example_id):
        canonical_examples.append(
            {
                "manifest": example.manifest.model_dump(mode="json"),
                "ground_truth": example.ground_truth.model_dump(mode="json"),
                "image_sha256": example.manifest.sha256,
                "ocr_sha256": example.ocr_sha256,
            }
        )
    payload = json.dumps(
        {"schema_version": 1, "split": dataset.split, "examples": canonical_examples},
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode()
    return hashlib.sha256(payload).hexdigest()
