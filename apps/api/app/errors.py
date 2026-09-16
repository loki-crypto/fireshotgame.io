"""Envelope de erro compartilhado com o cliente: {"error": {"code", "message", "details"}}.

Os códigos são os mesmos mapeados em apps/web/src/i18n/pt-BR.json.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

MESSAGES: dict[str, str] = {
    "invalid_credentials": "E-mail ou senha incorretos.",
    "email_taken": "Já existe uma conta com este e-mail.",
    "username_taken": "Este nome de jogador já está em uso.",
    "invalid_username": "Use de 3 a 16 caracteres: letras, números, ponto, hífen ou _.",
    "terms_required": "É preciso aceitar os termos.",
    "weak_password": "A senha precisa ter pelo menos 8 caracteres.",
    "common_password": "Esta senha é muito comum ou fácil de adivinhar. Escolha outra.",
    "too_many_attempts": "Muitas tentativas de login para esta conta. Aguarde 15 minutos e tente de novo.",
    "payload_too_large": "Requisição grande demais.",
    "rate_limited": "Muitas tentativas. Aguarde um minuto e tente de novo.",
    "validation": "Verifique os campos preenchidos.",
    "session_expired": "Sua sessão expirou. Entre novamente.",
    "not_found": "Não encontrado.",
    "forbidden": "Ação não permitida.",
    "phase_locked": "Esta fase ainda está bloqueada.",
    "insufficient_bytes": "Bytes insuficientes.",
    "requirements_not_met": "Requisitos não atendidos.",
    "no_slots": "Sem slots de upgrade livres.",
    "not_eligible": "Critérios do certificado ainda não atendidos.",
    "already_issued": "Certificado já emitido.",
    "unknown": "Erro inesperado.",
}

STATUS_CODES: dict[str, int] = {
    "invalid_credentials": 401,
    "email_taken": 409,
    "username_taken": 409,
    "invalid_username": 422,
    "terms_required": 422,
    "weak_password": 422,
    "common_password": 422,
    "too_many_attempts": 429,
    "payload_too_large": 413,
    "rate_limited": 429,
    "validation": 422,
    "session_expired": 401,
    "not_found": 404,
    "forbidden": 403,
    "phase_locked": 403,
    "insufficient_bytes": 402,
    "requirements_not_met": 409,
    "no_slots": 409,
    "not_eligible": 403,
    "already_issued": 409,
    "unknown": 500,
}


class ApiError(Exception):
    def __init__(self, code: str, message: str | None = None, details: Any = None, status: int | None = None) -> None:
        self.code = code
        self.message = message or MESSAGES.get(code, MESSAGES["unknown"])
        self.details = details
        self.status = status or STATUS_CODES.get(code, 400)
        super().__init__(self.message)

    def response(self) -> JSONResponse:
        body: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            body["details"] = self.details
        return JSONResponse(status_code=self.status, content={"error": body})


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return exc.response()

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields = sorted({".".join(str(p) for p in e["loc"][1:]) for e in exc.errors()})
        return ApiError("validation", details={"fields": fields}).response()

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {401: "session_expired", 403: "forbidden", 404: "not_found", 429: "rate_limited"}.get(exc.status_code, "unknown")
        message = exc.detail if isinstance(exc.detail, str) and exc.status_code not in (401, 403, 404) else MESSAGES[code]
        return ApiError(code, message=message, status=exc.status_code).response()
