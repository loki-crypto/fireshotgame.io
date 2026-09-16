"""/badges — badges conquistadas."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import CurrentUser, Db
from ..models import BadgeEarned

router = APIRouter(tags=["badges"])


@router.get("/badges")
async def badges(db: Db, user: CurrentUser) -> dict:
    rows = (
        await db.execute(select(BadgeEarned).where(BadgeEarned.user_id == user.id).order_by(BadgeEarned.earned_at))
    ).scalars().all()
    return {"earned": [{"id": r.badge_id, "earnedAt": r.earned_at.isoformat()} for r in rows]}
