"""Modelo de dados (PostgreSQL). Ver PLAN.md §3.3."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, CITEXT, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

TS = DateTime(timezone=True)


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    username: Mapped[str] = mapped_column(CITEXT, unique=True, nullable=False)
    """Identificador público, usado no rank. Único sem diferenciar maiúsculas (citext)."""
    name: Mapped[str] = mapped_column(Text, nullable=False)
    avatar: Mapped[str] = mapped_column(String(24), default="agente", nullable=False)
    """Id do avatar escolhido no cadastro (packages/content/avatars.json)."""
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accepted_terms_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)

    upgrades: Mapped[list[UpgradeOwned]] = relationship(back_populates="user", cascade="all, delete-orphan", lazy="selectin")
    badges: Mapped[list[BadgeEarned]] = relationship(back_populates="user", cascade="all, delete-orphan", lazy="selectin")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(Text, unique=True, nullable=False)
    family: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(TS, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    hard_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    """Invalidado sem janela de graça: logout, exclusão de conta ou reuso de token vazado.
    A rotação normal deixa este campo em falso, para tolerar refresh paralelos (ver services/auth.py)."""
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)


class PhaseSession(Base):
    __tablename__ = "phase_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    phase_id: Mapped[str] = mapped_column(Text, nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    equipped: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    started_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    accepted: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    duration_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    kills: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_collected: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    deaths: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    flags: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    """Resumo da sessão: contadores por tipo, armas usadas, resultado da conclusão."""
    result: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    """Resposta devolvida em /complete (idempotência em reenvios)."""


class PhaseProgress(Base):
    __tablename__ = "phase_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    phase_id: Mapped[str] = mapped_column(Text, primary_key=True)
    completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    completions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_time_s: Mapped[int | None] = mapped_column(Integer, nullable=True)
    best_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    first_completed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), onupdate=func.now(), nullable=False)


class TerminalAttempt(Base):
    __tablename__ = "terminal_attempts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("phase_sessions.id", ondelete="CASCADE"), nullable=False)
    phase_id: Mapped[str] = mapped_column(Text, nullable=False)
    terminal_id: Mapped[str] = mapped_column(Text, nullable=False)
    generator: Mapped[str] = mapped_column(Text, nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    challenge_index: Mapped[int] = mapped_column(Integer, nullable=False)
    attempt_no: Mapped[int] = mapped_column(Integer, nullable=False)
    answer: Mapped[dict | list | int | str | None] = mapped_column(JSONB, nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    tampered: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tags: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bytes_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    result: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("session_id", "terminal_id", "challenge_index", "attempt_no", name="uq_attempt"),
        Index("ix_attempts_user_generator", "user_id", "generator"),
    )


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("phase_sessions.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)
    client_ts: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    server_ts: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    accepted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (Index("ix_events_user_ts", "user_id", "server_ts"),)


class Heartbeat(Base):
    __tablename__ = "heartbeats"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    phase_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    client_ts: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    server_ts: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    credited_s: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    __table_args__ = (Index("ix_heartbeats_user_ts", "user_id", "server_ts"),)


class ActiveTime(Base):
    __tablename__ = "active_time"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    phase_id: Mapped[str] = mapped_column(Text, primary_key=True)
    """'' = tempo ativo total do usuário."""
    seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class BadgeEarned(Base):
    __tablename__ = "badges_earned"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    badge_id: Mapped[str] = mapped_column(Text, primary_key=True)
    earned_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="badges")


class BadgeCounter(Base):
    __tablename__ = "badge_counters"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    best_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class UpgradeOwned(Base):
    __tablename__ = "upgrades_owned"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    upgrade_id: Mapped[str] = mapped_column(Text, primary_key=True)
    equipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bought_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)

    user: Mapped[User] = relationship(back_populates="upgrades")


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    full_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    """Anonimizável (LGPD): a assinatura cobre o hash do nome, não o nome."""
    name_salt: Mapped[str | None] = mapped_column(Text, nullable=True)
    active_hours: Mapped[float] = mapped_column(Numeric(6, 1), nullable=False)
    modules: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    signature: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    """Chave pública Ed25519 (base64 raw) usada na emissão."""
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    accepted_terms_at: Mapped[datetime] = mapped_column(TS, server_default=func.now(), nullable=False)

    __table_args__ = (CheckConstraint("active_hours >= 0", name="ck_cert_hours"),)
