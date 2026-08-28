"""오류 형상 — 계약 v0.1 「오류 = {"error": {"code","message"}} + HTTP 4xx/5xx」.

🔴 골격 단계의 라우트는 «그럴듯한 가짜 응답»을 만들지 않는다. 계약이 약속한 응답 형상은
   OpenAPI 로 드러내되, 호출하면 `501` + 이 오류 형상으로 「아직 없다」고 답한다.
   근거 없이 필드를 채우는 쪽이 계약 README 원칙2(붙일 근거가 없으면 내보내지 않는다)를
   어긴다 — 화면이 없는 데이터를 그린 채로 통합되면 그게 제일 늦게 발견된다.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException


class ErrorBody(BaseModel):
    code: str = Field(description="기계가 분기하는 코드")
    message: str = Field(description="사람이 읽는 설명")


class ErrorResponse(BaseModel):
    """계약 v0.1 오류 envelope."""

    error: ErrorBody


NOT_IMPLEMENTED = {
    501: {
        "model": ErrorResponse,
        "description": "골격 — 계약 표면만 존재하고 구현은 아직 없다(T1-8).",
    }
}


class NotImplementedRoute(StarletteHTTPException):
    """계약에 있으나 아직 구현이 없는 라우트."""

    def __init__(self, route: str, needs: str) -> None:
        super().__init__(
            status_code=501,
            detail={
                "code": "not_implemented",
                "message": f"{route} 는 계약 v0.1 표면으로만 존재한다(T1-8 골격). 필요한 것: {needs}",
            },
        )


def install_error_handlers(app: FastAPI) -> None:
    """HTTPException 을 계약 오류 형상으로 바꿔 내보낸다.

    FastAPI 기본은 `{"detail": ...}` 라서, 손대지 않으면 서비스가 계약과 다른 오류를 말한다.
    """

    @app.exception_handler(StarletteHTTPException)
    async def _contract_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, dict) and {"code", "message"} <= set(detail):
            body = ErrorBody(code=str(detail["code"]), message=str(detail["message"]))
        else:
            body = ErrorBody(code=f"http_{exc.status_code}", message=str(detail))
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(error=body).model_dump(),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        """요청 검증 실패도 4xx 다 — 계약이 정한 오류 형상은 여기에도 적용된다.

        FastAPI 기본 422 는 `{"detail": [...]}` 라서, 두면 이 서비스가 오류를 두 가지
        형상으로 말하게 된다. 어느 필드가 문제인지는 message 안에 담는다.
        """
        first = exc.errors()[0] if exc.errors() else {}
        where = ".".join(str(p) for p in first.get("loc", ())) or "request"
        return JSONResponse(
            status_code=422,
            content=ErrorResponse(
                error=ErrorBody(
                    code="invalid_request",
                    message=f"{where}: {first.get('msg', '요청 형식이 계약과 맞지 않는다')}",
                )
            ).model_dump(),
        )
