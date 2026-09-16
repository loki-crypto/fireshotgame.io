"""Sessão de fase: início, eventos, respostas de terminal, conclusão e plausibilidade."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from app.terminals import generate_question, question_seed

from .conftest import backdate_session, correct_answer, register, solve_terminals

TUTORIAL = "00-tutorial"


def summary(**over) -> dict:
    base = {
        "phaseId": TUTORIAL,
        "simTime": 120.0,
        "deaths": 0,
        "kills": 3,
        "killsStrong": 0,
        "accuracy": 0.8,
        "terminalsSolved": 2,
        "terminalsFirstTry": 2,
        "terminalAttempts": 3,
        "terminalCorrect": 3,
        "bytes": 20,
        "weaponsUsed": ["patch_pistol"],
        "fakePickups": 0,
        "mitmInterference": 0,
        "phishReported": 0,
        "flags": {"noDeath": True, "onlyBaseWeapon": True, "noFakePickups": True, "noMitmInterference": True},
    }
    base.update(over)
    return base


def kill(t: float = 5.0, **over) -> dict:
    payload = {"t": t, "enemyType": "worm", "weapon": "patch_pistol", "counter": "neutral", "revealed": False}
    payload.update(over)
    return {"type": "enemy_killed", "clientTs": datetime.now(UTC).isoformat(), "payload": payload}


async def start(client: AsyncClient, phase_id: str = TUTORIAL) -> dict:
    res = await client.post(f"/api/v1/phases/{phase_id}/start")
    assert res.status_code == 201, res.text
    return res.json()


async def test_start_requires_unlocked_phase(client: AsyncClient, user) -> None:
    assert (await client.post("/api/v1/phases/01-lan/start")).status_code == 403
    assert (await client.post("/api/v1/phases/nao-existe/start")).status_code == 404
    s = await start(client)
    assert 0 <= s["seed"] < 2**32
    assert s["equippedUpgrades"] == []


async def test_practice_phase_is_always_unlocked(client: AsyncClient, user) -> None:
    s = await start(client, "lab")
    res = await client.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": [kill()]})
    assert res.status_code == 200
    assert res.json() == {
        "accepted": 1, "rejected": [], "xpDelta": 0, "bytesDelta": 0, "level": 1, "newBadges": [],
    }
    me = (await client.get("/api/v1/me")).json()
    assert me["xp"] == 0


async def test_events_credit_xp_and_reject_implausible(client: AsyncClient, user) -> None:
    s = await start(client)
    await backdate_session(s["sessionId"], 60)
    events = [
        kill(counter="strong"),
        kill(weapon="scanner"),
        kill(enemyType="dragao"),
        {"type": "pickup_collected", "clientTs": None, "payload": {"t": 6, "kind": "bytes", "amount": 15, "fake": False}},
        {"type": "pickup_collected", "clientTs": None, "payload": {"t": 7, "kind": "bytes", "amount": 150, "fake": False}},
        {"type": "player_died", "clientTs": None, "payload": {"t": 9, "cause": "worm"}},
        {"type": "voo_livre", "clientTs": None, "payload": {"t": 9}},
        kill(t=99999),
    ]
    res = await client.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": events})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["accepted"] == 3
    assert [r["reason"] for r in body["rejected"]] == [
        "weapon_unavailable", "unknown_enemy", "too_many_bytes", "unknown_type", "bad_time",
    ]
    assert body["xpDelta"] == 8  # abate com contramedida correta
    assert body["bytesDelta"] == 15
    me = (await client.get("/api/v1/me")).json()
    assert me["xp"] == 8 and me["bytes"] == 15


async def test_event_batch_limit(client: AsyncClient, user) -> None:
    s = await start(client)
    res = await client.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": [kill()] * 101})
    assert res.status_code == 422 and res.json()["error"]["code"] == "validation"


async def test_terminal_answer_awards_xp_once_and_is_idempotent(client: AsyncClient, user, content) -> None:
    s = await start(client)
    phase = content.phase(TUTORIAL)
    tdef = phase["terminals"][0]  # mc_pool, 2 desafios
    url = f"/api/v1/sessions/{s['sessionId']}/terminals/{tdef['id']}/answer"

    q0 = generate_question(tdef["generator"], tdef["params"], question_seed(s["seed"], tdef["id"], 0, 1), content.pools)
    res = await client.post(url, json={"challengeIndex": 0, "attemptNo": 1, "answer": correct_answer(q0), "tampered": False})
    assert res.json() == {"correct": True, "items": [], "xpDelta": 0, "bytesDelta": 0, "newBadges": []}

    # fora de ordem
    bad = await client.post(url, json={"challengeIndex": 0, "attemptNo": 2, "answer": 0, "tampered": False})
    assert bad.status_code == 403

    q1 = generate_question(tdef["generator"], tdef["params"], question_seed(s["seed"], tdef["id"], 1, 1), content.pools)
    res = await client.post(url, json={"challengeIndex": 1, "attemptNo": 1, "answer": correct_answer(q1), "tampered": False})
    body = res.json()
    assert body["correct"] is True and body["xpDelta"] == 60 and body["bytesDelta"] == 10

    # reenvio devolve o mesmo resultado sem creditar de novo
    again = await client.post(url, json={"challengeIndex": 1, "attemptNo": 1, "answer": correct_answer(q1), "tampered": False})
    assert again.json() == body
    me = (await client.get("/api/v1/me")).json()
    assert me["xp"] == 60 and me["bytes"] == 10


async def test_terminal_wrong_answer_reduces_reward(client: AsyncClient, user, content) -> None:
    s = await start(client)
    phase = content.phase(TUTORIAL)
    tdef = phase["terminals"][1]  # match_pool, 1 desafio
    url = f"/api/v1/sessions/{s['sessionId']}/terminals/{tdef['id']}/answer"
    q = generate_question(tdef["generator"], tdef["params"], question_seed(s["seed"], tdef["id"], 0, 1), content.pools)
    wrong = [(v + 1) % len(q["right"]) for v in q["answer"]]
    res = await client.post(url, json={"challengeIndex": 0, "attemptNo": 1, "answer": wrong, "tampered": False})
    assert res.json()["correct"] is False
    assert res.json()["items"].count(True) < len(q["answer"])

    q2 = generate_question(tdef["generator"], tdef["params"], question_seed(s["seed"], tdef["id"], 0, 2), content.pools)
    res = await client.post(url, json={"challengeIndex": 0, "attemptNo": 2, "answer": correct_answer(q2), "tampered": False})
    assert res.json()["xpDelta"] == 20 and res.json()["bytesDelta"] == 0


async def test_complete_rejects_missing_terminals_and_fast_run(client: AsyncClient, user, content) -> None:
    s = await start(client)
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 5, "stats": summary(simTime=5)},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["accepted"] is False
    assert set(body["reasons"]) == {"too_fast", "terminals_missing"}
    prog = (await client.get("/api/v1/progress")).json()
    assert prog["phases"][0]["completed"] is False


async def test_complete_rejects_clock_skew_and_implausible_time(client: AsyncClient, user, content) -> None:
    s = await start(client)
    await backdate_session(s["sessionId"], 200)
    await solve_terminals(client, s["sessionId"], s["seed"], content.phase(TUTORIAL), content)
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={
            "clientTs": (datetime.now(UTC) + timedelta(hours=2)).isoformat(),
            "elapsedS": 9999,
            "stats": summary(simTime=9999),
        },
    )
    body = res.json()
    assert body["accepted"] is False
    assert set(body["reasons"]) == {"clock_skew", "implausible_time"}


async def test_full_completion_awards_bonuses(client: AsyncClient, user, content) -> None:
    s = await start(client)
    await backdate_session(s["sessionId"], 200)
    phase = content.phase(TUTORIAL)
    await solve_terminals(client, s["sessionId"], s["seed"], phase, content)
    await client.post(
        f"/api/v1/sessions/{s['sessionId']}/events",
        json={
            "events": [
                kill(t=10),
                kill(t=12),
                {"type": "pickup_collected", "clientTs": None, "payload": {"t": 15, "kind": "bytes", "amount": 12, "fake": False}},
                {"type": "weapon_used", "clientTs": None, "payload": {"t": 3, "weapon": "patch_pistol"}},
            ]
        },
    )
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 190, "stats": summary(simTime=190)},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["accepted"] is True and body["reasons"] == []
    lines = {line["key"]: line for line in body["breakdown"]}
    assert lines["kills"]["xp"] == 10
    assert lines["terminals"] == {"key": "terminals", "xp": 120, "bytes": 20}
    assert lines["bytes"] == {"key": "bytes", "xp": 0, "bytes": 12}
    assert lines["phaseComplete"] == {"key": "phaseComplete", "xp": 50, "bytes": 10}
    assert lines["firstCompletion"] == {"key": "firstCompletion", "xp": 100, "bytes": 40}
    assert lines["noDeath"]["xp"] == 50
    assert lines["parTime"]["xp"] == 50
    assert body["xpDelta"] == 380 and body["bytesDelta"] == 82
    assert body["xp"] == 380 and body["level"] == 2 and body["leveledUp"] is True
    assert [b["id"] for b in body["newBadges"]] == ["primeiro_pacote", "sem_quedas"]

    me = (await client.get("/api/v1/me")).json()
    assert me["xp"] == 380 and me["bytes"] == 82
    prog = (await client.get("/api/v1/progress")).json()
    tutorial = next(p for p in prog["phases"] if p["phaseId"] == TUTORIAL)
    assert tutorial["completed"] is True and tutorial["completions"] == 1 and tutorial["bestTimeS"] == 190
    assert next(p for p in prog["phases"] if p["phaseId"] == "01-lan")["unlocked"] is True
    assert prog["terminalAccuracy"] == 1.0

    # reenvio é idempotente
    again = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 190, "stats": summary()},
    )
    assert again.json() == body
    assert (await client.get("/api/v1/me")).json()["xp"] == 380


async def test_replay_awards_less(client: AsyncClient, user, content) -> None:
    phase = content.phase(TUTORIAL)
    for run in range(2):
        s = await start(client)
        await backdate_session(s["sessionId"], 200)
        await solve_terminals(client, s["sessionId"], s["seed"], phase, content, first_try=run == 0)
        res = await client.post(
            f"/api/v1/sessions/{s['sessionId']}/complete",
            json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 150, "stats": summary(simTime=150)},
        )
        body = res.json()
        assert body["accepted"] is True
        if run == 0:
            assert body["xpDelta"] == 370 and body["bytesDelta"] == 70
        else:
            lines = {line["key"]: line for line in body["breakdown"]}
            assert "firstCompletion" not in lines
            assert lines["terminals"] == {"key": "terminals", "xp": 40, "bytes": 0}
            assert body["xpDelta"] == 190 and body["bytesDelta"] == 10
    prog = (await client.get("/api/v1/progress")).json()
    assert next(p for p in prog["phases"] if p["phaseId"] == TUTORIAL)["completions"] == 2


async def test_concurrent_events_do_not_erase_terminal_progress(client: AsyncClient, user, content) -> None:
    """O cliente envia lotes de eventos em paralelo com as respostas: os dois mutam session.flags."""
    import asyncio

    s = await start(client)
    await backdate_session(s["sessionId"], 200)
    phase = content.phase(TUTORIAL)
    tdef = phase["terminals"][0]
    url = f"/api/v1/sessions/{s['sessionId']}/terminals/{tdef['id']}/answer"
    events = {"events": [kill(t=float(i)) for i in range(1, 6)]}

    for index in range(int(tdef["challenges"])):
        q = generate_question(tdef["generator"], tdef["params"], question_seed(s["seed"], tdef["id"], index, 1), content.pools)
        answer, batch = await asyncio.gather(
            client.post(url, json={"challengeIndex": index, "attemptNo": 1, "answer": correct_answer(q), "tampered": False}),
            client.post(f"/api/v1/sessions/{s['sessionId']}/events", json=events),
        )
        assert answer.status_code == 200, answer.text
        assert answer.json()["correct"] is True
        assert batch.status_code == 200, batch.text

    await solve_terminals(client, s["sessionId"], s["seed"], {"terminals": phase["terminals"][1:]}, content)
    res = await client.post(
        f"/api/v1/sessions/{s['sessionId']}/complete",
        json={"clientTs": datetime.now(UTC).isoformat(), "elapsedS": 150, "stats": summary(simTime=150)},
    )
    body = res.json()
    assert body["accepted"] is True, body["reasons"]


async def test_session_belongs_to_user(client: AsyncClient, app, user, content) -> None:
    s = await start(client)
    other = AsyncClient(transport=client._transport, base_url="http://test", headers={"X-Requested-With": "fetch"})
    async with other:
        await register(other, email="outro@exemplo.com")
        res = await other.post(f"/api/v1/sessions/{s['sessionId']}/events", json={"events": [kill()]})
        assert res.status_code == 404
        assert (await other.post("/api/v1/sessions/nao-uuid/events", json={"events": []})).status_code == 404
