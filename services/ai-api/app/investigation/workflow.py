"""LangGraph 조사 워크플로우 — 5단계 plan (T2-3).

`structured → vector → graph → synthesize → draft_work_order` 를 LangGraph 로 세운다.
노드 이름은 `events.STEP_IDS` 와 **같은 문자열**이다 — 「노드 ↔ step 이벤트」 대조표를 따로
두면 그 표가 낡는다.

🔴 **egress 를 먼저 막고 langgraph 를 import 한다**(아래 순서가 규율이다). langchain 계열은
   설정을 import 시점에 읽어 캐시하므로, 나중에 끄면 늦다(`guards.py` 성문 · 오케 승인 J-5).

🔴 **단계 실패는 «보이게» 실패한다.** 어느 노드가 터지면 그 자리에서 멈추고 `run.failed` 가
   어느 단계였는지 코드에 담아 나간다 — 다른 전략의 결과로 조용히 채우지 않는다(T2-1 계보).
   스키마에 `step.failed` 타입이 없어 run 을 실패시키는 형태를 골랐다(계약 개정 없이).

🔴 **정직한 소견**: 이 plan 은 직선이라 LangGraph 의 분기·재시도·조건부 경로를 쓰지 않는다.
   지금 얻는 것은 「단계가 선언되고 순서대로 흐르며 각 단계가 이벤트를 낸다」는 구조이고,
   분기(예: 근거 부족 시 재검색)가 생길 때 값이 커진다. 지금 상태를 「LangGraph 라서 좋아졌다」로
   보고하면 그건 측정-주장 경계를 넘는 말이다(§0.2).
"""

from __future__ import annotations

import asyncio

import time
from dataclasses import dataclass, field
from typing import Any, TypedDict

from .guards import enforce_no_telemetry

# 🔴 순서 고정 — 강제가 먼저, import 가 나중.
enforce_no_telemetry()

from langgraph.graph import END, START, StateGraph  # noqa: E402 — 위 강제 뒤에 와야 한다

from ..reading import evidence as evidence_reader  # noqa: E402
from ..retrieval import graphrag  # noqa: E402
from ..retrieval.embedding import MODEL_ID, embed_query, ensure_ready  # noqa: E402
from ..retrieval import vector as vector_mod  # noqa: E402
from ..retrieval.vector import search as vector_search  # noqa: E402
from ..retrieval.hybrid import search as hybrid_search  # noqa: E402 — T7-44 · 기존 함수를 그대로 부른다
from ..retrieval.vector import excerpt as make_excerpt  # noqa: E402 — 발췌 규칙은 한 벌이다
from ..settings import get_settings  # noqa: E402
from . import structured as structured_reader  # noqa: E402
from . import synthesize as synth  # noqa: E402
from . import work_order as wo  # noqa: E402
from .binding import ScenarioAnchor  # noqa: E402
from .events import STEP_IDS, Emitter, evidence_ref  # noqa: E402


class StopRequested(Exception):
    """사용자가 중지를 눌렀다 — 실패가 아니라 «중지»다(스키마 run.stopped)."""


class StepFailed(Exception):
    """어느 단계가 터졌다. 어느 단계인지 담아 위로 올린다."""

    def __init__(self, step: str, cause: BaseException) -> None:
        super().__init__(f"{step}: {cause.__class__.__name__}")
        self.step = step
        self.cause = cause


class State(TypedDict, total=False):
    """노드 사이를 흐르는 데이터. 의존 핸들은 여기 담지 않는다(ctx 가 들고 있다)."""

    structuredEvidence: list[dict[str, Any]]
    citations: dict[str, str]
    graphTargets: dict[str, int]
    graphPaths: list[dict[str, Any]]
    # 🔴 **graph 가 «문서로 옮겨 온» 인용**(D-85). `citations`(vector) 와 **따로** 둔다 —
    #    같은 키에 병합해 실으면 순서가 바뀌는 날 vector 5건이 조용히 사라진다.
    #    이름에 출처를 담은 이유도 같다: 발췌가 어느 단계에서 왔는지 키가 말한다.
    graphDocumentCitations: dict[str, str]
    candidates: list[dict[str, Any]]
    workOrderDraft: dict[str, Any] | None
    evidenceIds: list[str]


