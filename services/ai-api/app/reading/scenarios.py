"""GET /scenarios — 승인된 시나리오 목록 (T2-2 · 계약 v0.1.1 append).

🔴 **질문의 유일한 원천은 `app/retrieval/allowlist.py` 다.** 이 모듈은 그것을 «읽어서»
   낼 뿐 자기 목록을 갖지 않는다. 두 목록이 따로 자라면 화면은 `/scenarios` 에서 받은
   질문을 compare 에 보냈다가 400(`question_not_approved`)을 맞는다 — 서버가 자기 자신과
   어긋나는 자리다(오케 판정 08-30 · 「목록 이원화 = FAIL」).

🔴 실리는 문자열은 **표준 표기**(`allowlist.canonical`)다. 정본 표기에는 마크다운 백틱·
   강조가 섞여 있어 화면에 그대로 보이면 안 되고, 무엇보다 compare 가 검색에 쓰는 것이
   바로 이 표준 표기다(V-1 정정). 화면이 받은 문자열과 서버가 검색하는 문자열이 같아진다.

승인 시나리오는 현재 **GS-01 하나**다(`docs/product/golden-scenario-spec.md`). 평가 질문
10문이 여기 붙는 이유: 그 10문(T0-8)이 **GS-01 무대 위에서 설계된 평가셋**이기 때문이다 —
같은 설비·알람·SOP·안전 규정을 앵커로 쓰고, `Q-MULTIHOP-001` 은 GS-01 단계 대본 S5의
경로를 그대로 묻는다. 시나리오가 늘면 이 귀속을 문항별로 쪼개야 한다(지금은 1:전체).
"""

from __future__ import annotations

from ..retrieval import allowlist
from ..schemas import ScenarioSummary

# (scenarioId, title) — golden-scenario-spec.md 표제 그대로.
_APPROVED: tuple[tuple[str, str], ...] = (("GS-01", "스핀들 진동 이상 조사"),)


def list_scenarios() -> list[ScenarioSummary]:
    questions = [allowlist.canonical(qid) for qid in allowlist.APPROVED_QUESTIONS]
    return [
        ScenarioSummary(scenarioId=sid, title=title, questions=questions)
        for sid, title in _APPROVED
    ]
