"""Checagens de plausibilidade dos eventos e da conclusão de fase (PLAN.md §4)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from ..config import get_settings
from .content import Content

EVENT_TYPES = {
    "enemy_killed",
    "pickup_collected",
    "player_died",
    "weapon_used",
    "mitm_interference",
    "phish_reported",
    "vault_cracked",
    "boss_defeated",
    "checkpoint",
}

COUNTERS = ("strong", "neutral", "weak")
#: abates por segundo tolerados (com folga para enxames)
KILLS_PER_SECOND = 4.0


@dataclass
class SessionTotals:
    """Totais já aceitos da sessão, usados para aplicar os tetos da fase."""

    kills: int = 0
    kills_by_type: dict[str, int] | None = None
    bytes_collected: int = 0
    deaths: int = 0

    def __post_init__(self) -> None:
        if self.kills_by_type is None:
            self.kills_by_type = {}


def _number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int | float):
        return float(value)
    return None


def check_event(
    event_type: str,
    payload: dict[str, Any],
    *,
    phase: dict[str, Any],
    content: Content,
    elapsed_s: float,
    totals: SessionTotals,
) -> str | None:
    """Retorna o motivo da rejeição, ou None se o evento é plausível."""
    s = get_settings()
    if event_type not in EVENT_TYPES:
        return "unknown_type"

    t = _number(payload.get("t"))
    if t is None or t < -1 or t > elapsed_s + s.event_time_tolerance_seconds:
        return "bad_time"

    limits = phase.get("limits", {})
    if event_type == "enemy_killed":
        enemy_type = payload.get("enemyType")
        weapon = payload.get("weapon")
        counter = payload.get("counter")
        if not isinstance(enemy_type, str) or content.enemy(enemy_type) is None:
            return "unknown_enemy"
        if not isinstance(weapon, str) or weapon not in phase["weaponsAvailable"]:
            return "weapon_unavailable"
        if counter not in COUNTERS:
            return "bad_counter"
        if totals.kills + 1 > limits.get("maxKills", 0):
            return "too_many_kills"
        if totals.kills + 1 > KILLS_PER_SECOND * max(1.0, elapsed_s) + 5:
            return "kill_rate"
        return None

    if event_type == "pickup_collected":
        amount = _number(payload.get("amount")) or 0.0
        if amount < 0 or amount > 200:
            return "bad_amount"
        if payload.get("kind") == "bytes" and totals.bytes_collected + amount > limits.get("maxBytes", 0):
            return "too_many_bytes"
        return None

    if event_type == "weapon_used":
        weapon = payload.get("weapon")
        if not isinstance(weapon, str) or weapon not in phase["weaponsAvailable"]:
            return "weapon_unavailable"
        return None

    if event_type == "boss_defeated":
        boss = payload.get("boss")
        if not isinstance(boss, str) or content.enemy(boss) is None:
            return "unknown_enemy"
        if not phase["exit"]["requires"].get("bossDefeated"):
            return "no_boss"
        return None

    if event_type == "mitm_interference":
        terminal = payload.get("terminalId")
        if not isinstance(terminal, str) or content.terminal(phase["id"], terminal) is None:
            return "unknown_terminal"
        return None

    if event_type == "vault_cracked":
        vault = payload.get("vault")
        ids = {v["id"] for v in phase.get("vaults", [])}
        if not isinstance(vault, str) or vault not in ids:
            return "unknown_vault"
        return None

    return None


def clock_skew_ok(client_ts: datetime | None) -> bool:
    if client_ts is None:
        return True
    if client_ts.tzinfo is None:
        client_ts = client_ts.replace(tzinfo=UTC)
    delta = abs((datetime.now(UTC) - client_ts).total_seconds())
    return delta <= get_settings().max_clock_skew_seconds


def check_completion(
    *,
    phase: dict[str, Any],
    stats: dict[str, Any],
    elapsed_real_s: float,
    claimed_elapsed_s: float,
    solved_terminals: set[str],
    boss_defeated: bool,
    content: Content,
    client_ts: datetime | None,
) -> list[str]:
    """Motivos para rejeitar a conclusão (lista vazia = aceita)."""
    reasons: list[str] = []
    min_time = phase.get("minTime", 0) * get_settings().min_time_scale
    if elapsed_real_s + 1 < min_time:
        reasons.append("too_fast")
    if not clock_skew_ok(client_ts):
        reasons.append("clock_skew")

    sim_time = _number(stats.get("simTime")) or 0.0
    tolerance = get_settings().event_time_tolerance_seconds
    if sim_time > elapsed_real_s + tolerance or claimed_elapsed_s > elapsed_real_s + tolerance:
        reasons.append("implausible_time")

    missing = [t for t in content.required_terminals(phase) if t not in solved_terminals]
    if missing:
        reasons.append("terminals_missing")

    if phase["exit"]["requires"].get("bossDefeated") and not boss_defeated:
        reasons.append("boss_missing")

    limits = phase.get("limits", {})
    kills = _number(stats.get("kills")) or 0.0
    collected = _number(stats.get("bytes")) or 0.0
    if kills > limits.get("maxKills", 0) or collected > limits.get("maxBytes", 0):
        reasons.append("implausible_stats")

    return reasons
