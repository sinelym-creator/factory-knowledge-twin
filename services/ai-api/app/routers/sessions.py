"""계약 v0.1 §세션 — 격리·리셋 (T3-1 실체화).

무엇이 «있는가»: 세션 발급(쿠키 병행)과 자기 세션 초기화. 여기서 발급된 id 가 이 서비스의
유일한 격리 단위이며, 가드(`app/session_guard.py`)와 소유권(`app/ownership.py`)이 그 위에 선다.

무엇이 «없는가», 그리고 왜:
- **내구성이 없다.** 저장소는 프로세스 안이고 재기동하면 세션이 사라진다 — 그 사실을 401 로
  정직하게 말한다(`session_store.py` 머리말). 「세션이 유지된다」는 주장은 실측된 적이 없다.
- **인증이 없다.** 계약이 그렇게 정했다(공개 Sandbox). 세션 id 는 자격이 아니라 격리 라벨이고,
  그래서 이 파일은 그것을 «비밀»로 다루지 않는다 — 다만 소유권 은닉(404)이 성립하도록
  추측하기 어려운 길이로 발급한다.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Request, Response

from ..errors import ErrorResponse, contract_error
from ..ownership import current_session
from ..schemas import OkResponse, SessionCreated
from ..session_store import SESSION_COOKIE, SESSION_TTL_SEC, SessionStore

log = logging.getLogger("fkt.routers.session")

router = APIRouter(tags=["session"])

_RESET_ERRORS: dict[int | str, dict[str, object]] = {
    404: {
        "model": ErrorResponse,
        "description": "`not_found` — 자기 세션이 아니다(타 세션은 존재를 숨긴다)",
    }
}


def _store(request: Request) -> SessionStore:
    return request.app.state.session_store


@router.post("/sessions", response_model=SessionCreated)
async def create_session(request: Request, response: Response) -> SessionCreated:
    """세션 생성 — 계약 `{ sessionId }`(쿠키 병행). 세션 키가 격리 단위다(인증 없음).

    🔴 **쿠키 이름의 정본은 `session_store.SESSION_COOKIE` 한 곳**이다. 셸은 이 이름을 자기
       코드에 적지 않고 이 응답의 `Set-Cookie` 를 그대로 전달한다 — 두 곳에 적으면 한쪽만
       자란다(계약 v0.1.5 가 「옮겨 적은 표」로 값을 치른 자리).

    🔴 `Secure` 는 **이 요청이 https 로 왔을 때만** 단다. 상수로 켜면 로컬 http 개발에서
       브라우저가 쿠키를 버려 「세션이 안 잡힌다」가 되고, 상수로 끄면 배포에서 평문에 실린다.
       요청 스킴을 보고 정하면 두 환경 모두에서 참이다.
    """
    record = _store(request).create()
    response.set_cookie(
        SESSION_COOKIE,
        record.sessionId,
        max_age=int(SESSION_TTL_SEC),
        path="/",
        httponly=True,          # 계약 v0.1.6 「HttpOnly 쿠키 병행」
        samesite="lax",
        secure=request.url.scheme == "https",
    )
    return SessionCreated(sessionId=record.sessionId)


@router.post("/sessions/{sid}/reset", response_model=OkResponse, responses=_RESET_ERRORS)
async def reset_session(sid: str, request: Request) -> OkResponse:
    """해당 세션 상태«만» 초기화 — 계약 `{ ok: true }`.

    🔴 **자기 세션만**(계약 v0.1.6). 타 세션은 `404` 다 — 「그 세션은 있지만 네 것이 아니다」로
       답하면 남의 세션 존재가 새어 나간다(`app/ownership.py` 와 같은 축).

    🔴 **초기화 범위 = 그 세션의 run·초안·이력 «만»**. SSOT(PostgreSQL·Neo4j)에는 손대지
       않는다 — 애초에 이 서비스는 조사 산출을 DB 에 쓰지 않는다(계약 v0.1.4 저장 축 해석).
       「무접촉」은 주장이 아니라 실측 대상이다: `tools/session_reset_probe.py` 가 리셋 전후
       SSOT 지문을 재서 같은지 본다.

    🔴 세션 자체는 살아 있다. reset 은 «비우기»지 «퇴장»이 아니다 — 리셋 뒤에도 같은 쿠키로
       계속 쓰는 것이 화면의 동작이고(⟲ 버튼), 여기서 세션을 지우면 그 다음 요청이 전부 401 이 된다.
    """
    if sid != current_session(request):
        raise contract_error(404, "not_found", f"세션 {sid} 를 찾을 수 없다")

    dropped_runs = request.app.state.run_store.drop_session(sid)
    dropped_audits = request.app.state.approval_store.drop_session(sid)
    # 🔴 버린 «개수»를 응답에 싣지 않는다 — 계약은 `{ ok: true }` 다. 몇 개가 있었는지는
    #    운영자가 로그에서 보는 사실이지 호출자에게 약속한 형상이 아니다.
    log.info("세션 리셋 — run %d · 승인 이력 %d 를 버렸다", dropped_runs, dropped_audits)
    return OkResponse()
