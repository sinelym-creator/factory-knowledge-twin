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

import re
import time
from typing import Any

from fastapi import HTTPException

from ..probes import Resources
from ..schemas import CompareRequest, CompareResult
from . import allowlist, graphrag, hybrid, vector
from .embedding import MODEL_ID, EmbeddingMismatch, embed_query, ensure_ready

# sessionId 는 형식만 본다 — 세션 저장소와 결합하지 않는다(오케 판정 08-30 ④-1 · 원장 Q-18).
# 🔴 「형식이 맞다」는 「그 세션이 있다」가 아니다. 이 티켓은 격리를 «주장하지 않는다».
_SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


async def compare(res: Resources, body: CompareRequest) -> list[CompareResult]:
    if not _SESSION_RE.match(body.sessionId):
        raise _error(422, "invalid_session_id", "sessionId 형식이 아니다(영숫자·-·_ 8~64자)")

    if allowlist.resolve(body.question) is None:
        # 🔴 비슷한 승인 질문으로 «조용히» 바꾸지 않는다(판정 08-30 ④-2 ⓐ).
        raise _error(
            400,
            "question_not_approved",
            "승인 시나리오 질문 목록에 없는 질문이다 — 목록 내 질문을 그대로 보내라",
        )

    pool = res.pg_pool
    if pool is None:
        raise _error(503, "dependency_unavailable", f"postgres 없음: {res.notes.get('postgres', '')}")
    driver = res.neo4j_driver
    if "graphrag" in body.strategies and driver is None:
        raise _error(503, "dependency_unavailable", f"neo4j 없음: {res.notes.get('neo4j', '')}")

    # --- 측정 «전»: 색인과 질의가 같은 공간인지 확인한다 -------------------------------
    try:
        signature = await vector.index_signature(pool)
    except LookupError as exc:
        raise _error(503, "index_unavailable", str(exc)) from exc
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
    results: list[CompareResult] = []
    for strategy in body.strategies:
        started = time.perf_counter()
        try:
            hits = await _run(strategy, pool, driver, body.question)
        except EmbeddingMismatch as exc:
            raise _error(500, "index_model_mismatch", str(exc)) from exc
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
