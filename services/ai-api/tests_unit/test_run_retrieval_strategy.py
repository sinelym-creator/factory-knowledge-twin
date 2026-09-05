"""T7-44 §2.4 — 조사 run 의 문서 검색 전략을 설정이 고르는가.

🔴 **무엇을 무는가.** `vector_node` 는 `retrieval.vector.search` 만 불렀고, 같은 패키지의
   `retrieval/hybrid.py` 는 `POST /retrieval/compare` 에서만 쓰였다. 처방은 전략을 설정으로
   고르게 하고(`FKT_RUN_RETRIEVAL_STRATEGY` · 기본 `hybrid`), 어느 전략으로 돌았는지를
   run 이벤트가 말하게 하는 것이다.

🔴 **두 값을 각각 세워 «갈리는지»까지 본다.** 기본값만 재면 vector 갈래는 자극 0으로 남고,
   그 갈래는 영원히 초록이다 — 같은 값을 두 번 보는 것은 판정이 아니다.

🔴 **`record` 면제는 «hybrid 이고 record 인 것» 하나로 좁혔다.** 넓히면 「검색이 낸 근거를
   읽기 표면이 풀지 못한다」는 진짜 사고까지 조용히 통과한다. 그래서 마지막 케이스는
   **vector 전략에서 같은 자극이 여전히 터지는지**를 잰다 — 면제가 제 사정거리에 머무는가.

실행: `pytest tests_unit -q`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import asyncio
import sys
import types
from typing import Any

import pytest

# langgraph 는 이 리포의 단위 층이 여는 의존 목록에 없다(ci.yml `unit-ai-api` = pytest·
# pydantic·fastapi·pydantic-settings 4개). 🔴 목록을 늘리는 대신 **없을 때만** 최소 stub 을
# 세운다 — 진짜가 있는 환경에서는 진짜를 쓴다(가짜로 덮으면 그 환경의 실측이 사라진다).
try:  # pragma: no cover - 설치 여부에 따라 한쪽만 돈다
    import langgraph.graph  # noqa: F401
except ModuleNotFoundError:  # pragma: no cover
    _pkg = types.ModuleType("langgraph")
    _mod = types.ModuleType("langgraph.graph")
    _mod.START = "__start__"
    _mod.END = "__end__"

    class _StateGraph:  # 세우기만 한다 — 이 파일은 노드 «함수»만 본다.
        def __init__(self, *_a: Any, **_k: Any) -> None: ...
        def add_node(self, *_a: Any, **_k: Any) -> None: ...
        def add_edge(self, *_a: Any, **_k: Any) -> None: ...
        def compile(self) -> Any: return None

    _mod.StateGraph = _StateGraph
    _pkg.graph = _mod
    sys.modules["langgraph"] = _pkg
    sys.modules["langgraph.graph"] = _mod

from app.investigation import workflow as wf  # noqa: E402
from app.settings import get_settings  # noqa: E402

STRATEGY_ENV = "FKT_RUN_RETRIEVAL_STRATEGY"


class _Emitter:
    """이벤트를 모으기만 한다 — 이 층의 판정 대상은 «payload 에 무엇이 실렸는가»다."""

    run_id = "RUN-test"

    def __init__(self) -> None:
        self.started: list[dict[str, Any]] = []
        self.completed: list[dict[str, Any]] = []
        self.evidence: list[dict[str, Any]] = []

    def step_started(self, step: str, note: str | None = None):
        self.started.append({"step": step})

    def step_completed(self, step: str, elapsed_ms: int, summary=None, extra=None):
        self.completed.append({"step": step, "summary": summary, **(extra or {})})

    def step_evidence(self, step: str, evidence: dict[str, Any]):
        self.evidence.append(evidence)


class _Recorder:
    """`build_graph` 가 등록하는 노드를 이름으로 잡아 둔다."""

    def __init__(self) -> None:
        self.nodes: dict[str, Any] = {}

    def __call__(self, *_a: Any, **_k: Any) -> "_Recorder":
        return self

    def add_node(self, name: str, fn: Any) -> None:
        self.nodes[name] = fn

    def add_edge(self, *_a: Any, **_k: Any) -> None: ...

    def compile(self) -> Any:
        return None


def _detail(kind: str, text: str = "본문"):
    return types.SimpleNamespace(
        kind=kind, text=text, revisionId="r1", contentHash="h", stale=False
    )


def _hit(evidence_id: str):
    return types.SimpleNamespace(evidenceId=evidence_id, excerpt="발췌", score=0.5)


def _build(monkeypatch, *, strategy: str | None, hits: list[Any], details: dict[str, Any]):
    """설정을 세우고 그래프를 세운 뒤 `vector` 노드와 emitter 를 돌려준다.

    🔴 전략은 `build_graph` 시점에 **한 번** 읽히므로, env 를 세운 «뒤에» 세워야 한다.
    """
    if strategy is None:
        monkeypatch.delenv(STRATEGY_ENV, raising=False)
    else:
        monkeypatch.setenv(STRATEGY_ENV, strategy)
    get_settings.cache_clear()

    calls: dict[str, int] = {"vector": 0, "hybrid": 0}

    async def fake_vector_search(pool, query_vec, *a, **k):
        calls["vector"] += 1
        return hits

    async def fake_hybrid_search(pool, question, *a, **k):
        calls["hybrid"] += 1
        # 🔴 «값이 닿았는가»는 결과가 아니라 인자로 센다 — 과수집 상한을 넘겼는지는
        #    돌아온 건수로는 알 수 없다(대상이 적게 가진 날 두 설명이 같은 수를 낸다).
        calls["hybrid_top_k"] = k.get("top_k", a[0] if a else None)
        return hits

    async def fake_signature(pool):
        return types.SimpleNamespace(model=wf.MODEL_ID, dim=8)

    async def fake_ready(dim): ...

    async def fake_embed(question):
        return [0.0] * 8

    async def fake_fetch(pool, evidence_id):
        return details.get(evidence_id)

    recorder = _Recorder()
    monkeypatch.setattr(wf, "StateGraph", recorder)
    monkeypatch.setattr(wf, "vector_search", fake_vector_search)
    monkeypatch.setattr(wf, "hybrid_search", fake_hybrid_search)
    monkeypatch.setattr(wf.vector_mod, "index_signature", fake_signature)
    monkeypatch.setattr(wf, "ensure_ready", fake_ready)
    monkeypatch.setattr(wf, "embed_query", fake_embed)
    monkeypatch.setattr(wf.evidence_reader, "fetch", fake_fetch)

    # 이웃 단계 하나를 돌 수 있게 해 둔다 — 「`strategy` 가 vector 단계에만 실리는가」는
    # 다른 단계를 «실제로 돌려» 그 payload 를 세지 않으면 답할 수 없다(안 돈 단계의 부재는
    # 부재가 아니라 미측정이다).
    class _StructResult:
        evidence: list[dict[str, Any]] = []

        def summary(self) -> str:
            return "구조화 0건"

    async def fake_collect(pool, equipment_id):
        return _StructResult()

    monkeypatch.setattr(wf.structured_reader, "collect", fake_collect)

    emitter = _Emitter()
    ctx = wf.Context(
        pool=object(),
        driver=object(),
        anchor=types.SimpleNamespace(question="EQ-CNC-204 의 경보 임계값", equipmentId="EQ-CNC-204"),
        emitter=emitter,
        should_stop=lambda: False,
    )
    wf.build_graph(ctx)
    return recorder.nodes, emitter, calls


def test_vector_strategy_calls_vector_search(monkeypatch):
    """설정 `vector` → vector 축만 돌고, 이벤트가 그 전략을 말한다."""
    hits = [_hit("DOC-SOP-0014@r2#001")]
    nodes, emitter, calls = _build(
        monkeypatch,
        strategy="vector",
        hits=hits,
        details={"DOC-SOP-0014@r2#001": _detail("doc-chunk")},
    )
    asyncio.run(nodes["vector"]({}))

    assert (calls["vector"], calls["hybrid"]) == (1, 0)
    # 🔴 착지 자리는 `step.completed` «하나»다 — `stepStarted` 스키마에는 additive 자리가
    #    없다(additionalProperties:false · step·note 뿐). started 에 키가 새면 계약 위반이다.
    assert [e["strategy"] for e in emitter.completed if e["step"] == "vector"] == ["vector"]
    assert all("strategy" not in e for e in emitter.started)


def test_default_is_hybrid_and_calls_hybrid_search(monkeypatch):
    """미설정 → 기본 `hybrid`(폐하 결정 ⓑ) → hybrid 축이 돈다. 위 케이스와 «갈린다»."""
    hits = [_hit("DOC-SOP-0014@r2#001")]
    nodes, emitter, calls = _build(
        monkeypatch,
        strategy=None,
        hits=hits,
        details={"DOC-SOP-0014@r2#001": _detail("doc-chunk")},
    )
    asyncio.run(nodes["vector"]({}))

    assert (calls["vector"], calls["hybrid"]) == (0, 1)
    assert [e["strategy"] for e in emitter.completed if e["step"] == "vector"] == ["hybrid"]
    assert all("strategy" not in e for e in emitter.started)


def test_unknown_strategy_refuses_to_boot(monkeypatch):
    """모르는 값은 «기동에서» 거부된다 — 런타임 한복판까지 살아 들어가지 않는다."""
    monkeypatch.setenv(STRATEGY_ENV, "graphrag")
    get_settings.cache_clear()
    with pytest.raises(Exception) as excinfo:
        get_settings()
    # pydantic 이 어느 필드를 물었는지까지 말하는지 본다(문면이 이름을 대야 고칠 자리를 안다).
    assert "run_retrieval_strategy" in str(excinfo.value)
    get_settings.cache_clear()


def test_hybrid_drops_record_hits_and_counts_them(monkeypatch):
    """hybrid 의 구조화 축(`kind=record`)은 이 단계에서 빠지고, 뺀 수가 요약에 남는다."""
    hits = [_hit("DOC-SOP-0014@r2#001"), _hit("EQ-CNC-204"), _hit("DOC-MAN-0021@r1#005")]
    nodes, emitter, _ = _build(
        monkeypatch,
        strategy="hybrid",
        hits=hits,
        details={
            "DOC-SOP-0014@r2#001": _detail("doc-chunk"),
            "EQ-CNC-204": _detail("record"),
            "DOC-MAN-0021@r1#005": _detail("doc-chunk"),
        },
    )
    patch = asyncio.run(nodes["vector"]({}))
    # 🔴 요약은 «이벤트에 실린 것»에서 읽는다 — 노드 반환값에서 읽으면 emitter 가 그 문면을
    #    실제로 내보냈는지는 확인하지 않은 채 통과한다(소비자가 보는 자리가 판정 자리다).
    summary = [e["summary"] for e in emitter.completed if e["step"] == "vector"][0]

    assert set(patch["citations"]) == {"DOC-SOP-0014@r2#001", "DOC-MAN-0021@r1#005"}
    # 오케 요구 ② — 걸러서 근거 «개수»가 줄면 그 수를 실물로 남긴다(TOP_K 상수는 무변).
    assert len(patch["citations"]) == len(hits) - 1 == 2
    # 🔴 «몇 건 걸렀는가»를 센다. 0 이면 이 케이스는 검출력이 없다 — 자극이 닿았는지를
    #    결과가 아니라 계수로 확인한다.
    assert "record 1건 제외" in summary
    assert [e["evidenceId"] for e in emitter.evidence] == [
        "DOC-SOP-0014@r2#001",
        "DOC-MAN-0021@r1#005",
    ]


def test_vector_strategy_still_raises_on_a_record_hit(monkeypatch):
    """🔴 대조군 — 면제가 «hybrid + record» 하나로 좁혀져 있는가.

    vector 전략에서 같은 자극을 주면 앞판의 가드가 **그대로 터져야** 한다. 여기서 조용히
    통과하면 면제가 가드를 통째로 끈 것이고, 그때는 검색과 읽기 표면이 어긋난 진짜 사고도
    안 보이게 된다.
    """
    nodes, _, _ = _build(
        monkeypatch,
        strategy="vector",
        hits=[_hit("EQ-CNC-204")],
        details={"EQ-CNC-204": _detail("record")},
    )
    with pytest.raises(wf.StepFailed) as excinfo:
        asyncio.run(nodes["vector"]({}))
    assert isinstance(excinfo.value.cause, RuntimeError)
    assert "EQ-CNC-204" in str(excinfo.value.cause)


def test_strategy_key_is_scoped_to_the_vector_step(monkeypatch):
    """🔴 대조군 — `strategy` 가 «vector 단계에만» 실리는가.

    이웃 단계(`structured`)를 **실제로 돌려** 그 `step.completed` payload 를 센다. 돌리지
    않고 「없다」고 적으면 그것은 부재가 아니라 미측정이다.
    """
    nodes, emitter, _ = _build(
        monkeypatch,
        strategy="hybrid",
        hits=[_hit("DOC-SOP-0014@r2#001")],
        details={"DOC-SOP-0014@r2#001": _detail("doc-chunk")},
    )
    asyncio.run(nodes["structured"]({}))
    asyncio.run(nodes["vector"]({}))

    by_step = {e["step"]: e for e in emitter.completed}
    assert set(by_step) == {"structured", "vector"}          # 두 단계가 실제로 돌았다
    assert by_step["vector"]["strategy"] == "hybrid"
    assert "strategy" not in by_step["structured"]


def test_hybrid_overfetches_and_keeps_top_k_doc_chunks(monkeypatch):
    """🔴 T7-44b — record 가 슬롯을 먹어도 doc-chunk 는 TOP_K 를 채운다.

    앞판은 `_fuse` 의 top_k 칸을 세 축이 «나눠 쓴다»는 것을 안 보고 걸렀고, 그래서 거른
    자리가 빈 채 나갔다(E1: 5→4 · `DOC-MAN-0021@r1#001` 소실). 처방은 넉넉히 받아 거른 뒤
    상위 TOP_K 만 쓰는 것이다.
    """
    docs = [_hit(f"DOC-MAN-002{i}@r1#00{i}") for i in range(5)]
    hits = [_hit("EQ-CNC-204"), *docs[:2], _hit("AL-20260826-0041"), *docs[2:]]
    details = {h.evidenceId: _detail("doc-chunk") for h in docs}
    details["EQ-CNC-204"] = _detail("record")
    details["AL-20260826-0041"] = _detail("record")

    nodes, emitter, calls = _build(monkeypatch, strategy="hybrid", hits=hits, details=details)
    patch = asyncio.run(nodes["vector"]({}))
    summary = [e["summary"] for e in emitter.completed if e["step"] == "vector"][0]

    # 🔴 과수집 상한이 실제로 hybrid 에 «전달됐는가» — 인자로 실측한다.
    assert calls["hybrid_top_k"] == wf.TOP_K * 2 == 10
    # hit 7(record 2 + doc 5) → doc-chunk 5건 전부 살아난다(앞판이면 여기서 5가 아니다).
    assert len(patch["citations"]) == wf.TOP_K == 5
    assert list(patch["citations"]) == [d.evidenceId for d in docs]      # RRF 순 보존
    assert "record 2건 제외" in summary and f"과수집 {len(hits)}" in summary


def test_hybrid_does_not_invent_when_fewer_docs_are_available(monkeypatch):
    """가용 doc 이 TOP_K 에 못 미치면 그 수 그대로다 — 모자란 자리를 채우지 않는다."""
    docs = [_hit(f"DOC-SOP-001{i}@r1#00{i}") for i in range(3)]
    hits = [_hit("EQ-CNC-204"), *docs]
    details = {h.evidenceId: _detail("doc-chunk") for h in docs}
    details["EQ-CNC-204"] = _detail("record")

    nodes, emitter, _ = _build(monkeypatch, strategy="hybrid", hits=hits, details=details)
    patch = asyncio.run(nodes["vector"]({}))

    assert len(patch["citations"]) == 3 < wf.TOP_K
    assert list(patch["citations"]) == [d.evidenceId for d in docs]


def test_hybrid_truncates_when_more_doc_chunks_than_top_k_come_back(monkeypatch):
    """🔴 절단 자체를 자극한다 — 과수집분이 그대로 나가지 않는가.

    ⑦(record 2 + doc 5)은 doc 이 «정확히» TOP_K 라 절단을 시험하지 못한다: break 를 지워도
    5가 나온다. 과수집 상한이 TOP_K*2 인 이상 doc 이 TOP_K 를 넘겨 올 수 있고, 그때 절단이
    없으면 이 단계는 계약이 말하는 근거집합 크기를 넘겨 방출한다.
    """
    docs = [_hit(f"DOC-MAN-00{i:02d}@r1#001") for i in range(7)]
    details = {h.evidenceId: _detail("doc-chunk") for h in docs}

    nodes, emitter, _ = _build(monkeypatch, strategy="hybrid", hits=docs, details=details)
    patch = asyncio.run(nodes["vector"]({}))

    assert len(patch["citations"]) == wf.TOP_K == 5
    assert list(patch["citations"]) == [d.evidenceId for d in docs[:5]]   # 앞에서부터 자른다
    # 🔴 방출도 함께 멈춰야 한다 — citations 만 자르고 이벤트를 다 내보내면 화면과 상태가 갈린다.
    assert [e["evidenceId"] for e in emitter.evidence] == [d.evidenceId for d in docs[:5]]
