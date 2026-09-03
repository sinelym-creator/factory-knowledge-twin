"""오류 형상 — 계약 v0.1 「오류 = {"error": {"code","message"}} + HTTP 4xx/5xx」.

🔴 골격 단계의 라우트는 «그럴듯한 가짜 응답»을 만들지 않는다. 계약이 약속한 응답 형상은
   OpenAPI 로 드러내되, 호출하면 `501` + 이 오류 형상으로 「아직 없다」고 답한다.
   근거 없이 필드를 채우는 쪽이 계약 README 원칙2(붙일 근거가 없으면 내보내지 않는다)를
   어긴다 — 화면이 없는 데이터를 그린 채로 통합되면 그게 제일 늦게 발견된다.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

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


def contract_error(status: int, code: str, message: str) -> StarletteHTTPException:
    """계약 오류 형상을 실은 예외 하나 — 사유 코드가 필요한 모든 라우트의 «정본 자리».

    🔴 지금 리포에 같은 3줄이 두 벌 더 있다(`routers/investigations.py`·`retrieval/service.py`).
       세 번째 사본을 만들지 않으려고 여기 둔다 — 이 파일이 이미 「잊을 수 있는 자리를
       없앤다」로 값을 치른 자리다(위 `DEPENDENCY_ERRORS` 성문 · V-7). 기존 두 벌을 여기로
       모으는 것은 그 라우터를 건드리는 일이라 이번 티켓 밖이다: **방향만 세우고 남긴다.**
    """
    return StarletteHTTPException(status_code=status, detail={"code": code, "message": message})


def contract_json_response(
    status: int,
    code: str,
    message: str,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    """계약 오류 envelope 을 «미들웨어에서» 직접 내보낸다 (T4-2b).

    🔴 **왜 raise 가 아니라 응답인가.** Starlette 의 미들웨어 스택에서 사용자 미들웨어는
       `ExceptionMiddleware` 보다 «바깥»에 있다 — 거기서 `HTTPException` 을 raise 하면
       계약 형상으로 바꿔 주는 핸들러(`install_error_handlers`)를 지나지 못하고
       `ServerErrorMiddleware` 의 500 이 된다. 보호장치가 «자기 응답 형상을 깨는» 형태다.

    🔴 **그래서 형상 조립은 이 한 함수만 한다.** 미들웨어(429·413 선검사)와 예외 핸들러가
       각자 dict 를 쓰면 같은 사실이 표면마다 달라진다 — 소비자는 「어떤 오류든 이 형상」을
       전제로 파싱하는데, 하필 «보호장치가 발동한» 순간에만 형상이 다르면 화면은 그 순간을
       오류로도 인식하지 못한다(V-2 계보).
    """
    return JSONResponse(
        status_code=status,
        content=ErrorResponse(error=ErrorBody(code=code, message=message)).model_dump(),
        headers=headers,
    )


class PayloadTooLarge(StarletteHTTPException):
    """요청 본문이 상한을 넘었다 — 계약 v0.1.9 `413 payload_too_large`.

    🔴 이 예외는 **본문을 읽는 도중**(라우트 핸들러 안쪽)에서 던져진다. 그 자리는 앱 «안»이라
       `install_error_handlers` 가 잡아 계약 형상으로 바꾼다. 미들웨어의 `Content-Length`
       선검사는 앱 밖이라 같은 형상을 `contract_json_response` 로 «직접» 낸다 — 두 경로가
       한 함수를 지나므로 형상이 갈리지 않는다.
    """

    def __init__(self, limit: int) -> None:
        super().__init__(
            status_code=413,
            detail={
                "code": "payload_too_large",
                "message": f"요청 본문이 상한({limit} 바이트)을 넘었다",
            },
        )


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


class LiveCapacityExhausted(StarletteHTTPException):
    """동시 실행 슬롯과 대기열이 «둘 다» 찼다 — 계약 v0.1.9 `503 live_capacity_exhausted`.

    🔴 `Retry-After` 는 계약이 «필수»로 적은 헤더다. 숫자 없이 「나중에」라고만 말하면 화면과
       클라이언트는 각자 다른 간격으로 다시 두드리고, 그 폭주가 이미 찬 자리를 더 조인다.
    🔴 `message` 에 Replay 안내를 담는다 — 거절만 하고 다음 수를 안 주면 방문자는 빈 화면에
       선다(§6.2). 🔴 다만 화면이 «분기»하는 것은 `code` 다: 문구는 구현의 것이고 바뀔 수 있다.
    """

    def __init__(self, retry_after_sec: int) -> None:
        super().__init__(
            status_code=503,
            detail={
                "code": "live_capacity_exhausted",
                "message": (
                    "지금은 Live 조사를 시작할 자리가 없다 — 잠시 후 다시 시도하거나 "
                    "Replay 로 같은 조사를 볼 수 있다"
                ),
            },
            headers={"Retry-After": str(retry_after_sec)},
        )


class SessionRunCapExceeded(StarletteHTTPException):
    """세션 단위 조사 실행 상한 — 계약 v0.1.12 `429 session_run_cap_exceeded`.

    🔴 `rate_limited`(분당 · 폭주 방지)와 **다른 code** 다. 화면이 이 둘을 가르지 못하면
       「잠시 후 다시」와 「이 시간은 재생으로 계속」이 같은 배너가 되고, 방문자는 60초 뒤에
       다시 눌러 또 막힌다.
    🔴 오류 형상은 `{error:{code,message}}` **그대로**다 — 본문에 `fallback` 같은 필드를
       더하지 않는다(계약 11행 · 형상을 넓히는 것은 계약 개정이지 구현 판단이 아니다).
       화면의 replay 강등은 `code` 분기로 한다.
    """

    def __init__(self, retry_after_sec: int, limit: int) -> None:
        super().__init__(
            status_code=429,
            detail={
                "code": "session_run_cap_exceeded",
                "message": (
                    f"세션 조사 상한({limit}/시간) · 녹화 재생으로 계속"
                ),
            },
            headers={"Retry-After": str(retry_after_sec)},
        )


# 🔴 「의존이 죽었다」와 「우리 코드가 틀렸다」는 다른 사건이라 코드가 달라야 한다(V-2).
#    이 목록과 아래 `dependency_guard` 가 **그 변환의 유일한 정의**다(V-7 정정 · 「1곳 수렴」).
#    전에는 compare 만 자기 안에 이 목록을 갖고 있었고, 나중에 열린 읽기 라우트에는 그 자리가
#    없어 같은 단절이 500(`internal_error`)으로 나갔다 — 한 사건에 두 판정이 나온 것이다.
#    새 라우트가 열릴 때 «변환을 잊는» 것이 결함의 형태였으므로, 잊을 수 있는 자리를 없앤다.
DEPENDENCY_ERRORS: tuple[type[BaseException], ...] = (OSError, ConnectionError)
try:                                                  # pragma: no cover - 설치 환경에 따라 다름
    import asyncpg

    DEPENDENCY_ERRORS += (asyncpg.PostgresError,)
except Exception:                                     # noqa: BLE001
    pass
try:                                                  # pragma: no cover
    from neo4j.exceptions import DriverError, Neo4jError

    DEPENDENCY_ERRORS += (DriverError, Neo4jError)
except Exception:                                     # noqa: BLE001
    pass


@asynccontextmanager
async def dependency_guard(which: str) -> AsyncIterator[None]:
    """블록 안에서 난 «의존 단절»을 503 `dependency_unavailable` 로 바꾼다.

    🔴 예외 «내용»은 로그에만 남긴다. 드라이버 메시지에는 호스트·포트·계정이 섞여 나올 수
       있고 이 서비스는 인증 없는 공개 Sandbox 다(`DependencyUnavailable` 성문과 같은 이유).

    🔴 여기서 잡는 것은 **의존 예외뿐**이다. 그 밖의 예외는 그대로 위로 흘려 전역 500 이
       되게 둔다 — 우리 코드의 결함을 「잠시 후 다시 시도하라」로 접으면 그 결함은 영영
       발견되지 않는다.
    """
    try:
        yield
    except DEPENDENCY_ERRORS as exc:
        log.warning("%s 단절 — %s", which, exc.__class__.__name__)
        raise DependencyUnavailable(which) from exc


class CitationIntegrityBroken(RuntimeError):
    """인용 좌표를 원문에서 되찾지 못했다 — 색인↔원문 정합이 깨졌다.

    🔴 **호출자 잘못이 아니다**(오케 판정 08-30). 요청 좌표는 옳고, chunk 텍스트가 그
       revision 의 body 안에 없다는 뜻이다. 400 으로 접으면 서버의 정합 문제를 호출자 탓으로
       돌리게 되고, 200 + 무강조로 접으면 「사유 없는 200」 — 조용한 null 의 상위형이 된다.

    🔴 이 벽이 필요한 이유는 **배지가 이 파열을 못 보기 때문이다**(검증 실측 I-05): 신선도는
       `source_sha256 ↔ content_sha256` 축만 보므로 chunk 수준 drift 에는 `FRESH` 라고
       답한다. 배지가 조용한 자리에서는 응답 자체가 말해야 한다.

    🔴 이 예외는 **어느 라우트에서 나오든** 아래 `install_error_handlers` 가 같은 코드로
       바꾼다. 라우트마다 잡기로 하면 새 인용 소비처가 생길 때 «잡기를 잊는» 자리가 다시
       생긴다 — V-7 이 바로 그 형태의 결함이었다(잊을 자리를 없앤다).
    """


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

    @app.exception_handler(CitationIntegrityBroken)
    async def _citation_integrity(_: Request, exc: CitationIntegrityBroken) -> JSONResponse:
        """인용 정합 파열 — 계약 오류 형상 그대로 5xx + 구분 코드(오케 판정 08-30).

        🔴 상세(어느 revision·어느 chunk)는 **로그에만**. 인증 없는 공개 Sandbox 라 응답에
           내부 식별자를 실으면 그대로 밖으로 나간다(§34.6 · V-2 규율).
        🔴 `internal_error` 와 코드를 나누는 이유: 화면·모니터가 「우리 코드가 터졌다」와
           「인용 자산이 어긋났다」를 다르게 다뤄야 한다. 후자는 재색인이 처방이다.
        """
        log.error("인용 정합 파열 — 강조 좌표를 되찾지 못했다: %s", exc)
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(
                error=ErrorBody(
                    code="citation_integrity_broken",
                    message="인용 좌표를 원문에서 되찾지 못했다 — 색인과 원문이 어긋나 있다",
                )
            ).model_dump(),
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
