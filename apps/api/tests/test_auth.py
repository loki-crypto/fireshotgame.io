"""Registro, login, refresh rotativo, CSRF e rate limit."""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.config import get_settings
from app.security.rate_limit import limiter
from app.security.tokens import ACCESS_COOKIE, REFRESH_COOKIE

from .conftest import USER, register


async def test_register_sets_cookies_and_profile(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/register", json=USER)
    assert res.status_code == 201, res.text
    user = res.json()["user"]
    assert user["email"] == USER["email"]
    assert user["level"] == 1 and user["xp"] == 0
    assert user["slots"] == 1 and user["loadout"] == []
    assert ACCESS_COOKIE in res.cookies and REFRESH_COOKIE in res.cookies


async def test_register_requires_terms_and_strong_password(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/register", json={**USER, "acceptedTerms": False})
    assert res.status_code == 422 and res.json()["error"]["code"] == "terms_required"
    res = await client.post("/api/v1/auth/register", json={**USER, "password": "curta"})
    assert res.status_code == 422 and res.json()["error"]["code"] == "weak_password"


async def test_duplicate_email(client: AsyncClient) -> None:
    await register(client)
    res = await client.post("/api/v1/auth/register", json={**USER, "email": "JOGADOR@exemplo.com"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "email_taken"


async def test_login_wrong_password(client: AsyncClient) -> None:
    await register(client)
    res = await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": "errada"})
    assert res.status_code == 401 and res.json()["error"]["code"] == "invalid_credentials"


async def test_me_requires_session(client: AsyncClient) -> None:
    res = await client.get("/api/v1/me")
    assert res.status_code == 401 and res.json()["error"]["code"] == "session_expired"


async def test_refresh_rotates_and_detects_reuse(client: AsyncClient) -> None:
    await register(client)
    first = client.cookies[REFRESH_COOKIE]
    res = await client.post("/api/v1/auth/refresh")
    assert res.status_code == 200
    second = client.cookies[REFRESH_COOKIE]
    assert second != first

    client.cookies.clear()
    # reuso do token já rotacionado revoga a família inteira
    res = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={first}"})
    assert res.status_code == 401
    res = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={second}"})
    assert res.status_code == 401


async def test_logout_clears_session(client: AsyncClient) -> None:
    await register(client)
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    assert ACCESS_COOKIE not in client.cookies
    assert (await client.get("/api/v1/me")).status_code == 401


async def test_csrf_header_required(client: AsyncClient) -> None:
    res = await client.post("/api/v1/auth/register", json=USER, headers={"X-Requested-With": ""})
    assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"


@pytest.fixture
def rate_limited():
    s = get_settings()
    s.rate_limit_enabled = True
    limiter.reset()
    yield
    s.rate_limit_enabled = False
    limiter.reset()


async def test_auth_rate_limit(client: AsyncClient, rate_limited) -> None:
    codes = []
    for i in range(get_settings().auth_rate_limit + 2):
        res = await client.post("/api/v1/auth/login", json={"email": f"x{i}@y.com", "password": "12345678"})
        codes.append(res.status_code)
    assert codes[-1] == 429
    assert codes.count(429) == 2


async def test_delete_account(client: AsyncClient) -> None:
    await register(client)
    res = await client.request("DELETE", "/api/v1/me", json={"password": "errada", "anonymizeCertificates": True})
    assert res.status_code == 401
    res = await client.request("DELETE", "/api/v1/me", json={"password": USER["password"], "anonymizeCertificates": True})
    assert res.status_code == 204
    res = await client.post("/api/v1/auth/login", json={"email": USER["email"], "password": USER["password"]})
    assert res.status_code == 401
