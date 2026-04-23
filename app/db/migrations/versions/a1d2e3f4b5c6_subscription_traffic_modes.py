"""subscription trial/paid traffic pools and live speeds

Revision ID: a1d2e3f4b5c6
Revises: 4b0aa8f0d8e1
Create Date: 2026-04-23 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "a1d2e3f4b5c6"
down_revision = "4b0aa8f0d8e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_trial", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("sub_live_uplink_bps", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "users",
        sa.Column("sub_live_downlink_bps", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "system",
        sa.Column(
            "trial_metered_node_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.add_column(
        "system",
        sa.Column(
            "paid_metered_node_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("system", "paid_metered_node_ids")
    op.drop_column("system", "trial_metered_node_ids")
    op.drop_column("users", "sub_live_downlink_bps")
    op.drop_column("users", "sub_live_uplink_bps")
    op.drop_column("users", "is_trial")
