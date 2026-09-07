"""Field extractors — one per mandatory declaration."""
from app.extractors.common_name import extract_common_name
from app.extractors.consumer_care import extract_consumer_care
from app.extractors.country_origin import extract_country_origin
from app.extractors.mfg_date import extract_mfg_date
from app.extractors.manufacturer import extract_manufacturer_address
from app.extractors.mrp import extract_mrp
from app.extractors.net_quantity import extract_net_quantity

__all__ = [
    "extract_manufacturer_address",
    "extract_net_quantity",
    "extract_mrp",
    "extract_consumer_care",
    "extract_mfg_date",
    "extract_common_name",
    "extract_country_origin",
]
