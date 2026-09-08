from __future__ import annotations

import json
import shutil
from copy import deepcopy
from pathlib import Path

import pytest
from PIL import Image

from app.evaluation import KNOWN_RULE_IDS, DatasetError, load_dataset
from scripts.generate_synthetic_eval import generate_dataset
from scripts.import_team_captures import CAPTURE_MATRIX, import_team_captures


def _verdicts() -> dict:
    verdicts = {
        rule_id: {"status": "na", "evidence": "", "bboxes": []} for rule_id in KNOWN_RULE_IDS
    }
    verdicts["r6_1_e_mrp"] = {
        "status": "pass",
        "evidence": "MRP Rs 99 inclusive of all taxes",
        "bboxes": [[0.1, 0.1, 0.5, 0.1]],
    }
    return verdicts


def write_captures(root: Path) -> list[dict]:
    root.mkdir(parents=True)
    records = []
    for index, (example_id, requirement) in enumerate(CAPTURE_MATRIX.items(), start=1):
        source_file = f"capture-{index}.png"
        Image.new("RGB", (32, 24), (index * 20, index * 15, index * 10)).save(
            root / source_file, format="PNG"
        )
        records.append(
            {
                "example_id": example_id,
                "product_id": requirement.product_id,
                "source_file": source_file,
                "condition": requirement.condition,
                "category": "non_food",
                "imported": False,
                "source_note": "Team-owned package; redistribution approved after metadata review",
                "redistribution_approved": True,
                "personal_data_reviewed": True,
                "annotator": "capture-annotator",
                "reviewer": "capture-reviewer",
                "annotation_date": "2026-09-08",
                "notes": "Tiny contract-test capture",
                "quality_status": "acceptable",
                "words": [
                    {
                        "text": "MRP",
                        "confidence": 0.95,
                        "bbox": [0.1, 0.1, 0.2, 0.1],
                    }
                ],
                "lines": [
                    {
                        "word_indexes": [0],
                        "bbox": [0.1, 0.1, 0.2, 0.1],
                        "median_character_height": 0.1,
                    }
                ],
                "verdicts": _verdicts(),
            }
        )
    (root / "captures.json").write_text(json.dumps(records), encoding="utf-8")
    return records


def _rewrite(root: Path, records: list[dict]) -> None:
    (root / "captures.json").write_text(json.dumps(records), encoding="utf-8")


def test_import_is_idempotent_and_preserves_synthetic_rows(tmp_path: Path):
    dataset_root = tmp_path / "dataset"
    capture_root = tmp_path / "captures"
    generate_dataset(dataset_root)
    write_captures(capture_root)

    first_hashes = import_team_captures(capture_root, dataset_root)
    second_hashes = import_team_captures(capture_root, dataset_root)

    assert first_hashes == second_hashes
    dataset = load_dataset(dataset_root, split="all")
    assert len(dataset.examples) == 36
    assert len({example.example_id for example in dataset.examples}) == 36
    assert (
        sum(
            example.manifest.source_classification == "team_captured"
            for example in dataset.examples
        )
        == 6
    )


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        ("unknown_id", "capture IDs must exactly match"),
        ("product_mismatch", "product_id must be"),
        ("reused_source", "source_file must be unique"),
        ("missing_approval", "redistribution_approved"),
        ("same_reviewer", "annotator and reviewer must be distinct"),
        ("malformed_bbox", "bbox"),
    ],
)
def test_import_rejects_invalid_capture_metadata(tmp_path: Path, mutation: str, message: str):
    dataset_root = tmp_path / "dataset"
    capture_root = tmp_path / "captures"
    generate_dataset(dataset_root)
    records = deepcopy(write_captures(capture_root))
    if mutation == "unknown_id":
        records[0]["example_id"] = "PHO-999"
    elif mutation == "product_mismatch":
        records[0]["product_id"] = "PHOTO-Z"
    elif mutation == "reused_source":
        records[1]["source_file"] = records[0]["source_file"]
    elif mutation == "missing_approval":
        records[0]["redistribution_approved"] = False
    elif mutation == "same_reviewer":
        records[0]["reviewer"] = records[0]["annotator"]
    elif mutation == "malformed_bbox":
        records[0]["words"][0]["bbox"] = [0.9, 0.1, 0.2, 0.1]
    _rewrite(capture_root, records)

    with pytest.raises(DatasetError, match=message):
        import_team_captures(capture_root, dataset_root)


def test_import_rejects_hash_already_in_dataset(tmp_path: Path):
    dataset_root = tmp_path / "dataset"
    capture_root = tmp_path / "captures"
    generate_dataset(dataset_root)
    records = write_captures(capture_root)
    shutil.copyfile(
        dataset_root / "images" / "retail" / "RET-001.png",
        capture_root / records[0]["source_file"],
    )

    with pytest.raises(DatasetError, match="image hash already exists"):
        import_team_captures(capture_root, dataset_root)
