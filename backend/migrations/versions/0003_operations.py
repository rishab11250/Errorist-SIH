"""Add users, sessions, ownership, and review actions.

Revision ID: 0003_operations
Revises: 0002_inspection_v2
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_operations"
down_revision = "0002_inspection_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username_normalized", sa.String(80), nullable=False),
        sa.Column("display_name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.Text(), nullable=False),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("role IN ('inspector', 'admin')", name="ck_users_role"),
    )
    op.create_index(
        "ix_users_username_normalized",
        "users",
        ["username_normalized"],
        unique=True,
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_sessions_token_hash", "sessions", ["token_hash"], unique=True)
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"], unique=False)

    with op.batch_alter_table("scans") as batch:
        batch.add_column(sa.Column("owner_user_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_scans_owner_user_id",
            "users",
            ["owner_user_id"],
            ["id"],
        )

    op.create_table(
        "review_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("scan_id", sa.Integer(), sa.ForeignKey("scans.id"), nullable=False),
        sa.Column("verdict_id", sa.Integer(), sa.ForeignKey("verdicts.id"), nullable=True),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("action", sa.String(30), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "action IN ('confirmed', 'false_positive', 'resolved', 'needs_follow_up')",
            name="ck_review_actions_action",
        ),
    )

    op.create_index(
        "ix_scans_owner_created_at",
        "scans",
        ["owner_user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_verdicts_rule_status",
        "verdicts",
        ["rule_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_review_actions_scan_created_at",
        "review_actions",
        ["scan_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_review_actions_scan_created_at", table_name="review_actions")
    op.drop_table("review_actions")

    op.drop_index("ix_scans_owner_created_at", table_name="scans")
    with op.batch_alter_table("scans") as batch:
        batch.drop_constraint("fk_scans_owner_user_id", type_="foreignkey")
        batch.drop_column("owner_user_id")

    op.drop_index("ix_verdicts_rule_status", table_name="verdicts")
    op.drop_index("ix_sessions_expires_at", table_name="sessions")
    op.drop_index("ix_sessions_token_hash", table_name="sessions")
    op.drop_table("sessions")
    op.drop_index("ix_users_username_normalized", table_name="users")
    op.drop_table("users")
