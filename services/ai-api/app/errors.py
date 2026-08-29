"""오류 형상 — 계약 v0.1 「오류 = {"error": {"code","message"}} + HTTP 4xx/5xx」.

🔴 골격 단계의 라우트는 «그럴듯한 가짜 응답»을 만들지 않는다. 계약이 약속한 응답 형상은
   OpenAPI 로 드러내되, 호출하면 `501` + 이 오류 형상으로 「아직 없다」고 답한다.
   근거 없이 필드를 채우는 쪽이 계약 README 원칙2(붙일 근거가 없으면 내보내지 않는다)를
   어긴다 — 화면이 없는 데이터를 그린 채로 통합되면 그게 제일 늦게 발견된다.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("fkt.errors")


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


class DependencyUnavailable(StarletteHTTPException):
    """의존(PostgreSQL·Neo4j)에 닿지 못했다 — «서비스 결함»과 구분되는 사건이다.

    🔴 `which` 만 밝히고 예외 문자열은 응답에 싣지 않는다. 드라이버 메시지에는 호스트·포트·
       계정 같은 접속 정보가 섞여 나올 수 있고, 이 서비스는 인증 없는 공개 Sandbox 다
       (baseline §34.6 공개 경계). 상세는 로그에만 남긴다.
    """

    def __init__(self, which: str) -> None:
        super().__init__(
            status_code=503,
            detail={
                "code": "dependency_unavailable",
                "message": f"{which} 에 연결할 수 없다 — 잠시 후 다시 시도하라",
            },
        )


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

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        """🔴 계약 밖 응답이 새어 나가는 마지막 구멍을 막는다.

        여기가 없으면 미포착 예외는 ASGI 서버의 기본 500(`text/plain` «Internal Server
        Error»)으로 나간다 — 계약이 약속한 `{"error":{...}}` JSON 이 아니다. 소비자는
        「어떤 오류든 이 형상」을 전제로 파싱하므로, 하필 «의존이 죽은» 순간에만 형상이
        달라지면 화면은 그 순간을 오류로도 인식하지 못한다(V-2 · 검증 적발).

        🔴 `message` 는 고정 문구다. 예외 문자열·traceback·파일 경로는 응답에 싣지 않는다 —
           인증 없는 공개 Sandbox 이므로 내부 구조가 그대로 밖으로 나간다(§34.6).
           진단에 필요한 전문은 `log.exception` 으로 서버 로그에만 남는다.
        """
        log.exception("처리되지 않은 예외 %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error=ErrorBody(
                    code="internal_error", message="요청 처리 중 내부 오류가 발생했다"
                )
            ).model_dump(),
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
