"""Endurecimento: PDF sem HTML/SSRF, trava de login, senhas comuns, cabeçalhos, limites e configuração."""

from __future__ import annotations

import io
import ssl
from datetime import UTC, datetime

import pytest
from httpx import AsyncClient
from pypdf import PdfReader
from sqlalchemy import text

from app.config import DEFAULT_JWT_SECRET, Settings, get_settings, ssl_connect_args
from app.db import sessionmaker
from app.main import InsecureConfiguration, create_app
from app.models import Certificate
from app.security.rate_limit import SlidingWindow, client_ip
from app.services import auth as auth_service
from app.services.certificate_pdf import offline_url_fetcher, render_pdf

from .conftest import USER, register

# ── PDF do certificado ─────────────────────────────────────────────────────────

HOSTILE_NAME = (
    'Maria <img src="http://127.0.0.1:9/ssrf"> '
    '<link rel="attachment" href="file:///etc/hostname"><style>@import "http://127.0.0.1:9/x.css";</style>'
)


def _cert(full_name: str) -> Certificate:
    return Certificate(
        code="ABCD-EFGH-JKLM",
        full_name=full_name,
        active_hours=4.0,
        modules=["<b>LAN</b>"],
        issued_at=datetime(2026, 9, 16, tzinfo=UTC),
    )


def test_pdf_escapes_user_text_and_embeds_nothing_external() -> None:
    reader = PdfReader(io.BytesIO(render_pdf(_cert(HOSTILE_NAME))))
    content = "".join(page.extract_text() for page in reader.pages)
    assert "<img" in content and "<link" in content, "o nome aparece como texto, não vira HTML"
    assert "<b>LAN</b>" in content
    assert reader.attachments == {}, "nenhum arquivo local anexado ao PDF"


def test_pdf_fetcher_only_accepts_data_urls() -> None:
    fetcher = offline_url_fetcher()
    for url in ("file:///etc/hostname", "http://169.254.169.254/latest/meta-data/", "https://exemplo.com/x.png"):
        with pytest.raises(ValueError, match="disallowed protocol"):
            fetcher.fetch(url)
    assert fetcher.fetch("data:text/plain;base64,b2s=").read() == b"ok"


# ── login ────────────────────────────────────────────────────────────────────


async def test_login_locks_after_repeated_failures_even_with_right_password(client: AsyncClient) -> None:
    await register(client)
    limit = get_settings().login_max_failures
    for _ in range(limit):
        res = await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": "errada-123"})
        assert res.status_code == 401
    res = await client.post("/api/v1/auth/login", json={"email": USER["email"].upper(), "password": USER["password"]})
    assert res.status_code == 429 and res.json()["error"]["code"] == "too_many_attempts"
    assert res.json()["error"]["details"]["retryAfterS"] > 0

    async with sessionmaker()() as db:  # passa o tempo da trava
        await db.execute(text("UPDATE login_throttle SET locked_until = now() - interval '1 second'"))
        await db.commit()
    res = await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert res.status_code == 200
    async with sessionmaker()() as db:
        assert (await db.execute(text("SELECT count(*) FROM login_throttle"))).scalar_one() == 0, "sucesso zera a contagem"


