"""replay fixture — 커밋된 녹화본을 재생한다 (T2-4 · 오케 판정 J-A~J-F).

무엇이 «있는가»: fixture 경로 해석 · JSONL 로더(형상 검사 포함) · 재생 run 시작.

무엇이 «없는가», 그리고 왜: 이벤트를 **만들지** 않는다. 재생은 녹화된 봉투를 그대로 다시
내보내는 일이고, 여기서 무엇 하나라도 새로 «세우면» 그것은 재생이 아니라 두 번째 구현이다.

🔴 **치환은 두 필드뿐이다**(판정 J-C):
     `mode`  → "replay"  — 계약 스키마가 「replay 는 mode 만 다르다」고 못박았고, 재생본이
                           자신을 live 라고 말하면 그것이 곧 「새 조사인 척」이다.
     `runId` → 이 재생 run 의 id — 치환하지 않으면 `GET /runs/{새id}/events` 가 «남의
                           runId 를 담은» 이벤트를 내고 WS 경로와 envelope 가 어긋난다.
                           녹화 runId 를 그대로 재사용하는 길도 있으나, 같은 fixture 를 두
                           세션이 동시에 재생하면 store 키가 충돌해 세션 격리가 깨진다.
   `seq`·`ts`·`type`·`payload` 는 **손대지 않는다**. 특히 `ts` 는 녹화 시각 그대로다 —
   「지금」으로 바꾸면 새 조사인 척하는 것이다.

🔴 **payload 안의 녹화 runId 는 그대로 둔다**(판정 J-H). graph 근거의 `evidenceId`
   (`GP-<녹화 runId>-NN`)는 「그 경로 근거의 이름」이지 현재 run 의 이름이 아니다. 여기까지
   치환하면 그것은 payload 가공이고, 가공은 이 티켓이 통째로 금지한 것이다.

🔴 **fixture 가 없으면 시끄럽게 막는다**(판정 J-F). 조용한 빈 재생은 「없는 것을 있다고
   말하는」 것의 가장 나쁜 형태다 — 화면은 아무 일도 없었다는 사실조차 모른다.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from .binding import ScenarioAnchor
from .store import TERMINAL_EVENT_STATUS, RunRecord, RunStore

FIXTURE_SUFFIX = ".events.jsonl"

# 🔴 **리포 안에서 돈다고 «단정»하지 않는다** — 이 줄이 `parents[4]` 였고, 컨테이너에서
#    모듈이 `/srv/app/investigation/replay.py` 로 놓이자 **import 시점에 IndexError 로
#    프로세스가 죽었다**(T4-1 실측: 컨테이너 crash loop · uvicorn 이 앱을 못 올린다).
#    「어디서 도는지」는 배포 형상이 정하는데 그 가정을 모듈 최상단에 굳혀 둔 것이 문제였다.
#
# 🔴 그래서 ① 계산을 «쓸 때»로 미루고 ② 위로 못 올라가면 `None` 을 돌려준다. 부재는
#    「fixture 가 없다」(FixtureMissing)로 드러나야지, 부팅 실패로 드러날 일이 아니다 —
#    컨테이너에서는 `FKT_REPLAY_FIXTURE_DIR` 로 자리를 «명시»한다(compose 가 그렇게 준다).
_REPO_RELATIVE_DEPTH = 4   # services/ai-api/app/investigation/replay.py → repo root


def _repo_fixture_dir() -> Path | None:
    here = Path(__file__).resolve()
    if len(here.parents) <= _REPO_RELATIVE_DEPTH:
        return None
    return here.parents[_REPO_RELATIVE_DEPTH] / "data" / "replay"

# 파일명이 되는 값이라 형식을 좁힌다. 라우터가 allowlist(binding)를 먼저 지나므로 실질
# 도달 경로는 없지만, 「경로가 되는 문자열」의 검증을 호출자에게 맡기지 않는다.
_SCENARIO_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$")

_REQUIRED_FIELDS = ("runId", "seq", "ts", "mode", "type", "payload")
# 🔴 정본은 `store.TERMINAL_EVENT_STATUS` 하나다(이름만 여기 남긴다).
_TERMINAL_TYPES = TERMINAL_EVENT_STATUS


class FixtureMissing(RuntimeError):
    """그 시나리오의 녹화본이 없다 — 재생할 것이 존재하지 않는다."""


class FixtureBroken(RuntimeError):
    """녹화본은 있으나 형상이 깨졌다 — 서버 자산의 문제다(호출자 잘못이 아니다)."""


def fixture_dir(fixture_dir_setting: str | None) -> Path:
    """fixture 디렉터리. 기본값은 «리포 상대»다.

    🔴 코드 기본값에 이 머신의 절대경로를 박지 않는다 — 커밋되는 값에 그것이 들어가면
       그 자체가 공개 경계 위반이다(§34.6). 환경변수(`FKT_REPLAY_FIXTURE_DIR`)로 바꿀 수
       있게 두는 이유는 「fixture 부재」 상태를 시험에서 실제로 만들어 재기 위함이다(J-F).
    """
    if fixture_dir_setting:
        return Path(fixture_dir_setting)
    guess = _repo_fixture_dir()
    if guess is None:
        # 🔴 리포 밖(컨테이너)이고 설정도 없다 — 「없는 자리」를 돌려주어 부재가 부재로
        #    드러나게 한다. 여기서 예외를 던지면 fixture 를 안 쓰는 요청까지 함께 죽는다.
        return Path("/nonexistent/replay-fixtures")
    return guess


def fixture_path(fixture_dir_setting: str | None, scenario_id: str) -> Path:
    if not _SCENARIO_ID.match(scenario_id):
        raise FixtureMissing(f"시나리오 id 형식이 아니다: {scenario_id!r}")
    return fixture_dir(fixture_dir_setting) / f"{scenario_id.lower()}{FIXTURE_SUFFIX}"


def load(fixture_dir_setting: str | None, scenario_id: str) -> list[dict[str, Any]]:
    """녹화본을 읽어 이벤트 배열로 돌려준다. 형상이 깨졌으면 `FixtureBroken`.

    🔴 **검사가 무엇을 봤는지 센다**: 줄 수 0 은 «통과»가 아니라 고장이다. 빈 fixture 를
       읽어 놓고 「이벤트 0건을 재생했다」고 답하면 조용한 빈 재생이 된다.
    """
    path = fixture_path(fixture_dir_setting, scenario_id)
    if not path.is_file():
        raise FixtureMissing(f"{scenario_id} 의 replay fixture 가 없다: {path.name}")

    events: list[dict[str, Any]] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            event = json.loads(line)
        except json.JSONDecodeError as exc:
            raise FixtureBroken(f"{path.name}:{lineno} JSON 이 아니다: {exc}") from exc
        if not isinstance(event, dict):
            raise FixtureBroken(f"{path.name}:{lineno} 이벤트가 객체가 아니다")
        missing = [f for f in _REQUIRED_FIELDS if f not in event]
        if missing:
            raise FixtureBroken(f"{path.name}:{lineno} 필수 필드 없음: {missing}")
        events.append(event)

    if not events:
        raise FixtureBroken(f"{path.name} 에 이벤트가 하나도 없다 — 빈 녹화본은 재생본이 아니다")

    seqs = [e["seq"] for e in events]
    if seqs != list(range(len(events))):
        # 🔴 여기서 «정렬해서 고치지» 않는다. seq 가 어긋난 녹화본은 그 자체가 사고의 증거이고,
        #    조용히 바로잡으면 무엇이 어긋났는지 영영 모른다.
        raise FixtureBroken(f"{path.name} seq 가 0..{len(events)-1} 단조가 아니다")
    run_ids = {e["runId"] for e in events}
    if len(run_ids) != 1:
        raise FixtureBroken(f"{path.name} 에 run 이 섞여 있다: {sorted(run_ids)}")
    if events[-1]["type"] not in _TERMINAL_TYPES:
        raise FixtureBroken(f"{path.name} 이 종단 이벤트로 끝나지 않는다: {events[-1]['type']}")
    return events


def start(
    store: RunStore,
    *,
    session_id: str,
    anchor: ScenarioAnchor,
    events: list[dict[str, Any]],
) -> RunRecord:
    """재생 run 을 만들고 녹화 이벤트를 «그대로» 흘린다.

    🔴 실행 경로와 **같은 저장소·같은 로그**를 쓴다(이원화 금지). 그래서 `GET /runs/{id}/events`
       와 WS 는 재생본에 대해서도 코드 한 줄 바꾸지 않고 같은 원천을 낸다.

    🔴 전량을 즉시 흘린다(판정 J-D). 원본 간격대로 흘리는 것은 «발행 속도»의 문제이고,
       필요해지면 이벤트를 손대지 않고 그 축만 더한다.
    """
    record = store.create(
        session_id=session_id,
        scenario_id=anchor.scenarioId,
        incident_id=anchor.incidentId,
        mode="replay",
    )
    for event in events:
        # dict 갱신은 키 «위치»를 유지한다 — 봉투의 필드 순서가 녹화본과 같게 남는다.
        record.append({**event, "runId": record.runId, "mode": "replay"})

    last = record.events[-1]
    record.status = _TERMINAL_TYPES[last["type"]]                    # type: ignore[assignment]
    if last["type"] == "run.completed":
        payload = last["payload"]
        record.candidates = payload.get("candidates", [])
        record.workOrderDraftId = payload.get("workOrderDraftId")
    # 🔴 `graphPaths` 는 비워 둔다 — 이벤트 밖에 살던 값이라 녹화본에 없다(판정 J-G).
    #    비었다는 사실을 `/graph/paths?byRun=` 이 «빈 배열 200» 으로 감추지 않게, 그 라우트가
    #    replay run 을 명시 오류로 막는다(routers/knowledge.py).
    record.close_subscribers()
    return record
