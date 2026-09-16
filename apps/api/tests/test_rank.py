"""Username, avatar e rank (global e por fase)."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import text

from app.db import sessionmaker
from app.services.leaderboard import TOP_LIMIT

from .conftest import USER, register

TUTORIAL = "00-tutorial"
LAN = "01-lan"


async def seed_player(username: str, times: dict[str, int], *, xp: int = 0, first_at: datetime | None = None) -> str:
    """Cria um jogador direto no banco com fases concluídas e melhores tempos (sem passar pelo jogo)."""
    user_id = str(uuid.uuid4())
    first_at = first_at or datetime.now(UTC)
    async with sessionmaker()() as db:
        await db.execute(
            text(
                "INSERT INTO users (id, email, username, name, avatar, password_hash, xp, level, bytes) "
                "VALUES (:id, :email, :username, :name, 'hacker', 'x', :xp, 1, 0)"
            ),
            {"id": user_id, "email": f"{username}@exemplo.com", "username": username, "name": username, "xp": xp},
        )
        for phase_id, best in times.items():
            await db.execute(
                text(
                    "INSERT INTO phase_progress (user_id, phase_id, completed, completions, best_time_s, best_score, first_completed_at) "
                    "VALUES (:u, :p, true, 1, :t, 0, :at)"
                ),
                {"u": user_id, "p": phase_id, "t": best, "at": first_at},
            )
        await db.commit()
    return user_id


# ── username ─────────────────────────────────────────────────────────────────


async def test_profile_has_username_and_avatar(client: AsyncClient) -> None:
    user = await register(client, avatar="hacker")
    assert user["username"] == USER["username"] and user["avatar"] == "hacker"
    me = (await client.get("/api/v1/me")).json()
    assert me["username"] == USER["username"] and me["avatar"] == "hacker"


async def test_invalid_usernames_are_rejected(client: AsyncClient) -> None:
    for bad in ["ab", "a" * 17, ".comeca-com-ponto", "com espaço", "acentuação", ""]:
        res = await client.post("/api/v1/auth/register", json={**USER, "username": bad})
        assert res.status_code == 422, bad
        assert res.json()["error"]["code"] == "invalid_username", bad
    res = await client.post("/api/v1/auth/register", json={k: v for k, v in USER.items() if k != "username"})
    assert res.status_code == 422 and res.json()["error"]["details"] == {"fields": ["username"]}


async def test_username_is_trimmed_and_unique_ignoring_case(client: AsyncClient) -> None:
    user = await register(client, username="  Neo.Sec_01 ")
    assert user["username"] == "Neo.Sec_01"
    res = await client.post("/api/v1/auth/register", json={**USER, "email": "outra@exemplo.com", "username": "neo.sec_01"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "username_taken"
    # o e-mail duplicado continua com o próprio erro
    res = await client.post("/api/v1/auth/register", json={**USER, "username": "livre"})
    assert res.status_code == 409 and res.json()["error"]["code"] == "email_taken"


async def test_username_availability(client: AsyncClient) -> None:
    await register(client)
    res = await client.get("/api/v1/usernames/livre")
    assert res.json() == {"username": "livre", "valid": True, "available": True}
    res = await client.get("/api/v1/usernames/JOGADOR")
    assert res.json() == {"username": "JOGADOR", "valid": True, "available": False}
    res = await client.get("/api/v1/usernames/x!")
    assert res.json()["valid"] is False and res.json()["available"] is False


# ── avatar ───────────────────────────────────────────────────────────────────


async def test_avatar_catalog_and_change(client: AsyncClient, content) -> None:
    catalog = (await client.get("/api/v1/avatars")).json()["avatars"]
    assert [a["id"] for a in catalog] == content.avatar_ids()
    assert all(len(a["rows"]) == 12 for a in catalog)

    user = await register(client, avatar="nao-existe")
    assert user["avatar"] == content.default_avatar(), "id desconhecido cai no avatar padrão"

    res = await client.put("/api/v1/me/avatar", json={"avatar": "androide"})
    assert res.status_code == 200 and res.json()["avatar"] == "androide"
    assert res.json()["username"] == USER["username"], "devolve o perfil inteiro"
    res = await client.put("/api/v1/me/avatar", json={"avatar": "nao-existe"})
    assert res.status_code == 422 and res.json()["error"]["code"] == "validation"
    assert (await client.get("/api/v1/me")).json()["avatar"] == "androide"


async def test_avatar_change_requires_session(client: AsyncClient) -> None:
    res = await client.put("/api/v1/me/avatar", json={"avatar": "androide"})
    assert res.status_code == 401


# ── rank ─────────────────────────────────────────────────────────────────────


async def test_phase_board_orders_by_best_time(client: AsyncClient) -> None:
    early = datetime.now(UTC) - timedelta(days=2)
    await seed_player("lento", {TUTORIAL: 300})
    await seed_player("rapido", {TUTORIAL: 90})
    await seed_player("empate-depois", {TUTORIAL: 120})
    await seed_player("empate-antes", {TUTORIAL: 120}, first_at=early)
    await seed_player("so-lan", {LAN: 50})

    body = (await client.get(f"/api/v1/leaderboard/{TUTORIAL}")).json()
    assert body["scope"] == "phase" and body["phaseId"] == TUTORIAL and body["total"] == 4
    assert [e["username"] for e in body["entries"]] == ["rapido", "empate-antes", "empate-depois", "lento"]
    assert [e["position"] for e in body["entries"]] == [1, 2, 3, 4]
    assert body["entries"][0]["bestTimeS"] == 90 and body["entries"][0]["avatar"] == "hacker"
    assert body["me"] is None, "sem sessão não há posição própria"
    assert all("email" not in e for e in body["entries"]), "rank é público: nunca expõe e-mail"


async def test_global_board_prefers_more_phases_then_total_time(client: AsyncClient) -> None:
    await seed_player("uma-rapida", {TUTORIAL: 30}, xp=5000)
    await seed_player("duas-lentas", {TUTORIAL: 400, LAN: 500})
    await seed_player("duas-rapidas", {TUTORIAL: 100, LAN: 200})
    await seed_player("treino", {"lab": 5})

    body = (await client.get("/api/v1/leaderboard")).json()
    assert body["scope"] == "global" and body["total"] == 3, "o laboratório não conta para o rank"
    assert [e["username"] for e in body["entries"]] == ["duas-rapidas", "duas-lentas", "uma-rapida"]
    assert body["entries"][0]["phasesCompleted"] == 2 and body["entries"][0]["totalTimeS"] == 300


async def test_own_position_is_returned_even_outside_the_top(client: AsyncClient) -> None:
    for i in range(TOP_LIMIT + 2):
        await seed_player(f"bot-{i:02d}", {TUTORIAL: 10 + i})
    me = await register(client)
    async with sessionmaker()() as db:
        await db.execute(
            text(
                "INSERT INTO phase_progress (user_id, phase_id, completed, completions, best_time_s, best_score, first_completed_at) "
                "VALUES (:u, :p, true, 1, 999, 0, now())"
            ),
            {"u": me["id"], "p": TUTORIAL},
        )
        await db.commit()

    body = (await client.get(f"/api/v1/leaderboard/{TUTORIAL}")).json()
    assert len(body["entries"]) == TOP_LIMIT and body["total"] == TOP_LIMIT + 3
    assert body["me"]["username"] == USER["username"] and body["me"]["position"] == TOP_LIMIT + 3
    assert body["me"]["bestTimeS"] == 999

    body = (await client.get("/api/v1/leaderboard")).json()
    assert body["me"]["position"] == TOP_LIMIT + 3


async def test_player_without_completions_has_no_position(client: AsyncClient) -> None:
    await register(client)
    body = (await client.get("/api/v1/leaderboard")).json()
    assert body["total"] == 0 and body["entries"] == [] and body["me"] is None


async def test_practice_and_unknown_phases_have_no_board(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/leaderboard/lab")).status_code == 404
    assert (await client.get("/api/v1/leaderboard/nao-existe")).status_code == 404