async def test_unknown_email_gets_same_answers_as_existing_one(client: AsyncClient, monkeypatch) -> None:
    """Nem a resposta, nem a trava, nem o custo do hash revelam se o e-mail existe."""
    calls: list[str] = []
    real_verify = auth_service.verify_password
    monkeypatch.setattr(auth_service, "verify_password", lambda h, p: calls.append(h) or real_verify(h, p))

    res = await client.post("/api/v1/auth/login", json={"email": "ninguem@exemplo.com", "password": "qualquer-coisa"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "invalid_credentials"
    assert len(calls) == 1, "argon2 roda mesmo sem conta"

    for _ in range(get_settings().login_max_failures - 1):
        await client.post("/api/v1/auth/login", json={"email": "ninguem@exemplo.com", "password": "qualquer-coisa"})
    res = await client.post("/api/v1/auth/login", json={"email": "ninguem@exemplo.com", "password": "qualquer-coisa"})
    assert res.status_code == 429


async def test_failures_outside_the_window_do_not_accumulate(client: AsyncClient) -> None:
    await register(client)
    for _ in range(get_settings().login_max_failures - 1):
        await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": "errada-123"})
    async with sessionmaker()() as db:
        await db.execute(text("UPDATE login_throttle SET window_started_at = now() - interval '1 hour'"))
        await db.commit()
    res = await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": "errada-123"})
    assert res.status_code == 401, "a janela expirou: a contagem recomeça em vez de travar"


# ── cadastro ─────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("password", ["12345678", "senha123", "Password1", "aaaaaaaaaa", "jogador123", "FIRESHOT123"])
async def test_common_or_personal_passwords_are_refused(client: AsyncClient, password: str) -> None:
    res = await client.post("/api/v1/auth/register", json={**USER, "password": password})
    assert res.status_code == 422 and res.json()["error"]["code"] == "common_password", password


@pytest.mark.parametrize("username", ["admin", "Suporte", "fireshot", "FireshotOficial", "administrador"])
async def test_reserved_usernames_cannot_be_taken(client: AsyncClient, username: str) -> None:
    res = await client.post("/api/v1/auth/register", json={**USER, "username": username})
    assert res.status_code == 409 and res.json()["error"]["code"] == "username_taken"
    assert (await client.get(f"/api/v1/usernames/{username}")).json()["available"] is False


# ── cabeçalhos e limites ─────────────────────────────────────────────────────


async def test_api_responses_carry_security_headers(client: AsyncClient, user) -> None:
    res = await client.get("/api/v1/me")
    assert res.headers["cache-control"] == "no-store", "dados pessoais não ficam em cache"
    assert res.headers["x-content-type-options"] == "nosniff"
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in res.headers["content-security-policy"]
    res = await client.post("/api/v1/auth/login", json={"email": "x", "password": "y"}, headers={"X-Requested-With": ""})
    assert res.status_code == 403 and res.headers["cache-control"] == "no-store", "respostas de erro também"
    res = await client.get("/.well-known/certificate-public-key")
    assert res.headers["cache-control"].startswith("public")


async def test_oversized_bodies_are_refused(client: AsyncClient, user) -> None:
    big = "x" * (get_settings().max_body_bytes + 1)
    res = await client.post("/api/v1/heartbeat", content=f'{{"phaseId": "{big}"}}', headers={"Content-Type": "application/json"})
    assert res.status_code == 413 and res.json()["error"]["code"] == "payload_too_large"


async def test_stored_json_fields_are_capped(client: AsyncClient, user) -> None:
    """Eventos, respostas e resumos viram JSONB: um item gigante não pode inflar o banco."""
    res = await client.post("/api/v1/phases/00-tutorial/start")
    sid = res.json()["sessionId"]
    fat = {"t": 1, "weapon": "x" * 2000}
    res = await client.post(f"/api/v1/sessions/{sid}/events", json={"events": [{"type": "weapon_used", "payload": fat}]})
    assert res.status_code == 422 and res.json()["error"]["details"]["fields"] == ["events.0.payload"]
    huge_answer = {"challengeIndex": 0, "attemptNo": 1, "answer": ["x" * 9000]}
    res = await client.post(f"/api/v1/sessions/{sid}/terminals/t1/answer", json=huge_answer)
    assert res.status_code == 422
    res = await client.post(f"/api/v1/sessions/{sid}/complete", json={"elapsedS": 10, "stats": {"weaponsUsed": ["x" * 5000]}})
    assert res.status_code == 422


def test_client_ip_ignores_spoofable_forwarded_prefix() -> None:
    from starlette.requests import Request

    s = get_settings()
    s.trust_proxy = True
    try:
        def req(headers: dict[str, str]) -> Request:
            raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
            return Request({"type": "http", "headers": raw, "client": ("10.0.0.1", 1)})

        assert client_ip(req({"X-Real-IP": "203.0.113.7", "X-Forwarded-For": "1.2.3.4, 203.0.113.7"})) == "203.0.113.7"
        assert client_ip(req({"X-Forwarded-For": "1.2.3.4, 203.0.113.7"})) == "203.0.113.7", "o cliente só controla o início"
    finally:
        s.trust_proxy = False


def test_rate_limiter_forgets_idle_keys() -> None:
    limiter = SlidingWindow()
    for i in range(1000):
        limiter.hit(f"ip-{i}", 10, now=1.0)
    limiter.hit("novo", 10, now=200.0)
    assert len(limiter) == 1


# ── configuração ─────────────────────────────────────────────────────────────


def test_production_refuses_weak_configuration() -> None:
    strong = "x" * 64
    assert Settings(cookie_secure=True, jwt_secret=DEFAULT_JWT_SECRET).insecure_reasons()
    assert Settings(cookie_secure=True, jwt_secret="curto-demais").insecure_reasons()
    assert Settings(cookie_secure=True, jwt_secret=strong, min_time_scale=0).insecure_reasons()
    assert Settings(cookie_secure=True, jwt_secret=strong).insecure_reasons() == []
    assert Settings(cookie_secure=False, jwt_secret=DEFAULT_JWT_SECRET).insecure_reasons() == [], "desenvolvimento local"


async def test_production_app_hides_docs_and_fails_closed() -> None:
    from httpx import ASGITransport

    s = get_settings()
    saved = (s.cookie_secure, s.jwt_secret)
    try:
        s.cookie_secure, s.jwt_secret = True, DEFAULT_JWT_SECRET
        with pytest.raises(InsecureConfiguration):
            create_app()
        s.jwt_secret = "y" * 64
        async with AsyncClient(transport=ASGITransport(app=create_app()), base_url="http://test") as c:
            assert (await c.get("/api/docs")).status_code == 404
            assert (await c.get("/api/openapi.json")).status_code == 404
    finally:
        s.cookie_secure, s.jwt_secret = saved


def test_database_tls_verifies_certificate_and_hostname() -> None:
    url, args = ssl_connect_args("postgresql+asyncpg://u:p@ep-x.neon.tech/db?ssl=require&prepared_statement_cache_size=0")
    assert url == "postgresql+asyncpg://u:p@ep-x.neon.tech/db?prepared_statement_cache_size=0"
    ctx = args["ssl"]
    assert isinstance(ctx, ssl.SSLContext) and ctx.verify_mode == ssl.CERT_REQUIRED and ctx.check_hostname
    local = "postgresql+asyncpg://u:p@localhost:5432/db"
    assert ssl_connect_args(local) == (local, {})
    assert ssl_connect_args("postgresql+asyncpg://u:p@h/db?ssl=disable")[1] == {}
