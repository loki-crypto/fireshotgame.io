"""Certificado de conclusão: elegibilidade, emissão assinada (Ed25519), PDF e verificação pública.

A assinatura cobre `holderHash = sha256(nome + salt)` em vez do nome em claro, para que a
exclusão de conta (LGPD) possa apagar nome e salt sem invalidar a assinatura do certificado.
"""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import secrets
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import get_settings
from ..errors import ApiError
from ..models import Certificate, User
from .content import Content
from .users import active_seconds, progress_map, terminal_accuracy

log = logging.getLogger("fireshot.certificates")

PAYLOAD_VERSION = 1
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # base32 sem caracteres ambíguos
CODE_GROUPS = 3
CODE_GROUP_SIZE = 4

_ephemeral_key: Ed25519PrivateKey | None = None


# ── chaves ────────────────────────────────────────────────────────────────────


def signing_key() -> Ed25519PrivateKey:
    global _ephemeral_key
    s = get_settings()
    if s.cert_private_key_file:
        path = Path(s.cert_private_key_file)
        if not path.is_file():
            raise ApiError("unknown", f"Chave do certificado não encontrada em {path}.")
        key = serialization.load_pem_private_key(path.read_bytes(), password=None)
        if not isinstance(key, Ed25519PrivateKey):
            raise ApiError("unknown", "A chave do certificado não é Ed25519.")
        return key
    if _ephemeral_key is None:
        _ephemeral_key = Ed25519PrivateKey.generate()
        log.warning("CERT_PRIVATE_KEY_FILE ausente: usando chave Ed25519 efêmera (só para desenvolvimento).")
    return _ephemeral_key


def public_key_pem() -> str:
    return (
        signing_key()
        .public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode("ascii")
    )


def public_key_b64(key: Ed25519PrivateKey | None = None) -> str:
    pub = (key or signing_key()).public_key()
    raw = pub.public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode("ascii")


# ── código e payload ──────────────────────────────────────────────────────────


def new_code() -> str:
    groups = [
        "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_GROUP_SIZE))
        for _ in range(CODE_GROUPS)
    ]
    return "-".join(groups)


def normalize_code(code: str) -> str:
    raw = "".join(c for c in code.upper() if c in CODE_ALPHABET)
    if len(raw) != CODE_GROUPS * CODE_GROUP_SIZE:
        return code.strip().upper()
    return "-".join(raw[i : i + CODE_GROUP_SIZE] for i in range(0, len(raw), CODE_GROUP_SIZE))


def holder_hash(full_name: str, salt: str) -> str:
    return hashlib.sha256(f"{full_name}|{salt}".encode()).hexdigest()


def canonical(payload: dict[str, Any]) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def build_payload(*, code: str, holder: str, active_hours: float, modules: list[str], issued_at: datetime) -> dict[str, Any]:
    return {
        "version": PAYLOAD_VERSION,
        "issuer": get_settings().issuer_name,
        "code": code,
        "holderHash": holder,
        "activeHours": round(float(active_hours), 1),
        "modules": list(modules),
        "issuedAt": issued_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
    }


def verify_signature(cert: Certificate) -> bool:
    try:
        raw = base64.b64decode(cert.public_key)
        Ed25519PublicKey.from_public_bytes(raw).verify(bytes(cert.signature), canonical(cert.payload_json))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


# ── elegibilidade ─────────────────────────────────────────────────────────────


async def eligibility(db: AsyncSession, user: User, content: Content) -> dict[str, Any]:
    s = get_settings()
    progress = await progress_map(db, user.id)
    curriculum = content.curriculum()
    done = [p for p in curriculum if (row := progress.get(p["id"])) and row.completed]
    accuracy = await terminal_accuracy(db, user.id)
    seconds = await active_seconds(db, user.id)
    required_seconds = int(s.cert_min_active_hours * 3600)

    requirements = [
        {"key": "phases", "met": len(done) >= len(curriculum), "current": len(done), "required": len(curriculum)},
        {"key": "accuracy", "met": accuracy >= s.cert_min_accuracy, "current": round(accuracy, 4), "required": s.cert_min_accuracy},
        {"key": "activeTime", "met": seconds >= required_seconds, "current": seconds, "required": required_seconds},
    ]
    cert = (
        await db.execute(select(Certificate).where(Certificate.user_id == user.id).order_by(Certificate.issued_at.desc()))
    ).scalars().first()
    return {
        "eligible": all(r["met"] for r in requirements),
        "requirements": requirements,
        "certificate": public_view(cert) if cert else None,
        "modules": [p["title"] for p in done],
    }


def public_view(cert: Certificate) -> dict[str, Any]:
    return {
        "code": cert.code,
        "issuedAt": cert.issued_at.isoformat(),
        "fullName": cert.full_name,
        "activeHours": float(cert.active_hours),
    }


# ── emissão ───────────────────────────────────────────────────────────────────


async def issue(db: AsyncSession, user: User, content: Content, *, full_name: str, accept_terms: bool) -> dict[str, Any]:
    if not accept_terms:
        raise ApiError("terms_required")
    status = await eligibility(db, user, content)
    if status["certificate"] is not None:
        raise ApiError("already_issued")
    if not status["eligible"]:
        raise ApiError("not_eligible", details={"requirements": status["requirements"]})

    seconds = await active_seconds(db, user.id)
    active_hours = round(seconds / 3600, 1)
    modules: list[str] = status["modules"]
    issued_at = datetime.now(UTC)
    salt = secrets.token_hex(16)
    key = signing_key()

    for _ in range(8):
        code = new_code()
        if (await db.execute(select(Certificate.id).where(Certificate.code == code))).first() is None:
            break
    else:
        raise ApiError("unknown", "Não foi possível gerar um código único.")

    payload = build_payload(
        code=code, holder=holder_hash(full_name, salt), active_hours=active_hours, modules=modules, issued_at=issued_at
    )
    cert = Certificate(
        code=code,
        user_id=user.id,
        full_name=full_name,
        name_salt=salt,
        active_hours=active_hours,
        modules=modules,
        issued_at=issued_at,
        payload_json=payload,
        signature=key.sign(canonical(payload)),
        public_key=public_key_b64(key),
        accepted_terms_at=issued_at,
    )
    db.add(cert)
    await db.flush()
    return public_view(cert)


async def by_code(db: AsyncSession, code: str) -> Certificate | None:
    return (await db.execute(select(Certificate).where(Certificate.code == normalize_code(code)))).scalars().first()


async def verify(db: AsyncSession, code: str) -> dict[str, Any]:
    cert = await by_code(db, code)
    if cert is None:
        raise ApiError("not_found")
    signature_ok = verify_signature(cert)
    anonymized = cert.full_name is None
    return {
        "valid": signature_ok and not cert.revoked,
        "signatureOk": signature_ok,
        "revoked": cert.revoked,
        "anonymized": anonymized,
        "code": cert.code,
        "fullName": cert.full_name,
        "activeHours": float(cert.active_hours),
        "issuedAt": cert.issued_at.isoformat(),
        "modules": list(cert.modules),
    }


async def handle_account_deletion(db: AsyncSession, user_id: uuid.UUID, *, anonymize: bool) -> None:
    """Anonimiza (mantém a validade da assinatura) ou revoga os certificados do usuário."""
    values: dict[str, Any] = {"user_id": None, "full_name": None, "name_salt": None}
    if not anonymize:
        values["revoked"] = True
    await db.execute(update(Certificate).where(Certificate.user_id == user_id).values(**values))
