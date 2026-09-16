"""Loja de upgrades, loadout, badges e tempo ativo."""

from __future__ import annotations

from datetime import UTC, datetime

from httpx import AsyncClient
from sqlalchemy import text

from app.db import sessionmaker
from app.services.xp import level_from_xp, upgrade_slots, xp_for_level

from .conftest import backdate_session, grant, solve_terminals

TUTORIAL = "00-tutorial"


def test_level_curve() -> None:
    assert xp_for_level(1) == 100 and xp_for_level(2) == 282 and xp_for_level(4) == 800
    assert level_from_xp(0).level == 1
    assert level_from_xp(99).level == 1
    assert level_from_xp(100).level == 2
    assert level_from_xp(381).level == 2
    assert level_from_xp(382).level == 3
    assert level_from_xp(100).into_level == 0
    assert level_from_xp(150).as_dict() == {"level": 2, "intoLevel": 50, "needed": 282}
    assert [upgrade_slots(n) for n in (1, 2, 3, 4, 10)] == [1, 2, 2, 3, 6]


async def test_buy_requires_bytes_level_and_prereqs(client: AsyncClient, user) -> None:
    res = await client.post("/api/v1/upgrades/off_damage_1/buy")
    assert res.status_code == 402 and res.json()["error"]["code"] == "insufficient_bytes"

    await grant(user["id"], bytes_=200)
    res = await client.post("/api/v1/upgrades/off_magazine_1/buy")  # exige nível 2 + off_damage_1
    assert res.status_code == 409 and res.json()["error"]["details"] == {"requiresLevel": 2}

    res = await client.post("/api/v1/upgrades/off_damage_1/buy")
    assert res.status_code == 200
    body = res.json()
    assert body == {"owned": ["off_damage_1"], "loadout": ["off_damage_1"], "slots": 1, "bytes": 140}

    assert (await client.post("/api/v1/upgrades/off_damage_1/buy")).status_code == 409
    assert (await client.post("/api/v1/upgrades/nao-existe/buy")).status_code == 404

    await grant(user["id"], xp=300)  # nível 2
    res = await client.post("/api/v1/upgrades/off_reload_1/buy")
    assert res.status_code == 200
    assert res.json() == {
        "owned": ["off_damage_1", "off_reload_1"],
        "loadout": ["off_damage_1", "off_reload_1"],
        "slots": 2,
        "bytes": 60,
    }


async def test_loadout_respects_slots(client: AsyncClient, user) -> None:
    await grant(user["id"], bytes_=400, xp=300)
    for uid in ("off_damage_1", "def_integrity_1", "ana_scanner_1"):
        assert (await client.post(f"/api/v1/upgrades/{uid}/buy")).status_code == 200

    res = await client.put("/api/v1/upgrades/loadout", json={"equipped": ["off_damage_1", "def_integrity_1", "ana_scanner_1"]})
    assert res.status_code == 409 and res.json()["error"]["code"] == "no_slots"

    res = await client.put("/api/v1/upgrades/loadout", json={"equipped": ["ana_scanner_1"]})
    assert res.json()["loadout"] == ["ana_scanner_1"]

    res = await client.put("/api/v1/upgrades/loadout", json={"equipped": ["def_mfa"]})
    assert res.status_code == 409 and res.json()["error"]["details"] == {"notOwned": ["def_mfa"]}

    # o loadout viaja na sessão de fase
    start = (await client.post(f"/api/v1/phases/{TUTORIAL}/start")).json()
    assert start["equippedUpgrades"] == ["ana_scanner_1"]


async def test_counter_badge_from_events(client: AsyncClient, user) -> None:
    s = (await client.post(f"/api/v1/phases/{TUTORIAL}/start")).json()
    await backdate_session(s["sessionId"], 300)
    events = [
        {
            "type": "enemy_killed",
            "clientTs": None,
            "payload": {"t": 10 + i, "enemyType": "rootkit", "weapon": "patch_pistol", "counter": "neutral", "revealed": True},
        }
        for i in range(25)
    ]
    res = await client.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": events})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["accepted"] == 25
    assert [b["id"] for b in body["newBadges"]] == ["cacador_rootkits"]
    assert body["xpDelta"] == 125

    earned = (await client.get("/api/v1/badges")).json()["earned"]
    assert [b["id"] for b in earned] == ["cacador_rootkits"]
    assert (await client.get("/api/v1/me")).json()["badges"] == ["cacador_rootkits"]

    # não concede duas vezes
    res = await client.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": events[:1]})
    assert res.json()["newBadges"] == []


async def test_phase_flag_badges_need_the_right_phase(client: AsyncClient, user, content) -> None:
    s = (await client.post(f"/api/v1/phases/{TUTORIAL}/start")).json()
    await backdate_session(s["sessionId"], 120)
    await solve_terminals(client, s["sessionId"], s["seed"], content.phase(TUTORIAL), content)
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 110, "stats": {"phaseId": TUTORIAL, "simTime": 110}},
    )
    ids = [b["id"] for b in res.json()["newBadges"]]
    # patch_only exige uma fase com 2+ armas; zero_trust exige a fase 03
    assert ids == ["primeiro_pacote", "sem_quedas"]


async def test_death_event_blocks_no_death_badge(client: AsyncClient, user, content) -> None:
    s = (await client.post(f"/api/v1/phases/{TUTORIAL}/start")).json()
    await backdate_session(s["sessionId"], 120)
    await client.post(
        f"/api/v1/sessions/{s['sessionId']}/events",
        json={"events": [{"type": "player_died", "clientTs": None, "payload": {"t": 20, "cause": "worm"}}]},
    )
    await solve_terminals(client, s["sessionId"], s["seed"], content.phase(TUTORIAL), content)
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 110, "stats": {"phaseId": TUTORIAL, "simTime": 110}},
    )
    body = res.json()
    assert [b["id"] for b in body["newBadges"]] == ["primeiro_pacote"]
    assert all(line["key"] != "noDeath" for line in body["breakdown"])


async def test_heartbeat_credits_active_time(client: AsyncClient, user) -> None:
    async def beat(phase: str | None = None) -> int:
        res = await client.post("/api/v1/heartbeat", json={"clientTs": datetime.now(UTC).isoformat(), "phaseId": phase})
        assert res.status_code == 204
        async with sessionmaker()() as db:
            return (
                await db.execute(text("SELECT credited_s FROM heartbeats ORDER BY id DESC LIMIT 1"))
            ).scalar_one()

    assert await beat(TUTORIAL) == 0  # primeiro heartbeat não tem lacuna
    async with sessionmaker()() as db:
        await db.execute(text("UPDATE heartbeats SET server_ts = server_ts - interval '20 seconds'"))
        await db.commit()
    assert await beat(TUTORIAL) == 20

    async with sessionmaker()() as db:
        await db.execute(text("UPDATE heartbeats SET server_ts = server_ts - interval '45 seconds'"))
        await db.commit()
    assert await beat(TUTORIAL) == 30  # crédito limitado a 30 s

    async with sessionmaker()() as db:
        await db.execute(text("UPDATE heartbeats SET server_ts = server_ts - interval '200 seconds'"))
        await db.commit()
    assert await beat(TUTORIAL) == 0  # lacuna > 90 s não conta

    me = (await client.get("/api/v1/me")).json()
    assert me["activeSeconds"] == 50
    prog = (await client.get("/api/v1/progress")).json()
    assert next(p for p in prog["phases"] if p["phaseId"] == TUTORIAL)["activeSeconds"] == 50
