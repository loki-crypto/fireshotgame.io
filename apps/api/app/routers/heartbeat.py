"""/heartbeat — tempo ativo."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..deps import CurrentUser, Db
from ..schemas import HeartbeatIn
from ..services import heartbeat as service

router = APIRouter(tags=["tempo ativo"])


@router.post("/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def heartbeat(body: HeartbeatIn, db: Db, user: CurrentUser) -> Response:
    await service.record(db, user.id, phase_id=body.phaseId, client_ts=body.clientTs)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
