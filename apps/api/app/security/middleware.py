"""Middlewares: CSRF por header (com SameSite) e rate limit."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from ..config import get_settings
from ..errors import ApiError
from .rate_limit import client_ip, limiter
from .tokens import ACCESS_COOKIE, decode_access_token

MUTATIONS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "fetch"


class CsrfMiddleware(BaseHTTPMiddleware):
    """Exige `X-Requested-With: fetch` nas mutações (cookies são SameSite=Lax)."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if request.method in MUTATIONS and request.url.path.startswith("/api/"):
            if request.headers.get(CSRF_HEADER, "").lower() != CSRF_VALUE:
                return ApiError("forbidden", "Requisição sem o cabeçalho X-Requested-With.").response()
        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """10 req/min em /auth/*, 120 req/min no restante (por usuário autenticado ou IP)."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        s = get_settings()
        path = request.url.path
        if s.rate_limit_enabled and path.startswith("/api/"):
            ip = client_ip(request)
            if path.startswith("/api/v1/auth/"):
                ok = limiter.hit(f"auth:{ip}", s.auth_rate_limit)
            else:
                token = request.cookies.get(ACCESS_COOKIE)
                user_id = decode_access_token(token) if token else None
                ok = limiter.hit(f"api:{user_id or ip}", s.api_rate_limit)
            if not ok:
                return ApiError("rate_limited").response()
        return await call_next(request)
