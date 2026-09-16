"""Fixtures dos testes: Postgres real (container), migrações Alembic e cliente HTTP autenticado.

Sobe o esquema uma vez por sessão (`alembic upgrade head`) e limpa as tabelas entre testes.
Aponte para outro banco com TEST_DATABASE_URL.
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "postgresql+asyncpg://fireshot:fireshot@localhost:55432/fireshot"


def _test_signing_key() -> str:
    """Chave Ed25519 própria dos testes: o .env do desenvolvedor não deve influenciar."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    path = Path(tempfile.gettempdir()) / "fireshot-test-cert-key.pem"
    if not path.exists():
        pem = Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
        path.write_bytes(pem)
    return str(path)


# variáveis de ambiente têm precedência sobre o .env do repositório: os testes ficam isolados
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", DEFAULT_URL)
os.environ["JWT_SECRET"] = os.environ.get("JWT_SECRET", "test-secret-nao-usar-em-producao")
os.environ["RATE_LIMIT_ENABLED"] = "false"
os.environ["COOKIE_SECURE"] = "false"
os.environ["MIN_TIME_SCALE"] = "1"
os.environ["CERT_MIN_ACTIVE_HOURS"] = "3"
os.environ["CERT_MIN_ACCURACY"] = "0.70"
os.environ["CERT_PRIVATE_KEY_FILE"] = _test_signing_key()

import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.db import Base, dispose_engine, sessionmaker  # noqa: E402
from app.main import create_app  # noqa: E402
from app.security.rate_limit import limiter  # noqa: E402
from app.services.content import get_content  # noqa: E402

TABLES = [t.name for t in reversed(Base.metadata.sorted_tables)]


@pytest.fixture(scope="session", autouse=True)
def schema() -> Iterator[None]:
    get_settings.cache_clear()
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=API_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        pytest.skip(f"Postgres de teste indisponível ({DEFAULT_URL}): {proc.stderr.strip()[-400:]}")
    yield


