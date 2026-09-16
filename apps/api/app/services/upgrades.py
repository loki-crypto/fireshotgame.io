"""Loja de upgrades e loadout (slots = 1 + nível/2)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import ApiError
from ..models import UpgradeOwned, User
from .content import Content
from .xp import level_from_xp, upgrade_slots


def state(user: User) -> dict[str, Any]:
    info = level_from_xp(user.xp)
    return {
        "owned": sorted(u.upgrade_id for u in user.upgrades),
        "loadout": sorted(u.upgrade_id for u in user.upgrades if u.equipped),
        "slots": upgrade_slots(info.level),
        "bytes": user.bytes,
    }


async def buy(db: AsyncSession, user: User, content: Content, upgrade_id: str) -> dict[str, Any]:
    upgrade = content.upgrade(upgrade_id)
    if upgrade is None:
        raise ApiError("not_found")
    owned = {u.upgrade_id for u in user.upgrades}
    if upgrade_id in owned:
        raise ApiError("requirements_not_met", "Você já tem este upgrade.")
    level = level_from_xp(user.xp).level
    if level < int(upgrade.get("requiresLevel", 1)):
        raise ApiError("requirements_not_met", details={"requiresLevel": upgrade.get("requiresLevel")})
    missing = [r for r in upgrade.get("requires", []) if r not in owned]
    if missing:
        raise ApiError("requirements_not_met", details={"requires": missing})
    cost = int(upgrade["costBytes"])
    if user.bytes < cost:
        raise ApiError("insufficient_bytes", details={"cost": cost, "bytes": user.bytes})

    user.bytes -= cost
    row = UpgradeOwned(user_id=user.id, upgrade_id=upgrade_id, equipped=len(
        [u for u in user.upgrades if u.equipped]
    ) < upgrade_slots(level))
    db.add(row)
    user.upgrades.append(row)
    await db.flush()
    return state(user)


async def set_loadout(db: AsyncSession, user: User, content: Content, equipped: list[str]) -> dict[str, Any]:
    wanted = set(equipped)
    owned = {u.upgrade_id for u in user.upgrades}
    unknown = sorted(wanted - owned)
    if unknown:
        raise ApiError("requirements_not_met", details={"notOwned": unknown})
    slots = upgrade_slots(level_from_xp(user.xp).level)
    if len(wanted) > slots:
        raise ApiError("no_slots", details={"slots": slots, "requested": len(wanted)})
    for row in user.upgrades:
        row.equipped = row.upgrade_id in wanted
    await db.flush()
    return state(user)