@dataclass
class Context:
    """한 run 이 쓰는 것 전부 — 노드는 이것을 «닫아» 들고 있다(state 를 더럽히지 않는다)."""

    pool: Any
    driver: Any
    anchor: ScenarioAnchor
    emitter: Emitter
    should_stop: Any                       # () -> bool
    evidence_ids: list[str] = field(default_factory=list)
    # synthesize 가 세운 후보. 🔴 초안 단계가 «다시 세우지» 않게 여기 둔다 — 두 번 세우면
    #    두 답이 갈릴 수 있고, 갈리면 화면의 후보와 초안의 대상이 어긋난다.
    candidates: list[Any] = field(default_factory=list)


def _step(ctx: Context, name: str, extra: dict[str, Any] | None = None):
    """노드 하나를 감싼다 — 중지 확인 · step 이벤트 · 실패 승격을 한 자리에서.

    `extra` 는 그 단계가 «시작할 때 이미 아는» 사실이다(T7-44 `strategy`). 🔴 그래도
    **`step.completed` 에만** 실린다 — `stepStarted` 스키마는 `additionalProperties: false`
    이고 `step`·`note` 밖에 자리가 없다(실측). 계약이 열어 둔 자리가 아닌 곳에 키를 얹으면
    그 이벤트는 스키마 밖으로 나가고, 그것은 additive 가 아니라 위반이다.
    """

    def wrap(fn):
        async def node(state: State) -> State:
            if ctx.should_stop():
                raise StopRequested(name)
            ctx.emitter.step_started(name)
            started = time.perf_counter()
            try:
                result = await fn(state)
            except StopRequested:
                raise
            except Exception as exc:                      # noqa: BLE001 — 어느 단계인지 실어 올린다
                raise StepFailed(name, exc) from exc
            # 노드는 (patch, summary) 또는 (patch, summary, extra) 를 돌려준다 — extra 는 그
            # 단계의 step.completed payload 에 그대로 얹힌다(계약 additive 필드의 착지 자리).
            patch, summary, node_extra = result if len(result) == 3 else (*result, None)
            # 단계 고정 사실(extra) + 그 실행에서만 아는 사실(node_extra). 노드가 같은 키를
            # 내면 노드가 이긴다 — 실행이 본 것이 선언보다 사실에 가깝다.
            merged = {**(extra or {}), **(node_extra or {})}
            ctx.emitter.step_completed(
                name,
                int((time.perf_counter() - started) * 1000),
                summary=summary,
                extra=merged or None,
            )
            return patch

        return node

    return wrap


