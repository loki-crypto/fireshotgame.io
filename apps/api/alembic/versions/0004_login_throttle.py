"""login_throttle: falhas de login por e-mail (trava que vale entre instâncias)

Revision ID: 0004_login_throttle
Revises: 0003_username_avatar
Create Date: 2026-09-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import CITEXT

from alembic import op

revision: str = "0004_login_throttle"
down_revision: str | None = "0003_username_avatar"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "login_throttle",
        sa.Column("email", CITEXT(), primary_key=True),
        sa.Column("failures", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("window_started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("login_throttle")
