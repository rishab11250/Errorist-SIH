"""Add inspection-v2 persistence fields.

Revision ID: 0002_inspection_v2
Revises: 0001_legacy_schema
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0002_inspection_v2"
down_revision = "0001_legacy_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scans") as batch:
        batch.add_column(
            sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1")
        )
        batch.add_column(
            sa.Column("processing_status", sa.String(), nullable=False, server_default="complete")
        )
        batch.add_column(sa.Column("product_name", sa.String(), nullable=True))
        batch.add_column(
            sa.Column("quality_summary", sa.JSON(), nullable=False, server_default="{}")
        )
        batch.add_column(
            sa.Column("extracted_fields", sa.JSON(), nullable=False, server_default="{}")
        )
        batch.add_column(
            sa.Column("analysis_version", sa.String(), nullable=False, server_default="legacy")
        )
        batch.add_column(sa.Column("updated_at", sa.DateTime(), nullable=True))
        batch.add_column(sa.Column("failure_stage", sa.String(), nullable=True))
        batch.add_column(sa.Column("request_id", sa.String(), nullable=True))
        batch.add_column(sa.Column("processing_error_code", sa.String(), nullable=True))
    with op.batch_alter_table("verdicts") as batch:
        batch.add_column(sa.Column("confidence", sa.Float(), nullable=False, server_default="1"))
        batch.add_column(
            sa.Column("reasoning", sa.Text(), nullable=False, server_default="Legacy verdict")
        )
        batch.add_column(
            sa.Column(
                "measurement_method",
                sa.String(),
                nullable=False,
                server_default="not_measurable",
            )
        )
        batch.add_column(
            sa.Column("review_state", sa.String(), nullable=False, server_default="unreviewed")
        )


def downgrade() -> None:
    with op.batch_alter_table("verdicts") as batch:
        for name in ("review_state", "measurement_method", "reasoning", "confidence"):
            batch.drop_column(name)
    with op.batch_alter_table("scans") as batch:
        for name in (
            "processing_error_code",
            "request_id",
            "failure_stage",
            "updated_at",
            "analysis_version",
            "extracted_fields",
            "quality_summary",
            "product_name",
            "processing_status",
            "schema_version",
        ):
            batch.drop_column(name)
