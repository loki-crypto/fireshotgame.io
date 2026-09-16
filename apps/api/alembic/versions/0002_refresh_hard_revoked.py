"""refresh_tokens.hard_revoked (janela de graça para refresh paralelos)

Revision ID: 0002_refresh_hard_revoked
Revises: 0001_initial
Create Date: 2026-09-16
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0002_refresh_hard_revoked"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("hard_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # tokens já revogados antes desta migração não ganham janela de graça
    op.execute("UPDATE refresh_tokens SET hard_revoked = true WHERE revoked_at IS NOT NULL")
    op.alter_column("refresh_tokens", "hard_revoked", server_default=None)


def downgrade() -> None:
    op.drop_column("refresh_tokens", "hard_revoked")
