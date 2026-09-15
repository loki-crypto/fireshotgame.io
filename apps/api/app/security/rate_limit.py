"""Rate limit em memória (janela deslizante por minuto). Suficiente para uma réplica; ver PLAN.md §7."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request

from ..config import get_settings


class SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def hit(self, key: str, limit: int, window: float = 60.0, now: float | None = None) -> bool:
        """Registra um acesso. Retorna False se estourou o limite."""
        t = time.monotonic() if now is None else now
        q = self._hits[key]
        while q and t - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(t)
        return True

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindow()


def client_ip(request: Request) -> str:
    s = get_settings()
    if s.trust_proxy:
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[0].strip()
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
    return request.client.host if request.client else "unknown"
