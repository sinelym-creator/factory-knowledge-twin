"""compare 실행 — 계약 v0.1 `POST /retrieval/compare` 의 본체 (T2-1).

읽는 순서: 게이트(질문 allowlist · sessionId 형식 · 의존 · 색인 정합) → 전략별 «독립» 실행.

🔴 전략 간 폴백 없음. 한 전략이 실행될 수 없으면 그 사실을 오류로 말하고, 다른 전략의
   결과로 그 칸을 채우지 않는다. 채우면 화면의 「전략 비교」는 비교가 아니게 된다.

🔴 `elapsedMs` 는 «그 전략 1회»의 관측치다(계약 각주 · baseline §0.2). 그래서 측정 구간
   밖에서 미리 끝내는 것과 안에서 재는 것을 분명히 나눈다:
     - 밖(측정 전): 임베딩 모델 로드 · 색인 지문 대조 — 전략의 비용이 아니라 준비 비용이다.
     - 안: 질의 임베딩 encode · DB/그래프 왕복 — 매 실행 실제로 드는 비용이다.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import HTTPException

from .. import session_id
from ..errors import DEPENDENCY_ERRORS, DependencyUnavailable
from ..probes import Resources
from ..schemas import CompareRequest, CompareResult
from ..settings import get_settings
from . import allowlist, graphrag, hybrid, vector
from .embedding import MODEL_ID, EmbeddingMismatch, embed_query, ensure_ready

# sessionId 는 형식만 본다 — 세션 저장소와 결합하지 않는다(오케 판정 08-30 ④-1 · 원장 Q-18).
# 🔴 「형식이 맞다」는 「그 세션이 있다」가 아니다. 이 티켓은 격리를 «주장하지 않는다».
log = logging.getLogger("fkt.retrieval")

# 규칙 정의는 `app/session_id.py` 한 곳이다 — 조사 실행(T2-3)도 같은 것을 본다.
# 두 곳에 적으면 화면이 한쪽에서 통과한 키로 다른 쪽에서 거절당한다.
_SESSION_RE = session_id.SESSION_ID_RE

# 🔴 「의존이 죽었다」와 「우리 코드가 틀렸다」는 다른 사건이라 코드가 달라야 한다(V-2).
#    목록의 정의는 `app/errors.py` 한 곳이다 — 전에는 이 파일이 자기 목록을 갖고 있었고,
#    나중에 열린 읽기 라우트에는 같은 변환이 없어 같은 단절이 500 으로 나갔다(V-7).
#    여기서는 이름만 빌려 온다: 목록이 자라면 세 라우트가 함께 자란다.
_DEPENDENCY_ERRORS = DEPENDENCY_ERRORS


def _dependency_of(strategy: str) -> str:
    """그 전략이 기대는 의존. graphrag 만 그래프를 쓴다."""
    return "neo4j" if strategy == "graphrag" else "postgres"


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


async def compare(res: Resources, body: CompareRequest) -> list[CompareResult]:
    if not _SESSION_RE.match(body.sessionId):
        raise _error(422, "invalid_session_id", "sessionId 형식이 아니다(영숫자·-·_ 8~64자)")

    # 🔴 **길이 상한이 allowlist 대조 «앞»이다**(계약 v0.1.9 ⓓ). 순서가 뒤면 상한을 훌쩍 넘는
    #    문자열이 먼저 정규화·해시를 지나고, 그 비용은 「승인 목록에 없다」로 끝날 요청이
    #    이미 다 쓴 뒤다. 형식 위반(422)은 내용 판정(400)보다 먼저 답하는 것이 맞다.
    #    🔴 바이트 축(413)은 이보다 더 앞, 미들웨어에 있다 — 두 축이 겹치면 413 이 먼저다.
    limit = get_settings().max_question_chars
    if len(body.question) > limit:
        raise _error(
            422,
            "question_too_long",
            f"질문이 상한({limit}자)을 넘었다",
        )

    qid = allowlist.resolve(body.question)
    if qid is None:
        # 🔴 비슷한 승인 질문으로 «조용히» 바꾸지 않는다(판정 08-30 ④-2 ⓐ).
        raise _error(
            400,
            "question_not_approved",
            "승인 시나리오 질문 목록에 없는 질문이다 — 목록 내 질문을 그대로 보내라",
        )

    # 🔴 이유 문자열(`res.notes`)을 응답에 싣지 않는다 — 드라이버 메시지에 호스트·계정이
    #    섞여 나올 수 있고 이 서비스는 인증 없는 공개 Sandbox 다(§34.6). 진단은 /health 가
    #    맡는다(그쪽은 운영 창구이며 같은 정보를 이미 구조화해 준다).
    pool = res.pg_pool
    if pool is None:
        raise DependencyUnavailable("postgres")
    driver = res.neo4j_driver
    if "graphrag" in body.strategies and driver is None:
        raise DependencyUnavailable("neo4j")

    # --- 측정 «전»: 색인과 질의가 같은 공간인지 확인한다 -------------------------------
    try:
        signature = await vector.index_signature(pool)
    except LookupError as exc:
        raise _error(503, "index_unavailable", str(exc)) from exc
    except _DEPENDENCY_ERRORS as exc:
        log.warning("색인 지문 조회 중 postgres 단절: %s", exc.__class__.__name__)
        raise DependencyUnavailable("postgres") from exc
    if signature.model != MODEL_ID:
        # 티켓 T2-1 단계 2: 「색인과 동일 모델·차원(어긋나면 즉시 보고)」.
        raise _error(
            500,
            "index_model_mismatch",
            f"색인 모델 {signature.model} ≠ 질의 모델 {MODEL_ID} — 같은 공간이 아니다",
        )
    try:
        await ensure_ready(signature.dim)
    except EmbeddingMismatch as exc:
        raise _error(500, "index_model_mismatch", str(exc)) from exc

    # --- 측정 «안»: 요청한 전략을 요청 순서대로, 하나씩 -------------------------------
    # 🔴 하류는 «표준 표기» 하나만 본다 — 승인된 같은 질문이 표기 때문에 다른 결과를 내지
    #    않게 한다(V-1 계보 · `allowlist.canonical` 성문).
    question = allowlist.canonical(qid)

    results: list[CompareResult] = []
    for strategy in body.strategies:
        started = time.perf_counter()
        try:
            hits = await _run(strategy, pool, driver, question)
        except EmbeddingMismatch as exc:
            raise _error(500, "index_model_mismatch", str(exc)) from exc
        except _DEPENDENCY_ERRORS as exc:
            which = _dependency_of(strategy)
            # 예외 «내용»은 로그에만. 응답에는 어느 의존인지만 나간다.
            log.warning("%s 전략 실행 중 %s 단절: %s", strategy, which, exc.__class__.__name__)
            raise DependencyUnavailable(which) from exc
        results.append(
            CompareResult(
                strategy=strategy,
                hits=hits,
                elapsedMs=int((time.perf_counter() - started) * 1000),
            )
        )
    return results


async def _run(strategy: str, pool: Any, driver: Any, question: str) -> list[Any]:
    if strategy == "vector":
        return await vector.search(pool, await embed_query(question))
    if strategy == "hybrid":
        return await hybrid.search(pool, question)
    if strategy == "graphrag":
        return await graphrag.search(driver, question)
    raise _error(422, "invalid_request", f"알 수 없는 전략: {strategy}")   # 계약이 막지만 이중 방어
