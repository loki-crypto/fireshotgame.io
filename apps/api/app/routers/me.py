"""/me, /progress e /content/version."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import Ct, CurrentUser, Db
from ..services.users import profile, progress_response

router = APIRouter(tags=["perfil"])


@router.get("/me")
async def me(db: Db, user: CurrentUser, content: Ct) -> dict:
    return await profile(db, user, content)


@router.get("/progress")
async def progress(db: Db, user: CurrentUser, content: Ct) -> dict:
    return await progress_response(db, user.id, content)


@router.get("/content/version")
async def content_version(content: Ct) -> dict:
    return {"contentVersion": content.version}


@router.get("/avatars")
async def avatars(content: Ct) -> dict:
    """Catálogo de avatares (o cliente desenha a arte a partir do id)."""
    return {"avatars": content.avatars}
