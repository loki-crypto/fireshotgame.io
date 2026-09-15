"""Avaliador de badges no servidor (critérios em packages/content/badges.json)."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import BadgeCounter, BadgeEarned, PhaseProgress
from .content import Content


@dataclass
class CompletionContext:
    """Contexto de uma conclusão aceita (critérios `phase_flag` só valem no fim da fase)."""

    phase: dict[str, Any]
    flags: dict[str, bool] = field(default_factory=dict)


async def _counter(db: AsyncSession, user_id: uuid.UUID, key: str) -> BadgeCounter:
    row = await db.get(BadgeCounter, (user_id, key))
    if row is None:
        row = BadgeCounter(user_id=user_id, key=key, value=0, streak=0, best_streak=0)
        db.add(row)
        await db.flush()
    return row


async def add_counters(db: AsyncSession, user_id: uuid.UUID, deltas: dict[str, int]) -> None:
    for key, delta in deltas.items():
        if delta:
            row = await _counter(db, user_id, key)
            row.value += delta


async def update_streak(db: AsyncSession, user_id: uuid.UUID, key: str, *, correct_items: int, total_items: int) -> None:
    """Acertos consecutivos por conceito (ex.: 10 cálculos de sub-rede seguidos)."""
    row = await _counter(db, user_id, key)
    row.value += correct_items
    if correct_items == total_items and total_items > 0:
        row.streak += total_items
        row.best_streak = max(row.best_streak, row.streak)
    else:
        row.streak = 0


async def counters_of(db: AsyncSession, user_id: uuid.UUID) -> dict[str, BadgeCounter]:
    rows = (await db.execute(select(BadgeCounter).where(BadgeCounter.user_id == user_id))).scalars().all()
    return {r.key: r for r in rows}


async def earned_ids(db: AsyncSession, user_id: uuid.UUID) -> set[str]:
    rows = (await db.execute(select(BadgeEarned.badge_id).where(BadgeEarned.user_id == user_id))).scalars().all()
    return set(rows)


def _flag_applies(criterion: dict[str, Any], ctx: CompletionContext) -> bool:
    phase = ctx.phase
    if criterion.get("phase") and criterion["phase"] != phase["id"]:
        return False
    tag = criterion.get("requiresTag")
    if tag and tag not in phase.get("tags", []):
        return False
    min_weapons = criterion.get("minWeapons")
    if min_weapons and len(phase.get("weaponsAvailable", [])) < min_weapons:
        return False
    return bool(ctx.flags.get(criterion["flag"]))


async def evaluate(
    db: AsyncSession,
    user_id: uuid.UUID,
    content: Content,
    *,
    completion: CompletionContext | None = None,
) -> list[dict[str, str]]:
    """Concede as badges cujos critérios foram atingidos. Retorna as novas ({id, name})."""
    already = await earned_ids(db, user_id)
    pending = [b for b in content.badges if b["id"] not in already]
    if not pending:
        return []

    counters = await counters_of(db, user_id)
    completed_phases: set[str] = set()
    if any(b["criterion"]["type"] == "phase_completed" for b in pending):
        rows = (
            await db.execute(
                select(PhaseProgress.phase_id).where(PhaseProgress.user_id == user_id, PhaseProgress.completed.is_(True))
            )
        ).scalars().all()
        completed_phases = set(rows)

    new: list[dict[str, str]] = []
    for badge in pending:
        c = badge["criterion"]
        kind = c["type"]
        ok = False
        if kind == "phase_completed":
            ok = c["phase"] in completed_phases
        elif kind == "counter":
            row = counters.get(c["counter"])
            ok = row is not None and row.value >= c["count"]
        elif kind == "streak":
            row = counters.get(c["counter"])
            ok = row is not None and row.best_streak >= c["count"]
        elif kind == "phase_flag":
            ok = completion is not None and _flag_applies(c, completion)
        if ok:
            db.add(BadgeEarned(user_id=user_id, badge_id=badge["id"]))
            new.append({"id": badge["id"], "name": badge["name"]})
    if new:
        await db.flush()
    return new
