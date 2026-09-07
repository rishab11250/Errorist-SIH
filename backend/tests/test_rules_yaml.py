"""Schema and content validation for rules.yaml."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from app.rules_loader import RulesLoadError, load_rules

RULES_PATH = "backend/app/rules.yaml"


def test_load_real_file_succeeds() -> None:
    cfg = load_rules(RULES_PATH)
    assert cfg.schema_version == 1
    assert cfg.version == "2026-09"


def test_both_rule7_versions_loaded() -> None:
    cfg = load_rules(RULES_PATH)
    assert "original_2011" in cfg.font_size.versions
    assert "consolidated_post_2021" in cfg.font_size.versions
    assert cfg.font_size.default_version == "consolidated_post_2021"


def test_original_2011_has_two_tables() -> None:
    cfg = load_rules(RULES_PATH)
    original = cfg.font_size.versions["original_2011"]
    assert original.table_I is not None
    assert original.table_II is not None
    assert len(original.table_I.brackets) == 3
    assert len(original.table_II.brackets) == 4


def test_consolidated_has_one_table() -> None:
    cfg = load_rules(RULES_PATH)
    current = cfg.font_size.versions["consolidated_post_2021"]
    assert current.table_I is not None
    assert current.table_II is None
    assert len(current.table_I.brackets) == 5


def test_all_five_mvp_checks_present() -> None:
    cfg = load_rules(RULES_PATH)
    assert {c.rule_id for c in cfg.checks} == {
        "r6_1_e_mrp",
        "r6_1_c_net_quantity",
        "r6_1_a_address",
        "r6_2_consumer_care",
        "r6_1_d_mfg_date",
    }


def test_citations_use_verified_form() -> None:
    import re

    cfg = load_rules(RULES_PATH)
    pattern = re.compile(r"Rule\s+\d+\([a-z0-9]+\)")
    for c in cfg.checks:
        assert pattern.search(c.citation), f"{c.rule_id}: bad citation {c.citation!r}"


def test_confidence_thresholds_valid() -> None:
    cfg = load_rules(RULES_PATH)
    assert 0.0 <= cfg.confidence_thresholds.warn_min < cfg.confidence_thresholds.pass_min <= 1.0


def test_load_nonexistent_file_raises() -> None:
    with pytest.raises(RulesLoadError):
        load_rules("/tmp/does-not-exist.yaml")


def test_exemption_block_present() -> None:
    cfg = load_rules(RULES_PATH)
    assert cfg.font_size.exemption_applies_when_another_law_governs
    assert set(cfg.font_size.exempted_declarations) >= {
        "net_weight",
        "retail_sale_price",
        "expiry_date",
        "consumer_care",
    }
    assert set(cfg.font_size.exempted_categories) >= {"food", "cosmetics", "seeds"}


def test_font_size_enforcement_policy_is_loaded() -> None:
    policy = load_rules(RULES_PATH).font_size
    assert policy.enforcement_scale_confidence == 0.80
    assert policy.boundary_error_policy == "manual_review"


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("enforcement_scale_confidence", 1.1),
        ("boundary_error_policy", "automatic_fail"),
    ],
)
def test_invalid_font_size_enforcement_policy_is_rejected(
    tmp_path: Path, key: str, value: object
) -> None:
    source = Path(__file__).parents[1] / "app" / "rules.yaml"
    raw = yaml.safe_load(source.read_text(encoding="utf-8"))
    raw["font_size_rules"][key] = value
    invalid_rules = tmp_path / "rules.yaml"
    invalid_rules.write_text(yaml.safe_dump(raw), encoding="utf-8")
    with pytest.raises(RulesLoadError):
        load_rules(invalid_rules)
