"""Aplicação FastAPI do Fireshot."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI

from .config import get_settings
from .db import dispose_engine
from .errors import install_error_handlers
from .routers import auth, badges, certificates, heartbeat, me, sessions, upgrades
from .security.middleware import CsrfMiddleware, RateLimitMiddleware
from .services.content import get_content

log = logging.getLogger("fireshot")

API_PREFIX = "/api/v1"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    content = get_content()
    log.info("conteúdo carregado: %d fases, versão %s", len(content.phases), content.version)
    yield
    await dispose_engine()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Fireshot: Defesa de Rede — API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )
    install_error_handlers(app)
    app.add_middleware(CsrfMiddleware)
    app.add_middleware(RateLimitMiddleware)

    v1 = APIRouter(prefix=API_PREFIX)
    v1.include_router(auth.router)
    v1.include_router(auth.me_router)
    v1.include_router(me.router)
    v1.include_router(sessions.router)
    v1.include_router(heartbeat.router)
    v1.include_router(upgrades.router)
    v1.include_router(badges.router)
    v1.include_router(certificates.router)
    app.include_router(v1)
    app.include_router(certificates.public_router)

    @app.get("/api/health", tags=["infra"])
    async def health() -> dict:
        return {"ok": True, "contentVersion": get_content().version, "issuer": settings.issuer_name}

    return app


app = create_app()
