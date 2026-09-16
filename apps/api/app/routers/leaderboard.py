"""/leaderboard — rank global e por fase (público: mostra username e avatar, nunca e-mail)."""

from __future__ import annotations

from fastapi import APIRouter, Request

from ..deps import Ct, Db
from ..errors import ApiError
from ..models import User
from ..security.tokens import ACCESS_COOKIE, decode_access_token
from ..services import leaderboard as service

router = APIRouter(prefix="/leaderboard", tags=["rank"])


async def _maybe_me(request: Request, db: Db) -> User | None:
    """O rank é público; se houver sessão, devolve também a posição do próprio jogador."""
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    return await db.get(User, user_id) if user_id else None


@router.get("")
async def global_board(request: Request, db: Db, content: Ct) -> dict:
    me = await _maybe_me(request, db)
    return await service.global_board(db, content, me=me.id if me else None)


@router.get("/{phase_id}")
async def phase_board(phase_id: str, request: Request, db: Db, content: Ct) -> dict:
    if content.phase(phase_id) is None or content.is_practice(phase_id):
        raise ApiError("not_found")
    me = await _maybe_me(request, db)
    return await service.phase_board(db, content, phase_id, me=me.id if me else None)
