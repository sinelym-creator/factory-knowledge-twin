"""계약 v0.1 §근거·그래프(Evidence) · §검색 전략 비교."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from ..errors import NOT_IMPLEMENTED, DependencyUnavailable, NotImplementedRoute
from ..reading import documents as document_reader
from ..reading import evidence as evidence_reader
from ..retrieval.service import compare
from ..schemas import CompareRequest, CompareResult, DocumentPreview, EvidenceResponse

router = APIRouter(tags=["knowledge"])


def _pool(request: Request) -> Any:
    pool = request.app.state.resources.pg_pool
    if pool is None:
        raise DependencyUnavailable("postgres")
    return pool


def _not_found(what: str, ident: str) -> HTTPException:
    """🔴 「없다」를 «빈 응답»으로 말하지 않는다 — 없는 것과 비어 있는 것은 다른 사건이다."""
    return HTTPException(
        status_code=404,
        detail={"code": "not_found", "message": f"{what} {ident} 를 찾을 수 없다"},
    )


@router.get("/evidence/{evidenceId}", response_model=EvidenceResponse)
async def evidence(evidenceId: str, request: Request) -> EvidenceResponse:
    """kind별 실체 — `doc-chunk` · `record` (계약 v0.1.1 append · T2-2 해제).

    신뢰 배지(검증 F-4)와 인용 유효 조건(T0-6 §3.3)이 이 응답에 걸려 있다. 🔴 조회는
    인용 유효 조건으로 **거르지 않는다** — 인용할 수 없는 revision 인지를 화면이 보려면
    그 revision 도 열려야 한다. 거르는 것은 검색(T2-1)의 몫이고, 여기는 «보여 주고
    표시하는» 자리다.

    kind `graph-path`·`sensor-series` 는 T2-2 범위 밖이다(계약 v0.1.1 · compare 가 해당
    evidenceId 를 만들지 않는다).
    """
    pool = _pool(request)
    found = await evidence_reader.fetch(pool, evidenceId)
    if found is None:
        raise _not_found("evidence", evidenceId)
    return found


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


@router.get("/documents/{docId}", response_model=DocumentPreview)
async def document_preview(
    docId: str, request: Request, highlight: str | None = None
) -> DocumentPreview:
    """문서 미리보기 + 인용 문장 강조 좌표 + revision 신뢰 필드(F-4 · T0-6 §3.3).

    `highlight` 가 있으면 **그 chunk 의 revision** 을 편다 — 인용은 특정 revision 의 문장이라
    현행본 위에 옛 좌표를 찍으면 엉뚱한 자리를 강조한다.
    """
    pool = _pool(request)
    try:
        found = await document_reader.fetch(pool, docId, highlight)
    except document_reader.HighlightMismatch as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "highlight_mismatch",
                "message": f"highlight={highlight} 는 문서 {docId} 의 chunk 가 아니다",
            },
        ) from exc
    if found is None:
        raise _not_found("document", docId)
    return found


@router.post("/retrieval/compare", response_model=list[CompareResult])
async def compare_strategies(body: CompareRequest, request: Request) -> list[CompareResult]:
    """전략별 `[{ strategy, hits, elapsedMs }]` — vector·hybrid·graphrag (T2-1 해제).

    🔴 `elapsedMs` 는 이 실행 1회의 관측치다. 화면은 이것을 벤치마크로 표시하지 않는다
       (baseline §0.2 측정-주장 경계 · wireframes ⑤ 각주).
    🔴 `score` 는 «전략 내 서수»다 — 전략마다 산출 방식이 달라(코사인 / RRF / 경로 길이)
       전략 «사이»의 크기 비교는 뜻이 없다(오케 판정 08-30 ③-2 · 원장 Q-17).
    """
    return await compare(request.app.state.resources, body)
