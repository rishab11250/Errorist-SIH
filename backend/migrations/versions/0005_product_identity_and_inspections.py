"""Add products, inspections, product audit logs, and scan linkages.

Revision ID: 0005_product_identity_and_inspections
Revises: 0004_offline_sync
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_product_identity_and_inspections"
down_revision = "0004_offline_sync"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("fingerprint_exact", sa.String(64), nullable=False),
        sa.Column("search_key", sa.Text(), nullable=False),
        sa.Column("manufacturer_name", sa.Text(), nullable=True),
        sa.Column("common_name", sa.Text(), nullable=True),
        sa.Column("net_quantity_value", sa.Float(), nullable=True),
        sa.Column("net_quantity_unit", sa.String(20), nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("first_scan_id", sa.Integer(), nullable=True),
        sa.Column("latest_scan_id", sa.Integer(), nullable=True),
        sa.Column("scan_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_products_fingerprint_exact",
        "products",
        ["fingerprint_exact"],
        unique=True,
    )
    op.create_index(
        "ix_products_search_key",
        "products",
        ["search_key"],
        unique=False,
    )

    op.create_table(
        "inspections",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("owner_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("company_name", sa.Text(), nullable=True),
        sa.Column("location", sa.Text(), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('open', 'completed', 'cancelled')",
            name="ck_inspections_status",
        ),
    )
    op.create_index(
        "ix_inspections_owner_created_at",
        "inspections",
        ["owner_id", "created_at"],
        unique=False,
    )

    with op.batch_alter_table("scans") as batch:
        batch.add_column(sa.Column("product_id", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("inspection_id", sa.Integer(), nullable=True))
        batch.add_column(
            sa.Column(
                "product_match_status",
                sa.String(20),
                nullable=False,
                server_default="unmatched",
            )
        )
        batch.create_foreign_key(
            "fk_scans_product_id",
            "products",
            ["product_id"],
            ["id"],
        )
        batch.create_foreign_key(
            "fk_scans_inspection_id",
            "inspections",
            ["inspection_id"],
            ["id"],
        )

    op.create_index("ix_scans_product_id", "scans", ["product_id"], unique=False)
    op.create_index("ix_scans_inspection_id", "scans", ["inspection_id"], unique=False)
    op.create_index(
        "ix_scans_product_inspection_created",
        "scans",
        ["product_id", "inspection_id", "created_at"],
        unique=False,
    )

    op.create_table(
        "product_audit_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("scan_id", sa.Integer(), sa.ForeignKey("scans.id"), nullable=False),
        sa.Column("old_product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("new_product_id", sa.Integer(), sa.ForeignKey("products.id"), nullable=True),
        sa.Column("action", sa.String(50), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_product_audit_logs_scan_created",
        "product_audit_logs",
        ["scan_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_product_audit_logs_scan_created", table_name="product_audit_logs")
    op.drop_table("product_audit_logs")

    op.drop_index("ix_scans_product_inspection_created", table_name="scans")
    op.drop_index("ix_scans_inspection_id", table_name="scans")
    op.drop_index("ix_scans_product_id", table_name="scans")

    with op.batch_alter_table("scans") as batch:
        batch.drop_constraint("fk_scans_inspection_id", type_="foreignkey")
        batch.drop_constraint("fk_scans_product_id", type_="foreignkey")
        batch.drop_column("product_match_status")
        batch.drop_column("inspection_id")
        batch.drop_column("product_id")

    op.drop_index("ix_inspections_owner_created_at", table_name="inspections")
    op.drop_table("inspections")

    op.drop_index("ix_products_search_key", table_name="products")
    op.drop_index("ix_products_fingerprint_exact", table_name="products")
    op.drop_table("products")
