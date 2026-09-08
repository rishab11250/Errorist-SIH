"""Orchestrate the bounded inspection-intelligence pipeline."""

from __future__ import annotations

from dataclasses import replace

from app.domain import (
    AnalysisInput,
    AnalysisResult,
    ImageMeta,
    OCRLine,
    OCRWord,
    RulesConfig,
    ScanContext,
)
from app.engine import overall_status, run_engine
from app.errors import AppError
from app.extractors.registry import extract_all
from app.models import ScanRequest
from app.placement import assess_placements
from app.visual_analysis import analyze_quality, assess_fields, decode_image, estimate_panel
from app.visual_analysis.image_io import ImageDecodeError

ANALYSIS_VERSION = "inspection-v2"
MAX_IMAGE_BYTES = 10_000_000
MAX_IMAGE_PIXELS = 24_000_000
_LEGACY_RULE_IDS = {
    "r6_1_e_mrp",
    "r6_1_c_net_quantity",
    "r6_1_a_address",
    "r6_2_consumer_care",
    "r6_1_d_mfg_date",
}


class PipelineError(AppError):
    """An expected pipeline error with a stable audit stage."""

    def __init__(self, status_code: int, error: str, detail: str, stage: str) -> None:
        super().__init__(status_code, error, detail)
        self.stage = stage


def _word_from_dto(word: object) -> OCRWord:
    return OCRWord(text=word.text, confidence=word.confidence, bbox=tuple(word.bbox))


def _line_from_dto(line: object) -> OCRLine:
    return OCRLine(
        word_indexes=tuple(line.word_indexes),
        bbox=tuple(line.bbox),
        median_character_height=line.median_character_height,
    )


