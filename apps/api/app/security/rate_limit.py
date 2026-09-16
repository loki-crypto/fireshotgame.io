"""Rate limit em memória (janela deslizante por minuto). Suficiente para uma réplica; ver PLAN.md §7."""

from __future__ import annotations

import time
from collections import defaultdict, deque

from fastapi import Request

from ..config import get_settings


class SlidingWindow:
    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._last_sweep = 0.0

    def hit(self, key: str, limit: int, window: float = 60.0, now: float | None = None) -> bool:
        """Registra um acesso. Retorna False se estourou o limite."""
        t = time.monotonic() if now is None else now
        self._sweep(t, window)
        q = self._hits[key]
        while q and t - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(t)
        return True

    def _sweep(self, t: float, window: float) -> None:
        """Descarta chaves ociosas: sem isto, IPs forjados cresceriam a memória sem limite."""
        if t - self._last_sweep < window:
            return
        self._last_sweep = t
        for key in [k for k, q in self._hits.items() if not q or t - q[-1] > window]:
            del self._hits[key]

    def __len__(self) -> int:
        return len(self._hits)

    def reset(self) -> None:
        self._hits.clear()


limiter = SlidingWindow()


def client_ip(request: Request) -> str:
    """IP de quem fez a requisição.

    Atrás de proxy, `X-Real-IP` vem primeiro: a Vercel e o nginx do compose o definem com o IP
    da conexão. O primeiro item de `X-Forwarded-For` pode ter sido escrito pelo próprio cliente
    quando o proxy apenas acrescenta ao cabeçalho recebido — usá-lo antes permitiria trocar de
    "IP" a cada tentativa e escapar do rate limit.
    """
    s = get_settings()
    if s.trust_proxy:
        real = request.headers.get("x-real-ip")
        if real:
            return real.strip()
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"
