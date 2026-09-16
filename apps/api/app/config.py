"""Configuração da API (variáveis de ambiente; ver .env.example na raiz do repositório)."""

from __future__ import annotations

import ssl
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

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


#: parâmetros de libpq que o asyncpg não entende (provedores gerenciados os incluem)
_LIBPQ_ONLY = {"channel_binding", "options", "connect_timeout", "application_name", "target_session_attrs"}


def normalize_database_url(raw: str) -> str:
    """Converte a URL do provedor para o dialeto asyncpg do SQLAlchemy.

    Neon, Supabase e afins entregam `postgresql://…?sslmode=require&channel_binding=require`
    (formato libpq). O asyncpg usa `ssl=` e recusa os demais parâmetros. Em endpoint com
    PgBouncer (`-pooler` no host) o cache de prepared statements precisa ficar desligado.
    """
    if not raw or "+" in raw.split("://", 1)[0]:
        return raw  # já está no formato do SQLAlchemy (ex.: postgresql+asyncpg://)
    parts = urlsplit(raw)
    if parts.scheme not in ("postgres", "postgresql"):
        return raw

    query: list[tuple[str, str]] = []
    for key, value in parse_qsl(parts.query, keep_blank_values=True):
        if key == "sslmode":
            query.append(("ssl", value))
        elif key not in _LIBPQ_ONLY:
            query.append((key, value))
    keys = {k for k, _ in query}
    if "ssl" not in keys and parts.hostname and not parts.hostname.endswith(("localhost", "127.0.0.1")):
        query.append(("ssl", "require"))
    if "-pooler" in (parts.hostname or "") and "prepared_statement_cache_size" not in keys:
        query.append(("prepared_statement_cache_size", "0"))

    return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, urlencode(query), parts.fragment))


#: valores de `ssl=` que pedem criptografia (os demais, como `disable`, ficam como estão)
_SSL_ON = {"require", "verify-ca", "verify-full", "prefer", "allow", "true"}
DEFAULT_JWT_SECRET = "dev-secret-trocar-em-producao"
MIN_JWT_SECRET_LENGTH = 32


def ssl_connect_args(url: str, *, verify: bool = True) -> tuple[str, dict[str, Any]]:
    """Troca `ssl=require` por um SSLContext que confere certificado e hostname.

    No asyncpg, `ssl=require` criptografa mas **não** valida o certificado do servidor (um
    intermediário na rede poderia se passar pelo banco), e `verify-full` como texto exige um
    `~/.postgresql/root.crt`. Um `ssl.create_default_context()` usa as CAs do sistema, que
    validam os certificados públicos de Neon, Supabase e afins.
    """
    parts = urlsplit(url)
    query = parse_qsl(parts.query, keep_blank_values=True)
    mode = next((v for k, v in query if k == "ssl"), None)
    if not verify or mode is None or mode.lower() not in _SSL_ON:
        return url, {}
    rest = [(k, v) for k, v in query if k != "ssl"]
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(rest), parts.fragment)), {"ssl": ssl.create_default_context()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(REPO_ROOT / ".env"), extra="ignore", case_sensitive=False)

    # ── banco ─────────────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://fireshot:fireshot@localhost:5432/fireshot"
    db_echo: bool = False
    database_ssl_verify: bool = True
    """Com TLS ligado, confere o certificado e o hostname do banco (ver `ssl_connect_args`)."""

    # ── autenticação ──────────────────────────────────────────────────────
    jwt_secret: str = DEFAULT_JWT_SECRET
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

    login_max_failures: int = 10
    """Senhas erradas seguidas para o mesmo e-mail antes de travar o login (vale entre instâncias)."""
    login_window_minutes: int = 15
    login_lock_minutes: int = 15

    # ── limites ───────────────────────────────────────────────────────────
    rate_limit_enabled: bool = True
    auth_rate_limit: int = 10       # por minuto, por IP
    api_rate_limit: int = 120       # por minuto, por usuário/IP
    trust_proxy: bool = False
    max_body_bytes: int = 512 * 1024
    """Corpo máximo aceito na API (o maior uso legítimo, um lote de eventos, fica bem abaixo)."""
    api_docs: bool = False
    """Swagger em /api/docs. Fica sempre ligado fora de produção (COOKIE_SECURE=false)."""

    # ── conteúdo do jogo ──────────────────────────────────────────────────
    content_dir: Path = REPO_ROOT / "packages" / "content"

    # ── certificado ───────────────────────────────────────────────────────
    issuer_name: str = "Fireshot: Defesa de Rede"
    verify_base_url: str = "http://localhost:5173/verificar"
    cert_private_key_file: Path | None = None
    """Chave Ed25519 (PEM PKCS#8, sem senha) em arquivo — usado no Docker Compose."""
    cert_private_key_pem: str | None = None
    """Mesma chave, mas embutida na variável de ambiente (serverless não tem arquivo de segredo).

    Tem precedência sobre o arquivo. Sem nenhuma das duas, gera uma chave efêmera e avisa: só
    serve para desenvolvimento, porque cada processo assinaria com uma chave diferente.
    """
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
    def is_production(self) -> bool:
        """Cookies `Secure` só fazem sentido atrás de HTTPS: é o sinal de ambiente publicado."""
        return self.cookie_secure

    @property
    def docs_enabled(self) -> bool:
        return self.api_docs or not self.is_production

    def insecure_reasons(self) -> list[str]:
        """Configurações que deixariam usuários expostos em produção (a API se recusa a subir)."""
        if not self.is_production:
            return []
        reasons: list[str] = []
        if self.jwt_secret == DEFAULT_JWT_SECRET or len(self.jwt_secret) < MIN_JWT_SECRET_LENGTH:
            reasons.append(f"JWT_SECRET ausente, padrão ou com menos de {MIN_JWT_SECRET_LENGTH} caracteres")
        if self.min_time_scale < 1:
            reasons.append("MIN_TIME_SCALE < 1 (só para testes automatizados)")
        return reasons

    @property
    def content_path(self) -> Path:
        return Path(self.content_dir)

    @property
    def sqlalchemy_url(self) -> str:
        """URL do banco no dialeto asyncpg, aceitando o formato entregue pelos provedores."""
        return normalize_database_url(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()
