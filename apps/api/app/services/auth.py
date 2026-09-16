"""Registro, login e rotação de refresh token."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..errors import ApiError
from ..models import RefreshToken, User
from ..security.passwords import hash_password, needs_rehash, verify_password
from ..security.tokens import create_access_token, hash_refresh_token, new_refresh_token


async def register(db: AsyncSession, *, email: str, password: str, name: str, accepted_terms: bool) -> User:
    s = get_settings()
    if not accepted_terms:
        raise ApiError("terms_required")
    if len(password) < s.min_password_length:
        raise ApiError("weak_password")
    user = User(
        email=email.strip(),
        name=name.strip(),
        password_hash=hash_password(password),
        accepted_terms_at=datetime.now(UTC),
    )
    user.upgrades = []
    user.badges = []
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise ApiError("email_taken") from None
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User:
    user = (await db.execute(select(User).where(User.email == email.strip()))).scalars().first()
    if user is None or not verify_password(user.password_hash, password):
        raise ApiError("invalid_credentials")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        await db.flush()
    return user


async def issue_tokens(db: AsyncSession, user: User, *, family: uuid.UUID | None = None) -> tuple[str, int, str, int]:
    """Cria par (access, refresh). Retorna (access, ttl_access, refresh, ttl_refresh)."""
    access, access_ttl = create_access_token(user.id)
    refresh, token_hash, expires = new_refresh_token()
    row = RefreshToken(
        user_id=user.id,
        token_hash=token_hash,
        family=family or uuid.uuid4(),
        expires_at=expires,
    )
    db.add(row)
    await db.flush()
    refresh_ttl = int((expires - datetime.now(UTC)).total_seconds())
    return access, access_ttl, refresh, refresh_ttl


async def rotate(db: AsyncSession, token: str | None) -> tuple[User, str, int, str, int]:
    """Troca um refresh válido por um novo par. Reuso de token revogado mata a família."""
    if not token:
        raise ApiError("session_expired")
    row = (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token)))).scalars().first()
    if row is None:
        raise ApiError("session_expired")
    now = datetime.now(UTC)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=UTC)
    if row.revoked_at is not None:
        revoked = row.revoked_at if row.revoked_at.tzinfo else row.revoked_at.replace(tzinfo=UTC)
        if row.hard_revoked or (now - revoked).total_seconds() > get_settings().refresh_reuse_grace_seconds:
            # reuso tardio (ou família já derrubada): token vazado. Grava antes de abortar a requisição.
            await revoke_family(db, row.family, hard=True)
            await db.commit()
            raise ApiError("session_expired")
        # dentro da janela de graça: dois refresh paralelos com o mesmo cookie
        user = await db.get(User, row.user_id)
        if user is None:
            raise ApiError("session_expired")
        access, access_ttl, refresh, refresh_ttl = await issue_tokens(db, user, family=row.family)
        return user, access, access_ttl, refresh, refresh_ttl
    if expires <= now:
        raise ApiError("session_expired")
    user = await db.get(User, row.user_id)
    if user is None:
        raise ApiError("session_expired")
    row.revoked_at = now
    access, access_ttl, refresh, refresh_ttl = await issue_tokens(db, user, family=row.family)
    return user, access, access_ttl, refresh, refresh_ttl


async def revoke_family(db: AsyncSession, family: uuid.UUID, *, hard: bool = True) -> None:
    """Encerra a família de refresh tokens. `hard` remove a janela de graça de reuso."""
    now = datetime.now(UTC)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family == family)
        .values(revoked_at=func.coalesce(RefreshToken.revoked_at, now), hard_revoked=hard)
    )


async def revoke(db: AsyncSession, token: str | None) -> None:
    if not token:
        return
    row = (await db.execute(select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(token)))).scalars().first()
    if row is not None:
        await revoke_family(db, row.family)


async def revoke_all(db: AsyncSession, user_id: uuid.UUID) -> None:
    now = datetime.now(UTC)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id)
        .values(revoked_at=func.coalesce(RefreshToken.revoked_at, now), hard_revoked=True)
    )
