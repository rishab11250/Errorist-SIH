"""Evaluate engine predictions against the hand-labeled eval CSV."""
from __future__ import annotations
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from app.domain import ExtractedField, ScanContext
from app.engine import run_engine
from app.rules_loader import load_rules

EVAL_PATH = Path(__file__).resolve().parent.parent / "tests" / "eval" / "eval_set.csv"
RESULTS_PATH = EVAL_PATH.with_name("results.json")
RULES_PATH = Path(__file__).resolve().parent.parent / "app" / "rules.yaml"
RULE_IDS = ["r6_1_a_address", "r6_1_e_mrp", "r6_1_c_net_quantity", "r6_2_consumer_care", "r6_1_d_mfg_date"]
FIELDS = dict(zip(RULE_IDS, ["manufacturer_address", "mrp", "net_quantity", "consumer_care", "mfg_date"], strict=True))
def main() -> int:
    if not EVAL_PATH.exists(): print(f"eval_set.csv not found at {EVAL_PATH}", file=sys.stderr); return 1
    rows = list(csv.DictReader(EVAL_PATH.open(encoding="utf-8")))
    if not [row for row in rows if row.get("image_id")]:
        RESULTS_PATH.write_text(json.dumps({"summary": {}, "per_image": []}, indent=2))
        print("eval_set.csv has no data rows; results written to", RESULTS_PATH)
        return 0
    rules = load_rules(RULES_PATH); counts = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0, "tn": 0, "skip": 0}); per_image = []
    for row in rows:
        if not row.get("image_id"): continue
        extracted = {field: ExtractedField(field, row.get(f"{rule}_evidence") or None, None, 0.9, []) for rule, field in FIELDS.items()}
        verdicts = {v.rule_id: v for v in run_engine(extracted, rules, ScanContext())}; image = {"image_id": row["image_id"], "rules": {}}
        for rule in RULE_IDS:
            gt = row.get(f"{rule}_pass", ""); predicted = verdicts[rule].status
            if gt == "-1" or predicted == "na": counts[rule]["skip"] += 1; continue
            passed = predicted in {"pass", "warn"}; outcome = "tp" if gt == "1" and passed else "fn" if gt == "1" else "fp" if passed else "tn"; counts[rule][outcome] += 1; image["rules"][rule] = {"gt": int(gt), "pred": predicted, "outcome": outcome}
        per_image.append(image)
    summary = {}; print(f"{'Rule':<25} {'TP':>4} {'FP':>4} {'FN':>4} {'TN':>4} {'Skip':>4} {'Prec':>7} {'Rec':>7}")
    for rule in RULE_IDS:
        c = counts[rule]; precision = c["tp"] / (c["tp"] + c["fp"]) if c["tp"] + c["fp"] else 0.0; recall = c["tp"] / (c["tp"] + c["fn"]) if c["tp"] + c["fn"] else 0.0; summary[rule] = {**c, "precision": round(precision, 3), "recall": round(recall, 3)}; print(f"{rule:<25} {c['tp']:>4} {c['fp']:>4} {c['fn']:>4} {c['tn']:>4} {c['skip']:>4} {precision:>7.3f} {recall:>7.3f}")
    RESULTS_PATH.write_text(json.dumps({"summary": summary, "per_image": per_image}, indent=2)); print("results written to", RESULTS_PATH); return 0 if min(value["recall"] for value in summary.values()) >= .8 else 2
if __name__ == "__main__": raise SystemExit(main())
