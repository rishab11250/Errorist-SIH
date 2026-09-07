"""Field extractors — one per mandatory declaration."""

from app.extractors.best_before import extract_best_before
from app.extractors.common_name import extract_common_name
from app.extractors.consumer_care import extract_consumer_care
from app.extractors.country_origin import extract_country_origin, extract_importer_address
from app.extractors.dimensions import extract_dimensions
from app.extractors.manufacturer import extract_manufacturer_address
from app.extractors.mfg_date import extract_mfg_date
from app.extractors.mrp import extract_mrp
from app.extractors.net_quantity import extract_net_quantity
from app.extractors.registry import EXTRACTORS, VIRTUAL_FIELDS, extract_all
from app.extractors.unit_price import extract_unit_price

__all__ = [
    "extract_manufacturer_address",
    "extract_net_quantity",
    "extract_mrp",
    "extract_consumer_care",
    "extract_mfg_date",
    "extract_common_name",
    "extract_country_origin",
    "extract_importer_address",
    "extract_best_before",
    "extract_dimensions",
    "extract_unit_price",
    "extract_all",
    "EXTRACTORS",
    "VIRTUAL_FIELDS",
]
