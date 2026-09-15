"""PRNG determinístico espelhando packages/sim/src/core/rng.ts.

Não alterar sem atualizar o TypeScript e regenerar as fixtures
(UPDATE_FIXTURES=1 pnpm --filter @fireshot/content test).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import TypeVar

M = 0xFFFFFFFF
T = TypeVar("T")


def _imul(a: int, b: int) -> int:
    """Math.imul: multiplicação de 32 bits truncada (mesmos bits, sinal irrelevante)."""
    return (a * b) & M


class Rng:
    """mulberry32. Todas as operações usam o representante sem sinal de 32 bits."""

    __slots__ = ("_a",)

    def __init__(self, seed: int) -> None:
        self._a = seed & M

    def next(self) -> float:
        self._a = (self._a + 0x6D2B79F5) & M
        t = self._a
        t = _imul(t ^ (t >> 15), t | 1)
        t = (t ^ (t + _imul(t ^ (t >> 7), t | 61))) & M
        return ((t ^ (t >> 14)) & M) / 4294967296

    def int(self, lo: int, hi: int) -> int:
        return lo + math.floor(self.next() * (hi - lo + 1))

    def pick(self, arr: Sequence[T]) -> T:
        if not arr:
            raise ValueError("pick on empty array")
        return arr[math.floor(self.next() * len(arr))]

    def shuffle(self, arr: Sequence[T]) -> list[T]:
        out = list(arr)
        for i in range(len(out) - 1, 0, -1):
            j = math.floor(self.next() * (i + 1))
            out[i], out[j] = out[j], out[i]
        return out

    def sample(self, arr: Sequence[T], k: int) -> list[T]:
        return self.shuffle(arr)[:k]

    def chance(self, p: float) -> bool:
        return self.next() < p


def mulberry32(seed: int) -> Rng:
    return Rng(seed)


def fnv1a32(text: str) -> int:
    """FNV-1a de 32 bits sobre os bytes UTF-8."""
    h = 0x811C9DC5
    for b in text.encode("utf-8"):
        h ^= b
        h = (h * 0x01000193) & M
    return h


def question_seed(session_seed: int, terminal_id: str, challenge_index: int, attempt_no: int) -> int:
    return fnv1a32(f"{session_seed & M}|{terminal_id}|{challenge_index}|{attempt_no}")
