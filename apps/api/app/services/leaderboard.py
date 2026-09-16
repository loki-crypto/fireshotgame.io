"""Rank de jogadores: global (percurso mais rápido) e por fase (melhor tempo).

O critério global honra o mesmo princípio do rank por fase — tempo importa —, mas sem
premiar quem só repete a fase mais fácil: ordena por **fases concluídas** e, entre quem
concluiu o mesmo tanto, pela **soma dos melhores tempos**. Empate vai para quem chegou antes.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import Integer, String, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .content import Content
from .xp import level_from_xp

TOP_LIMIT = 20


def _entry(row: Any, position: int) -> dict[str, Any]:
    return {
        "position": position,
        "username": row.username,
        "avatar": row.avatar,
        "level": level_from_xp(row.xp).level,
        "xp": row.xp,
        "phasesCompleted": int(row.phases or 0),
        "totalTimeS": int(row.total_time or 0),
    }


def _global_query(content: Content):
    from ..models import PhaseProgress, User

    curriculum = [p["id"] for p in content.curriculum()]
    completed = (
        select(
            PhaseProgress.user_id.label("user_id"),
            func.count().label("phases"),
            func.coalesce(func.sum(PhaseProgress.best_time_s), 0).label("total_time"),
            func.min(PhaseProgress.first_completed_at).label("first_at"),
        )
        .where(PhaseProgress.completed.is_(True), PhaseProgress.phase_id.in_(curriculum))
        .group_by(PhaseProgress.user_id)
        .subquery()
    )
    return (
        select(
            User.id,
            User.username,
            User.avatar,
            User.xp,
            completed.c.phases,
            completed.c.total_time,
            completed.c.first_at,
        )
        .join(completed, completed.c.user_id == User.id)
        .order_by(completed.c.phases.desc(), completed.c.total_time.asc(), completed.c.first_at.asc())
    )


async def global_board(db: AsyncSession, content: Content, *, me: uuid.UUID | None, limit: int = TOP_LIMIT) -> dict[str, Any]:
    rows = (await db.execute(_global_query(content))).all()
    top = [_entry(r, i + 1) for i, r in enumerate(rows[:limit])]
    mine = next((_entry(r, i + 1) for i, r in enumerate(rows) if me is not None and r.id == me), None)
    return {"scope": "global", "phaseId": None, "total": len(rows), "entries": top, "me": mine}


async def phase_board(
    db: AsyncSession, content: Content, phase_id: str, *, me: uuid.UUID | None, limit: int = TOP_LIMIT
) -> dict[str, Any]:
    from ..models import PhaseProgress, User

    query = (
        select(
            User.id,
            User.username,
            User.avatar,
            User.xp,
            PhaseProgress.best_time_s.label("best_time"),
            PhaseProgress.completions.label("completions"),
            PhaseProgress.first_completed_at.label("first_at"),
            func.cast(1, Integer).label("phases"),
            PhaseProgress.best_time_s.label("total_time"),
            func.cast(phase_id, String).label("phase"),
        )
        .join(PhaseProgress, PhaseProgress.user_id == User.id)
        .where(
            PhaseProgress.phase_id == phase_id,
            PhaseProgress.completed.is_(True),
            PhaseProgress.best_time_s.is_not(None),
        )
        .order_by(PhaseProgress.best_time_s.asc(), PhaseProgress.first_completed_at.asc())
    )
    rows = (await db.execute(query)).all()

    def entry(row: Any, position: int) -> dict[str, Any]:
        base = _entry(row, position)
        base["bestTimeS"] = int(row.best_time)
        base["completions"] = int(row.completions or 0)
        return base

    top = [entry(r, i + 1) for i, r in enumerate(rows[:limit])]
    mine = next((entry(r, i + 1) for i, r in enumerate(rows) if me is not None and r.id == me), None)
    return {"scope": "phase", "phaseId": phase_id, "total": len(rows), "entries": top, "me": mine}
