"""Perfil e progresso do usuário (formato consumido por apps/web/src/api/client.ts)."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import ActiveTime, Certificate, PhaseProgress, TerminalAttempt, User
from .content import Content
from .xp import level_from_xp, upgrade_slots

TOTAL_KEY = ""


async def active_seconds(db: AsyncSession, user_id: uuid.UUID, phase_id: str = TOTAL_KEY) -> int:
    row = await db.get(ActiveTime, (user_id, phase_id))
    return row.seconds if row else 0


async def active_seconds_by_phase(db: AsyncSession, user_id: uuid.UUID) -> dict[str, int]:
    rows = (await db.execute(select(ActiveTime).where(ActiveTime.user_id == user_id))).scalars().all()
    return {r.phase_id: r.seconds for r in rows}


async def terminal_accuracy(db: AsyncSession, user_id: uuid.UUID) -> float:
    """Proporção de respostas corretas em terminais (todas as tentativas do usuário)."""
    total, correct = (
        await db.execute(
            select(func.count(TerminalAttempt.id), func.count().filter(TerminalAttempt.correct.is_(True))).where(
                TerminalAttempt.user_id == user_id
            )
        )
    ).one()
    return (correct / total) if total else 0.0


async def certificate_of(db: AsyncSession, user_id: uuid.UUID) -> Certificate | None:
    return (
        await db.execute(select(Certificate).where(Certificate.user_id == user_id).order_by(Certificate.issued_at.desc()))
    ).scalars().first()


async def profile(db: AsyncSession, user: User, content: Content) -> dict[str, Any]:
    info = level_from_xp(user.xp)
    cert = await certificate_of(db, user.id)
    owned = sorted(u.upgrade_id for u in user.upgrades)
    loadout = sorted(u.upgrade_id for u in user.upgrades if u.equipped)
    return {
        "id": str(user.id),
        "name": user.name,
        "username": user.username,
        "avatar": user.avatar,
        "email": user.email,
        "xp": user.xp,
        "level": info.level,
        "levelInfo": info.as_dict(),
        "bytes": user.bytes,
        "activeSeconds": await active_seconds(db, user.id),
        "createdAt": user.created_at.isoformat(),
        "badges": sorted(b.badge_id for b in user.badges),
        "upgradesOwned": owned,
        "loadout": loadout,
        "slots": upgrade_slots(info.level),
        "certificate": {"code": cert.code, "issuedAt": cert.issued_at.isoformat()} if cert else None,
    }


async def progress_map(db: AsyncSession, user_id: uuid.UUID) -> dict[str, PhaseProgress]:
    rows = (await db.execute(select(PhaseProgress).where(PhaseProgress.user_id == user_id))).scalars().all()
    return {r.phase_id: r for r in rows}


def is_unlocked(content: Content, phase_id: str, progress: dict[str, PhaseProgress]) -> bool:
    """Fase liberada: treino livre sempre; currículo exige a anterior concluída."""
    if content.is_practice(phase_id):
        return True
    order = content.curriculum()
    idx = next((i for i, p in enumerate(order) if p["id"] == phase_id), -1)
    if idx <= 0:
        return idx == 0
    previous = order[idx - 1]["id"]
    prev = progress.get(previous)
    return bool(prev and prev.completed)


async def progress_response(db: AsyncSession, user_id: uuid.UUID, content: Content) -> dict[str, Any]:
    progress = await progress_map(db, user_id)
    seconds = await active_seconds_by_phase(db, user_id)
    phases = []
    for p in content.phases:
        row = progress.get(p["id"])
        phases.append(
            {
                "phaseId": p["id"],
                "unlocked": is_unlocked(content, p["id"], progress),
                "completed": bool(row and row.completed),
                "completions": row.completions if row else 0,
                "bestTimeS": row.best_time_s if row else None,
                "activeSeconds": seconds.get(p["id"], 0),
            }
        )
    return {"phases": phases, "terminalAccuracy": await terminal_accuracy(db, user_id)}
