"""Corpos de requisição (pydantic). O formato das respostas é montado nos serviços."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from .config import get_settings

USERNAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{2,15}$")


class RegisterIn(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=16)
    password: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=60)
    acceptedTerms: bool
    avatar: str | None = Field(default=None, max_length=24)

    @field_validator("username")
    @classmethod
    def _username(cls, v: str) -> str:
        v = v.strip()
        if not USERNAME_RE.match(v):
            raise ValueError("username inválido")
        return v

    @field_validator("name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("nome vazio")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class AvatarIn(BaseModel):
    avatar: str = Field(min_length=1, max_length=24)


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=200)
    anonymizeCertificates: bool = True


class EventIn(BaseModel):
    type: str = Field(max_length=40)
    clientTs: datetime | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class EventsIn(BaseModel):
    events: list[EventIn]

    @field_validator("events")
    @classmethod
    def _limit(cls, v: list[EventIn]) -> list[EventIn]:
        if len(v) > get_settings().max_events_per_batch:
            raise ValueError("lote grande demais")
        return v


class AnswerIn(BaseModel):
    challengeIndex: int = Field(ge=0, le=64)
    attemptNo: int = Field(ge=1, le=200)
    answer: Any = None
    tampered: bool = False


class CompleteIn(BaseModel):
    clientTs: datetime | None = None
    elapsedS: float = Field(default=0.0, ge=0, le=86_400)
    stats: dict[str, Any] = Field(default_factory=dict)


class HeartbeatIn(BaseModel):
    clientTs: datetime | None = None
    phaseId: str | None = Field(default=None, max_length=40)


class LoadoutIn(BaseModel):
    equipped: list[str] = Field(default_factory=list, max_length=32)


class CertificateIn(BaseModel):
    fullName: str = Field(min_length=3, max_length=120)
    acceptTerms: bool

    @field_validator("fullName")
    @classmethod
    def _clean(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("nome curto")
        return v


Tone = Literal["info", "warn", "success", "danger"]
