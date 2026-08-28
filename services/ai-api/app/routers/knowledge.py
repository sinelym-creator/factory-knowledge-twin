"""계약 v0.1 §근거·그래프(Evidence) · §검색 전략 비교."""

from __future__ import annotations

from fastapi import APIRouter, Query

from ..errors import NOT_IMPLEMENTED, NotImplementedRoute
from ..schemas import CompareRequest, CompareResult

router = APIRouter(tags=["knowledge"])


@router.get("/evidence/{evidenceId}", responses=NOT_IMPLEMENTED)
async def evidence(evidenceId: str) -> None:
    """kind별 실체 — doc-chunk(원문 + 강조 offset + `revisionId`·`contentHash`·`stale`·
    `approvalState`·`effectiveFrom`/`effectiveTo`) · graph-path · record · sensor-series.

    신뢰 배지(검증 F-4)와 인용 유효 조건(T0-6 §3.3)이 이 응답에 걸려 있다. kind 별 실체
    형상은 계약이 서술로만 두었으므로 모델을 만들지 않는다.
    """
    raise NotImplementedRoute("GET /evidence/{evidenceId}", "evidence 저장소 + 계약의 kind별 형상 확정")


@router.get("/graph/paths", responses=NOT_IMPLEMENTED)
async def graph_paths(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    byRun: str | None = None,
) -> None:
    """그래프 경로(노드·엣지·라벨).

    🔴 계약은 «고정 template 조회만» 허용한다. 임의 Cypher 를 받는 파라미터는 계약에
       존재하지 않으며, 추가 시도는 Stop 조건이다(계약 README 원칙3 · baseline §16.2).
    """
    raise NotImplementedRoute("GET /graph/paths", "그래프 조회 계층(고정 template)")


@router.get("/documents/{docId}", responses=NOT_IMPLEMENTED)
async def document_preview(docId: str, highlight: str | None = None) -> None:
    """문서 미리보기 + 인용 문장 강조 좌표 + revision 신뢰 필드(F-4 · T0-6 §3.3)."""
    raise NotImplementedRoute("GET /documents/{docId}", "문서·색인 조회 계층")


@router.post("/retrieval/compare", response_model=list[CompareResult], responses=NOT_IMPLEMENTED)
async def compare_strategies(body: CompareRequest) -> list[CompareResult]:
    """전략별 `[{ strategy, hits, elapsedMs }]`.

    🔴 `elapsedMs` 는 이 실행 1회의 관측치다. 화면은 이것을 벤치마크로 표시하지 않는다
       (baseline §0.2 측정-주장 경계 · wireframes ⑤ 각주).
    """
    raise NotImplementedRoute("POST /retrieval/compare", "retrieval 3전략 구현")
