"""add used_traffic_total (all nodes) and log column

Revision ID: c7b8a9d0e1f2
Revises: a1d2e3f4b5c6
Create Date: 2026-04-23

"""
from alembic import op
import sqlalchemy as sa


revision = "c7b8a9d0e1f2"
down_revision = "a1d2e3f4b5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "used_traffic_total",
            sa.BigInteger(),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "user_usage_logs",
        sa.Column("used_traffic_total_at_reset", sa.BigInteger(), nullable=True),
    )
    # Best-effort backfill: before this field existed, only metered totals were tracked.
    op.execute(sa.text("UPDATE users SET used_traffic_total = used_traffic"))


def downgrade() -> None:
    op.drop_column("user_usage_logs", "used_traffic_total_at_reset")
    op.drop_column("users", "used_traffic_total")
