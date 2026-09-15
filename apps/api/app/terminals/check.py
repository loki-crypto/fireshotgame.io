"""Verificação de respostas — espelho de packages/sim/src/terminals/check.ts.

As normalizações replicam a semântica do JavaScript (trim/regex) para que cliente e
servidor cheguem sempre ao mesmo veredito.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# espaços em branco reconhecidos por String.prototype.trim e /\s/ no JavaScript
JS_WS = "\t\n\v\f\r                  　﻿"
_WS_RUN = re.compile(f"[{re.escape(JS_WS)}]+")
_DIGITS_1_3 = re.compile(r"[0-9]{1,3}\Z")
_DIGITS_1_10 = re.compile(r"[0-9]{1,10}\Z")


@dataclass(frozen=True)
class CheckResult:
    correct: bool
    items: list[bool]

    def as_dict(self) -> dict[str, Any]:
        return {"correct": self.correct, "items": list(self.items)}


def js_trim(s: str) -> str:
    return s.strip(JS_WS)


def normalize_ipv4(s: str) -> str | None:
    parts = js_trim(s).split(".")
    if len(parts) != 4:
        return None
    nums: list[int] = []
    for p in parts:
        if not _DIGITS_1_3.match(p):
            return None
        n = int(p)
        if n > 255:
            return None
        nums.append(n)
    return ".".join(str(n) for n in nums)


def normalize_int(s: str) -> str | None:
    t = js_trim(s)
    if t.startswith("+"):
        t = t[1:]
    if not _DIGITS_1_10.match(t):
        return None
    return str(int(t))


def normalize_text(s: str) -> str:
    return _WS_RUN.sub(" ", js_trim(s).lower())


def is_int(v: Any) -> bool:
    """Number.isInteger: booleanos não são números em JS."""
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return True
    return isinstance(v, float) and float(v).is_integer()


def _is_int_list(v: Any) -> bool:
    return isinstance(v, list) and all(is_int(x) for x in v)


def effective_allowed(ports: list[int], rules: dict[str, Any]) -> list[int]:
    allowed: list[int] = []
    for port in ports:
        rule = next((r for r in rules.get("rules", []) if isinstance(r, dict) and r.get("port") == port), None)
        if rule is not None:
            if rule.get("action") == "allow":
                allowed.append(port)
        elif rules.get("defaultPolicy") == "allow":
            allowed.append(port)
    return allowed


def _valid_ruleset(a: Any) -> bool:
    if not isinstance(a, dict) or a.get("defaultPolicy") not in ("allow", "deny"):
        return False
    rules = a.get("rules")
    if not isinstance(rules, list):
        return False
    return all(isinstance(r, dict) and is_int(r.get("port")) and r.get("action") in ("allow", "deny") for r in rules)


def check_answer(question: dict[str, Any], answer: Any) -> CheckResult:
    kind = question["kind"]

    if kind == "mc":
        return CheckResult(is_int(answer) and answer == question["answer"], [])

    if kind in ("match", "classify"):
        expected: list[int] = question["answer"]
        n = len(expected)
        if not _is_int_list(answer) or len(answer) != n:
            return CheckResult(False, [False] * n)
        items = [answer[i] == v for i, v in enumerate(expected)]
        return CheckResult(all(items), items)

    if kind == "numeric":
        expected_values: list[str] = question["answer"]
        n = len(expected_values)
        if not isinstance(answer, list) or len(answer) != n or not all(isinstance(x, str) for x in answer):
            return CheckResult(False, [False] * n)
        items = []
        for i, field in enumerate(question["fields"]):
            given = answer[i]
            want = expected_values[i]
            if field["format"] == "ipv4":
                items.append(normalize_ipv4(given) == want)
            elif field["format"] == "int":
                items.append(normalize_int(given) == want)
            else:
                items.append(normalize_text(given) == normalize_text(want))
        return CheckResult(all(items), items)

    if kind == "rules":
        ports = [p["port"] for p in question["ports"]]
        if not _valid_ruleset(answer):
            return CheckResult(False, [False] * len(ports))
        allowed = set(effective_allowed(ports, answer))
        wanted = set(question["answer"]["allowed"])
        items = [(p in allowed) == (p in wanted) for p in ports]
        return CheckResult(all(items), items)

    raise ValueError(f"tipo de questão desconhecido: {kind}")
