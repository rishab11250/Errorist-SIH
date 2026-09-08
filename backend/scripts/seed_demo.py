"""Insert demo scans for a non-empty dashboard.

Usage: cd backend && .venv/bin/python -m scripts.seed_demo
"""

from __future__ import annotations

import base64
import io
from datetime import UTC, datetime, timedelta

from PIL import Image

from app import db

DEMO_SCANS = [
    {
        "mode": "retail_image",
        "category": "non_food",
        "overall_status": "pass",
        "verdicts": [
            ("r6_1_e_mrp", "pass"),
            ("r6_1_c_net_quantity", "pass"),
            ("r6_1_a_address", "pass"),
            ("r6_2_consumer_care", "pass"),
            ("r6_1_d_mfg_date", "pass"),
        ],
    },
    {
        "mode": "retail_image",
        "category": "food",
        "overall_status": "fail",
        "verdicts": [
            ("r6_1_e_mrp", "fail"),
            ("r6_1_c_net_quantity", "pass"),
            ("r6_1_a_address", "pass"),
            ("r6_2_consumer_care", "fail"),
            ("r6_1_d_mfg_date", "na"),
        ],
    },
    {
        "mode": "retail_image",
        "category": "non_food",
        "overall_status": "mixed",
        "verdicts": [
            ("r6_1_e_mrp", "pass"),
            ("r6_1_c_net_quantity", "warn"),
            ("r6_1_a_address", "pass"),
            ("r6_2_consumer_care", "pass"),
            ("r6_1_d_mfg_date", "pass"),
        ],
    },
]

CITATIONS = {
    "r6_1_e_mrp": "Rule 6(1)(e) of LMPC Rules 2011",
    "r6_1_c_net_quantity": "Rule 6(1)(c) read with Rule 13 of LMPC Rules 2011",
    "r6_1_a_address": "Rule 6(1)(a) read with Rule 10 of LMPC Rules 2011",
    "r6_2_consumer_care": "Rule 6(2) of LMPC Rules 2011",
    "r6_1_d_mfg_date": "Rule 6(1)(d) of LMPC Rules 2011",
}


def _demo_image_b64() -> str:
    img = Image.new("RGB", (400, 600), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def main(db_path: str = "lmpc.db") -> None:
    """Create the local database and insert three representative demo scans."""
    db.init_db(db_path)
    if db.SessionLocal is None:
        raise RuntimeError("DB not initialized")
    session = db.SessionLocal()
    try:
        demo_image = _demo_image_b64()
        first_user = session.query(db.User).first()
        owner_id = first_user.id if first_user else None
        now = datetime.now(UTC)
        for index, spec in enumerate(DEMO_SCANS):
            session.add(
                db.Scan(
                    created_at=now - timedelta(hours=index * 2),
                    mode=spec["mode"],
                    category=spec["category"],
                    image_b64=demo_image,
                    owner_user_id=owner_id,
                    image_meta={"width": 400, "height": 600, "dpi": 72, "orientation": 1},
                    ocr_payload=[],
                    overall_status=spec["overall_status"],
                    verdicts=[
                        db.VerdictRow(
                            rule_id=rule_id,
                            status=status,
                            severity="critical",
                            citation=CITATIONS[rule_id],
                            evidence="(demo)",
                            evidence_bboxes=[],
                            failure_message=None,
                            rule_version="2026-09",
                        )
                        for rule_id, status in spec["verdicts"]
                    ],
                )
            )
        session.commit()
        print(f"seeded {len(DEMO_SCANS)} demo scans")
    finally:
        session.close()


if __name__ == "__main__":
    main()
