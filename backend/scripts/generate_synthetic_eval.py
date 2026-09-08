"""Generate the deterministic, original 30-case LMPC evaluation baseline."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import random
import re
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Literal

import reportlab
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

from app.evaluation import KNOWN_RULE_IDS, MANIFEST_COLUMNS

SEED = 26034
CANVAS_SIZE = (1200, 900)
_REPORTLAB_FONTS = Path(reportlab.__file__).parent / "fonts"
FONT_CANDIDATES = (
    Path("/usr/share/fonts/TTF/DejaVuSans.ttf"),
    Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    _REPORTLAB_FONTS / "DejaVuSans.ttf",
    _REPORTLAB_FONTS / "Vera.ttf",
    Path("C:/Windows/Fonts/DejaVuSans.ttf"),
    Path("C:/Windows/Fonts/arial.ttf"),
    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
)
Mode = Literal["retail_image", "ecommerce_listing"]


@dataclass(frozen=True)
class CaseDefinition:
    example_id: str
    product_id: str
    mode: Mode
    split: Literal["development", "test"]
    condition: str
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"]
    imported: Literal["true", "false", "unknown"]
    expected: dict[str, str]


@dataclass(frozen=True)
class PositionedLine:
    key: str
    text: str
    bbox: tuple[int, int, int, int]
    word_indexes: tuple[int, ...]


@dataclass(frozen=True)
class RenderedCase:
    image: Image.Image
    words: tuple[dict[str, object], ...]
    lines: tuple[PositionedLine, ...]


def _base_expected(
    mode: Mode, category: str, imported: str
) -> dict[str, Literal["pass", "fail", "warn", "manual_review", "na"]]:
    expected = {rule_id: "pass" for rule_id in KNOWN_RULE_IDS}
    if category != "food":
        expected["r6_1_da_best_before"] = "na"
    if category in {"food", "cosmetics", "seeds"} or mode == "ecommerce_listing":
        expected["r6_1_d_mfg_date"] = "na"
    if category != "non_food" or mode == "ecommerce_listing":
        expected["r6_1_f_dimensions"] = "na"
    if imported == "false":
        expected["r6_1_aa_country_origin"] = "na"
        expected["r6_1_a_importer_address"] = "na"
    elif imported == "unknown":
        expected["r6_1_aa_country_origin"] = "manual_review"
        expected["r6_1_a_importer_address"] = "manual_review"
    if mode == "retail_image":
        expected["r6_10_ecommerce_declarations"] = "na"
    else:
        expected["r7_font_size"] = "na"
    return expected


def _case(
    example_id: str,
    product_id: str,
    mode: Mode,
    split: Literal["development", "test"],
    condition: str,
    *,
    category: Literal["food", "non_food", "cosmetics", "seeds", "unknown"] = "non_food",
    imported: Literal["true", "false", "unknown"] = "false",
    overrides: dict[str, str] | None = None,
) -> CaseDefinition:
    expected = _base_expected(mode, category, imported)
    expected.update(overrides or {})
    return CaseDefinition(
        example_id, product_id, mode, split, condition, category, imported, expected
    )


CASE_DEFINITIONS = (
    _case("RET-001", "RETAIL-A", "retail_image", "development", "clean-non-food"),
    _case(
        "RET-002",
        "RETAIL-B",
        "retail_image",
        "development",
        "clean-food-exemption",
        category="food",
    ),
    _case(
        "RET-003",
        "RETAIL-C",
        "retail_image",
        "development",
        "clean-imported",
        imported="true",
    ),
    _case(
        "RET-004",
        "RETAIL-A",
        "retail_image",
        "development",
        "mrp-missing",
        overrides={"r6_1_e_mrp": "fail"},
    ),
    _case(
        "RET-005",
        "RETAIL-D",
        "retail_image",
        "development",
        "tax-phrase-missing",
        overrides={"r6_1_e_mrp": "fail"},
    ),
    _case(
        "RET-006",
        "RETAIL-B",
        "retail_image",
        "development",
        "imperial-quantity",
        category="food",
        overrides={"r6_1_c_net_quantity": "fail"},
    ),
    _case(
        "RET-007",
        "RETAIL-E",
        "retail_image",
        "development",
        "pin-missing",
        overrides={"r6_1_a_address": "fail"},
    ),
    _case(
        "RET-008",
        "RETAIL-F",
        "retail_image",
        "development",
        "care-email-missing",
        overrides={"r6_2_consumer_care": "fail"},
    ),
    _case(
        "RET-009",
        "RETAIL-C",
        "retail_image",
        "development",
        "malformed-manufacture-date",
        imported="true",
        overrides={"r6_1_d_mfg_date": "fail"},
    ),
    _case(
        "RET-010",
        "RETAIL-G",
        "retail_image",
        "development",
        "common-name-missing",
        overrides={"r6_1_b_common_name": "fail"},
    ),
    _case(
        "RET-011",
        "RETAIL-H",
        "retail_image",
        "development",
        "imported-origin-missing",
        imported="true",
        overrides={"r6_1_aa_country_origin": "fail"},
    ),
    _case(
        "RET-012",
        "RETAIL-I",
        "retail_image",
        "development",
        "best-before-missing",
        category="food",
        overrides={"r6_1_da_best_before": "fail"},
    ),
    _case(
        "RET-013",
        "RETAIL-J",
        "retail_image",
        "test",
        "relevant-dimensions-present",
        overrides={"r7_font_size": "warn"},
    ),
    _case(
        "RET-014",
        "RETAIL-K",
        "retail_image",
        "test",
        "unit-price-missing",
        overrides={"r6_11_unit_sale_price": "fail"},
    ),
    _case(
        "RET-015",
        "RETAIL-J",
        "retail_image",
        "test",
        "blur-low-contrast-manual-review",
    ),
    _case(
        "RET-016",
        "RETAIL-K",
        "retail_image",
        "test",
        "glare-perspective-manual-review",
    ),
    _case(
        "RET-017",
        "RETAIL-J",
        "retail_image",
        "test",
        "undersized-characters",
        overrides={"r7_font_size": "fail"},
    ),
    _case(
        "RET-018",
        "RETAIL-K",
        "retail_image",
        "test",
        "clipped-declaration",
        overrides={"r6_1_f_dimensions": "fail"},
    ),
    _case("ECO-001", "ECOM-A", "ecommerce_listing", "development", "clean-domestic"),
    _case(
        "ECO-002",
        "ECOM-B",
        "ecommerce_listing",
        "development",
        "clean-imported",
        imported="true",
    ),
    _case(
        "ECO-003",
        "ECOM-C",
        "ecommerce_listing",
        "development",
        "clean-multi-card-listing",
    ),
    _case(
        "ECO-004",
        "ECOM-A",
        "ecommerce_listing",
        "development",
        "common-name-missing",
        overrides={"r6_1_b_common_name": "fail"},
    ),
    _case(
        "ECO-005",
        "ECOM-D",
        "ecommerce_listing",
        "development",
        "net-quantity-missing",
        overrides={"r6_1_c_net_quantity": "fail"},
    ),
    _case(
        "ECO-006",
        "ECOM-C",
        "ecommerce_listing",
        "development",
        "mrp-missing",
        overrides={"r6_1_e_mrp": "fail"},
    ),
    _case(
        "ECO-007",
        "ECOM-B",
        "ecommerce_listing",
        "development",
        "country-origin-missing",
        imported="true",
        overrides={"r6_1_aa_country_origin": "fail"},
    ),
    _case(
        "ECO-008",
        "ECOM-E",
        "ecommerce_listing",
        "test",
        "consumer-details-missing",
        overrides={"r6_2_consumer_care": "fail"},
    ),
    _case(
        "ECO-009",
        "ECOM-F",
        "ecommerce_listing",
        "test",
        "unit-price-missing",
        overrides={"r6_11_unit_sale_price": "fail"},
    ),
    _case(
        "ECO-010",
        "ECOM-E",
        "ecommerce_listing",
        "test",
        "declarations-clipped",
        overrides={"r6_10_ecommerce_declarations": "fail"},
    ),
    _case(
        "ECO-011",
        "ECOM-F",
        "ecommerce_listing",
        "test",
        "small-low-contrast-manual-review",
    ),
    _case(
        "ECO-012",
        "ECOM-G",
        "ecommerce_listing",
        "test",
        "unknown-imported-context-manual-review",
        imported="unknown",
    ),
)

_DEGRADED_CONDITIONS = {
    "blur-low-contrast-manual-review",
    "glare-perspective-manual-review",
    "small-low-contrast-manual-review",
}
_RULE_TO_LINE = {
    "r6_1_e_mrp": "mrp",
    "r6_1_c_net_quantity": "net_quantity",
    "r6_1_a_address": "manufacturer_address",
    "r6_2_consumer_care": "consumer_care",
    "r6_1_d_mfg_date": "mfg_date",
    "r6_1_b_common_name": "common_name",
    "r6_1_aa_country_origin": "country_origin",
    "r6_1_a_importer_address": "importer_address",
    "r6_1_da_best_before": "best_before",
    "r6_1_f_dimensions": "dimensions",
    "r6_11_unit_sale_price": "unit_price",
    "r6_10_ecommerce_declarations": "listing_declarations",
    "r7_font_size": "common_name",
}


def _with_quality_manual_review(case: CaseDefinition) -> CaseDefinition:
    if case.condition not in _DEGRADED_CONDITIONS:
        return case
    expected = {
        rule_id: "manual_review" if status != "na" else "na"
        for rule_id, status in case.expected.items()
    }
    return replace(case, expected=expected)


CASE_DEFINITIONS = tuple(_with_quality_manual_review(case) for case in CASE_DEFINITIONS)


def _font_path() -> Path:
    for candidate in FONT_CANDIDATES:
        if candidate.is_file():
            return candidate
    raise RuntimeError("DejaVu Sans is required to generate deterministic evaluation assets")


def _declarations(case: CaseDefinition) -> list[tuple[str, str]]:
    lines = [("listing_declarations", "MANDATORY PACKAGE DECLARATIONS")]
    if case.condition != "common-name-missing":
        lines.append(("common_name", "COMMON NAME: Multipurpose Sample Product"))
    if case.condition == "imperial-quantity":
        lines.append(("net_quantity", "NET QUANTITY: 16 oz"))
    elif case.condition != "net-quantity-missing":
        lines.append(("net_quantity", "NET QUANTITY: 500 ml"))
    if case.condition == "tax-phrase-missing":
        lines.append(("mrp", "MRP: Rs 99"))
    elif case.condition != "mrp-missing":
        lines.append(("mrp", "MRP: Rs 99 Inclusive of all taxes"))
    if case.condition == "pin-missing":
        lines.append(
            ("manufacturer_address", "MANUFACTURED BY: Demo Products, Industrial Road, Delhi")
        )
    else:
        lines.append(
            (
                "manufacturer_address",
                "MANUFACTURED BY: Demo Products, Industrial Road, Delhi 110001",
            )
        )
    if case.condition == "care-email-missing":
        lines.append(("consumer_care", "CONSUMER CARE: Demo Desk, Delhi 110001, 9876543210"))
    elif case.condition != "consumer-details-missing":
        lines.append(
            (
                "consumer_care",
                "CONSUMER CARE: Demo Desk, Delhi 110001, 9876543210, help@example.test",
            )
        )
    if case.mode == "retail_image" and case.category not in {"food", "cosmetics", "seeds"}:
        value = (
            "MFD: month 99" if case.condition == "malformed-manufacture-date" else "MFD: 08/2026"
        )
        lines.append(("mfg_date", value))
    if case.category == "food" and case.condition != "best-before-missing":
        lines.append(("best_before", "BEST BEFORE: 12 months from manufacture"))
    if case.category == "non_food" and case.mode == "retail_image":
        lines.append(("dimensions", "DIMENSIONS: 20 cm x 10 cm x 5 cm"))
    if case.condition != "unit-price-missing":
        lines.append(("unit_price", "UNIT SALE PRICE: Rs 0.20/ml"))
    if case.imported == "true":
        if case.condition not in {"imported-origin-missing", "country-origin-missing"}:
            lines.append(("country_origin", "COUNTRY OF ORIGIN: Exampleland"))
        lines.append(("importer_address", "IMPORTED BY: Demo Imports, Mumbai 400001"))
    return lines


def _render_lines(
    image: Image.Image,
    case: CaseDefinition,
    *,
    origin: tuple[int, int],
    max_width: int,
    rng: random.Random,
) -> tuple[tuple[dict[str, object], ...], tuple[PositionedLine, ...]]:
    draw = ImageDraw.Draw(image)
    font_size = (
        10
        if case.condition in {"undersized-characters", "small-low-contrast-manual-review"}
        else 24
    )
    font = ImageFont.truetype(str(_font_path()), font_size)
    heading_font = ImageFont.truetype(str(_font_path()), 26)
    x, y = origin
    words: list[dict[str, object]] = []
    positioned: list[PositionedLine] = []
    confidence = 0.98
    if case.condition in _DEGRADED_CONDITIONS:
        confidence = 0.68
    if "clipped" in case.condition:
        confidence = 0.40

    for index, (key, text) in enumerate(_declarations(case)):
        active_font = heading_font if index == 0 else font
        line_x = x
        if "clipped" in case.condition and key in {"dimensions", "listing_declarations"}:
            line_x = 790
        line_bbox = draw.textbbox((line_x, y), text, font=active_font)
        draw.text((line_x, y), text, font=active_font, fill=(24, 36, 52))
        indexes: list[int] = []
        for match in re.finditer(r"\S+", text):
            prefix = text[: match.start()]
            token = match.group()
            token_x = line_x + int(draw.textlength(prefix, font=active_font))
            token_bbox = draw.textbbox((token_x, y), token, font=active_font)
            indexes.append(len(words))
            words.append(
                {
                    "text": token,
                    "confidence": confidence,
                    "pixel_bbox": list(token_bbox),
                }
            )
        positioned.append(PositionedLine(key, text, line_bbox, tuple(indexes)))
        line_height = line_bbox[3] - line_bbox[1]
        y += max(line_height + (15 if font_size > 10 else 10), 24)
        if y > 800:
            x += max_width // 2 + rng.randint(5, 15)
            y = origin[1]
    return tuple(words), tuple(positioned)


def retail_label(case: CaseDefinition, rng: random.Random) -> RenderedCase:
    image = Image.new("RGB", CANVAS_SIZE, (232, 239, 232))
    draw = ImageDraw.Draw(image)
    accent = (25 + rng.randint(0, 20), 112 + rng.randint(0, 20), 90 + rng.randint(0, 15))
    draw.rounded_rectangle(
        (70, 45, 1130, 855), radius=36, fill=(255, 254, 247), outline=accent, width=8
    )
    draw.rectangle((70, 45, 1130, 135), fill=accent)
    title_font = ImageFont.truetype(str(_font_path()), 34)
    draw.text((105, 72), f"ORIGINAL TEST LABEL  {case.example_id}", font=title_font, fill="white")
    words, lines = _render_lines(image, case, origin=(115, 175), max_width=900, rng=rng)
    return RenderedCase(image, words, lines)


def listing_screenshot(case: CaseDefinition, rng: random.Random) -> RenderedCase:
    image = Image.new("RGB", CANVAS_SIZE, (244, 247, 251))
    draw = ImageDraw.Draw(image)
    draw.rectangle((0, 0, 1200, 72), fill=(31, 41, 55))
    draw.rounded_rectangle((45, 18, 500, 55), radius=16, fill=(255, 255, 255))
    draw.text(
        (65, 25),
        "local-evaluation.example/product",
        font=ImageFont.truetype(str(_font_path()), 18),
        fill=(65, 75, 90),
    )
    draw.rounded_rectangle(
        (55, 105, 1145, 850), radius=24, fill="white", outline=(204, 213, 224), width=3
    )
    draw.rounded_rectangle((90, 150, 390, 520), radius=18, fill=(222, 235, 231))
    if case.condition == "clean-multi-card-listing":
        draw.rounded_rectangle((430, 150, 660, 360), radius=18, fill=(234, 229, 244))
    words, lines = _render_lines(image, case, origin=(460, 390), max_width=610, rng=rng)
    return RenderedCase(image, words, lines)


def add_white_translucent_ellipse(image: Image.Image) -> Image.Image:
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(overlay).ellipse((360, 80, 1120, 710), fill=(255, 255, 255, 185))
    return Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")


def apply_fixed_perspective_quad(image: Image.Image) -> Image.Image:
    width, height = image.size
    quad = (35, 20, width - 55, 0, width - 10, height - 35, 65, height)
    return image.transform(image.size, Image.Transform.QUAD, quad, Image.Resampling.BICUBIC)


def _apply_condition(rendered: RenderedCase, case: CaseDefinition) -> RenderedCase:
    image = rendered.image
    if case.condition == "blur-low-contrast-manual-review":
        image = ImageEnhance.Contrast(image).enhance(0.25)
        image = image.filter(ImageFilter.GaussianBlur(radius=4))
    elif case.condition == "glare-perspective-manual-review":
        image = add_white_translucent_ellipse(apply_fixed_perspective_quad(image))
    elif case.condition == "small-low-contrast-manual-review":
        image = ImageEnhance.Contrast(image).enhance(0.25)
    elif "clipped" in case.condition:
        image = image.crop((0, 0, 900, image.height))
    return RenderedCase(image, rendered.words, rendered.lines)


def _normalized_pixel_bbox(
    box: tuple[int, int, int, int] | list[int], width: int, height: int
) -> list[float] | None:
    left = min(max(int(box[0]), 0), width)
    top = min(max(int(box[1]), 0), height)
    right = min(max(int(box[2]), 0), width)
    bottom = min(max(int(box[3]), 0), height)
    if right <= left or bottom <= top:
        return None
    x = round(left / width, 6)
    y = round(top / height, 6)
    box_width = round((right - left) / width, 6)
    box_height = round((bottom - top) / height, 6)
    box_width = min(box_width, round(1 - x, 6))
    box_height = min(box_height, round(1 - y, 6))
    return [x, y, box_width, box_height]


def _fixture(rendered: RenderedCase, case: CaseDefinition) -> dict[str, object]:
    width, height = rendered.image.size
    words: list[dict[str, object]] = []
    old_to_new: dict[int, int] = {}
    for old_index, word in enumerate(rendered.words):
        bbox = _normalized_pixel_bbox(word["pixel_bbox"], width, height)
        if bbox is None:
            continue
        old_to_new[old_index] = len(words)
        words.append({"text": word["text"], "confidence": word["confidence"], "bbox": bbox})
    lines = []
    for line in rendered.lines:
        bbox = _normalized_pixel_bbox(line.bbox, width, height)
        indexes = [old_to_new[index] for index in line.word_indexes if index in old_to_new]
        if bbox is None or not indexes:
            continue
        heights = [words[index]["bbox"][3] for index in indexes]
        lines.append(
            {
                "word_indexes": indexes,
                "bbox": bbox,
                "median_character_height": sorted(heights)[len(heights) // 2],
            }
        )
    return {
        "schema_version": 2,
        "image_meta": {
            "width": width,
            "height": height,
            "dpi": 150 if case.condition == "undersized-characters" else None,
            "orientation": 1,
        },
        "words": words,
        "lines": lines,
    }


def _quality_status(case: CaseDefinition) -> str:
    if case.condition in _DEGRADED_CONDITIONS:
        return "retake_recommended"
    if "clipped" in case.condition:
        return "usable_with_warnings"
    return "acceptable"


def _ground_truth(case: CaseDefinition, rendered: RenderedCase) -> dict[str, object]:
    width, height = rendered.image.size
    line_by_key = {line.key: line for line in rendered.lines}
    verdicts = {}
    for rule_id in sorted(KNOWN_RULE_IDS):
        status = case.expected[rule_id]
        line = line_by_key.get(_RULE_TO_LINE[rule_id])
        bbox = _normalized_pixel_bbox(line.bbox, width, height) if line else None
        verdicts[rule_id] = {
            "status": status,
            "evidence": line.text if line and status != "na" else "",
            "bboxes": [bbox] if bbox is not None and status != "na" else [],
        }
    return {
        "example_id": case.example_id,
        "quality_status": _quality_status(case),
        "verdicts": verdicts,
        "annotator": "synthetic-generator-26034",
        "reviewer": "synthetic-matrix-reviewer",
        "annotation_date": "2026-09-07",
        "notes": f"Original deterministic synthetic case: {case.condition}",
    }


def _read_existing(root: Path, replace_synthetic: bool) -> tuple[list[dict[str, str]], list[dict]]:
    manifest_path = root / "manifest.csv"
    truth_path = root / "ground_truth.jsonl"
    if not manifest_path.exists() and not truth_path.exists():
        return [], []
    if not replace_synthetic:
        raise FileExistsError("dataset already exists; pass --replace-synthetic to refresh it")
    if not manifest_path.is_file() or not truth_path.is_file():
        raise ValueError("existing dataset must contain both manifest.csv and ground_truth.jsonl")
    with manifest_path.open(newline="", encoding="utf-8") as stream:
        rows = list(csv.DictReader(stream))
    truths = [
        json.loads(line) for line in truth_path.read_text(encoding="utf-8").splitlines() if line
    ]
    synthetic_ids = {
        row["example_id"] for row in rows if row.get("source_classification") == "synthetic"
    }
    for row in rows:
        if row.get("example_id") not in synthetic_ids:
            continue
        for key in ("image_path", "ocr_path"):
            target = root / row[key]
            if target.is_file():
                target.unlink()
    return (
        [row for row in rows if row.get("example_id") not in synthetic_ids],
        [truth for truth in truths if truth.get("example_id") not in synthetic_ids],
    )


def generate_dataset(output: Path, *, replace_synthetic: bool = False) -> int:
    """Generate all synthetic cases, preserving any reviewed non-synthetic rows."""

    root = Path(output)
    root.mkdir(parents=True, exist_ok=True)
    manifest_rows, truths = _read_existing(root, replace_synthetic)
    (root / "images" / "retail").mkdir(parents=True, exist_ok=True)
    (root / "images" / "ecommerce").mkdir(parents=True, exist_ok=True)
    (root / "ocr").mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)

    for case in CASE_DEFINITIONS:
        rendered = (
            retail_label(case, rng)
            if case.mode == "retail_image"
            else listing_screenshot(case, rng)
        )
        rendered = _apply_condition(rendered, case)
        image_folder = "retail" if case.mode == "retail_image" else "ecommerce"
        image_relative = f"images/{image_folder}/{case.example_id}.png"
        ocr_relative = f"ocr/{case.example_id}.json"
        image_path = root / image_relative
        rendered.image.save(image_path, format="PNG", compress_level=9, optimize=False)
        fixture = _fixture(rendered, case)
        (root / ocr_relative).write_text(
            json.dumps(fixture, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n",
            encoding="utf-8",
        )
        manifest_rows.append(
            {
                "example_id": case.example_id,
                "product_id": case.product_id,
                "split": case.split,
                "mode": case.mode,
                "category": case.category,
                "imported": case.imported,
                "condition": case.condition,
                "image_path": image_relative,
                "sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
                "source_classification": "synthetic",
                "source_note": "Original deterministic asset generated with seed 26034",
                "ocr_path": ocr_relative,
            }
        )
        truths.append(_ground_truth(case, rendered))

    manifest_rows.sort(key=lambda row: row["example_id"])
    truths.sort(key=lambda record: record["example_id"])
    with (root / "manifest.csv").open("w", newline="", encoding="utf-8") as stream:
        writer = csv.DictWriter(stream, fieldnames=MANIFEST_COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(manifest_rows)
    (root / "ground_truth.jsonl").write_text(
        "".join(
            json.dumps(record, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n"
            for record in truths
        ),
        encoding="utf-8",
    )
    return len(CASE_DEFINITIONS)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--replace-synthetic", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    count = generate_dataset(args.output, replace_synthetic=args.replace_synthetic)
    print(f"generated {count} deterministic synthetic examples in {args.output.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
