"""Configuração da API (variáveis de ambiente; ver .env.example na raiz do repositório)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


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
    max_events_per_batch: int = Field(default=100, ge=1, le=500)

    @property
    def content_path(self) -> Path:
        return Path(self.content_dir)


@lru_cache
def get_settings() -> Settings:
    return Settings()
