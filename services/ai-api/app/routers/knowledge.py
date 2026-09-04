"""계약 v0.1 §근거·그래프(Evidence) · §검색 전략 비교.

🔴 **의존 단절은 세 라우트가 «한 코드»로 말한다**(V-7 정정). 변환의 정의는 `app/errors.py`
   의 `dependency_guard` 한 곳이고, 여기서는 그것을 두르기만 한다 — compare 만 자기 안에
   변환을 갖고 있던 탓에 뒤늦게 열린 읽기 라우트가 같은 단절을 500 으로 말했다.
   한 사건에 두 판정이 나오면 하나는 반드시 거짓이다.

🔴 **인용 정합 파열도 여기서 잡지 않는다** — `CitationIntegrityBroken` 은 앱 전역 핸들러가
   받아 `/evidence` 와 `/documents` 에 «같은» (status, code) 를 준다(V-6 ③ 확장 정정).
   라우트마다 잡기로 하면 새 인용 소비처가 생길 때 잡기를 잊는 자리가 다시 생긴다 —
   V-7 이 정확히 그 형태였다.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request

from .. import ownership
from ..errors import (
    NOT_IMPLEMENTED,
    DependencyUnavailable,
    NotImplementedRoute,
    contract_error,
    dependency_guard,
)
from ..reading import documents as document_reader
from ..reading import evidence as evidence_reader
from ..retrieval.service import compare
from ..schemas import (
    CompareRequest,
    CompareResult,
    DocumentPreview,
    EvidenceResponse,
    GraphPathBody,
    GraphPathMeta,
)

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


#: GP 근거 id 접두 — 조사 run 이 만든다(`investigation/workflow.py` graph 단계).
_GRAPH_PATH_PREFIX = "GP-"


def _graph_path_run_id(evidence_id: str) -> str | None:
    """`GP-<runId 접미>-<idx>` 에서 runId 를 되세운다 — 형식이 아니면 None.

    🔴 접미에 `-` 가 들어갈 수 있으므로 **뒤에서** 한 번만 자른다. 앞에서 자르면 runId 가
       잘려 「없는 run」이 되고, 그 404 는 부재가 아니라 파싱 실패다.
    """
    suffix, _, index = evidence_id.removeprefix(_GRAPH_PATH_PREFIX).rpartition("-")
    if not suffix or not index.isdigit():
        return None
    return f"RUN-{suffix}"


def _graph_path_evidence(evidenceId: str, request: Request) -> EvidenceResponse:
    """run 상태의 `graphPaths` 를 근거 한 건으로 편다(D-68 · 계약 v0.1.17 append).

    🔴 **이 kind 만 세션 스코프다.** GP id 는 조사 run 이 만들고 run 상태에만 사는데,
       `/evidence` 는 세션 «읽기 예외» 라우트다(`session_guard.READ_ONLY_EXCEPTIONS`).
       그래서 세션 강제를 여기서 한다 — 무세션 401 · 타 세션 404.

    🔴 **부재와 타 세션이 같은 문장으로 나간다**(`ownership` 성문 · Q-25). 파싱 실패도
       같은 404 다: 「그런 id 형식이 아니다」를 따로 말하면 GP id 규칙이 응답으로 샌다.
    """
    if ownership.current_session(request) is None:
        # 🔴 세션 «없음»은 존재를 누설하지 않는다(모든 GP id 에 같은 401) — 그래서 404 로
        #    접지 않는다. 접으면 화면이 「로그인하라」와 「없다」를 구별하지 못한다.
        raise contract_error(
            401, "session_required", "세션이 없다 — POST /api/sessions 로 발급받아라"
        )
    run_id = _graph_path_run_id(evidenceId)
    record = ownership.find_run(request, run_id) if run_id is not None else None
    if record is not None and record.mode == "replay":
        # 🔴 재생 run 은 `GET /graph/paths?byRun=` 과 **같은 판정**을 낸다(J-G). 여기서만
        #    404 를 내면 한 사건에 두 판정이 서고, 무엇보다 «원본이 없다»를
        #    «없는 근거»로 말하게 된다 — 그 둘은 화면이 다르게 말해야 하는 다른 사건이다.
        raise HTTPException(
            status_code=501,
            detail={
                "code": "replay_path_source_absent",
                "message": (
                    f"run {run_id} 은 재생본이다 — replay fixture 는 이벤트만 담으므로 "
                    "그래프 경로 원본이 없다"
                ),
            },
        )
    path = None
    if record is not None:
        path = next(
            (p for p in record.graphPaths if p.get("evidenceId") == evidenceId), None
        )
    if path is None:
        raise _not_found("evidence", evidenceId)
    return EvidenceResponse(
        evidenceId=evidenceId,
        kind="graph-path",
        # 🔴 revision 6필드는 null · `stale` 은 false — 색인이 아니라 그 run 이 밟은 걸음
        #    자체라 「낡음」이라는 축이 없다(`record` kind 와 같은 사유).
        stale=False,
        text=str(path["excerpt"]),
        excerpt=str(path["excerpt"]),
        sourceId=str(path["targetId"]),
        score=float(path["score"]),
        meta=GraphPathBody(
            path=GraphPathMeta(
                label=str(path["label"]),
                hops=int(path["hops"]),
                nodes=[str(n) for n in path["nodes"]],
                edges=[dict(e) for e in path["edges"]],
            )
        ),
    )


@router.get("/evidence/{evidenceId}", response_model=EvidenceResponse)
async def evidence(evidenceId: str, request: Request) -> EvidenceResponse:
    """kind별 실체 — `doc-chunk` · `record` · `graph-path` (v0.1.1 · v0.1.17 append).

    신뢰 배지(검증 F-4)와 인용 유효 조건(T0-6 §3.3)이 이 응답에 걸려 있다. 🔴 조회는
    인용 유효 조건으로 **거르지 않는다** — 인용할 수 없는 revision 인지를 화면이 보려면
    그 revision 도 열려야 한다. 거르는 것은 검색(T2-1)의 몫이고, 여기는 «보여 주고
    표시하는» 자리다.

    🔴 `graph-path` 는 **DB 를 보지 않는다**(D-68). GP 근거는 postgres 에 실린 적이 없어
    이 라우트가 지금까지 구조적으로 404 를 냈다 — 화면의 「찾을 수 없음」은 정확히 그
    부재였다. 원천은 run 상태이므로 분기를 pool 획득 «앞»에 둔다: postgres 가 끊긴
    날에도 그래프 근거는 열려야 하고, 무엇보다 여기서 pool 을 먼저 잡으면 GP 조회가
    쓰지도 않는 의존에 묶인다.

    kind `sensor-series` 는 아직 범위 밖이다(compare 가 해당 evidenceId 를 만들지 않는다).
    """
    if evidenceId.startswith(_GRAPH_PATH_PREFIX):
        return _graph_path_evidence(evidenceId, request)
    pool = _pool(request)
    async with dependency_guard("postgres"):
        found = await evidence_reader.fetch(pool, evidenceId)
    if found is None:
        raise _not_found("evidence", evidenceId)
    return found


@router.get("/graph/paths", responses=NOT_IMPLEMENTED)
async def graph_paths(
    request: Request,
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = None,
    byRun: str | None = None,
) -> list[dict[str, Any]]:
    """그래프 경로(노드·엣지·라벨) — `byRun` 축 해제(T2-3 · 원장 Q-18 판정분).

    🔴 계약은 «고정 template 조회만» 허용한다. 임의 Cypher 를 받는 파라미터는 계약에
       존재하지 않으며, 추가 시도는 Stop 조건이다(계약 README 원칙3 · baseline §16.2).

    🔴 **여기서 그래프를 다시 걷지 않는다.** 조사가 실제로 밟은 경로를 그대로 낸다 — 다시
       걸으면 「화면이 보는 경로」와 「조사가 근거로 삼은 경로」가 갈릴 수 있고, 그 갈림은
       근거를 눌러 본 사람에게만 보인다. 이벤트의 `graph-path` evidenceId 가 이 응답의
       항목과 1:1로 맺힌다 — 그 결선이 이 라우트의 존재 이유다.

    `from`·`to` 축은 **아직 501 이다**: T2-3 이 만드는 소비처가 `byRun` 뿐이라, 지금 열면
    쓰는 화면 없이 그래프 조회 표면만 넓어진다(공개 경계는 좁을수록 낫다). 소비처가 생기는
    티켓에서 같은 관계 화이트리스트로 연다.
    """
    if byRun is None:
        raise NotImplementedRoute(
            "GET /graph/paths?from=&to=", "이 축의 소비 화면(T2-3 은 byRun 만 쓴다)"
        )
    # 🔴 run 을 여는 문이 여기에도 있다(T3-1 형제 세기 — `GET /runs/*` 계열 · WS · 여기).
    #    소유권을 라우트마다 적으면 셋 중 하나를 잊고, 잊은 문이 곧 Q-25 의 재발이다.
    record = ownership.run_or_404(request, byRun)
    if record.mode == "replay":
        # 🔴 재생 run 에는 경로 «원본»이 없다(T2-4 판정 J-G). fixture 는 이벤트 스트림만
        #    담고, `graphPaths` 는 이벤트 밖에 살던 값이다. 여기서 빈 배열을 200 으로 내면
        #    「fixture 부재는 시끄럽게 막으면서 경로 원본 부재는 빈 배열로 답하는」 것 —
        #    같은 병을 반만 고친 것이 된다. 이벤트의 excerpt 문자열을 파싱해 되세우는 길도
        #    있으나 그것은 재조립이고, 재조립 금지가 이 축의 상위 규율이다(J-C).
        raise HTTPException(
            status_code=501,
            detail={
                "code": "replay_path_source_absent",
                "message": (
                    f"run {byRun} 은 재생본이다 — replay fixture 는 이벤트만 담으므로 "
                    "그래프 경로 원본이 없다"
                ),
            },
        )
    return record.graphPaths


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
        async with dependency_guard("postgres"):
            found = await document_reader.fetch(pool, docId, highlight)
    except document_reader.HighlightMismatch as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "highlight_mismatch",
                "message": f"highlight={highlight} 는 문서 {docId} 의 chunk 가 아니다",
            },
        ) from exc
    except document_reader.HighlightNotFound as exc:
        # 🔴 `highlight_mismatch` 와 **다른 코드**다. 「이 문서의 것이 아니다」와 「이 문서의
        #    것이지만 그 좌표가 없다」는 화면이 다르게 말해야 하는 다른 사건이고, 무엇보다
        #    기존 코드를 넓히면 형식 위반·타 문서 케이스의 판정이 함께 흐려진다.
        raise HTTPException(
            status_code=400,
            detail={
                "code": "highlight_not_found",
                "message": f"highlight={highlight} 의 chunk 가 실재하지 않는다 — {exc.detail}",
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
