"""JWT de acesso (curto) e refresh opaco rotativo (hash no banco)."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt

from ..config import get_settings

ACCESS_COOKIE = "fireshot_access"
REFRESH_COOKIE = "fireshot_refresh"
REFRESH_COOKIE_PATH = "/api/v1/auth"
ALGORITHM = "HS256"


def create_access_token(user_id: uuid.UUID) -> tuple[str, int]:
    """Retorna (token, validade em segundos)."""
    s = get_settings()
    ttl = timedelta(minutes=s.access_ttl_minutes)
    now = datetime.now(UTC)
    payload = {"sub": str(user_id), "iat": int(now.timestamp()), "exp": int((now + ttl).timestamp()), "typ": "access"}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM), int(ttl.total_seconds())


def decode_access_token(token: str) -> uuid.UUID | None:
    s = get_settings()
    try:
        payload = jwt.decode(token, s.jwt_secret, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        if payload.get("typ") != "access":
            return None
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        return None


def new_refresh_token() -> tuple[str, str, datetime]:
    """Retorna (token em claro, hash, expiração)."""
    token = secrets.token_urlsafe(48)
    expires = datetime.now(UTC) + timedelta(days=get_settings().refresh_ttl_days)
    return token, hash_refresh_token(token), expires


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
