"""Dependências comuns dos routers."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_db
from .errors import ApiError
from .models import User
from .security.tokens import ACCESS_COOKIE, decode_access_token
from .services.content import Content, get_content

Db = Annotated[AsyncSession, Depends(get_db)]


async def current_user(request: Request, db: Db) -> User:
    token = request.cookies.get(ACCESS_COOKIE)
    user_id = decode_access_token(token) if token else None
    if user_id is None:
        raise ApiError("session_expired")
    user = await db.get(User, user_id)
    if user is None:
        raise ApiError("session_expired")
    return user


def content() -> Content:
    return get_content()


CurrentUser = Annotated[User, Depends(current_user)]
Ct = Annotated[Content, Depends(content)]
