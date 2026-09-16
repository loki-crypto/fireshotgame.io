"""Middlewares: CSRF por header (com SameSite), rate limit, tamanho de corpo e cabeçalhos de segurança."""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from ..config import get_settings
from ..errors import ApiError
from .rate_limit import client_ip, limiter
from .tokens import ACCESS_COOKIE, decode_access_token

log = logging.getLogger("fireshot.security")

MUTATIONS = {"POST", "PUT", "PATCH", "DELETE"}
CSRF_HEADER = "x-requested-with"
CSRF_VALUE = "fetch"


class CsrfMiddleware(BaseHTTPMiddleware):
    """Exige `X-Requested-With: fetch` nas mutações (cookies são SameSite=Lax)."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        if request.method in MUTATIONS and request.url.path.startswith("/api/"):
            if request.headers.get(CSRF_HEADER, "").lower() != CSRF_VALUE:
                log.warning("CSRF: %s %s sem X-Requested-With", request.method, request.url.path)
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


#: cabeçalhos de toda resposta da API (JSON não é página: nada de framing, sniffing ou referer)
SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
}
#: a CSP restritiva não vai no PDF: o visualizador embutido do navegador precisa renderizá-lo
JSON_CSP = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
PUBLIC_CACHE_PATHS = ("/.well-known/certificate-public-key",)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Cabeçalhos defensivos e `Cache-Control: no-store` (respostas trazem dados pessoais)."""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        response = await call_next(request)
        for name, value in SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        if not response.headers.get("content-type", "").startswith("application/pdf"):
            response.headers.setdefault("Content-Security-Policy", JSON_CSP)
        if request.url.path.startswith(PUBLIC_CACHE_PATHS):
            response.headers["Cache-Control"] = "public, max-age=3600"
        else:
            response.headers["Cache-Control"] = "no-store"
        return response


class BodySizeLimitMiddleware:
    """Recusa corpos acima de `MAX_BODY_BYTES` antes de o JSON ser lido para a memória."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        limit = get_settings().max_body_bytes
        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > limit):
            await ApiError("payload_too_large").response()(scope, receive, send)
            return

        received = 0

        async def limited_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > limit:
                    # corpo sem Content-Length (chunked) que passou do limite: encerra a leitura
                    return {"type": "http.disconnect"}
            return message

        await self.app(scope, limited_receive, send)
