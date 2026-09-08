from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

import pytest

from app.evaluation import DatasetError, dataset_digest, load_dataset

PNG_BYTES = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDAT\x08\xd7c\xf8\xcf"
    b"\xc0\xf0\x1f\x00\x05\x00\x01\xff\x89\x99=\x1d\x00\x00\x00\x00IEND\xaeB`\x82"
)
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


def _row(example_id: str, product_id: str, split: str, image_path: str, digest: str) -> dict:
    return {
        "example_id": example_id,
        "product_id": product_id,
        "split": split,
        "mode": "retail_image",
        "category": "non_food",
        "imported": "false",
        "condition": "clean-label",
        "image_path": image_path,
        "sha256": digest,
        "source_classification": "synthetic",
        "source_note": "Deterministic test fixture",
        "ocr_path": f"ocr/{example_id}.json",
    }


def _truth(example_id: str) -> dict:
    return {
        "example_id": example_id,
        "quality_status": "acceptable",
        "verdicts": {
            "r6_1_e_mrp": {
                "status": "pass",
                "evidence": "MRP Rs 99 inclusive of all taxes",
                "bboxes": [[0.1, 0.5, 0.5, 0.06]],
            }
        },
        "annotator": "annotator-one",
        "reviewer": "reviewer-two",
        "annotation_date": "2026-09-07",
        "notes": "Synthetic clean retail label",
    }


def _write_dataset(root: Path, rows: list[dict], truths: list[dict]) -> Path:
    (root / "images" / "retail").mkdir(parents=True)
    (root / "ocr").mkdir()
    for row in rows:
        image = root / row["image_path"]
        if not image.exists():
            image.write_bytes(PNG_BYTES)
        (root / row["ocr_path"]).write_text(
            json.dumps(
                {
                    "words": [
                        {
                            "text": "MRP",
                            "confidence": 0.98,
                            "bbox": [0.1, 0.5, 0.1, 0.06],
                        }
                    ],
                    "lines": [],
                }
            ),
            encoding="utf-8",
        )
    with (root / "manifest.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    (root / "ground_truth.jsonl").write_text(
        "".join(f"{json.dumps(record)}\n" for record in truths), encoding="utf-8"
    )
    return root


def write_minimal_dataset(root: Path, image_bytes: bytes = PNG_BYTES) -> Path:
    digest = hashlib.sha256(image_bytes).hexdigest()
    return _write_dataset(
        root,
        [_row("RET-001", "PRODUCT-A", "test", "images/retail/RET-001.png", digest)],
        [_truth("RET-001")],
    )


def write_invalid_dataset(root: Path, mutation: str) -> Path:
    digest = hashlib.sha256(PNG_BYTES).hexdigest()
    rows = [_row("RET-001", "PRODUCT-A", "test", "images/retail/RET-001.png", digest)]
    truths = [_truth("RET-001")]
    if mutation == "bad_hash":
        rows[0]["sha256"] = "0" * 64
    elif mutation == "escaping_path":
        rows[0]["image_path"] = "../outside.png"
    elif mutation == "unknown_status":
        truths[0]["verdicts"]["r6_1_e_mrp"]["status"] = "probably"
    elif mutation == "same_product_across_splits":
        rows.append(
            _row(
                "RET-002",
                "PRODUCT-A",
                "development",
                "images/retail/RET-002.png",
                digest,
            )
        )
        truths.append(_truth("RET-002"))
    elif mutation == "invalid_bbox":
        truths[0]["verdicts"]["r6_1_e_mrp"]["bboxes"] = [[0.8, 0.5, 0.5, 0.06]]
    else:  # pragma: no cover - test helper guard
        raise AssertionError(f"unknown mutation: {mutation}")
    return _write_dataset(root, rows, truths)


def test_valid_dataset_loads_and_has_stable_digest(tmp_path: Path):
    root = write_minimal_dataset(tmp_path)
    first = load_dataset(root, split="test")
    second = load_dataset(root, split="test")
    assert first.examples[0].example_id == "RET-001"
    assert dataset_digest(first) == dataset_digest(second)


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("bad_hash", "sha256 mismatch"),
        ("escaping_path", "path must stay inside dataset"),
        ("unknown_status", "invalid verdict status"),
        ("same_product_across_splits", "product_id crosses splits"),
        ("invalid_bbox", "bbox must be normalized"),
    ],
)
def test_invalid_dataset_is_rejected(tmp_path: Path, mutation: str, message: str):
    root = write_invalid_dataset(tmp_path, mutation)
    with pytest.raises(DatasetError, match=message):
        load_dataset(root, split="test")


def test_dataset_requires_exact_ground_truth_coverage(tmp_path: Path):
    root = write_minimal_dataset(tmp_path)
    (root / "ground_truth.jsonl").write_text("", encoding="utf-8")
    with pytest.raises(DatasetError, match="ground truth IDs must exactly match manifest IDs"):
        load_dataset(root, split="test")


def test_dataset_digest_changes_with_ocr_content(tmp_path: Path):
    root = write_minimal_dataset(tmp_path)
    first = dataset_digest(load_dataset(root, split="test"))
    fixture = root / "ocr" / "RET-001.json"
    payload = json.loads(fixture.read_text(encoding="utf-8"))
    payload["words"][0]["text"] = "Maximum retail price"
    fixture.write_text(json.dumps(payload), encoding="utf-8")
    second = dataset_digest(load_dataset(root, split="test"))
    assert first != second
