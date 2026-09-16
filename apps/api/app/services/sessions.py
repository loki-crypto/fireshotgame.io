"""Sessão de fase: início, eventos, respostas de terminal e conclusão.

O servidor é a autoridade: XP de abates e de terminais é creditado na hora (rotas de
eventos e de resposta) e `/complete` soma os bônus de conclusão. A resposta de
`/complete` reporta o total da sessão, mas só grava no usuário a parte ainda não creditada.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from ..errors import ApiError
from ..models import Event, PhaseProgress, PhaseSession, TerminalAttempt, User
from ..terminals import check_answer, generate_question, question_seed
from . import badges as badge_service
from .content import Content
from .plausibility import SessionTotals, check_completion, check_event
from .users import is_unlocked, progress_map
from .xp import BYTES_RULES, XP_RULES, kill_xp, level_from_xp

log = logging.getLogger("fireshot.sessions")

SEED_MAX = 2**32


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(ts: datetime | None) -> datetime | None:
    if ts is None:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


def _elapsed_since_start(session: PhaseSession) -> float:
    started = _aware(session.started_at) or _now()
    return max(0.0, (_now() - started).total_seconds())


def new_flags(level: int) -> dict[str, Any]:
    return {
        "levelAtStart": level,
        "killsByType": {},
        "weapons": [],
        "fakePickups": 0,
        "mitm": 0,
        "phishReported": 0,
        "bossDefeated": [],
        "vaults": [],
        "xpKills": 0,
        "xpTerminals": 0,
        "bytesTerminals": 0,
        "bytesPickups": 0,
        "terminals": {},
    }


def _totals(session: PhaseSession) -> SessionTotals:
    return SessionTotals(
        kills=session.kills,
        kills_by_type=dict(session.flags.get("killsByType", {})),
        bytes_collected=session.bytes_collected,
        deaths=session.deaths,
    )


async def _credit(db: AsyncSession, user: User, xp: int, bytes_: int) -> None:
    if xp:
        user.xp = max(0, user.xp + xp)
        user.level = level_from_xp(user.xp).level
    if bytes_:
        user.bytes = max(0, user.bytes + bytes_)
    if xp or bytes_:
        await db.flush()


async def get_session(db: AsyncSession, user_id: uuid.UUID, session_id: str) -> PhaseSession:
    """Carrega a sessão travando a linha (SELECT … FOR UPDATE).

    Eventos, respostas de terminal e conclusão mutam o mesmo `flags` JSONB e o cliente
    envia lotes de eventos em paralelo com as respostas: sem o lock, a última gravação
    apagava o progresso dos terminais escrito pela outra requisição.
    """
    try:
        sid = uuid.UUID(session_id)
    except ValueError:
        raise ApiError("not_found") from None
    session = (
        await db.execute(select(PhaseSession).where(PhaseSession.id == sid).with_for_update())
    ).scalars().first()
    if session is None or session.user_id != user_id:
        raise ApiError("not_found")
    return session


# ── início ────────────────────────────────────────────────────────────────────


async def start_session(db: AsyncSession, user: User, phase_id: str, content: Content) -> dict[str, Any]:
    phase = content.phase(phase_id)
    if phase is None:
        raise ApiError("not_found")
    progress = await progress_map(db, user.id)
    if not is_unlocked(content, phase_id, progress):
        raise ApiError("phase_locked")

    equipped = sorted(u.upgrade_id for u in user.upgrades if u.equipped)
    session = PhaseSession(
        user_id=user.id,
        phase_id=phase_id,
        seed=secrets.randbelow(SEED_MAX),
        equipped=equipped,
        flags=new_flags(level_from_xp(user.xp).level),
    )
    db.add(session)
    await db.flush()
    return {"sessionId": str(session.id), "seed": session.seed, "equippedUpgrades": equipped}


# ── eventos ───────────────────────────────────────────────────────────────────


def _apply_event(
    event_type: str,
    payload: dict[str, Any],
    *,
    session: PhaseSession,
    flags: dict[str, Any],
    totals: SessionTotals,
    limits: dict[str, Any],
) -> tuple[int, int, dict[str, int]]:
    """Atualiza os contadores da sessão. Devolve (xp, bytes, contadores de badge)."""
    xp = 0
    bytes_ = 0
    counters: dict[str, int] = {}

    if event_type == "enemy_killed":
        enemy = str(payload["enemyType"])
        counter = str(payload.get("counter", "neutral"))
        session.kills += 1
        totals.kills += 1
        by_type = flags["killsByType"]
        by_type[enemy] = by_type.get(enemy, 0) + 1
        counters[f"kills:{enemy}"] = 1
        if payload.get("revealed") is True:
            counters[f"revealed_kill:{enemy}"] = 1
        xp = kill_xp(counter)
        flags["xpKills"] += xp

    elif event_type == "pickup_collected":
        kind = str(payload.get("kind", ""))
        amount = int(float(payload.get("amount") or 0))
        if payload.get("fake") is True:
            flags["fakePickups"] += 1
        elif kind == "bytes":
            room = max(0, int(limits.get("maxBytes", 0)) - session.bytes_collected)
            amount = min(amount, room)
            session.bytes_collected += amount
            totals.bytes_collected += amount
            flags["bytesPickups"] += amount
            bytes_ = amount

    elif event_type == "player_died":
        session.deaths += 1
        totals.deaths += 1

    elif event_type == "weapon_used":
        weapon = str(payload.get("weapon", ""))
        if weapon and weapon not in flags["weapons"]:
            flags["weapons"].append(weapon)

    elif event_type == "mitm_interference":
        flags["mitm"] += 1

    elif event_type == "phish_reported":
        if payload.get("correct") is True:
            flags["phishReported"] += 1
            counters["phish_reported"] = 1
            xp = XP_RULES["phish_reported"]
            flags["xpKills"] += xp

    elif event_type == "boss_defeated":
        boss = str(payload.get("boss", ""))
        if boss and boss not in flags["bossDefeated"]:
            flags["bossDefeated"].append(boss)
            counters[f"boss_defeated:{boss}"] = 1

    elif event_type == "vault_cracked":
        vault = str(payload.get("vault", ""))
        if vault and vault not in flags["vaults"]:
            flags["vaults"].append(vault)
            counters["vaults_cracked"] = 1

    return xp, bytes_, counters


async def record_events(
    db: AsyncSession,
    user: User,
    session: PhaseSession,
    events: list[Any],
    content: Content,
) -> dict[str, Any]:
    phase = content.phase(session.phase_id)
    if phase is None:
        raise ApiError("not_found")
    practice = content.is_practice(session.phase_id)
    elapsed = _elapsed_since_start(session)
    limits = phase.get("limits", {})
    flags = session.flags
    totals = _totals(session)

    accepted = 0
    rejected: list[dict[str, Any]] = []
    xp_total = 0
    bytes_total = 0
    counters: dict[str, int] = {}

    for index, item in enumerate(events):
        payload = dict(item.payload)
        reason = check_event(
            item.type,
            payload,
            phase=phase,
            content=content,
            elapsed_s=elapsed,
            totals=totals,
        )
        db.add(
            Event(
                user_id=user.id,
                session_id=session.id,
                type=item.type,
                payload=payload,
                client_ts=_aware(item.clientTs),
                accepted=reason is None,
                reject_reason=reason,
            )
        )
        if reason is not None:
            rejected.append({"index": index, "reason": reason})
            continue
        accepted += 1
        xp, bytes_, new_counters = _apply_event(
            item.type, payload, session=session, flags=flags, totals=totals, limits=limits
        )
        xp_total += xp
        bytes_total += bytes_
        for key, delta in new_counters.items():
            counters[key] = counters.get(key, 0) + delta

    flag_modified(session, "flags")
    await db.flush()

    new_badges: list[dict[str, str]] = []
    if practice:
        xp_total = 0
        bytes_total = 0
    else:
        if counters:
            await badge_service.add_counters(db, user.id, counters)
        await _credit(db, user, xp_total, bytes_total)
        new_badges = await badge_service.evaluate(db, user.id, content)

    return {
        "accepted": accepted,
        "rejected": rejected,
        "xpDelta": xp_total,
        "bytesDelta": bytes_total,
        "level": level_from_xp(user.xp).level,
        "newBadges": new_badges,
    }


# ── respostas de terminal ─────────────────────────────────────────────────────


@dataclass(frozen=True)
class ItemScore:
    correct: int
    total: int


def item_score(question: dict[str, Any], items: list[bool]) -> ItemScore:
    """Itens acertados na questão (múltipla escolha conta como um item só)."""
    if question["kind"] == "mc" or not items:
        return ItemScore(correct=1 if not items else sum(items), total=1)
    return ItemScore(correct=sum(1 for i in items if i), total=len(items))


def _terminal_state(flags: dict[str, Any], terminal_id: str) -> dict[str, Any]:
    states = flags.setdefault("terminals", {})
    return states.setdefault(terminal_id, {"solved": 0, "firstTry": True, "done": False, "attempts": 0})


async def answer_terminal(
    db: AsyncSession,
    user: User,
    session: PhaseSession,
    terminal_id: str,
    body: Any,
    content: Content,
) -> dict[str, Any]:
    phase = content.phase(session.phase_id)
    if phase is None:
        raise ApiError("not_found")
    tdef = content.terminal(session.phase_id, terminal_id)
    if tdef is None:
        raise ApiError("not_found")

    existing = (
        await db.execute(
            select(TerminalAttempt).where(
                TerminalAttempt.session_id == session.id,
                TerminalAttempt.terminal_id == terminal_id,
                TerminalAttempt.challenge_index == body.challengeIndex,
                TerminalAttempt.attempt_no == body.attemptNo,
            )
        )
    ).scalars().first()
    if existing is not None:
        return dict(existing.result)

    practice = content.is_practice(session.phase_id)
    flags = session.flags
    state = _terminal_state(flags, terminal_id)
    challenges = int(tdef.get("challenges", 1))

    if state["done"] or body.challengeIndex != state["solved"] or body.challengeIndex >= challenges:
        log.warning(
            "desafio fora de ordem: sessão=%s terminal=%s recebido=%s estado=%s desafios=%s",
            session.id, terminal_id, body.challengeIndex, state, challenges,
        )
        raise ApiError("forbidden", "Desafio fora de ordem.")

    seed = question_seed(session.seed, terminal_id, body.challengeIndex, body.attemptNo)
    question = generate_question(tdef["generator"], tdef.get("params"), seed, content.pools)
    result = check_answer(question, body.answer)
    score = item_score(question, result.items)

    xp = 0
    bytes_ = 0
    if result.correct:
        state["solved"] += 1
        state["attempts"] = 0
        if state["solved"] >= challenges:
            state["done"] = True
            if state["firstTry"]:
                xp = XP_RULES["terminal_first_try"]
                bytes_ = BYTES_RULES["terminal_first_try"]
            else:
                xp = XP_RULES["terminal_later"]
    else:
        state["firstTry"] = False
        state["attempts"] += 1

    if practice:
        xp = 0
        bytes_ = 0
    flags["xpTerminals"] += xp
    flags["bytesTerminals"] += bytes_
    flag_modified(session, "flags")

    payload = {
        "correct": result.correct,
        "items": list(result.items),
        "xpDelta": xp,
        "bytesDelta": bytes_,
        "newBadges": [],
    }

    attempt = TerminalAttempt(
        user_id=user.id,
        session_id=session.id,
        phase_id=session.phase_id,
        terminal_id=terminal_id,
        generator=tdef["generator"],
        seed=seed,
        challenge_index=body.challengeIndex,
        attempt_no=body.attemptNo,
        answer=body.answer,
        correct=result.correct,
        tampered=bool(body.tampered),
        tags=list(question.get("tags", [])),
        xp_awarded=xp,
        bytes_awarded=bytes_,
        result=payload,
    )
    db.add(attempt)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        session = await get_session(db, user.id, str(session.id))
        again = (
            await db.execute(
                select(TerminalAttempt).where(
                    TerminalAttempt.session_id == session.id,
                    TerminalAttempt.terminal_id == terminal_id,
                    TerminalAttempt.challenge_index == body.challengeIndex,
                    TerminalAttempt.attempt_no == body.attemptNo,
                )
            )
        ).scalars().first()
        if again is not None:
            return dict(again.result)
        raise

    if not practice:
        for tag in question.get("tags", []):
            await badge_service.update_streak(db, user.id, tag, correct_items=score.correct, total_items=score.total)
        await _credit(db, user, xp, bytes_)
        payload = dict(payload)
        payload["newBadges"] = await badge_service.evaluate(db, user.id, content)
        if payload["newBadges"]:
            attempt.result = payload
            flag_modified(attempt, "result")
            await db.flush()
    return payload


# ── conclusão ─────────────────────────────────────────────────────────────────


def _breakdown(
    *,
    flags: dict[str, Any],
    first_completion: bool,
    no_death: bool,
    within_par: bool,
) -> list[dict[str, Any]]:
    lines = [
        {"key": "kills", "xp": int(flags.get("xpKills", 0)), "bytes": 0},
        {"key": "terminals", "xp": int(flags.get("xpTerminals", 0)), "bytes": int(flags.get("bytesTerminals", 0))},
        {"key": "bytes", "xp": 0, "bytes": int(flags.get("bytesPickups", 0))},
        {"key": "phaseComplete", "xp": XP_RULES["phase_complete"], "bytes": BYTES_RULES["phase_complete"]},
    ]
    if first_completion:
        lines.append(
            {"key": "firstCompletion", "xp": XP_RULES["first_completion"], "bytes": BYTES_RULES["first_completion"]}
        )
    if no_death:
        lines.append({"key": "noDeath", "xp": XP_RULES["no_death_bonus"], "bytes": 0})
    if within_par:
        lines.append({"key": "parTime", "xp": XP_RULES["par_time_bonus"], "bytes": 0})
    return [line for line in lines if line["xp"] or line["bytes"]]


def completion_flags(flags: dict[str, Any], content: Content, deaths: int) -> dict[str, bool]:
    """Flags de badge derivadas do que o servidor aceitou (não do resumo do cliente)."""
    base = content.base_weapons()
    used = list(flags.get("weapons", []))
    return {
        "noDeath": deaths == 0,
        "onlyBaseWeapon": all(w in base for w in used),
        "noFakePickups": int(flags.get("fakePickups", 0)) == 0,
        "noMitmInterference": int(flags.get("mitm", 0)) == 0,
    }


async def complete_session(
    db: AsyncSession,
    user: User,
    session: PhaseSession,
    body: Any,
    content: Content,
) -> dict[str, Any]:
    if session.result is not None:
        return dict(session.result)

    phase = content.phase(session.phase_id)
    if phase is None:
        raise ApiError("not_found")

    flags = session.flags
    stats = dict(body.stats or {})
    real_elapsed = _elapsed_since_start(session)
    solved = {tid for tid, st in flags.get("terminals", {}).items() if st.get("done")}
    reasons = check_completion(
        phase=phase,
        stats=stats,
        elapsed_real_s=real_elapsed,
        claimed_elapsed_s=float(body.elapsedS or 0.0),
        solved_terminals=solved,
        boss_defeated=bool(flags.get("bossDefeated")),
        content=content,
        client_ts=_aware(body.clientTs),
    )
    level_before = level_from_xp(user.xp).level

    if reasons:
        rejected = {
            "accepted": False,
            "reasons": reasons,
            "xpDelta": 0,
            "bytesDelta": 0,
            "xp": user.xp,
            "level": level_before,
            "leveledUp": False,
            "newBadges": [],
            "breakdown": [],
        }
        db.add(
            Event(
                user_id=user.id,
                session_id=session.id,
                type="phase_completed",
                payload={"stats": stats, "elapsedS": body.elapsedS},
                client_ts=_aware(body.clientTs),
                accepted=False,
                reject_reason=",".join(reasons),
            )
        )
        await db.flush()
        return rejected

    practice = content.is_practice(session.phase_id)
    duration = int(min(float(body.elapsedS or 0.0) or real_elapsed, real_elapsed))
    progress = await db.get(PhaseProgress, (user.id, session.phase_id))
    first_completion = not (progress and progress.completed)
    cflags = completion_flags(flags, content, session.deaths)
    within_par = duration <= int(phase.get("parTime", 0))

    lines = _breakdown(
        flags=flags,
        first_completion=first_completion and not practice,
        no_death=cflags["noDeath"],
        within_par=within_par,
    )
    session_xp = sum(int(line["xp"]) for line in lines)
    session_bytes = sum(int(line["bytes"]) for line in lines)
    already_xp = int(flags.get("xpKills", 0)) + int(flags.get("xpTerminals", 0))
    already_bytes = int(flags.get("bytesTerminals", 0)) + int(flags.get("bytesPickups", 0))

    if practice:
        session_xp = session_bytes = already_xp = already_bytes = 0
        lines = []

    await _credit(db, user, session_xp - already_xp, session_bytes - already_bytes)

    session.completed_at = _now()
    session.accepted = True
    session.duration_s = duration
    session.xp_awarded = session_xp
    session.bytes_awarded = session_bytes
    flags["completionFlags"] = cflags
    flags["stats"] = stats
    flag_modified(session, "flags")

    new_badges: list[dict[str, str]] = []
    if not practice:
        if progress is None:
            progress = PhaseProgress(user_id=user.id, phase_id=session.phase_id, completed=False, completions=0, best_score=0)
            db.add(progress)
        progress.completions += 1
        if not progress.completed:
            progress.completed = True
            progress.first_completed_at = session.completed_at
        if progress.best_time_s is None or duration < progress.best_time_s:
            progress.best_time_s = duration
        progress.best_score = max(progress.best_score, session_xp)
        await db.flush()
        await badge_service.add_counters(db, user.id, {"phases_completed": 1})
        new_badges = await badge_service.evaluate(
            db, user.id, content, completion=badge_service.CompletionContext(phase=phase, flags=cflags)
        )

    info = level_from_xp(user.xp)
    result = {
        "accepted": True,
        "reasons": [],
        "xpDelta": session_xp,
        "bytesDelta": session_bytes,
        "xp": user.xp,
        "level": info.level,
        "leveledUp": info.level > int(flags.get("levelAtStart", level_before)),
        "newBadges": new_badges,
        "breakdown": lines,
    }
    session.result = result
    db.add(
        Event(
            user_id=user.id,
            session_id=session.id,
            type="phase_completed",
            payload={"durationS": duration, "xp": session_xp, "bytes": session_bytes},
            client_ts=_aware(body.clientTs),
            accepted=True,
        )
    )
    await db.flush()
    return result
