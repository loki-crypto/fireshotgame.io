"""Registro, login e rotação de refresh token."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import case, delete, func, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..errors import ApiError
from ..models import LoginThrottle, RefreshToken, User
from ..schemas import USERNAME_RE
from ..security.common_passwords import is_common_password
from ..security.passwords import hash_password, needs_rehash, verify_password
from ..security.tokens import create_access_token, hash_refresh_token, new_refresh_token
from .content import Content, get_content

#: nomes que se passariam pela equipe do jogo no rank público
RESERVED_USERNAMES = frozenset(
    {"admin", "administrador", "administrator", "root", "sistema", "system", "suporte", "support", "staff",
     "moderador", "moderator", "oficial", "official", "equipe", "team", "seguranca", "security", "null", "undefined"}
)
RESERVED_PREFIXES = ("fireshot", "admin", "suporte", "support")

#: hash de uma senha aleatória: login com e-mail inexistente gasta o mesmo argon2 que um real
_DUMMY_HASH = hash_password(secrets.token_urlsafe(24))


def is_reserved_username(username: str) -> bool:
    name = username.strip().lower()
    return name in RESERVED_USERNAMES or name.startswith(RESERVED_PREFIXES)


async def register(
    db: AsyncSession,
    *,
    email: str,
    username: str,
    password: str,
    name: str,
    accepted_terms: bool,
    avatar: str | None = None,
    content: Content | None = None,
) -> User:
    s = get_settings()
    if not accepted_terms:
        raise ApiError("terms_required")
    if len(password) < s.min_password_length:
        raise ApiError("weak_password")
    if not USERNAME_RE.fullmatch(username.strip()):
        raise ApiError("invalid_username")
    if is_reserved_username(username):
        raise ApiError("username_taken")
    if is_common_password(password, identifiers=(email.split("@")[0], username, name)):
        raise ApiError("common_password")
    user = User(
        email=email.strip(),
        username=username.strip(),
        name=name.strip(),
        avatar=resolve_avatar(avatar, content),
        password_hash=hash_password(password),
        accepted_terms_at=datetime.now(UTC),
    )
    user.upgrades = []
    user.badges = []
    db.add(user)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        # a mensagem do Postgres diz qual índice único falhou
        detail = str(getattr(exc, "orig", exc)).lower()
        raise ApiError("username_taken" if "username" in detail else "email_taken") from None
    return user


async def username_status(db: AsyncSession, username: str) -> dict[str, bool]:
    """Formato válido e disponibilidade (sem diferenciar maiúsculas, como o índice citext)."""
    name = username.strip()
    if not USERNAME_RE.fullmatch(name):
        return {"valid": False, "available": False}
    if is_reserved_username(name):
        return {"valid": True, "available": False}
    taken = (await db.execute(select(User.id).where(User.username == name))).first() is not None
    return {"valid": True, "available": not taken}


def resolve_avatar(avatar: str | None, content: Content | None) -> str:
    """Aceita só ids do catálogo; qualquer outra coisa cai no avatar padrão."""
    c = content or get_content()
    ids = c.avatar_ids()
    if avatar and avatar in ids:
        return avatar
    return c.default_avatar()


async def set_avatar(db: AsyncSession, user: User, avatar: str, content: Content | None = None) -> User:
    c = content or get_content()
    if avatar not in c.avatar_ids():
        raise ApiError("validation", details={"fields": ["avatar"]})
    user.avatar = avatar
    await db.flush()
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User:
    email = email.strip()
    await _ensure_not_locked(db, email)
    user = (await db.execute(select(User).where(User.email == email))).scalars().first()
    # sempre roda o argon2: sem isto, a resposta mais rápida entregaria quais e-mails existem
    ok = verify_password(user.password_hash if user else _DUMMY_HASH, password)
    if user is None or not ok:
        await _record_login_failure(db, email)
        await db.commit()  # a requisição termina em erro (rollback): a falha precisa ficar gravada
        raise ApiError("invalid_credentials")
    await db.execute(delete(LoginThrottle).where(LoginThrottle.email == email))
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(password)
        await db.flush()
    return user


async def _ensure_not_locked(db: AsyncSession, email: str) -> None:
    row = await db.get(LoginThrottle, email)
    now = datetime.now(UTC)
    if row is not None and row.locked_until is not None and row.locked_until > now:
        raise ApiError("too_many_attempts", details={"retryAfterS": int((row.locked_until - now).total_seconds()) + 1})


async def _record_login_failure(db: AsyncSession, email: str) -> None:
    """Conta a falha numa janela; ao chegar no limite, trava o e-mail por alguns minutos.

    Upsert atômico: tentativas paralelas não perdem contagem.
    """
    s = get_settings()
    now = datetime.now(UTC)
    window_start = now - timedelta(minutes=s.login_window_minutes)
    table = LoginThrottle.__table__
    expired = table.c.window_started_at < window_start
    stmt = (
        insert(LoginThrottle)
        .values(email=email, failures=1, window_started_at=now)
        .on_conflict_do_update(
            index_elements=[table.c.email],
            set_={
                "failures": case((expired, 1), else_=table.c.failures + 1),
                "window_started_at": case((expired, now), else_=table.c.window_started_at),
            },
        )
        .returning(table.c.failures)
    )
    failures = (await db.execute(stmt)).scalar_one()
    if failures >= s.login_max_failures:
        await db.execute(
            update(LoginThrottle)
            .where(LoginThrottle.email == email)
            .values(failures=0, window_started_at=now, locked_until=now + timedelta(minutes=s.login_lock_minutes))
        )
    if secrets.randbelow(50) == 0:  # faxina ocasional de e-mails que ninguém mais tenta
        await db.execute(
            delete(LoginThrottle).where(
                LoginThrottle.window_started_at < now - timedelta(days=1),
                func.coalesce(LoginThrottle.locked_until, LoginThrottle.window_started_at) < now,
            )
        )


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
