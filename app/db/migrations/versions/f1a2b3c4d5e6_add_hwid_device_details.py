"""add platform/os/model fields for hwid devices

Revision ID: f1a2b3c4d5e6
Revises: c7b8a9d0e1f2
Create Date: 2026-04-25

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "f1a2b3c4d5e6"
down_revision = "c7b8a9d0e1f2"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    cols = inspect(bind).get_columns(table_name)
    return any(c["name"] == column_name for c in cols)


def upgrade() -> None:
    if not _has_column("user_hwid_devices", "platform"):
        op.add_column("user_hwid_devices", sa.Column("platform", sa.String(length=32), nullable=True))
    if not _has_column("user_hwid_devices", "os_version"):
        op.add_column("user_hwid_devices", sa.Column("os_version", sa.String(length=64), nullable=True))
    if not _has_column("user_hwid_devices", "device_model"):
        op.add_column("user_hwid_devices", sa.Column("device_model", sa.String(length=128), nullable=True))


def downgrade() -> None:
    if _has_column("user_hwid_devices", "device_model"):
        op.drop_column("user_hwid_devices", "device_model")
    if _has_column("user_hwid_devices", "os_version"):
        op.drop_column("user_hwid_devices", "os_version")
    if _has_column("user_hwid_devices", "platform"):
        op.drop_column("user_hwid_devices", "platform")
