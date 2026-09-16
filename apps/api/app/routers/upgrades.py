"""/upgrades — catálogo, compra e loadout."""

from __future__ import annotations

from fastapi import APIRouter

from ..deps import Ct, CurrentUser, Db
from ..schemas import LoadoutIn
from ..services import upgrades as service

router = APIRouter(prefix="/upgrades", tags=["loja"])


@router.get("")
async def list_upgrades(user: CurrentUser) -> dict:
    return service.state(user)


@router.put("/loadout")
async def set_loadout(body: LoadoutIn, db: Db, user: CurrentUser, content: Ct) -> dict:
    return await service.set_loadout(db, user, content, body.equipped)


@router.post("/{upgrade_id}/buy")
async def buy(upgrade_id: str, db: Db, user: CurrentUser, content: Ct) -> dict:
    return await service.buy(db, user, content, upgrade_id)
