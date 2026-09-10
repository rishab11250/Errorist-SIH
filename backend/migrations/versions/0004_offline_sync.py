"""Add idempotency keys for offline scan synchronization.

Revision ID: 0004_offline_sync
Revises: 0003_operations
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_offline_sync"
down_revision = "0003_operations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("scans") as batch:
        batch.add_column(sa.Column("client_local_id", sa.String(36), nullable=True))
    op.create_index(
        "ix_scans_owner_client_local_id",
        "scans",
        ["owner_user_id", "client_local_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_scans_owner_client_local_id", table_name="scans")
    with op.batch_alter_table("scans") as batch:
        batch.drop_column("client_local_id")
