"""Registry for running all declaration extractors consistently."""

from __future__ import annotations

from collections.abc import Callable

from app.domain import ExtractedField, ImageMeta, OCRWord, RulesConfig, ScanContext
from app.extractors.best_before import extract_best_before
from app.extractors.common_name import extract_common_name
from app.extractors.consumer_care import extract_consumer_care
from app.extractors.country_origin import extract_country_origin, extract_importer_address
from app.extractors.dimensions import extract_dimensions
from app.extractors.manufacturer import extract_manufacturer_address
from app.extractors.mfg_date import extract_mfg_date
from app.extractors.mrp import extract_mrp
from app.extractors.net_quantity import extract_net_quantity
from app.extractors.unit_price import extract_unit_price

Extractor = Callable[[list[OCRWord], ImageMeta, RulesConfig], ExtractedField | None]
VIRTUAL_FIELDS = frozenset({"listing_declarations", "declaration_readability"})


def _check(rules: RulesConfig, field_name: str):
    return next((check for check in rules.checks if check.field == field_name), None)


def _manufacturer(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig):
    check = _check(rules, "manufacturer_address")
    pin_pattern = check.pin_code_regex if check and check.pin_code_regex else r"\b[1-9][0-9]{5}\b"
    return extract_manufacturer_address(words, meta, pin_pattern)


def _net_quantity(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig):
    check = _check(rules, "net_quantity")
    units = check.requires_unit_in if check and check.requires_unit_in else ["g", "kg", "ml", "l"]
    return extract_net_quantity(words, meta, units)


def _mrp(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig):
    check = _check(rules, "mrp")
    phrase = (
        check.tax_inclusive_phrase_regex
        if check and check.tax_inclusive_phrase_regex
        else r"(?i)\binclusive\s+of\s+all\s+taxes\b"
    )
    return extract_mrp(words, meta, phrase)


def _consumer_care(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig):
    check = _check(rules, "consumer_care")
    email = check.email_regex if check and check.email_regex else r"[^\s@]+@[^\s@]+\.[^\s@]+"
    phone = check.phone_regex if check and check.phone_regex else r"(?:\+91[\s-]?)?[6-9]\d{9}"
    return extract_consumer_care(words, meta, email, phone)


def _manufacture_date(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig):
    check = _check(rules, "mfg_date")
    pattern = check.date_format_regex if check and check.date_format_regex else r"(?i)\bmfg\b.*\d"
    return extract_mfg_date(words, meta, pattern)


def _simple(
    extractor: Callable[[list[OCRWord], ImageMeta], ExtractedField],
) -> Extractor:
    def run(words: list[OCRWord], meta: ImageMeta, rules: RulesConfig) -> ExtractedField:
        return extractor(words, meta)

    return run


EXTRACTORS: dict[str, Extractor] = {
    "manufacturer_address": _manufacturer,
    "net_quantity": _net_quantity,
    "mrp": _mrp,
    "consumer_care": _consumer_care,
    "mfg_date": _manufacture_date,
    "common_name": _simple(extract_common_name),
    "country_origin": _simple(extract_country_origin),
    "best_before": _simple(extract_best_before),
    "dimensions": _simple(extract_dimensions),
    "unit_price": _simple(extract_unit_price),
    "importer_address": _simple(extract_importer_address),
}


def _inside_viewport(word: OCRWord) -> bool:
    x, y, width, height = word.bbox
    return width > 0 and height > 0 and x >= 0 and y >= 0 and x + width <= 1 and y + height <= 1


def extract_all(
    words: list[OCRWord],
    image_meta: ImageMeta,
    context: ScanContext,
    rules: RulesConfig,
) -> dict[str, ExtractedField | None]:
    """Run registered extractors without applying legal applicability policy."""

    visible_words = (
        [word for word in words if _inside_viewport(word)]
        if context.mode == "ecommerce_listing"
        else words
    )
    return {
        field_name: extractor(visible_words, image_meta, rules)
        for field_name, extractor in EXTRACTORS.items()
    }
