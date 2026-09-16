"""Certificado: elegibilidade, emissão assinada, PDF, verificação pública e LGPD."""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from pypdf import PdfReader
from sqlalchemy import text

from app.db import sessionmaker
from app.errors import ApiError
from app.services import certificates as service

from .conftest import USER, add_active_time, complete_phase

NAME = "Maria da Silva Souza"


async def _make_eligible(client: AsyncClient, user: dict, content) -> None:
    for phase in content.curriculum():
        await complete_phase(client, phase["id"], content)
    await add_active_time(user["id"], 4 * 3600)


async def test_not_eligible_at_first(client: AsyncClient, user, content) -> None:
    res = await client.get("/api/v1/certificates/eligibility")
    assert res.status_code == 200
    body = res.json()
    assert body["eligible"] is False and body["certificate"] is None
    keys = {r["key"]: r for r in body["requirements"]}
    assert keys["phases"] == {"key": "phases", "met": False, "current": 0, "required": len(content.curriculum())}
    assert keys["activeTime"]["required"] == 10800
    assert "modules" not in body

    res = await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": True})
    assert res.status_code == 403 and res.json()["error"]["code"] == "not_eligible"


async def test_issue_verify_and_pdf(client: AsyncClient, user, content) -> None:
    await _make_eligible(client, user, content)
    res = await client.get("/api/v1/certificates/eligibility")
    assert res.json()["eligible"] is True

    res = await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": False})
    assert res.status_code == 422 and res.json()["error"]["code"] == "terms_required"

    res = await client.post("/api/v1/certificates", json={"fullName": f"  {NAME}  ", "acceptTerms": True})
    assert res.status_code == 201, res.text
    cert = res.json()
    code = cert["code"]
    assert cert["fullName"] == NAME and cert["activeHours"] == 4.0
    assert len(code) == 14 and code.count("-") == 2

    # segunda emissão é bloqueada
    res = await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": True})
    assert res.status_code == 409 and res.json()["error"]["code"] == "already_issued"

    # verificação pública (sem sessão, código com espaços e minúsculas)
    async with AsyncClient(transport=client._transport, base_url="http://test") as anon:
        res = await anon.get(f"/api/v1/verify/{code.replace('-', ' ').lower()}")
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["valid"] is True and body["signatureOk"] is True and body["revoked"] is False
        assert body["anonymized"] is False and body["fullName"] == NAME
        assert body["code"] == code and body["activeHours"] == 4.0
        assert body["modules"] == [p["title"] for p in content.curriculum()]
        assert (await anon.get("/api/v1/verify/AAAA-BBBB-CCCC")).status_code == 404

        res = await anon.get("/.well-known/certificate-public-key")
        assert res.status_code == 200 and "BEGIN PUBLIC KEY" in res.text

    res = await client.get(f"/api/v1/certificates/{code}.pdf")
    assert res.status_code == 200 and res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF")
    reader = PdfReader(__import__("io").BytesIO(res.content))
    assert len(reader.pages) == 1
    text_pdf = reader.pages[0].extract_text()
    assert NAME in text_pdf and code in text_pdf

    me = (await client.get("/api/v1/me")).json()
    assert me["certificate"]["code"] == code


async def test_signature_detects_tampering(client: AsyncClient, user, content) -> None:
    await _make_eligible(client, user, content)
    code = (await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": True})).json()["code"]
    async with sessionmaker()() as db:
        await db.execute(
            text("UPDATE certificates SET payload_json = jsonb_set(payload_json, '{activeHours}', '999') WHERE code = :c"),
            {"c": code},
        )
        await db.commit()
    body = (await client.get(f"/api/v1/verify/{code}")).json()
    assert body["signatureOk"] is False and body["valid"] is False


async def test_account_deletion_anonymizes_certificate(client: AsyncClient, user, content) -> None:
    await _make_eligible(client, user, content)
    code = (await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": True})).json()["code"]
    res = await client.request("DELETE", "/api/v1/me", json={"password": USER["password"], "anonymizeCertificates": True})
    assert res.status_code == 204

    async with AsyncClient(transport=client._transport, base_url="http://test") as anon:
        body = (await anon.get(f"/api/v1/verify/{code}")).json()
        assert body["anonymized"] is True and body["fullName"] is None
        assert body["signatureOk"] is True and body["valid"] is True  # a assinatura cobre o hash do nome
        assert body["revoked"] is False
    async with sessionmaker()() as db:
        row = (await db.execute(text("SELECT user_id, name_salt FROM certificates WHERE code = :c"), {"c": code})).one()
        assert row == (None, None)
        assert (await db.execute(text("SELECT count(*) FROM users"))).scalar_one() == 0


async def test_account_deletion_can_revoke_instead(client: AsyncClient, user, content) -> None:
    await _make_eligible(client, user, content)
    code = (await client.post("/api/v1/certificates", json={"fullName": NAME, "acceptTerms": True})).json()["code"]
    res = await client.request("DELETE", "/api/v1/me", json={"password": USER["password"], "anonymizeCertificates": False})
    assert res.status_code == 204
    async with AsyncClient(transport=client._transport, base_url="http://test") as anon:
        body = (await anon.get(f"/api/v1/verify/{code}")).json()
        assert body["revoked"] is True and body["valid"] is False and body["signatureOk"] is True


def test_signing_key_from_env_pem(monkeypatch) -> None:
    """Em serverless a chave vem por variável de ambiente, não por arquivo."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.config import get_settings

    generated = Ed25519PrivateKey.generate()
    pem = generated.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode()

    s = get_settings()
    monkeypatch.setattr(s, "cert_private_key_pem", pem)
    assert service.public_key_b64() == service.public_key_b64(generated)

    # \n literal (como o Vercel guarda variáveis multilinha) também funciona
    monkeypatch.setattr(s, "cert_private_key_pem", pem.replace("\n", "\\n"))
    assert service.public_key_b64() == service.public_key_b64(generated)

    monkeypatch.setattr(s, "cert_private_key_pem", "não é uma chave")
    with pytest.raises(ApiError):
        service.signing_key()


def test_code_normalization() -> None:
    assert service.normalize_code("abcd-efgh-jklm") == "ABCD-EFGH-JKLM"
    assert service.normalize_code("abcdefghjklm") == "ABCD-EFGH-JKLM"
    assert service.normalize_code("abcd efgh jklm") == "ABCD-EFGH-JKLM"
    assert service.normalize_code("xx") == "XX"
    assert "I" not in service.CODE_ALPHABET and "0" not in service.CODE_ALPHABET
