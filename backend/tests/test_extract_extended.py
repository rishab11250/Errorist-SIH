from __future__ import annotations

import pytest

from app.domain import ImageMeta, OCRWord, ScanContext
from app.extractors.registry import EXTRACTORS, VIRTUAL_FIELDS, extract_all
from app.rules_loader import load_rules


@pytest.fixture
def image_meta() -> ImageMeta:
    return ImageMeta(width=1000, height=1000)


def words_from_line(text: str, *, y: float = 0.1) -> list[OCRWord]:
    tokens = text.split()
    width = 0.8 / max(len(tokens), 1)
    return [
        OCRWord(token, 0.95, (0.1 + index * width, y, width * 0.9, 0.04))
        for index, token in enumerate(tokens)
    ]


@pytest.mark.parametrize(
    ("text", "field", "expected"),
    [
        ("Common name: Roasted Peanuts", "common_name", "Roasted Peanuts"),
        ("Country of Origin: India", "country_origin", "India"),
        ("Best Before 9 Months from Packing", "best_before", "9 Months from Packing"),
        ("Dimensions 20 cm x 10 cm x 5 cm", "dimensions", "20 cm x 10 cm x 5 cm"),
        ("Unit Sale Price ₹ 0.50/g", "unit_price", "₹ 0.50/g"),
        (
            "Imported by Acme India Pvt Ltd Mumbai 400001",
            "importer_address",
            "Acme India Pvt Ltd Mumbai 400001",
        ),
    ],
)
def test_extended_extractors(text: str, field: str, expected: str, image_meta: ImageMeta) -> None:
    words = words_from_line(text)
    result = extract_all(
        words,
        image_meta,
        ScanContext(),
        load_rules("app/rules.yaml"),
    )[field]
    assert result is not None
    assert result.value == expected
    assert result.evidence_spans


@pytest.mark.parametrize(
    ("text", "field"),
    [
        ("Roasted Peanuts", "common_name"),
        ("Dimensions 20 inches x 10 inches", "dimensions"),
        ("Unit Sale Price ₹ per gram", "unit_price"),
        ("Packed by Acme India Mumbai 400001", "importer_address"),
    ],
)
def test_malformed_or_unlabelled_text_is_not_extracted(
    text: str, field: str, image_meta: ImageMeta
) -> None:
    result = extract_all(
        words_from_line(text),
        image_meta,
        ScanContext(imported=False),
        load_rules("app/rules.yaml"),
    )[field]
    assert result is None or result.value is None


def test_screenshot_text_outside_visible_box_is_ignored(image_meta: ImageMeta) -> None:
    words = [OCRWord("Country of Origin: India", 0.95, (0.95, 0.1, 0.10, 0.04))]
    result = extract_all(
        words,
        image_meta,
        ScanContext(mode="ecommerce_listing", imported=True),
        load_rules("app/rules.yaml"),
    )["country_origin"]
    assert result is None or result.value is None


def test_extractor_window_never_consumes_more_than_two_following_lines(
    image_meta: ImageMeta,
) -> None:
    words = [
        *words_from_line("Common name:", y=0.10),
        *words_from_line("Roasted", y=0.20),
        *words_from_line("Peanuts", y=0.30),
        *words_from_line("Unrelated manufacturer text", y=0.40),
    ]
    result = extract_all(
        words,
        image_meta,
        ScanContext(),
        load_rules("app/rules.yaml"),
    )["common_name"]
    assert result is not None
    assert result.value == "Roasted"
    assert all(box[1] <= 0.20 for box in result.evidence_spans)


def test_every_non_virtual_configured_field_has_a_registered_extractor() -> None:
    rules = load_rules("app/rules.yaml")
    configured = {check.field for check in rules.checks} - VIRTUAL_FIELDS
    assert configured <= EXTRACTORS.keys()
