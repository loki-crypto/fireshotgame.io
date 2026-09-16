"""/certificates — elegibilidade, emissão, PDF — e a verificação pública /verify."""

from __future__ import annotations

from fastapi import APIRouter, Response, status

from ..deps import Ct, CurrentUser, Db
from ..errors import ApiError
from ..schemas import CertificateIn
from ..services import certificates as service
from ..services.certificate_pdf import render_pdf

router = APIRouter(tags=["certificado"])


@router.get("/certificates/eligibility")
async def eligibility(db: Db, user: CurrentUser, content: Ct) -> dict:
    status_ = await service.eligibility(db, user, content)
    return {k: v for k, v in status_.items() if k != "modules"}


@router.post("/certificates", status_code=status.HTTP_201_CREATED)
async def issue(body: CertificateIn, db: Db, user: CurrentUser, content: Ct) -> dict:
    return await service.issue(db, user, content, full_name=body.fullName, accept_terms=body.acceptTerms)


@router.get("/certificates/{code}.pdf")
async def pdf(code: str, db: Db, user: CurrentUser) -> Response:
    cert = await service.by_code(db, code)
    if cert is None or cert.user_id != user.id:
        raise ApiError("not_found")
    filename = f"certificado-fireshot-{cert.code}.pdf"
    return Response(
        content=render_pdf(cert),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.get("/verify/{code}")
async def verify(code: str, db: Db) -> dict:
    return await service.verify(db, code)


public_router = APIRouter(tags=["certificado"])


@public_router.get("/.well-known/certificate-public-key")
async def public_key() -> Response:
    return Response(content=service.public_key_pem(), media_type="application/x-pem-file")
