"""Sessões de fase: início, eventos, respostas de terminal e conclusão."""

from __future__ import annotations

from fastapi import APIRouter, status

from ..deps import Ct, CurrentUser, Db
from ..schemas import AnswerIn, CompleteIn, EventsIn
from ..services import sessions as service

router = APIRouter(tags=["sessão"])


@router.post("/phases/{phase_id}/start", status_code=status.HTTP_201_CREATED)
async def start(phase_id: str, db: Db, user: CurrentUser, content: Ct) -> dict:
    return await service.start_session(db, user, phase_id, content)


@router.post("/sessions/{session_id}/events")
async def events(session_id: str, body: EventsIn, db: Db, user: CurrentUser, content: Ct) -> dict:
    session = await service.get_session(db, user.id, session_id)
    return await service.record_events(db, user, session, body.events, content)


@router.post("/sessions/{session_id}/terminals/{terminal_id}/answer")
async def answer(session_id: str, terminal_id: str, body: AnswerIn, db: Db, user: CurrentUser, content: Ct) -> dict:
    session = await service.get_session(db, user.id, session_id)
    return await service.answer_terminal(db, user, session, terminal_id, body, content)


@router.post("/sessions/{session_id}/complete")
async def complete(session_id: str, body: CompleteIn, db: Db, user: CurrentUser, content: Ct) -> dict:
    session = await service.get_session(db, user.id, session_id)
    return await service.complete_session(db, user, session, body, content)
