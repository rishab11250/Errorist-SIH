"""Schema and content validation for rules.yaml."""
from __future__ import annotations
import pytest
from app.rules_loader import load_rules, RulesLoadError
RULES_PATH = "backend/app/rules.yaml"
def test_load_real_file_succeeds() -> None:
    cfg = load_rules(RULES_PATH); assert cfg.schema_version == 1; assert cfg.version == "2026-09"
def test_both_rule7_versions_loaded() -> None:
    cfg = load_rules(RULES_PATH); assert "original_2011" in cfg.font_size.versions; assert "consolidated_post_2021" in cfg.font_size.versions; assert cfg.font_size.default_version == "consolidated_post_2021"
def test_original_2011_has_two_tables() -> None:
    cfg = load_rules(RULES_PATH); original = cfg.font_size.versions["original_2011"]; assert original.table_I is not None; assert original.table_II is not None; assert len(original.table_I.brackets) == 3; assert len(original.table_II.brackets) == 4
def test_consolidated_has_one_table() -> None:
    cfg = load_rules(RULES_PATH); current = cfg.font_size.versions["consolidated_post_2021"]; assert current.table_I is not None; assert current.table_II is None; assert len(current.table_I.brackets) == 5
def test_all_five_mvp_checks_present() -> None:
    cfg = load_rules(RULES_PATH); assert {c.rule_id for c in cfg.checks} == {"r6_1_e_mrp", "r6_1_c_net_quantity", "r6_1_a_address", "r6_2_consumer_care", "r6_1_d_mfg_date"}
def test_citations_use_verified_form() -> None:
    import re
    cfg = load_rules(RULES_PATH); pattern = re.compile(r"Rule\s+\d+\([a-z0-9]+\)")
    for c in cfg.checks: assert pattern.search(c.citation), f"{c.rule_id}: bad citation {c.citation!r}"
def test_confidence_thresholds_valid() -> None:
    cfg = load_rules(RULES_PATH); assert 0.0 <= cfg.confidence_thresholds.warn_min < cfg.confidence_thresholds.pass_min <= 1.0
def test_load_nonexistent_file_raises() -> None:
    with pytest.raises(RulesLoadError): load_rules("/tmp/does-not-exist.yaml")
def test_exemption_block_present() -> None:
    cfg = load_rules(RULES_PATH); assert cfg.font_size.exemption_applies_when_another_law_governs; assert set(cfg.font_size.exempted_declarations) >= {"net_weight", "retail_sale_price", "expiry_date", "consumer_care"}; assert set(cfg.font_size.exempted_categories) >= {"food", "cosmetics", "seeds"}
