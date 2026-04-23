"""subscription trial/paid traffic pools and live speeds

Revision ID: a1d2e3f4b5c6
Revises: 4b0aa8f0d8e1
Create Date: 2026-04-23 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import cast, inspect, update
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.sql import quoted_name


revision = "a1d2e3f4b5c6"
down_revision = "4b0aa8f0d8e1"
branch_labels = None
depends_on = None


def _has_column(bind, table_name: str, column_name: str) -> bool:
    try:
        cols = inspect(bind).get_columns(table_name)
    except NoSuchTableError:
        return False
    return any(c["name"] == column_name for c in cols)


def _backfill_system_json_column(column_name: str) -> None:
    """Table name `system` is reserved in MySQL 8; use dialect-quoted identifiers."""
    tbl = sa.table(
        quoted_name("system", quote=True),
        sa.column(column_name, sa.JSON()),
    )
    op.execute(
        update(tbl)
        .where(tbl.c[column_name].is_(None))
        .values(**{column_name: cast(sa.literal("[]"), sa.JSON())})
    )


def upgrade() -> None:
    bind = op.get_bind()
    if not _has_column(bind, "users", "is_trial"):
        op.add_column(
            "users",
            sa.Column("is_trial", sa.Boolean(), nullable=False, server_default="0"),
        )
    if not _has_column(bind, "users", "sub_live_uplink_bps"):
        op.add_column(
            "users",
            sa.Column(
                "sub_live_uplink_bps",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    if not _has_column(bind, "users", "sub_live_downlink_bps"):
        op.add_column(
            "users",
            sa.Column(
                "sub_live_downlink_bps",
                sa.Integer(),
                nullable=False,
                server_default="0",
            ),
        )
    # MySQL rejects DEFAULT on JSON columns; add nullable, backfill, then NOT NULL.
    if not _has_column(bind, "system", "trial_metered_node_ids"):
        op.add_column(
            "system",
            sa.Column("trial_metered_node_ids", sa.JSON(), nullable=True),
        )
    if not _has_column(bind, "system", "paid_metered_node_ids"):
        op.add_column(
            "system",
            sa.Column("paid_metered_node_ids", sa.JSON(), nullable=True),
        )
    if _has_column(bind, "system", "trial_metered_node_ids"):
        _backfill_system_json_column("trial_metered_node_ids")
        op.alter_column(
            "system",
            "trial_metered_node_ids",
            existing_type=sa.JSON(),
            nullable=False,
        )
    if _has_column(bind, "system", "paid_metered_node_ids"):
        _backfill_system_json_column("paid_metered_node_ids")
        op.alter_column(
            "system",
            "paid_metered_node_ids",
            existing_type=sa.JSON(),
            nullable=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    if _has_column(bind, "system", "paid_metered_node_ids"):
        op.drop_column("system", "paid_metered_node_ids")
    if _has_column(bind, "system", "trial_metered_node_ids"):
        op.drop_column("system", "trial_metered_node_ids")
    if _has_column(bind, "users", "sub_live_downlink_bps"):
        op.drop_column("users", "sub_live_downlink_bps")
    if _has_column(bind, "users", "sub_live_uplink_bps"):
        op.drop_column("users", "sub_live_uplink_bps")
    if _has_column(bind, "users", "is_trial"):
        op.drop_column("users", "is_trial")
