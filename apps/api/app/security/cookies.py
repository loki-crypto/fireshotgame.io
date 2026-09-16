"""Cookies de sessão (HttpOnly, SameSite=Lax)."""

from __future__ import annotations

from fastapi import Response

from ..config import get_settings
from .tokens import ACCESS_COOKIE, REFRESH_COOKIE, REFRESH_COOKIE_PATH


def set_access_cookie(response: Response, token: str, max_age: int) -> None:
    s = get_settings()
    response.set_cookie(
        ACCESS_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=s.cookie_secure,
        samesite=s.cookie_samesite,  # type: ignore[arg-type]
        domain=s.cookie_domain,
        path="/",
    )


def set_refresh_cookie(response: Response, token: str, max_age: int) -> None:
    s = get_settings()
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=s.cookie_secure,
        samesite=s.cookie_samesite,  # type: ignore[arg-type]
        domain=s.cookie_domain,
        path=REFRESH_COOKIE_PATH,
    )


def clear_cookies(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(ACCESS_COOKIE, path="/", domain=s.cookie_domain)
    response.delete_cookie(REFRESH_COOKIE, path=REFRESH_COOKIE_PATH, domain=s.cookie_domain)