def _upper_median(values: list[float]) -> float:
    ordered = sorted(values)
    return ordered[len(ordered) // 2]


def _reconstruct_lines(words: tuple[OCRWord, ...]) -> tuple[OCRLine, ...]:
    indexed = sorted(
        enumerate(words),
        key=lambda item: (
            item[1].bbox[1] + item[1].bbox[3] / 2,
            item[1].bbox[0],
            item[0],
        ),
    )
    groups: list[list[tuple[int, OCRWord]]] = []
    for index, word in indexed:
        center_y = word.bbox[1] + word.bbox[3] / 2
        match = next(
            (
                group
                for group in groups
                if abs(
                    center_y
                    - sum(item.bbox[1] + item.bbox[3] / 2 for _, item in group) / len(group)
                )
                <= max(word.bbox[3], _upper_median([item.bbox[3] for _, item in group])) * 0.6
            ),
            None,
        )
        if match is None:
            groups.append([(index, word)])
        else:
            match.append((index, word))

    lines: list[OCRLine] = []
    for group in groups:
        group.sort(key=lambda item: (item[1].bbox[0], item[0]))
        left = min(word.bbox[0] for _, word in group)
        top = min(word.bbox[1] for _, word in group)
        right = max(word.bbox[0] + word.bbox[2] for _, word in group)
        bottom = max(word.bbox[1] + word.bbox[3] for _, word in group)
        lines.append(
            OCRLine(
                word_indexes=tuple(index for index, _ in group),
                bbox=(left, top, right - left, bottom - top),
                median_character_height=_upper_median([word.bbox[3] for _, word in group]),
            )
        )
    return tuple(lines)


def normalize_ocr(request: ScanRequest) -> tuple[tuple[OCRWord, ...], tuple[OCRLine, ...]]:
    """Convert DTOs and validate or reconstruct deterministic line groups."""

    submitted_words = tuple(_word_from_dto(word) for word in request.ocr_payload)
    usable_indexes = {
        old_index: new_index
        for new_index, (old_index, word) in enumerate(
            item for item in enumerate(submitted_words) if item[1].text.strip()
        )
    }
    words = tuple(submitted_words[index] for index in usable_indexes)
    if not words:
        return (), ()
    if request.schema_version == 1 or not request.ocr_lines:
        return words, _reconstruct_lines(words)

    seen_indexes: set[int] = set()
    lines: list[OCRLine] = []
    for line in request.ocr_lines:
        if any(index >= len(submitted_words) for index in line.word_indexes):
            raise PipelineError(
                422,
                "invalid_ocr_lines",
                "An OCR line references a word index outside the submitted OCR payload.",
                "normalize_ocr",
            )
        remapped_indexes = tuple(
            usable_indexes[index] for index in line.word_indexes if index in usable_indexes
        )
        if not remapped_indexes:
            continue
        repeated = seen_indexes.intersection(remapped_indexes)
        if repeated:
            raise PipelineError(
                422,
                "invalid_ocr_lines",
                "An OCR word index appears in more than one submitted line.",
                "normalize_ocr",
            )
        seen_indexes.update(remapped_indexes)
        lines.append(
            OCRLine(
                word_indexes=remapped_indexes,
                bbox=tuple(line.bbox),
                median_character_height=line.median_character_height,
            )
        )
    return words, tuple(lines)


def _decode(request: ScanRequest, *, max_image_bytes: int, max_image_pixels: int):
    try:
        return decode_image(
            request.image_b64,
            max_bytes=max_image_bytes,
            max_pixels=max_image_pixels,
        )
    except ImageDecodeError as exc:
        mapping = {
            "invalid_image": (400, "invalid_image", "The supplied file is not a supported image."),
            "image_too_large": (
                413,
                "image_too_large",
                "The image exceeds the allowed byte or pixel limit.",
            ),
            "image_decode_failed": (
                422,
                "image_decode_failed",
                "The image payload could not be decoded.",
            ),
        }
        status, error, detail = mapping.get(exc.code, mapping["image_decode_failed"])
        raise PipelineError(status, error, detail, "decode_image") from exc


def analyze_scan(
    request: ScanRequest,
    rules: RulesConfig,
    *,
    max_image_bytes: int | None = None,
    max_image_pixels: int | None = None,
) -> AnalysisResult:
    """Run the complete analysis sequence once for a validated scan request."""

    decoded = _decode(
        request,
        max_image_bytes=MAX_IMAGE_BYTES if max_image_bytes is None else max_image_bytes,
        max_image_pixels=MAX_IMAGE_PIXELS if max_image_pixels is None else max_image_pixels,
    )
    words, lines = normalize_ocr(request)
    if not words:
        raise PipelineError(
            422,
            "no_text_extracted",
            "No usable text was found; retake or replace the evidence image.",
            "normalize_ocr",
        )
    quality = analyze_quality(decoded, words)
    if quality.status == "unreadable":
        guidance = "; ".join(quality.guidance) or "The evidence image is unreadable."
        raise PipelineError(422, "image_unreadable", guidance, "analyze_quality")

    panel = estimate_panel(decoded, words)
    context = ScanContext(
        mode=request.scan_context.mode,
        category=request.scan_context.category,
        imported=request.scan_context.imported,
        inspection_date=request.scan_context.inspection_date,
    )
    image_meta = ImageMeta(**request.image_meta.model_dump())
    extracted = extract_all(list(words), image_meta, context, rules)
    readability = assess_fields(
        extracted,
        words,
        lines,
        quality,
        panel,
        rules,
        decoded=decoded,
    )
    placement = assess_placements(extracted, panel, context, rules)
    engine_rules = (
        replace(
            rules,
            checks=[check for check in rules.checks if check.rule_id in _LEGACY_RULE_IDS],
        )
        if request.schema_version == 1
        else rules
    )
    engine_input = AnalysisInput(
        extracted=extracted,
        quality=quality,
        readability={} if request.schema_version == 1 else readability,
        placement={} if request.schema_version == 1 else placement,
    )
    verdicts = run_engine(engine_input, engine_rules, context)
    return AnalysisResult(
        quality=quality,
        extracted=extracted,
        verdicts=tuple(verdicts),
        overall_status=overall_status(verdicts),
        analysis_version=ANALYSIS_VERSION,
    )
