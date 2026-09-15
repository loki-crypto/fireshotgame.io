"""Regras de XP, nível e slots — espelho de packages/sim/src/progression/*.ts.

O servidor é a autoridade; o cliente usa a cópia em TypeScript apenas para prever recompensas.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

XP_RULES = {
    "kill": 5,
    "kill_strong_bonus": 3,
    "terminal_first_try": 60,
    "terminal_later": 20,
    "phase_complete": 50,
    "first_completion": 100,
    "no_death_bonus": 50,
    "par_time_bonus": 50,
    "phish_reported": 10,
}

BYTES_RULES = {
    "terminal_first_try": 10,
    "phase_complete": 10,
    "first_completion": 40,
}


def xp_for_level(n: int) -> int:
    """XP para subir do nível n ao n+1: floor(100 · n^1.5)."""
    return math.floor(100 * math.pow(n, 1.5))


@dataclass(frozen=True)
class LevelInfo:
    level: int
    into_level: int
    needed: int

    def as_dict(self) -> dict[str, int]:
        return {"level": self.level, "intoLevel": self.into_level, "needed": self.needed}


def level_from_xp(total_xp: int) -> LevelInfo:
    level = 1
    remaining = max(0, int(total_xp))
    while remaining >= xp_for_level(level):
        remaining -= xp_for_level(level)
        level += 1
    return LevelInfo(level=level, into_level=remaining, needed=xp_for_level(level))


def upgrade_slots(level: int) -> int:
    return 1 + level // 2


def kill_xp(counter: str) -> int:
    return XP_RULES["kill"] + (XP_RULES["kill_strong_bonus"] if counter == "strong" else 0)
