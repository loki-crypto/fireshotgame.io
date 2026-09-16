"""Esquema inicial (PLAN.md §3.3)

Revision ID: 0001_initial
Revises: 
Create Date: 2026-09-15 22:24:18.513583
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = '0001_initial'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('xp', sa.Integer(), nullable=False),
    sa.Column('level', sa.Integer(), nullable=False),
    sa.Column('bytes', sa.Integer(), nullable=False),
    sa.Column('accepted_terms_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('email')
    )
    op.create_table('active_time',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('phase_id', sa.Text(), nullable=False),
    sa.Column('seconds', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'phase_id')
    )
    op.create_table('badge_counters',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('key', sa.Text(), nullable=False),
    sa.Column('value', sa.Integer(), nullable=False),
    sa.Column('streak', sa.Integer(), nullable=False),
    sa.Column('best_streak', sa.Integer(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'key')
    )
    op.create_table('badges_earned',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('badge_id', sa.Text(), nullable=False),
    sa.Column('earned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'badge_id')
    )
    op.create_table('certificates',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('full_name', sa.Text(), nullable=True),
    sa.Column('name_salt', sa.Text(), nullable=True),
    sa.Column('active_hours', sa.Numeric(precision=6, scale=1), nullable=False),
    sa.Column('modules', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('payload_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('signature', sa.LargeBinary(), nullable=False),
    sa.Column('public_key', sa.Text(), nullable=False),
    sa.Column('revoked', sa.Boolean(), nullable=False),
    sa.Column('accepted_terms_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('active_hours >= 0', name='ck_cert_hours'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_table('heartbeats',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('phase_id', sa.Text(), nullable=True),
    sa.Column('client_ts', sa.DateTime(timezone=True), nullable=True),
    sa.Column('server_ts', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('credited_s', sa.SmallInteger(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_heartbeats_user_ts', 'heartbeats', ['user_id', 'server_ts'], unique=False)
    op.create_table('phase_progress',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('phase_id', sa.Text(), nullable=False),
    sa.Column('completed', sa.Boolean(), nullable=False),
    sa.Column('completions', sa.Integer(), nullable=False),
    sa.Column('best_time_s', sa.Integer(), nullable=True),
    sa.Column('best_score', sa.Integer(), nullable=False),
    sa.Column('first_completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'phase_id')
    )
    op.create_table('phase_sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('phase_id', sa.Text(), nullable=False),
    sa.Column('seed', sa.BigInteger(), nullable=False),
    sa.Column('equipped', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('accepted', sa.Boolean(), nullable=True),
    sa.Column('duration_s', sa.Integer(), nullable=True),
    sa.Column('xp_awarded', sa.Integer(), nullable=False),
    sa.Column('bytes_awarded', sa.Integer(), nullable=False),
    sa.Column('kills', sa.Integer(), nullable=False),
    sa.Column('bytes_collected', sa.Integer(), nullable=False),
    sa.Column('deaths', sa.Integer(), nullable=False),
    sa.Column('flags', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_phase_sessions_user_id'), 'phase_sessions', ['user_id'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('family', sa.UUID(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_refresh_tokens_family'), 'refresh_tokens', ['family'], unique=False)
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('upgrades_owned',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('upgrade_id', sa.Text(), nullable=False),
    sa.Column('equipped', sa.Boolean(), nullable=False),
    sa.Column('bought_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id', 'upgrade_id')
    )
    op.create_table('events',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.Text(), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('client_ts', sa.DateTime(timezone=True), nullable=True),
    sa.Column('server_ts', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('accepted', sa.Boolean(), nullable=False),
    sa.Column('reject_reason', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['session_id'], ['phase_sessions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_user_ts', 'events', ['user_id', 'server_ts'], unique=False)
    op.create_table('terminal_attempts',
    sa.Column('id', sa.BigInteger(), autoincrement=True, nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('phase_id', sa.Text(), nullable=False),
    sa.Column('terminal_id', sa.Text(), nullable=False),
    sa.Column('generator', sa.Text(), nullable=False),
    sa.Column('seed', sa.BigInteger(), nullable=False),
    sa.Column('challenge_index', sa.Integer(), nullable=False),
    sa.Column('attempt_no', sa.Integer(), nullable=False),
    sa.Column('answer', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('correct', sa.Boolean(), nullable=False),
    sa.Column('tampered', sa.Boolean(), nullable=False),
    sa.Column('tags', postgresql.ARRAY(sa.Text()), nullable=False),
    sa.Column('xp_awarded', sa.Integer(), nullable=False),
    sa.Column('bytes_awarded', sa.Integer(), nullable=False),
    sa.Column('result', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['phase_sessions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id', 'terminal_id', 'challenge_index', 'attempt_no', name='uq_attempt')
    )
    op.create_index('ix_attempts_user_generator', 'terminal_attempts', ['user_id', 'generator'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_attempts_user_generator', table_name='terminal_attempts')
    op.drop_table('terminal_attempts')
    op.drop_index('ix_events_user_ts', table_name='events')
    op.drop_table('events')
    op.drop_table('upgrades_owned')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_index(op.f('ix_refresh_tokens_family'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index(op.f('ix_phase_sessions_user_id'), table_name='phase_sessions')
    op.drop_table('phase_sessions')
    op.drop_table('phase_progress')
    op.drop_index('ix_heartbeats_user_ts', table_name='heartbeats')
    op.drop_table('heartbeats')
    op.drop_table('certificates')
    op.drop_table('badges_earned')
    op.drop_table('badge_counters')
    op.drop_table('active_time')
    op.drop_table('users')