@pytest.fixture(autouse=True)
async def clean_db() -> AsyncIterator[None]:
    limiter.reset()
    async with sessionmaker()() as db:
        await db.execute(text(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE"))
        await db.commit()
    yield


@pytest.fixture
def app():
    return create_app()


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Requested-With": "fetch"},
    ) as c:
        yield c


@pytest.fixture(scope="session", autouse=True)
async def _dispose() -> AsyncIterator[None]:
    yield
    await dispose_engine()


@pytest.fixture
def content():
    return get_content()


# ── auxiliares ────────────────────────────────────────────────────────────────

USER = {"email": "jogador@exemplo.com", "password": "senha-forte-123", "name": "Jogador", "acceptedTerms": True}


async def register(client: AsyncClient, **overrides) -> dict:
    body = {**USER, **overrides}
    res = await client.post("/api/v1/auth/register", json=body)
    assert res.status_code == 201, res.text
    return res.json()["user"]


@pytest.fixture
async def user(client: AsyncClient) -> dict:
    return await register(client)


async def grant(user_id: str, *, xp: int = 0, bytes_: int = 0) -> None:
    """Credita XP/bytes direto no banco (atalho para testar loja e níveis)."""
    from app.services.xp import level_from_xp

    async with sessionmaker()() as db:
        await db.execute(
            text("UPDATE users SET xp = xp + :xp, bytes = bytes + :b, level = :lvl WHERE id = :id"),
            {"xp": xp, "b": bytes_, "lvl": level_from_xp(xp).level, "id": user_id},
        )
        await db.commit()


async def backdate_session(session_id: str, seconds: int) -> None:
    """Move `started_at` para trás (simula tempo real de jogo nos testes)."""
    from sqlalchemy import text as _text

    async with sessionmaker()() as db:
        await db.execute(
            _text("UPDATE phase_sessions SET started_at = started_at - make_interval(secs => :s) WHERE id = :id"),
            {"s": seconds, "id": session_id},
        )
        await db.commit()


def correct_answer(question: dict):
    """Resposta certa de uma questão gerada (o cliente faz o mesmo com o gerador em TS)."""
    kind = question["kind"]
    if kind == "rules":
        allowed = set(question["answer"]["allowed"])
        return {
            "defaultPolicy": "deny",
            "rules": [{"port": p["port"], "action": "allow" if p["port"] in allowed else "deny"} for p in question["ports"]],
        }
    return question["answer"]


def wrong_answer(question: dict):
    kind = question["kind"]
    if kind == "mc":
        return (question["answer"] + 1) % len(question["options"])
    if kind in ("match", "classify"):
        return [(v + 1) % max(2, len(question.get("right") or question.get("categories") or [2])) for v in question["answer"]]
    if kind == "numeric":
        return ["0" for _ in question["answer"]]
    return {"defaultPolicy": "allow", "rules": []}


async def solve_terminals(client: AsyncClient, session_id: str, seed: int, phase: dict, content, *, first_try: bool = True) -> None:
    """Resolve todos os terminais obrigatórios da fase pela API."""
    from app.terminals import generate_question, question_seed

    for tdef in phase["terminals"]:
        challenges = int(tdef.get("challenges", 1))
        for index in range(challenges):
            attempt = 1
            if not first_try:
                q = generate_question(tdef["generator"], tdef.get("params"), question_seed(seed, tdef["id"], index, 1), content.pools)
                res = await client.post(
                    f"/api/v1/sessions/{session_id}/terminals/{tdef['id']}/answer",
                    json={"challengeIndex": index, "attemptNo": 1, "answer": wrong_answer(q), "tampered": False},
                )
                assert res.status_code == 200 and res.json()["correct"] is False, res.text
                attempt = 2
            q = generate_question(tdef["generator"], tdef.get("params"), question_seed(seed, tdef["id"], index, attempt), content.pools)
            res = await client.post(
                f"/api/v1/sessions/{session_id}/terminals/{tdef['id']}/answer",
                json={"challengeIndex": index, "attemptNo": attempt, "answer": correct_answer(q), "tampered": False},
            )
            assert res.status_code == 200, res.text
            assert res.json()["correct"] is True, f"{tdef['id']}#{index}: {res.json()}"


async def complete_phase(client: AsyncClient, phase_id: str, content, *, elapsed: int = 200) -> dict:
    """Início → terminais → conclusão de uma fase inteira pela API."""
    from datetime import UTC, datetime

    res = await client.post(f"/api/v1/phases/{phase_id}/start")
    assert res.status_code == 201, res.text
    s = res.json()
    phase = content.phase(phase_id)
    await backdate_session(s["sessionId"], elapsed + 20)
    await solve_terminals(client, s["sessionId"], s["seed"], phase, content)
    if phase["exit"]["requires"].get("bossDefeated"):
        # o cliente envia o tipo do inimigo; aqui vem do próprio layout da fase
        legend_enemies = [e["enemy"] for e in phase["legend"].values() if e["type"] == "enemy"]
        boss = next((e for e in legend_enemies if e in phase.get("introducesEnemies", [])), legend_enemies[0])
        res = await client.post(
            f"/api/v1/sessions/{s['sessionId']}/events",
            json={"events": [{"type": "boss_defeated", "clientTs": None, "payload": {"t": elapsed - 5, "boss": boss}}]},
        )
        assert res.json()["rejected"] == [], res.text
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={
            "clientTs": datetime.now(UTC).isoformat(),
            "elapsedS": elapsed,
            "stats": {"phaseId": phase_id, "simTime": elapsed},
        },
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["accepted"] is True, body["reasons"]
    return body


async def add_active_time(user_id: str, seconds: int, phase_id: str = "") -> None:
    from sqlalchemy import text as _text

    async with sessionmaker()() as db:
        await db.execute(
            _text(
                "INSERT INTO active_time (user_id, phase_id, seconds) VALUES (:u, :p, :s) "
                "ON CONFLICT (user_id, phase_id) DO UPDATE SET seconds = active_time.seconds + :s"
            ),
            {"u": user_id, "p": phase_id, "s": seconds},
        )
        await db.commit()


async def age_refresh_tokens(*, seconds: int) -> None:
    """Empurra `revoked_at` para trás (simula reuso tardio de refresh token)."""
    from sqlalchemy import text as _text

    async with sessionmaker()() as db:
        await db.execute(
            _text("UPDATE refresh_tokens SET revoked_at = revoked_at - make_interval(secs => :s) WHERE revoked_at IS NOT NULL"),
            {"s": seconds},
        )
        await db.commit()
