"""/auth/* — registro, login, refresh rotativo e logout."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from ..deps import Ct, CurrentUser, Db
from ..errors import ApiError
from ..schemas import DeleteAccountIn, LoginIn, RegisterIn
from ..security.cookies import clear_cookies, set_access_cookie, set_refresh_cookie
from ..security.passwords import verify_password
from ..security.tokens import REFRESH_COOKIE
from ..services import auth as auth_service
from ..services import certificates as cert_service
from ..services.users import profile

router = APIRouter(prefix="/auth", tags=["auth"])


async def _login_response(db: Db, user, response: Response, content: Ct) -> dict:
    access, access_ttl, refresh, refresh_ttl = await auth_service.issue_tokens(db, user)
    set_access_cookie(response, access, access_ttl)
    set_refresh_cookie(response, refresh, refresh_ttl)
    return {"user": await profile(db, user, content)}


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterIn, response: Response, db: Db, content: Ct) -> dict:
    user = await auth_service.register(
        db, email=str(body.email), password=body.password, name=body.name, accepted_terms=body.acceptedTerms
    )
    return await _login_response(db, user, response, content)


@router.post("/login")
async def login(body: LoginIn, response: Response, db: Db, content: Ct) -> dict:
    user = await auth_service.authenticate(db, email=str(body.email), password=body.password)
    return await _login_response(db, user, response, content)


@router.post("/refresh")
async def refresh(request: Request, response: Response, db: Db) -> dict:
    _user, access, access_ttl, token, refresh_ttl = await auth_service.rotate(db, request.cookies.get(REFRESH_COOKIE))
    set_access_cookie(response, access, access_ttl)
    set_refresh_cookie(response, token, refresh_ttl)
    return {"ok": True}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: Db) -> Response:
    await auth_service.revoke(db, request.cookies.get(REFRESH_COOKIE))
    clear_cookies(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=dict(response.headers))


me_router = APIRouter(tags=["auth"])


@me_router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account(body: DeleteAccountIn, request: Request, response: Response, db: Db, user: CurrentUser) -> Response:
    """Exclusão de conta (LGPD). Certificados podem ser anonimizados ou revogados."""
    if not verify_password(user.password_hash, body.password):
        raise ApiError("invalid_credentials")
    await cert_service.handle_account_deletion(db, user.id, anonymize=body.anonymizeCertificates)
    await auth_service.revoke_all(db, user.id)
    await db.delete(user)
    await db.flush()
    clear_cookies(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT, headers=dict(response.headers))
