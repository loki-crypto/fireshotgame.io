"""Carrega o conteúdo do jogo (packages/content) — mesma fonte usada pelo cliente."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from ..config import get_settings

PRACTICE_TAG = "practice"


@dataclass(frozen=True)
class Content:
    enemies: list[dict[str, Any]]
    weapons: list[dict[str, Any]]
    upgrades: list[dict[str, Any]]
    badges: list[dict[str, Any]]
    phases: list[dict[str, Any]]
    pools: dict[str, Any]
    version: str

    def phase(self, phase_id: str) -> dict[str, Any] | None:
        return next((p for p in self.phases if p["id"] == phase_id), None)

    def curriculum(self) -> list[dict[str, Any]]:
        return [p for p in self.phases if PRACTICE_TAG not in p.get("tags", [])]

    def is_practice(self, phase_id: str) -> bool:
        p = self.phase(phase_id)
        return p is not None and PRACTICE_TAG in p.get("tags", [])

    def upgrade(self, upgrade_id: str) -> dict[str, Any] | None:
        return next((u for u in self.upgrades if u["id"] == upgrade_id), None)

    def weapon(self, weapon_id: str) -> dict[str, Any] | None:
        return next((w for w in self.weapons if w["id"] == weapon_id), None)

    def enemy(self, enemy_id: str) -> dict[str, Any] | None:
        return next((e for e in self.enemies if e["id"] == enemy_id), None)

    def badge(self, badge_id: str) -> dict[str, Any] | None:
        return next((b for b in self.badges if b["id"] == badge_id), None)

    def terminal(self, phase_id: str, terminal_id: str) -> dict[str, Any] | None:
        p = self.phase(phase_id)
        if p is None:
            return None
        return next((t for t in p["terminals"] if t["id"] == terminal_id), None)

    def base_weapons(self) -> set[str]:
        return {w["id"] for w in self.weapons if w.get("base")}

    def required_terminals(self, phase: dict[str, Any]) -> list[str]:
        required = {t["id"] for t in phase["terminals"] if t.get("required")}
        required.update(phase["exit"]["requires"].get("terminals", []))
        return sorted(required)


def _read(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def load_content(directory: Path | None = None) -> Content:
    root = Path(directory) if directory else get_settings().content_path
    enemies = _read(root / "enemies.json")
    weapons = _read(root / "weapons.json")
    upgrades = _read(root / "upgrades.json")
    badges = _read(root / "badges.json")
    phases = sorted((_read(p) for p in sorted((root / "phases").glob("*.json"))), key=lambda p: p["order"])
    pools = {p.stem: _read(p) for p in sorted((root / "pools").glob("*.json"))}
    version = ";".join(
        [str(enemies["version"]), str(weapons["version"]), str(upgrades["version"]), str(badges["version"])]
        + [f"{p['id']}@{p['version']}" for p in phases]
    )
    return Content(
        enemies=enemies["enemies"],
        weapons=weapons["weapons"],
        upgrades=upgrades["upgrades"],
        badges=badges["badges"],
        phases=phases,
        pools=pools,
        version=version,
    )


@lru_cache
def get_content() -> Content:
    return load_content()
