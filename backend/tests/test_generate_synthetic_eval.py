from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path

from app.evaluation import dataset_digest, load_dataset
from scripts.generate_synthetic_eval import CASE_DEFINITIONS, generate_dataset


def test_case_matrix_has_required_coverage():
    assert len(CASE_DEFINITIONS) == 30
    assert Counter(case.mode for case in CASE_DEFINITIONS) == {
        "retail_image": 18,
        "ecommerce_listing": 12,
    }
    statuses = {status for case in CASE_DEFINITIONS for status in case.expected.values()}
    assert {"pass", "fail", "warn", "manual_review", "na"} <= statuses
    assert len({case.product_id for case in CASE_DEFINITIONS}) >= 15
    by_product = defaultdict(list)
    for case in CASE_DEFINITIONS:
        by_product[case.product_id].append(case)
    for product_id, cases in by_product.items():
        assert len({case.split for case in cases}) == 1, product_id


def test_generator_is_deterministic_and_schema_valid(tmp_path: Path):
    first_root = tmp_path / "first"
    second_root = tmp_path / "second"
    assert generate_dataset(first_root) == 30
    assert generate_dataset(second_root) == 30

    first = load_dataset(first_root, split="all")
    second = load_dataset(second_root, split="all")
    assert dataset_digest(first) == dataset_digest(second)
    assert [path.relative_to(first_root) for path in sorted(first_root.rglob("*"))] == [
        path.relative_to(second_root) for path in sorted(second_root.rglob("*"))
    ]
    for first_path in sorted(path for path in first_root.rglob("*") if path.is_file()):
        relative = first_path.relative_to(first_root)
        assert first_path.read_bytes() == (second_root / relative).read_bytes()


def test_replace_synthetic_keeps_non_synthetic_rows(tmp_path: Path):
    root = tmp_path / "dataset"
    generate_dataset(root)
    first = dataset_digest(load_dataset(root, split="all"))
    assert generate_dataset(root, replace_synthetic=True) == 30
    assert dataset_digest(load_dataset(root, split="all")) == first