def build_graph(ctx: Context):
    """5단계 그래프를 세워 컴파일한다."""

    @_step(ctx, "structured")
    async def structured_node(_: State):
        result = await structured_reader.collect(ctx.pool, ctx.anchor.equipmentId)
        for ref in result.evidence:
            ctx.emitter.step_evidence("structured", ref)
            ctx.evidence_ids.append(ref["evidenceId"])
        return {"structuredEvidence": result.evidence}, result.summary()

    # T7-44 — 이 run 의 문서 검색 전략. 🔴 **run 이 시작할 때 한 번 읽어 고정한다.**
    #    노드 안에서 매번 읽으면 실행 도중 설정이 바뀌는 날 `step.started` 가 말한 전략과
    #    실제로 돈 전략이 갈릴 수 있다 — 이벤트가 자기 run 에 대해 거짓말하게 된다.
    strategy = get_settings().run_retrieval_strategy

    @_step(ctx, "vector", extra={"strategy": strategy})
    async def vector_node(_: State):
        # 🔴 **질의와 색인이 같은 공간인지 먼저 확인한다** — compare(T2-1)가 하는 그 확인을
        #    조사도 한다. 건너뛰면 다른 모델의 벡터로 검색해 「오류 없이 순위만 조용히 나쁜」
        #    결과가 나오고, 그 조사는 근거를 가진 채로 틀린다.
        signature = await vector_mod.index_signature(ctx.pool)
        if signature.model != MODEL_ID:
            raise RuntimeError(f"색인 모델 {signature.model} ≠ 질의 모델 {MODEL_ID} — 같은 공간이 아니다")
        await ensure_ready(signature.dim)
        # 🔴 두 전략은 **입력이 다르다** — vector 는 임베딩을, hybrid 는 질문 문자열을 받아
        #    안에서 스스로 임베딩한다(`hybrid.search` 성문: 벡터 축을 물려받지 않는다).
        #    그래서 여기서 embed_query 를 미리 불러 두면 hybrid 경로에서 «쓰지도 않을»
        #    임베딩 비용을 한 벌 더 치른다. 갈래마다 그 갈래의 입력만 만든다.
        if strategy == "hybrid":
            hits = await hybrid_search(ctx.pool, ctx.anchor.question)
        else:
            hits = await vector_search(ctx.pool, await embed_query(ctx.anchor.question))
        citations: dict[str, str] = {}
        # hybrid 의 구조화 축이 낸 record 근거를 이 단계에서 «세어» 뺀 수. 0 이면 필터가
        # 아무것도 안 걸렀다는 뜻이고, 그 실행의 대조군은 검출력이 없다(요약에 그대로 낸다).
        dropped_records = 0
        for hit in hits:
            # 🔴 doc-chunk 는 스키마가 revision 3필드를 «요구»한다. 그 값의 정본은 T2-2
            #    `/evidence` 가 보는 것과 같은 자리여야 한다 — 여기서 따로 조회해 만들면
            #    같은 근거가 두 표면에서 다른 신뢰 배지를 달 수 있다.
            detail = await evidence_reader.fetch(ctx.pool, hit.evidenceId)
            # 🔴 **hybrid 의 구조화 축은 `kind=record` 를 낸다**(`reading/evidence.py` 표가
            #    성문: 개념 ID → record → 「hybrid 구조화 축」). 이 단계의 근거집합은 계약상
            #    doc-chunk 이므로 record 는 여기서 방출하지 않는다 — 실으면 같은 근거가
            #    vector 단계와 `/evidence` 에서 다른 종류로 불린다.
            #
            #    🔴 **면제는 «hybrid 이고 record 인 것» 하나로 좁힌다.** 넓히면 아래 가드가
            #    사실상 꺼져서, 검색과 읽기 표면이 어긋난 «진짜» 사고까지 조용히 통과한다.
            #    vector 전략에서는 이 줄이 아예 서지 않으므로 앞판의 거동이 그대로다.
            if strategy == "hybrid" and detail is not None and detail.kind == "record":
                dropped_records += 1
                continue
            if detail is None or detail.kind != "doc-chunk":
                # 검색이 낸 근거를 읽기 표면이 풀지 못한다 = 두 층이 어긋났다. 조용히 빼지 않는다.
                raise RuntimeError(f"검색 결과 {hit.evidenceId} 를 evidence 표면이 풀지 못한다")
            ref = evidence_ref(
                evidence_id=hit.evidenceId,
                kind="doc-chunk",
                source_id=detail.revisionId or hit.evidenceId,
                excerpt=hit.excerpt,
                score=hit.score,
                revision_id=detail.revisionId,
                content_hash=detail.contentHash,
                stale=detail.stale,
            )
            ctx.emitter.step_evidence("vector", ref)
            ctx.evidence_ids.append(hit.evidenceId)
            citations[hit.evidenceId] = detail.text
        # 🔴 제외 건수를 **요약 문면에** 남긴다 — 이벤트 payload 에는 `strategy` 1키만
        #    싣는 것이 이 티켓의 계약 범위이기 때문이다(계약 표면을 넓히지 않고 계수를 남긴다).
        summary = f"인용 후보 {len(citations)}건"
        if dropped_records:
            summary += f"(구조화 축 record {dropped_records}건 제외)"
        return {"citations": citations}, summary

    @_step(ctx, "graph")
    async def graph_node(_: State):
        if ctx.driver is None:
            raise RuntimeError("neo4j 드라이버가 없다 — 그래프 단계를 건너뛰지 않는다")
        paths = await graphrag.traverse(ctx.driver, ctx.anchor.question)
        targets: dict[str, int] = {}
        stored: list[dict[str, Any]] = []
        for index, path in enumerate(paths):
            target = str(path["targetId"])
            # 🔴 evidenceId 는 «경로»의 것이다. 종단 노드 ID 를 그대로 쓰면 같은 ID 를
            #    `/evidence` 는 record 로, 이벤트는 graph-path 로 부르게 된다 — 한 근거는
            #    한 종류다(structured 단계 성문과 같은 규율). 종단은 sourceId 로 가리킨다.
            evidence_id = f"GP-{ctx.emitter.run_id.removeprefix('RUN-')}-{index:02d}"
            walk = " → ".join(str(n) for n in path["nodes"])
            # 🔴 걸음 문장은 **여기서 한 번만** 짓는다(D-68). `GET /evidence/GP-*` 도 같은
            #    문장을 내야 하는데, 그쪽에서 다시 조립하면 서식 규칙이 두 자리에 살고
            #    한쪽만 고치는 날 「이벤트가 말한 근거」와 「눌러서 본 근거」가 갈린다.
            excerpt = f"[{path['label']} · {path['hops']}-hop] {walk}"
            score = float(path["score"])
            ref = evidence_ref(
                evidence_id=evidence_id,
                kind="graph-path",
                source_id=target,
                excerpt=excerpt,
                score=score,
            )
            ctx.emitter.step_evidence("graph", ref)
            ctx.evidence_ids.append(evidence_id)
            stored.append({
                "evidenceId": evidence_id,
                "targetId": target,
                # 🔴 `excerpt`·`score` 를 run 상태에 «함께» 남긴다 — 근거 딥링크가 읽는
                #    원천이 이것이고, 없으면 라우트가 문장을 다시 지어야 한다.
                "excerpt": excerpt,
                "score": score,
                **{k: path[k] for k in ("label", "hops", "nodes", "edges")},
            })
            targets[target] = int(path["hops"])

        # 🔴 **O-33 · 도달한 «엔티티»를 그 문서 청크로 옮긴다.** 앞판은 `SOP-BRG-INSP-014`·
        #    `SAF-LOTO-01` 에 도달하고도 `graph-path` 근거만 냈다. 기대 근거는 **청크 id** 라,
        #    아무리 잘 걸어도 근거집합에는 0건이었다(GS-01 실측: graph 가 낸 doc-chunk 0건).
        # 🔴 푸는 자리는 **vector 단계와 같은 `evidence_reader`** 다. 여기서 따로 조회해 만들면
        #    같은 근거가 두 표면에서 다른 신뢰 배지를 달 수 있다(vector 단계 주석과 같은 이유).
        # 🔴 이미 있는 id 는 «건너뛰고 센다» — 한 근거는 한 번이다. 조용히 빼면 「투영이 0건인
        #    run」과 「전부 중복이라 0건인 run」이 같은 표를 그린다.
        projected = 0
        duplicated = 0
        # 🔴 **D-85**: 근거집합에 넣는 것만으로는 모델이 그 청크를 «볼» 수 없다.
        #    `build_evidence_text` 가 훑는 자리에 본문을 실어야 인용이 가능해진다 —
        #    앞판은 이 자리가 비어 있어서 모델이 인용을 «안» 한 게 아니라 «못» 했고,
        #    했다면 게이트웨이가 「인용 id 가 준 근거 밖이다」로 답 전체를 버렸다.
        projected_texts: dict[str, str] = {}
        for chunk_id in await evidence_reader.documents_for_entities(ctx.pool, sorted(targets)):
            if chunk_id in ctx.evidence_ids:
                duplicated += 1
                continue
            detail = await evidence_reader.fetch(ctx.pool, chunk_id)
            if detail is None or detail.kind != "doc-chunk":
                raise RuntimeError(f"투영한 {chunk_id} 를 evidence 표면이 풀지 못한다")
            ref = evidence_ref(
                evidence_id=chunk_id,
                kind="doc-chunk",
                source_id=detail.revisionId or chunk_id,
                excerpt=make_excerpt(detail.text),
                revision_id=detail.revisionId,
                content_hash=detail.contentHash,
                stale=detail.stale,
            )
            ctx.emitter.step_evidence("graph", ref)
            ctx.evidence_ids.append(chunk_id)
            projected_texts[chunk_id] = detail.text
            projected += 1

        return (
            {
                "graphTargets": targets,
                "graphPaths": stored,
                "graphDocumentCitations": projected_texts,
            },
            f"경로 {len(stored)}건 · 종단 {sorted(targets)}"
            f" · 문서 투영 {projected}건(중복 제외 {duplicated}건)",
        )

    @_step(ctx, "synthesize")
    async def synthesize_node(state: State):
        candidates = await synth.build_candidates(
            ctx.pool,
            ctx.anchor,
            structured_ids=[e["evidenceId"] for e in state.get("structuredEvidence", [])],
            citation_texts=state.get("citations", {}),
            graph_targets=state.get("graphTargets", {}),
        )
        if not candidates:
            # 🔴 후보 0건은 «성공한 조사»가 아니다. 스키마도 candidates 최소 1건을 요구한다.
            raise RuntimeError(f"{ctx.anchor.alarmId} 에서 원인 후보를 하나도 세우지 못했다")
        axis = synth.resolve_synthesizer()
        rationale: dict[str, Any] = {}
        synthesis: dict[str, str] = {"axis": axis}
        gateway = "결정적 집계(로컬 합성 게이트웨이 미도달)"
        if axis == "live":
            # 🔴 게이트 뒤에서만 불러온다 — 공개 배포 프로세스에 이 코드가 «없게» 한다.
            from . import live_synthesis             # noqa: PLC0415

            # ── ① 선표시 — 계약 v0.1.13 ─────────────────────────────────────────
            # 🔴 **이미 계산된 값만 낸다.** 결정적 순위는 위 `build_candidates` 가 방금 세운
            #    것이고, 여기서 다시 계산하지 않는다 — 지연 0 이어야 「선표시」다.
            # 🔴 **live 축에서만 낸다.** 결정적 축은 이 자리에서 곧바로 끝나므로 기다림이
            #    없고, 기다림이 없는데 「잠정입니다」라고 말하면 화면이 없는 대기를 그린다.
            progress_seq = 0
            ctx.emitter.step_progress(
                "synthesize",
                "preliminary",
                progress_seq,
                preliminary={
                    "ranking": [c.failureModeId for c in candidates],
                    "axis": "deterministic",
                },
            )
            progress_seq += 1

            # ── ② 스트리밍 — 문장 줄마다 progress ───────────────────────────────
            # 🔴 **이벤트는 «루프 스레드»에서 낸다.** 게이트웨이 호출은 `asyncio.to_thread`
            #    안이라 콜백도 워커 스레드에서 온다. 거기서 emitter 를 직접 부르면 run 기록과
            #    구독자 통지가 두 스레드에서 동시에 일어난다 — `call_soon_threadsafe` 로
            #    돌려보내면 다른 모든 이벤트와 «같은 스레드»에 줄을 서고 순서도 보존된다.
            loop = asyncio.get_running_loop()

            def _on_sentence(sentence: dict[str, Any]) -> None:
                nonlocal progress_seq
                seq = progress_seq
                progress_seq += 1
                loop.call_soon_threadsafe(
                    lambda: ctx.emitter.step_progress(
                        "synthesize", "sentence", seq, sentence=sentence
                    )
                )

            outcome = await live_synthesis.synthesize(
                candidates,
                on_sentence=_on_sentence,
                anchor=ctx.anchor,
                state=state,
                evidence_ids=list(dict.fromkeys(ctx.evidence_ids)),
            )
            candidates = outcome.candidates
            rationale = outcome.rationale
            synthesis = outcome.synthesis_payload()
            gateway = (
                "live(로컬 게이트웨이)"
                if outcome.axis == "live"
                # 🔴 거부는 감추지 않는다 — 결정적 순위를 쓰되 왜 그렇게 됐는지 같이 말한다.
                else f"결정적 집계(live 응답 거부 · {outcome.rejected_reason})"
            )
            ctx.candidates = candidates
            payload = live_synthesis.attach_rationale(synth.to_payload(candidates), rationale)
        else:
            ctx.candidates = candidates
            payload = synth.to_payload(candidates)
        return (
            {"candidates": payload},
            f"후보 {len(payload)}건 · 1순위 {payload[0]['failureModeId']} · 합성 축 = {gateway}",
            {"synthesis": synthesis},
        )

    @_step(ctx, "draft_work_order")
    async def draft_node(_: State):
        draft = await wo.draft(
            ctx.pool,
            equipment_id=ctx.anchor.equipmentId,
            incident_id=ctx.anchor.incidentId,
            top=ctx.candidates[0],
            evidence_ids=list(dict.fromkeys(ctx.evidence_ids)),
        )
        safety = len(draft["safetyMeasures"])
        gaps = f" · 🔴 결손 {len(draft['gaps'])}건" if draft["gaps"] else ""
        return ({"workOrderDraft": draft}, f"초안 1건 · 안전 조치 {safety}건{gaps}")

    graph = StateGraph(State)
    nodes = {
        "structured": structured_node,
        "vector": vector_node,
        "graph": graph_node,
        "synthesize": synthesize_node,
        "draft_work_order": draft_node,
    }
    for name in STEP_IDS:
        graph.add_node(name, nodes[name])
    graph.add_edge(START, STEP_IDS[0])
    for earlier, later in zip(STEP_IDS, STEP_IDS[1:]):
        graph.add_edge(earlier, later)
    graph.add_edge(STEP_IDS[-1], END)
    return graph.compile()
