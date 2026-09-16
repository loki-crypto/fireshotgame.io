"""users.username (rank público) e users.avatar (bonequinho escolhido no cadastro)

Revision ID: 0003_username_avatar
Revises: 0002_refresh_hard_revoked
Create Date: 2026-09-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import CITEXT

from alembic import op

revision: str = "0003_username_avatar"
down_revision: str | None = "0002_refresh_hard_revoked"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar", sa.String(24), nullable=False, server_default="agente"))
    op.alter_column("users", "avatar", server_default=None)

    # contas criadas antes do rank recebem um username derivado do id (único e válido)
    op.add_column("users", sa.Column("username", CITEXT(), nullable=True))
    op.execute("UPDATE users SET username = 'agente-' || substr(replace(id::text, '-', ''), 1, 8) WHERE username IS NULL")
    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("uq_users_username", "users", ["username"])


def downgrade() -> None:
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "username")
    op.drop_column("users", "avatar")
