"""Configuração da API (variáveis de ambiente; ver .env.example na raiz do repositório)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _discover_root(start: Path) -> Path:
    """Raiz do monorepo (onde vive pnpm-workspace.yaml).

    Em desenvolvimento o arquivo está em `<repo>/apps/api/app/config.py`; na imagem Docker o
    serviço é copiado para `/srv/app`, sem o repositório em volta — aí a raiz é `/srv`, que é
    onde o Dockerfile coloca `packages/content`.
    """
    for candidate in (start, *start.parents):
        if (candidate / "pnpm-workspace.yaml").is_file():
            return candidate
    return start.parent


REPO_ROOT = _discover_root(Path(__file__).resolve().parent)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env"), extra="ignore", case_sensitive=False)

    # ── banco ─────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://fireshot:fireshot@localhost:5432/fireshot"
    db_echo: bool = False

    # ── autenticação ──────────────────────────────────────────────────────
    jwt_secret: str = "dev-secret-trocar-em-producao"
    access_ttl_minutes: int = 15
    refresh_ttl_days: int = 7
    cookie_secure: bool = True
    cookie_samesite: str = "lax"
    cookie_domain: str | None = None
    min_password_length: int = 8
    refresh_reuse_grace_seconds: int = 15
    """Requisições paralelas que recebem 401 podem disparar dois refresh com o mesmo token.
    Reuso dentro desta janela é tratado como corrida de rede (novo par, mesma família);
    depois dela, é reuso de token roubado e revoga a família inteira."""

    # ── limites ───────────────────────────────────────────────────────────
    rate_limit_enabled: bool = True
    auth_rate_limit: int = 10       # por minuto, por IP
    api_rate_limit: int = 120       # por minuto, por usuário/IP
    trust_proxy: bool = False

    # ── conteúdo do jogo ──────────────────────────────────────────────────
    content_dir: Path = REPO_ROOT / "packages" / "content"

    # ── certificado ───────────────────────────────────────────────────────
    issuer_name: str = "Fireshot: Defesa de Rede"
    verify_base_url: str = "http://localhost:5173/verificar"
    cert_private_key_file: Path | None = None
    """Chave Ed25519 (PEM PKCS#8, sem senha). Ausente: gera uma efêmera e avisa (só para desenvolvimento)."""
    cert_min_active_hours: float = 3.0
    cert_min_accuracy: float = 0.70

    # ── plausibilidade ────────────────────────────────────────────────────
    max_clock_skew_seconds: int = 300
    event_time_tolerance_seconds: int = 15
    min_time_scale: float = 1.0
    """Escala aplicada ao `minTime` das fases. 0 desliga a checagem — só para testes
    automatizados (o E2E conclui uma fase em segundos); nunca use em produção."""
    max_events_per_batch: int = Field(default=100, ge=1, le=500)

    @property
    def content_path(self) -> Path:
        return Path(self.content_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
