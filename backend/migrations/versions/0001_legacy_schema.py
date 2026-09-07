"""Create the legacy scan and verdict schema.

Revision ID: 0001_legacy_schema
Revises:
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001_legacy_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("image_b64", sa.Text(), nullable=False),
        sa.Column("image_meta", sa.JSON(), nullable=False),
        sa.Column("ocr_payload", sa.JSON(), nullable=False),
        sa.Column("overall_status", sa.String(), nullable=False),
    )
    op.create_table(
        "verdicts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scan_id", sa.Integer(), sa.ForeignKey("scans.id"), nullable=False),
        sa.Column("rule_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False),
        sa.Column("citation", sa.String(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("evidence_bboxes", sa.JSON(), nullable=False),
        sa.Column("failure_message", sa.Text(), nullable=True),
        sa.Column("rule_version", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("verdicts")
    op.drop_table("scans")
