"""D-97 — run 1건이 게이트웨이를 몇 번 불렀는가를 «센다».

🔴 이 파일의 판정선은 **한 값이 아니라 두 값이 갈리는 것**이다. `calls` 가 늘 1 을 내는
   계측기도 「SAF 없음 → 1」 케이스만 보면 초록이다. 그래서 재요청을 실제로 일으키는 케이스를
   같이 세우고, **1 과 2 가 갈리는 것**을 본다(마커는 두 상태를 갈라야 한다).
🔴 게이트웨이는 부르지 않는다 — `_post` 를 스텁으로 갈아 끼운다(구독 소모 0). 스텁은 **부른
   횟수를 자기가 세어** 페이로드의 `calls` 와 대조한다: 「필드가 말하는 수」와 「실제로 간 수」를
   다른 계측기로 재야 필드가 자기를 증명하지 못한다.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.investigation import live_synthesis as ls
from app.investigation.synthesize import Candidate

RULE = "SAF-LOTO-01"


def _state(text: str) -> dict[str, Any]:
    return {"structuredEvidence": [{"evidenceId": "E1", "note": text}]}


def _candidates() -> list[Candidate]:
    return [Candidate(failureModeId="FM-1", label="L", pattern="P", evidenceIds=["E1"])]


def _answer(sentence: str) -> dict[str, Any]:
    """가드(`apply_guard`)를 통과하는 최소 응답 — ranking 은 **id 문자열 배열**이다."""
    return {
        "model": "stub",
        "ranking": ["FM-1"],
        "rationale": {"FM-1": {"sentences": [sentence], "citedEvidenceIds": ["E1"]}},
    }


class _Gateway:
    """`_post` 자리에 들어가는 스텁 — 회차마다 다른 답을 주고 호출 수를 «자기가» 센다."""

    def __init__(self, answers: list[str]) -> None:
        self.answers = answers
        self.hits = 0
        self.notices: list[str | None] = []

    def __call__(self, url, body, timeout_sec, on_sentence=None):  # noqa: ANN001
        import json

        self.hits += 1
        self.notices.append(json.loads(body.decode("utf-8")).get("guardNotice"))
        return _answer(self.answers[min(self.hits - 1, len(self.answers) - 1)])


@pytest.fixture
def gate(monkeypatch: pytest.MonkeyPatch):
    """스텁 게이트웨이를 끼우고 돌려준다. `_post` 는 모듈 전역이라 호출 시점에 해석된다."""
    monkeypatch.setenv(ls.LIVE_GATE_ENV, "http://stub.invalid")

    def _install(answers: list[str]) -> _Gateway:
        stub = _Gateway(answers)
        monkeypatch.setattr(ls, "_post", stub)
        return stub

    return _install


def _run(coro):
    """비동기 진입점을 동기 테스트에서 돈다 — 이 스위트에 async 플러그인이 없다."""
    return asyncio.run(coro)


def test_no_safety_rule_in_evidence_costs_one_call(gate) -> None:
    """🔴 대조군 — 발췌에 `SAF-*` 가 없으면 재요청 자극 자체가 없다: 호출 1."""
    stub = gate(["원인은 배선 과열입니다."])
    result = _run(
        ls.synthesize(
        _candidates(), anchor=None, state=_state("배선 과열 기록"), evidence_ids=["E1"]
        )
    )
    assert result.axis == "live"
    assert stub.hits == 1                      # 실제로 간 수(다른 계측기)
    assert result.synthesis_payload()["calls"] == 1
    assert result.synthesis_payload()["safetyRetried"] is False


def test_unnamed_safety_rule_costs_two_calls(gate) -> None:
    """🔴 판정선 — 규정이 발췌에 있는데 1회차 답이 호명하지 않으면 호출 2."""
    stub = gate(["원인은 배선 과열입니다.", f"원인은 배선 과열입니다({RULE})."])
    result = _run(
        ls.synthesize(
        _candidates(), anchor=None, state=_state(f"{RULE} 준수 기록"), evidence_ids=["E1"]
        )
    )
    payload = result.synthesis_payload()
    assert stub.hits == 2
    assert payload["calls"] == 2
    assert payload["safetyRetried"] is True
    # 2회차에 통지가 실렸다 = 같은 발췌를 «왜» 다시 보냈는지가 본문에 있다.
    assert stub.notices[0] is None and RULE in (stub.notices[1] or "")
    # 2회차가 규정을 호명했으므로 `safetyOmitted` 는 실리지 않는다(D-84 규약 불변).
    assert "safetyOmitted" not in payload


def test_still_unnamed_after_retry_keeps_both_fields(gate) -> None:
    """2회차에도 미호명 — 채택하되 `safetyOmitted` 와 계수가 «함께» 선다."""
    stub = gate(["원인은 배선 과열입니다.", "원인은 여전히 배선 과열입니다."])
    result = _run(
        ls.synthesize(
        _candidates(), anchor=None, state=_state(f"{RULE} 준수 기록"), evidence_ids=["E1"]
        )
    )
    payload = result.synthesis_payload()
    assert stub.hits == 2
    assert payload["calls"] == 2 and payload["safetyRetried"] is True
    assert payload["safetyOmitted"] is True


def test_unreached_gateway_counts_zero(gate) -> None:
    """🔴 도달하지 못한 회차는 **소모가 아니다** — 주소가 비면 calls 0 이 «값»으로 실린다."""
    import os

    os.environ.pop(ls.LIVE_GATE_ENV, None)
    result = _run(
        ls.synthesize(
        _candidates(), anchor=None, state=_state("배선 과열"), evidence_ids=["E1"]
        )
    )
    payload = result.synthesis_payload()
    assert result.axis == "live-rejected"
    assert payload["calls"] == 0 and payload["safetyRetried"] is False


# ─────────────────────────────────────────────────────────────────────────────
# D-97-M2 — 「200 을 받았는가」가 기준이다 (리바이2 독검 회부 · 결함 수리)
#
# 🔴 앞판은 `_post` 가 **돌아온 뒤** 셌다. 그래서 200 을 받고 본문 «안»에서 끊긴 회차가
#    「도달 못 함」과 같은 0 이 됐다 — 페이로드에도 로그에도 남지 않는 소모였다.
# 🔴 아래 세 케이스는 **한 방향으로만 몰면 안 된다**: 200 뒤 실패는 1, 200 «전» 거부는 0.
#    둘 중 하나만 재면 「전부 1」이나 「전부 0」인 계측기가 통과한다.
# ─────────────────────────────────────────────────────────────────────────────


def _raise(exc: BaseException):
    def _stub(url, body, timeout_sec, on_sentence=None):  # noqa: ANN001
        raise exc

    return _stub


def test_stream_error_after_200_counts_one(monkeypatch: pytest.MonkeyPatch) -> None:
    """🔴 판정선 — 200 뒤 스트림 안에서 끊긴 회차는 **소모 1**이다."""
    monkeypatch.setenv(ls.LIVE_GATE_ENV, "http://stub.invalid")
    monkeypatch.setattr(ls, "_post", _raise(ls._Rejected("합성 결과가 근거 검증을 통과하지 못했습니다", reached=True)))
    result = _run(
        ls.synthesize(_candidates(), anchor=None, state=_state("배선 과열"), evidence_ids=["E1"])
    )
    payload = result.synthesis_payload()
    assert result.axis == "live-rejected"
    assert payload["calls"] == 1
    assert payload["safetyRetried"] is False


def test_refused_before_200_counts_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    """🔴 대조군 — 4xx·5xx 거부는 CLI 를 부르기 «전»이라 소모 0이다."""
    monkeypatch.setenv(ls.LIVE_GATE_ENV, "http://stub.invalid")
    monkeypatch.setattr(ls, "_post", _raise(ls._Rejected("게이트웨이가 요청을 거부했습니다(HTTP 401)")))
    result = _run(
        ls.synthesize(_candidates(), anchor=None, state=_state("배선 과열"), evidence_ids=["E1"])
    )
    assert result.synthesis_payload()["calls"] == 0


def test_guard_refusal_counts_one(monkeypatch: pytest.MonkeyPatch) -> None:
    """가드가 «내용»을 물린 회차 — 200 을 받았으므로 소모 1.

    🔴 패치는 **fixture 로** 건다. 직접 만든 `MonkeyPatch()` 는 되돌려지지 않아 뒤 테스트까지
       스텁을 물고 가고, 그러면 그 초록은 자기 것이 아니다.
    """
    monkeypatch.setenv(ls.LIVE_GATE_ENV, "http://stub.invalid")
    hits = {"n": 0}

    def _bad(url, body, timeout_sec, on_sentence=None):  # noqa: ANN001
        hits["n"] += 1
        # ranking 이 후보 집합과 다르다 → `apply_guard` 가 전량 거부한다(200 은 이미 받았다).
        return {"model": "stub", "ranking": ["FM-NOPE"], "rationale": {}}

    monkeypatch.setattr(ls, "_post", _bad)
    result = _run(
        ls.synthesize(_candidates(), anchor=None, state=_state("배선 과열"), evidence_ids=["E1"])
    )
    payload = result.synthesis_payload()
    assert result.axis == "live-rejected"
    assert hits["n"] == 1
    assert payload["calls"] == 1
