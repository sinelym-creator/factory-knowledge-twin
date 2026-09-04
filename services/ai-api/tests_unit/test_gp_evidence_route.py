"""`GET /evidence/{id}` 의 `GP-` 분기 — D-75 재발 그물(코드 층).

🔴 **무엇을 무는가.** D-75 의 근인은 「분기가 없는 이미지가 배포에 올라가 있었다」였다
   (배포본 `b4b06dd` 에 `_graph_path_evidence` 부재 → 공개면 GP 근거 전부 404). 그
   재발을 코드 층에서 잡으려면 **분기의 «존재»가 아니라 «성질»을 걸어야 한다** —
   파일에 함수 이름이 있는지 grep 하는 검사는 이름만 남기고 분기를 지워도 초록이다.

🔴 그래서 여기서 재는 성질은 하나다: **postgres 없이 응답이 나온다.**
   GP 근거의 원천은 run 상태이고, 라우트는 그래서 분기를 `_pool()` 획득 «앞»에 둔다.
   pool 을 잡는 순간 터지는 가짜 request 로 부르면, 그 순서가 깨진 날 이 테스트가
   빨강이 된다 — 순서는 주석이 아니라 실행으로 지켜진다.

🔴 문면은 **코드에서 읽어 옮긴다**(`NO_DSN_MESSAGE` 처럼 상수가 없는 자리라, 404 문장은
   라우트가 쓰는 그 함수로 만들어 비교한다). 여기에 문장을 손으로 적으면 문면이 바뀌는 날
   테스트가 「옛 문장」을 정본이라고 우기게 된다.

실행: `pytest tests_unit/test_gp_evidence_route.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.investigation.store import RunRecord
from app.routers.knowledge import _GRAPH_PATH_PREFIX, _not_found, evidence
from app.schemas import EvidenceResponse

SESSION = "sess-1"
RUN_ID = "RUN-abc123"
GP_ID = "GP-abc123-00"

PATH_ROW = {
    "evidenceId": GP_ID,
    "targetId": "SOP-BRG-INSP-014",
    "excerpt": "[SOP · 3-hop] AL-1 → INC-1 → SOP-BRG-INSP-014",
    "score": 0.25,
    "label": "SOP",
    "hops": 3,
    "nodes": ["AL-1", "INC-1", "SOP-BRG-INSP-014"],
    "edges": [
        {"from": "AL-1", "type": "ESCALATES_TO", "to": "INC-1"},
        {"from": "INC-1", "type": "RESOLVED_BY", "to": "SOP-BRG-INSP-014"},
    ],
}


class _ExplodingResources:
    """🔴 pool 을 «읽기만» 해도 터진다 — 잡았는지가 아니라 «닿았는지»를 잡는다."""

    @property
    def pg_pool(self):  # noqa: ANN201 - 이 property 는 값을 돌려주지 않는다
        raise AssertionError(
            "GP 분기가 postgres 를 건드렸다 — 분기는 _pool() 획득 «앞»에 있어야 한다"
        )


def _run(graph_paths: list[dict], *, session: str = SESSION) -> RunRecord:
    return RunRecord(
        runId=RUN_ID,
        sessionId=session,
        scenarioId="GS-01",
        incidentId="INC-2026-014",
        mode="live",
        graphPaths=list(graph_paths),
    )


def _request(record: RunRecord | None, *, session: str | None = SESSION):
    """FastAPI Request 대신 «라우트가 실제로 읽는 것»만 가진 대역.

    라우트가 보는 것은 세 자리뿐이다: `state.session_id`(가드가 넣는다) ·
    `app.state.run_store` · `app.state.resources.pg_pool`. 진짜 Request 를 세우면
    ASGI scope 를 지어내야 하고, 그 지어낸 값이 테스트의 주어가 된다.
    """
    store = SimpleNamespace(get=lambda rid: record if record and rid == record.runId else None)
    app = SimpleNamespace(state=SimpleNamespace(run_store=store, resources=_ExplodingResources()))
    return SimpleNamespace(app=app, state=SimpleNamespace(session_id=session))


def _call(evidence_id: str, request) -> EvidenceResponse:
    return asyncio.run(evidence(evidence_id, request))


def test_prefix_is_gp() -> None:
    """🔴 접두는 `investigation/workflow.py` 가 굽는 id 와 한 글자도 달라선 안 된다."""
    assert _GRAPH_PATH_PREFIX == "GP-"
    assert GP_ID.startswith(_GRAPH_PATH_PREFIX)


def test_graph_path_answers_without_postgres() -> None:
    """분기가 pool 획득 «앞»에 있다 — 이 테스트의 몸통.

    `_ExplodingResources` 는 pool 을 읽는 순간 AssertionError 를 낸다. 200 이 나왔다는
    것은 그 자리에 닿지 않았다는 뜻이고, 분기가 아래로 내려가면 여기서 빨강이 난다.
    """
    reply = _call(GP_ID, _request(_run([PATH_ROW])))

    assert reply.kind == "graph-path"
    assert reply.evidenceId == GP_ID
    # 걸음 문장은 run 상태의 것을 «그대로» 낸다 — 라우트가 다시 조립하면 여기서 갈린다.
    assert reply.excerpt == PATH_ROW["excerpt"]
    assert reply.text == PATH_ROW["excerpt"]
    assert reply.sourceId == PATH_ROW["targetId"]
    assert reply.score == PATH_ROW["score"]
    assert reply.stale is False
    assert reply.revisionId is None
    # edge 는 객체 모양 그대로 — 문자열로 접히면 화면이 관계를 다시 파싱해야 한다.
    assert reply.meta is not None
    assert reply.meta.path.hops == PATH_ROW["hops"]
    assert reply.meta.path.nodes == PATH_ROW["nodes"]
    assert reply.meta.path.edges == PATH_ROW["edges"]


def test_missing_path_is_404_with_the_route_wording() -> None:
    """run 은 내 것인데 그 idx 가 없다 → 404. 문면은 라우트가 쓰는 함수에서 읽어 온다."""
    with pytest.raises(Exception) as caught:  # noqa: PT011 - HTTPException 두 계보를 함께 받는다
        _call(GP_ID, _request(_run([])))

    expected = _not_found("evidence", GP_ID)
    assert getattr(caught.value, "status_code", None) == expected.status_code == 404
    assert caught.value.detail == expected.detail


def test_foreign_session_is_the_same_404() -> None:
    """🔴 남의 run 과 «없는 run» 이 같은 문장으로 나간다(존재 은닉 · ownership 성문).

    문장이 갈리면 id 를 던져 보는 것만으로 남의 run 존재가 새어 나간다.
    """
    with pytest.raises(Exception) as foreign:  # noqa: PT011
        _call(GP_ID, _request(_run([PATH_ROW], session="someone-else")))
    with pytest.raises(Exception) as absent:  # noqa: PT011
        _call(GP_ID, _request(None))

    assert foreign.value.status_code == absent.value.status_code == 404
    assert foreign.value.detail == absent.value.detail


def test_no_session_is_401_not_404() -> None:
    """무세션은 존재를 누설하지 않으므로 401 로 «구별해» 말한다 — 404 로 접지 않는다."""
    with pytest.raises(Exception) as caught:  # noqa: PT011
        _call(GP_ID, _request(_run([PATH_ROW]), session=None))

    assert caught.value.status_code == 401
    assert caught.value.detail["code"] == "session_required"


def test_replay_run_says_the_source_is_absent() -> None:
    """재생 run 은 `GET /graph/paths?byRun=` 과 «같은 판정»(501) — 한 사건에 한 판정."""
    record = _run([PATH_ROW])
    record.mode = "replay"

    with pytest.raises(Exception) as caught:  # noqa: PT011
        _call(GP_ID, _request(record))

    assert caught.value.status_code == 501
    assert caught.value.detail["code"] == "replay_path_source_absent"


def test_non_gp_id_still_needs_postgres() -> None:
    """🔴 대조군 — 분기가 «GP- 에만» 걸린다.

    같은 가짜 request 로 평범한 근거 id 를 물으면 pool 에 닿아 터져야 한다. 이 축이 없으면
    「분기를 모든 id 에 걸어 놓은」 코드도 위 테스트를 통과한다.
    """
    with pytest.raises(AssertionError, match="postgres"):
        _call("DOC-MAN-0021@r1#000", _request(_run([PATH_ROW])))
