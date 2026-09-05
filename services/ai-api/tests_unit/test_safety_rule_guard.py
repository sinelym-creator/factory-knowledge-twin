"""D-84 — 합성 답변이 안전 규정을 호명하지 않는 결함의 코드 층 그물.

🔴 **무엇을 무는가.** 회부 실물(#758 raw · GS-01 live 3/3): graph 단계가
   `…→SOP-BRG-INSP-014→SAF-LOTO-01` 을 근거로 찾았는데 답변 문장에 `SAF-LOTO-01` 이 0건이었다.
   그 3 run 을 다시 재 보면 **근거 id 집합(`evidenceText` 의 키)에 `SAF-*` 는 0건**이고 규정 id 는
   발췌 **본문** 안에 있다 — 그래서 이 판정을 키 집합으로 하면 자극이 영원히 0건이고, 초록은
   「고쳤다」가 아니라 「한 번도 안 걸렸다」가 된다. 아래 픽스처는 전부 **본문**에 규정을 둔다.

🔴 **세는 것은 문장이 아니라 «호출 건수»다.** 「무한 재시도 금지」는 주석으로 지켜지지 않는다 —
   각 케이스가 `_post` 가 몇 번 불렸는지(0/1/2)를 판정선으로 든다. 자극이 안 닿았는데 초록이
   나오는 자리를 그 열이 막는다.

🔴 **라이브 호출 0.** 게이트웨이 드라이버(`_post`)를 목으로 갈아끼우므로 소켓을 열지 않는다.
   무대(`:8090`·`:8787`)에 닿지 않는다.

실행: `pytest tests_unit/test_safety_rule_guard.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

from app.investigation import live_synthesis as ls
from app.investigation.synthesize import LIVE_GATE_ENV, Candidate

RULE = "SAF-LOTO-01"
GP_ID = "GP-run1-03"
FM_A = "FM-BRG-WEAR"
FM_B = "FM-TOOL-IMB"

ANCHOR = SimpleNamespace(scenarioId="GS-01", alarmId="AL-1", equipmentId="EQ-CNC-204")


def _candidates() -> list[Candidate]:
    return [
        Candidate(failureModeId=FM_A, label="베어링 마모", pattern="p", graphHops=2),
        Candidate(failureModeId=FM_B, label="공구 불균형", pattern="p", graphHops=3),
    ]


def _state(rule_id: str | None) -> dict:
    """run 상태 → `build_evidence_text` 가 만드는 발췌. 규정 id 는 graph 경로 **본문**에 있다."""
    nodes = ["AL-1", "INC-1", "SOP-BRG-INSP-014"]
    if rule_id:
        nodes.append(rule_id)
    return {
        "structuredEvidence": [],
        "citations": {},
        "graphPaths": [
            {
                "evidenceId": GP_ID,
                "targetId": "SOP-BRG-INSP-014",
                "label": "SOP",
                "hops": 3,
                "nodes": nodes,
                "edges": [],
            }
        ],
    }


def _answer(sentence_a: str, sentence_b: str = "그래프 경로가 이 후보를 받친다.") -> dict:
    return {
        "model": "claude-code-cli:test",
        "ranking": [FM_A, FM_B],
        "rationale": {
            FM_A: {"sentences": [sentence_a], "citedEvidenceIds": [GP_ID]},
            FM_B: {"sentences": [sentence_b], "citedEvidenceIds": [GP_ID]},
        },
    }


def _run(monkeypatch, answers: list[dict], rule_in_evidence: str | None = RULE):
    """드라이버를 목으로 갈고 1 run 을 돌린다. 돌려주는 것은 (결과, 호출 기록)."""
    calls: list[dict] = []

    def fake_post(url, body, timeout_sec, on_sentence=None):
        calls.append(
            {
                "body": json.loads(body.decode("utf-8")),
                "streaming": on_sentence is not None,
            }
        )
        if not answers:
            raise AssertionError("목이 준비한 답보다 많이 불렸다")
        return answers.pop(0)

    monkeypatch.setenv(LIVE_GATE_ENV, "http://127.0.0.1:9")
    monkeypatch.setattr(ls, "_post", fake_post)

    result = asyncio.run(
        ls.synthesize(
            _candidates(),
            on_sentence=lambda _s: None,
            anchor=ANCHOR,
            state=_state(rule_in_evidence),
            evidence_ids=[GP_ID],
        )
    )
    return result, calls


def test_evidence_carries_the_rule_in_the_body_not_in_the_ids():
    """🔴 계측기를 «참»으로 먼저 울린다 — 이 전제가 깨지면 아래 판정은 전부 무효다."""
    evidence_text = ls.build_evidence_text(_state(RULE))
    assert RULE not in " ".join(evidence_text.keys())
    assert ls.safety_rules_in_evidence(evidence_text) == {RULE}


def test_named_in_answer_no_retry(monkeypatch):
    """규정 있음 + 호명 O → 개입 0. 호출 1회."""
    result, calls = _run(monkeypatch, [_answer(f"작업 전 {RULE} 을 적용한다.")])

    assert len(calls) == 1
    assert "guardNotice" not in calls[0]["body"]
    assert result.axis == "live"
    assert result.safety_omitted is False
    assert "safetyOmitted" not in result.synthesis_payload()


def test_omitted_retries_exactly_once_and_then_accepts(monkeypatch):
    """규정 있음 + 호명 X → 재요청 **정확히 1회** · 2회째도 없으면 그대로 채택 + 표기."""
    result, calls = _run(monkeypatch, [_answer("베어링 마모가 유력하다."), _answer("여전히 규정을 말하지 않는다.")])

    assert len(calls) == 2, "재요청은 1회다 — 무한 재시도도, 0회도 아니다"
    assert "guardNotice" not in calls[0]["body"]
    assert RULE in calls[1]["body"]["guardNotice"], "재요청에 자극이 실려야 한다"
    # 🔴 스트리밍은 1회차에만 — 2회차까지 흘리면 잠정 문장이 두 벌 겹친다.
    assert [c["streaming"] for c in calls] == [True, False]
    # 거부로 승격시키지 않는다 — 덜 말한 것이지 틀린 것이 아니다.
    assert result.axis == "live"
    assert result.rejected_reason is None
    assert result.safety_omitted is True
    assert result.synthesis_payload()["safetyOmitted"] is True


def test_retry_that_names_the_rule_is_not_flagged(monkeypatch):
    """재요청이 실제로 값을 바꾼 자리 — 호출 2회지만 표기는 붙지 않는다."""
    result, calls = _run(monkeypatch, [_answer("베어링 마모가 유력하다."), _answer(f"{RULE} 을 먼저 적용한다.")])

    assert len(calls) == 2
    assert result.safety_omitted is False
    assert "safetyOmitted" not in result.synthesis_payload()


def test_no_rule_in_evidence_no_intervention(monkeypatch):
    """근거에 `SAF-*` 가 없으면 무개입 — 호출 1회 · 통지 0."""
    result, calls = _run(monkeypatch, [_answer("베어링 마모가 유력하다.")], rule_in_evidence=None)

    assert len(calls) == 1
    assert "guardNotice" not in calls[0]["body"]
    assert result.axis == "live"
    assert result.safety_omitted is False


def test_document_id_is_not_a_rule_id():
    """거두는 축은 엄격 · 답하는 축은 관대 — 두 축의 기준이 다른 것이 의도다."""
    # `DOC-SAF-0030` 은 규정을 «담은 문서»의 id 다. 규정 호명을 요구하지 않는다.
    assert ls.safety_rules_in_evidence({GP_ID: "출처 DOC-SAF-0030@r3 참조"}) == set()
    # 반대로 답이 문서 id 로 호명하면 규정을 말한 것으로 친다.
    rationale = {FM_A: {"sentences": ["DOC-SAF-0030@r3 의 절차를 따른다."]}}
    assert ls.unnamed_safety_rules({"SAF-0030"}, rationale) == []


@pytest.mark.parametrize(
    "text,expected",
    [
        ("SAF-LOTO-01", {"SAF-LOTO-01"}),
        ("SAF-0029 와 SAF-PPE-01", {"SAF-0029", "SAF-PPE-01"}),
        ("safety, staff, SAFETY-NET", set()),
    ],
)
def test_rule_pattern_does_not_swallow_plain_words(text, expected):
    """넓힌 문자군이 평범한 낱말을 삼키지 않는지 — 위양성 축을 따로 센다."""
    assert ls.safety_rules_in_evidence({GP_ID: text}) == expected
