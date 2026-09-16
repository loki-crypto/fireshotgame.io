"""Tempo ativo: crédito por heartbeat = min(30, lacuna); lacuna > 90 s não conta (PLAN.md §4)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ActiveTime, Heartbeat

MAX_CREDIT_S = 30
MAX_GAP_S = 90
TOTAL_KEY = ""


async def _add_seconds(db: AsyncSession, user_id: uuid.UUID, phase_id: str, seconds: int) -> None:
    row = await db.get(ActiveTime, (user_id, phase_id))
    if row is None:
        row = ActiveTime(user_id=user_id, phase_id=phase_id, seconds=0)
        db.add(row)
    row.seconds += seconds


async def record(db: AsyncSession, user_id: uuid.UUID, *, phase_id: str | None, client_ts: datetime | None) -> int:
    now = datetime.now(UTC)
    last = (
        await db.execute(
            select(Heartbeat.server_ts).where(Heartbeat.user_id == user_id).order_by(Heartbeat.server_ts.desc()).limit(1)
        )
    ).scalars().first()

    credited = 0
    if last is not None:
        previous = last if last.tzinfo else last.replace(tzinfo=UTC)
        gap = (now - previous).total_seconds()
        if 0 <= gap <= MAX_GAP_S:
            credited = int(min(MAX_CREDIT_S, gap))

    db.add(
        Heartbeat(
            user_id=user_id,
            phase_id=phase_id,
            client_ts=client_ts if client_ts is None or client_ts.tzinfo else client_ts.replace(tzinfo=UTC),
            server_ts=now,
            credited_s=credited,
        )
    )
    if credited:
        await _add_seconds(db, user_id, TOTAL_KEY, credited)
        if phase_id:
            await _add_seconds(db, user_id, phase_id, credited)
    await db.flush()
    return credited
