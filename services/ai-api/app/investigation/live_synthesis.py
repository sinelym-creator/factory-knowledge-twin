"""live 합성 축 — 로컬 게이트웨이(호스트 프로세스)에 물어 순위·근거 문장을 받는다.

🔴 이 모듈은 `FKT_LOCAL_SYNTHESIS_GATEWAY` 가 켜졌을 때만 import 된다
   (`synthesize.resolve_synthesizer`). 공개 배포 프로세스 안에는 이 코드가 «불려오지» 않는다.

🔴 조용한 폴백 0 — 게이트웨이가 못 답했거나, 답이 근거 결속을 깨거나, 형상이 어긋나면
   **전량 거부**하고 결정적 순위를 그대로 쓰되 `axis="live-rejected"` + 사유를 드러낸다.
   부분 채택(문장만 쓰고 순위는 버리는 식)은 하지 않는다 — 어느 쪽이 말한 결과인지 갈리면
   화면의 근거 표기가 거짓이 된다.

의존: 표준 라이브러리만(urllib). 새로 들이는 패키지가 없다.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable

from .synthesize import LIVE_GATE_ENV, Candidate

log = logging.getLogger(__name__)

# 🔴 **불변식: 게이트웨이 상한 < 이 예산**(= 아래 값 + margin). 게이트웨이가 먼저 504 로
#    사유를 내고, 클라이언트는 그 답을 받을 만큼만 더 기다린다 — 클라이언트가 먼저 끊으면
#    게이트웨이가 답할 수 있었던 건까지 「타임아웃」으로 뭉뚱그려지고, 어느 쪽이 끊었는지
#    사후에 가릴 수 없다.
# 🔴 그래서 이름을 **분리했다**(32대 09-03). 예전엔 이 예산과 게이트웨이 상한이 둘 다
#    `SYNTHESIS_TIMEOUT_MS` 였다 — 한 셸에서 export 하면 두 값이 함께 움직여 불변식이
#    무의미해지고, 크게 주면 드릴 상한(300s)까지 넘겨 «사유 없는 무효»가 된다(31대 드릴 0/4).
#    게이트웨이 쪽 이름 = `SYNTHESIS_GATEWAY_TIMEOUT_MS`.
TIMEOUT_ENV = "SYNTHESIS_TIMEOUT_MS"
DEFAULT_TIMEOUT_MS = 60_000
CLIENT_MARGIN_MS = 5_000

UNKNOWN_MODEL = "claude-code-cli:unknown"
_MAX_EXCERPT = 600

# 🔴 게이트웨이와 «같은 비밀»이되 이름의 접두어는 층을 따른다 — ai-api 쪽 env 는 `FKT_`
#    (LIVE_GATE_ENV 와 같은 관례)이고 게이트웨이 쪽은 `SYNTHESIS_` 다. 이름을 새로 짓지 않고
#    `run.ps1` 이 이미 안내하던 문면(`FKT_SYNTHESIS_GATEWAY_TOKEN`)을 그대로 쓴다 —
#    이미 참을 말하는 층에서 낱말을 빌리는 편이 낱말을 하나 더 만드는 것보다 안전하다.
#    값이 없으면 헤더를 아예 붙이지 않는다(토큰 없는 게이트웨이와 그대로 호환).
TOKEN_ENV = "FKT_SYNTHESIS_GATEWAY_TOKEN"
TOKEN_HEADER = "X-FKT-Gateway-Token"
# 스트리밍을 «요청»하는 낱말 — 게이트웨이와 «같은 문자열»이어야 한다(양쪽에 적는 값이라
# 이름을 새로 짓지 않고 계약 문면 그대로 쓴다).
NDJSON_MIME = "application/x-ndjson"

# 도달 프로브 — `/live/status` 가 「env 가 있다」가 아니라 「닿는다」를 답하게 하는 자리.
PROBE_TIMEOUT_SEC = 2.0
PROBE_CACHE_SEC = 5.0

# 🔴 **안전 규정 id 는 근거 «본문»에 산다 — 근거 id «집합»에는 없다**(D-84).
#    실측(#758 raw · GS-01 live 3/3 · 근거 19건): `evidenceText` 의 **키**에 `SAF-*` 0건 ·
#    발췌 **본문**에 `SAF-LOTO-01` 1건(graph 경로 `GP-…-03/04` 의 nodes 안). 그래서 이 판정을
#    `evidence_ids`(키 집합)로 하면 자극이 영원히 0건이 되고 초록이 거짓으로 난다.
#    앞의 `-` 를 막는 이유: `DOC-SAF-0030` 은 그 규정을 «담은 문서»의 id 이지 규정 id 가 아니다.
#    (실측 위양성: 같은 3 run 전량에서 이 배제로 사라지는 id 0건 — 넓혀도 이 데이터에선 같았다.)
SAFETY_RULE_RE = re.compile(r"(?<![A-Za-z0-9-])SAF-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*")
SAFETY_OMITTED_REASON = "safety_rule_omitted"
# 통지에 싣는 규정 id 상한 — 통지는 프롬프트에 들어가는 문장이라 길이를 우리가 정한다.
MAX_NOTICE_RULES = 5


@dataclass
class LiveResult:
    """합성 축 하나의 결과. `axis` 가 무엇이든 «순위는 항상 있다»(거부 시 결정적 순위)."""

    axis: str                                       # "live" | "live-rejected"
    candidates: list[Candidate]
    model: str | None = None
    rejected_reason: str | None = None
    rationale: dict[str, dict[str, Any]] = field(default_factory=dict)
    safety_omitted: bool = False

    def synthesis_payload(self) -> dict[str, Any]:
        """`step.completed(synthesize).payload.synthesis` — 계약 v0.1.11 형상 그대로.

        🔴 `safetyOmitted` 는 **참일 때만** 싣는다(D-84). 화면이 아니라 계측이 보는 칸이라
           평시 형상을 바꾸지 않는 편이 낫다 — 늘 붙는 `false` 는 「이 run 은 재요청까지 갔다」와
           「이 run 은 규정이 아예 없었다」를 같은 칸으로 만든다.
        """
        payload: dict[str, Any] = {"axis": self.axis}
        if self.model:
            payload["model"] = self.model
        if self.rejected_reason:
            payload["rejectedReason"] = self.rejected_reason
        if self.safety_omitted:
            payload["safetyOmitted"] = True
        return payload


class _Rejected(Exception):
    """가드가 응답을 물렸다 — 이 메시지가 «그대로» 이벤트에 실린다.

    🔴 그래서 여기 담는 것은 **이미 방문자가 읽을 문장**이어야 한다. 남의 층(게이트웨이·CLI)이
       준 문자열을 그대로 넣으면 그 층의 내부 문면이 공개 화면까지 간다(D-23 · D-24 · D-24b 가
       전부 그 형태였다). 남의 말은 `_refusal_wording` 을 태우고, 원문은 로그에 남긴다.
    """


class _GatewayStreamError(RuntimeError):
    """게이트웨이가 200 을 낸 «뒤» 본문 안에서 끊었다 — 상태코드로 말할 수 없는 자리.

    🔴 이 형은 **분류하기 위해** 있다. NDJSON 첫 줄이 나간 뒤에는 상태코드를 바꿀 수 없어
       게이트웨이가 사유를 본문(`kind=error`)으로 싣는데, 그 사유는 게이트웨이 내부 문면이다.
       그대로 올리면 D-24 와 같은 누출이 되므로 사유는 로그에 두고 이 형으로 바꿔 던진다.

    🔴 `code` 는 게이트웨이가 준 **분류**다(문면 아님). 문면을 정규식으로 갈라 분류하는 길도
       있었지만, 그러면 게이트웨이의 한 낱말이 바뀔 때 화면이 조용히 다른 사실을 말한다.
    """

    def __init__(self, reason: str, code: str | None = None) -> None:
        super().__init__(reason)
        self.code = code


def gateway_url() -> str:
    return (os.environ.get(LIVE_GATE_ENV) or "").rstrip("/")


def timeout_ms() -> int:
    raw = os.environ.get(TIMEOUT_ENV)
    try:
        return int(raw) if raw else DEFAULT_TIMEOUT_MS
    except ValueError:
        return DEFAULT_TIMEOUT_MS


def build_evidence_text(state: dict[str, Any]) -> dict[str, str]:
    """run 이 «실제로 낸» 근거만 발췌로 바꾼다 — 여기 없는 id 는 인용될 수 없다.

    structured/vector/graph 세 단계가 `step.evidence` 로 낸 것과 같은 id 집합이다.
    """
    excerpts: dict[str, str] = {}

    for item in state.get("structuredEvidence", []) or []:
        evidence_id = item.get("evidenceId")
        if not isinstance(evidence_id, str):
            continue
        body = {k: v for k, v in item.items() if k != "evidenceId"}
        excerpts[evidence_id] = json.dumps(body, ensure_ascii=False)[:_MAX_EXCERPT]

    for evidence_id, text in (state.get("citations") or {}).items():
        if isinstance(evidence_id, str) and isinstance(text, str):
            excerpts[evidence_id] = text[:_MAX_EXCERPT]

    for path in state.get("graphPaths", []) or []:
        evidence_id = path.get("evidenceId")
        if not isinstance(evidence_id, str):
            continue
        excerpts[evidence_id] = json.dumps(
            {k: path.get(k) for k in ("targetId", "label", "hops", "nodes", "edges")},
            ensure_ascii=False,
        )[:_MAX_EXCERPT]

    return excerpts


def safety_rules_in_evidence(evidence_text: dict[str, str]) -> set[str]:
    """발췌 **본문**에서 안전 규정 id 를 거둔다 — 키가 아니라 값을 훑는다(위 주석의 이유)."""
    found: set[str] = set()
    for text in evidence_text.values():
        if isinstance(text, str):
            found.update(SAFETY_RULE_RE.findall(text))
    return found


def unnamed_safety_rules(rules: set[str], rationale: dict[str, dict[str, Any]]) -> list[str]:
    """규정 id 중 **어느 후보의 어느 문장에도** 안 나온 것.

    🔴 답 쪽은 «부분일치»로 관대하게 본다 — 답이 `DOC-SAF-0030` 처럼 그 규정을 담은 문서를
       호명해도 호명으로 친다. 거두는 쪽(위)만 엄격하다. 두 축의 기준을 같게 맞추면 둘 중
       하나가 반드시 틀린다: 양쪽 다 엄격하면 문서 호명이 누락으로 찍히고(위양성), 양쪽 다
       느슨하면 `DOC-SAF-0030` 만 있는 발췌가 규정 호명을 «요구»한다(허위 자극).
    """
    if not rules:
        return []
    blob = " ".join(
        sentence
        for entry in rationale.values()
        for sentence in entry.get("sentences", [])
        if isinstance(sentence, str)
    )
    return sorted(rule for rule in rules if rule not in blob)


def _guard_notice(missing: list[str]) -> str:
    """재요청 1회에 실을 통지. 담기는 것은 우리 문장 + `SAF-[A-Za-z0-9-]+` 로 제한된 id 뿐이다."""
    shown = missing[:MAX_NOTICE_RULES]
    return (
        "Your previous answer for this input did not name these safety rule ids: "
        + ", ".join(shown)
        + ". Name each of them verbatim in the sentence text of the candidate whose work it governs. "
        "Do not put them in `ids`."
    )


def _request_body(
    anchor: Any,
    candidates: list[Candidate],
    evidence_text: dict[str, str],
    guard_notice: str | None = None,
) -> bytes:
    payload = {
        "anchor": {
            "scenarioId": getattr(anchor, "scenarioId", None),
            "alarmId": getattr(anchor, "alarmId", None),
            "equipmentId": getattr(anchor, "equipmentId", None),
        },
        "candidates": [
            {
                "failureModeId": c.failureModeId,
                "label": c.label,
                "pattern": c.pattern,
                "evidenceIds": c.evidenceIds,
                "history": c.history,
                "citations": c.citations,
                "graphHops": c.graphHops,
                "sopIds": c.sopIds,
            }
            for c in candidates
        ],
        "evidenceText": evidence_text,
    }
    # 🔴 통지가 없으면 **키 자체를 넣지 않는다** — 평시 본문은 앞판과 바이트로 같다(옵트인).
    if guard_notice:
        payload["guardNotice"] = guard_notice
    return json.dumps(payload, ensure_ascii=False).encode("utf-8")


def _headers(base: dict[str, str] | None = None) -> dict[str, str]:
    """토큰이 설정돼 있으면 붙인다 — 값은 로그·예외 문면 어디에도 싣지 않는다."""
    headers = dict(base or {})
    token = os.environ.get(TOKEN_ENV, "").strip()
    if token:
        headers[TOKEN_HEADER] = token
    return headers


_probe_cache: dict[str, Any] = {"at": 0.0, "online": False}


def probe_reachable() -> bool:
    """게이트웨이에 «실제로 닿는가» — `GET /health` 1회. 결과는 몇 초 캐시한다.

    🔴 「env 가 있다」와 「닿는다」는 다른 사실이다. 앞의 것만 보고 online=true 를 주면
       화면은 갈 수 없는 길을 권하고, 방문자는 진행 표시 뒤에서 거부를 만난다
       (31대 드릴이 정확히 그 형태로 무효가 났다 — 자극이 게이트웨이에 닿지 않았다).

    🔴 캐시가 필요한 이유: 배지는 폴링된다. 캐시가 없으면 방문자 수만큼 게이트웨이를
       두드리고, 그 두드림이 합성 1건과 같은 단일 스레드 서버를 막는다.
       반대로 캐시가 길면 「방금 껐는데 아직 켜져 보인다」가 된다 — 그래서 몇 초다.
    """
    url = gateway_url()
    if not url:
        return False
    now = time.monotonic()
    if now - float(_probe_cache["at"]) < PROBE_CACHE_SEC:
        return bool(_probe_cache["online"])
    online = False
    try:
        request = urllib.request.Request(                    # noqa: S310 — 루프백 고정 URL
            f"{url}/health", headers=_headers(), method="GET"
        )
        with urllib.request.urlopen(request, timeout=PROBE_TIMEOUT_SEC) as response:  # noqa: S310
            online = response.status == 200
    except Exception:                                        # noqa: BLE001 — 못 닿는 것도 «답»이다
        online = False
    _probe_cache["at"] = now
    _probe_cache["online"] = online
    return online


def _post(
    url: str,
    body: bytes,
    timeout_sec: float,
    on_sentence: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """게이트웨이 1회. `on_sentence` 를 주면 **스트리밍을 «요청»하고** 줄마다 부른다.

    🔴 **옵트인이다.** 콜백이 없으면 `Accept` 를 붙이지 않고, 게이트웨이는 앞판과 같은 단일
       JSON 으로 답한다 — 이 파일이 구 게이트웨이와도 계속 돈다(둘 중 하나만 배포된 창이 반드시
       생긴다).

    🔴 **스트리밍을 «요청»했다고 «받았다»가 아니다.** 구 게이트웨이는 Accept 를 무시하고 단일
       JSON 을 준다. 그래서 응답의 Content-Type 으로 갈라 읽는다 — 요청한 형식을 전제하고 읽으면
       그 창에서 전건 실패한다.
    """
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if on_sentence is not None:
        headers["Accept"] = NDJSON_MIME
    request = urllib.request.Request(                        # noqa: S310 — 127.0.0.1 고정 URL
        f"{url}/synthesize",
        data=body,
        headers=_headers(headers),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_sec) as response:  # noqa: S310
            ctype = (response.headers.get("Content-Type") or "").lower()
            if on_sentence is None or NDJSON_MIME not in ctype:
                return json.loads(response.read().decode("utf-8"))
            return _read_ndjson(response, on_sentence)
    except urllib.error.HTTPError as exc:
        # 🔴 **본문 사유는 «로그에만» 남긴다**(D-24 · 리바이2 #444 회부 2). 게이트웨이가 401 에
        #    실어 보내는 사유는 **내부 인증 헤더 이름**을 그대로 담고 있고, 앞판은 그것을 그대로
        #    올려 `rejectedReason` → run 타임라인 → **공개 화면**까지 흘려보냈다(baseline §15.2 공개 경계).
        #    D-23 과 같은 형태의 누출이다 — 다른 점은 새어 나간 것이 예외 이름이 아니라 우리 헤더 이름이라는 것뿐이다.
        detail = ""
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("rejectedReason", "")
        except Exception:                                    # noqa: BLE001 — 사유를 못 읽어도 상태는 남긴다
            detail = ""
        log.warning("게이트웨이가 거부 — HTTP %s: %s", exc.code, detail or "(본문 사유 없음)")
        raise _Rejected(_refusal_wording(exc)) from None
    except TimeoutError:
        raise _Rejected(f"게이트웨이 타임아웃({int(timeout_sec * 1000)}ms)") from None
    except urllib.error.URLError as exc:
        # 🔴 **여기가 방문자가 실제로 읽는 자리다**(33대 브라우저 실측: 화면 문면 =
        #    「게이트웨이 미도달(ConnectionRefusedError)」). D-23 수리를 아래 `except
        #    Exception` 에만 걸었더니 이 `_Rejected` 경로는 세 줄 위에서 그대로 샜다 —
        #    가드가 «전량 거부»로 승격시키는 경로라 예외 그물에 닿지 않는다.
        log.warning("게이트웨이 미도달 — %s: %s", type(exc.reason).__name__, exc.reason)
        raise _Rejected(_refusal_wording(exc)) from None
    except json.JSONDecodeError:
        raise _Rejected("게이트웨이 응답을 JSON 으로 읽지 못했다") from None


def _read_ndjson(response: Any, on_sentence: Callable[[dict[str, Any]], None]) -> dict[str, Any]:
    """chunked NDJSON 을 줄 단위로 읽는다. 문장 줄은 흘리고, 마지막 result 줄을 돌려준다.

    🔴 **오류는 «본문 안»으로도 온다.** 첫 줄이 나간 뒤에는 상태코드를 바꿀 수 없으므로
       게이트웨이가 `{"kind":"error"}` 로 사유를 싣는다 — 그 줄을 그대로 거부로 올린다.
       읽고 버리면 「문장 몇 개 받고 조용히 끝난 run」이 된다.

    🔴 **result 줄이 없으면 실패다.** 문장이 아무리 많이 왔어도 판정은 마지막 줄이고, 그 줄이
       없으면 가드가 볼 것이 없다(부분 채택 0).
    """
    result: dict[str, Any] | None = None
    for raw in response:
        line = raw.decode("utf-8").strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(obj, dict):
            continue
        kind = obj.get("kind")
        if kind == "sentence":
            sentence = obj.get("sentence")
            if isinstance(sentence, dict):
                on_sentence(sentence)
        elif kind == "error":
            # 🔴 **게이트웨이의 «자기 문면»을 그대로 올리지 않는다**(D-24b · D-24 와 같은 경계).
            #    여기 오는 문자열은 게이트웨이가 자기 검사에 쓴 말이라, 우리 화면의 낱말이 아니다.
            #    원문은 로그에만 두고 분류를 태운다.
            reason = str(obj.get("rejectedReason") or "")
            code = obj.get("reasonCode")
            log.warning(
                "게이트웨이가 스트림 도중 거부 — code=%s · %s",
                code or "(없음)",
                reason or "(사유 없음)",
            )
            raise _Rejected(
                _refusal_wording(_GatewayStreamError(reason, code if isinstance(code, str) else None))
            )
        elif kind == "result" and isinstance(obj.get("result"), dict):
            result = obj["result"]
    if result is None:
        raise _Rejected("게이트웨이가 결과 줄 없이 끝냈다")
    return result


def apply_guard(
    response: dict[str, Any],
    candidates: list[Candidate],
    evidence_ids: set[str],
) -> tuple[list[Candidate], dict[str, dict[str, Any]]]:
    """🔴 근거 결속 가드 — 하나라도 어긋나면 전량 거부(부분 채택 0).

    `evidence_ids` 는 **run 근거집합**이다(`workflow.Context.evidence_ids`). 게이트웨이에 보낸
    발췌 목록이 아니라 이것이 판정 기준이다 — 보낸 것이 잘못 좁거나 넓어도 여기서 걸린다.
    """
    ranking = response.get("ranking")
    rationale = response.get("rationale")
    if not isinstance(ranking, list) or not all(isinstance(x, str) for x in ranking):
        raise _Rejected("ranking 이 문자열 배열이 아니다")
    if not isinstance(rationale, dict):
        raise _Rejected("rationale 이 객체가 아니다")

    by_id = {c.failureModeId: c for c in candidates}
    if set(ranking) != set(by_id) or len(ranking) != len(by_id):
        raise _Rejected("ranking 이 후보 집합과 다르다(추가·누락·중복)")

    cleaned: dict[str, dict[str, Any]] = {}
    for fm_id, entry in rationale.items():
        if fm_id not in by_id:
            raise _Rejected("rationale 에 준 적 없는 failureModeId 가 있다")
        if not isinstance(entry, dict):
            raise _Rejected("rationale 원소가 객체가 아니다")
        sentences = entry.get("sentences")
        cited = entry.get("citedEvidenceIds")
        if not isinstance(sentences, list) or not sentences:
            raise _Rejected("rationale.sentences 가 비었다")
        if not all(isinstance(s, str) and s.strip() for s in sentences):
            raise _Rejected("rationale.sentences 에 빈 문장이 있다")
        if not isinstance(cited, list) or not cited:
            raise _Rejected("rationale.citedEvidenceIds 가 비었다")
        outside = [c for c in cited if not isinstance(c, str) or c not in evidence_ids]
        if outside:
            # 🔴 여기가 T6-1 의 핵심 판정 — 인용이 run 근거집합 밖이면 응답 전체를 버린다.
            raise _Rejected(f"인용 id 가 run 근거집합 밖이다({len(outside)}건)")
        cleaned[fm_id] = {"sentences": list(sentences), "citedEvidenceIds": list(cited)}

    if set(cleaned) != set(by_id):
        raise _Rejected("rationale 이 후보 전부를 덮지 않는다")

    reordered = [by_id[fm_id] for fm_id in ranking]
    # 🔴 재정렬은 허용하되, 받친 근거가 0 인 후보를 «새로» 1순위로 올리는 것은 거부한다.
    if reordered[0].support == 0 and reordered[0].failureModeId != candidates[0].failureModeId:
        raise _Rejected("support 0 후보를 1순위로 승격했다")

    return reordered, cleaned


def _refusal_wording(exc: BaseException) -> str:
    """예외를 «방문자가 읽을 문장»으로 바꾼다 — D-23(09-03 리바이2 회부 · 오케 판정).

    🔴 **클래스명·호스트·포트를 싣지 않는다.** 앞판은 `f"합성 중 예외({type(exc).__name__})"`
       였고, 그 문자열이 `rejectedReason` → run 타임라인 → **공개 화면**까지 그대로 흘러
       방문자가 `ConnectionRefusedError` 를 읽었다(baseline §15.2 공개 경계 · 계약 OFF 문면).
       원문은 아래 호출부에서 **로그에만** 남긴다.

    🔴 **분류는 다섯 종뿐이다.** 한 문장이 모든 원인을 덮으면 아무 원인도 말하지 않고, 반대로
       원인을 더 잘게 나누면 그 목록이 곧 내부 구현의 지도가 된다. 방문자에게 필요한 것은
       「지금 어떤 상태인가」와 「무엇을 할 수 있는가」이지 예외 이름이 아니다.
    """
    if isinstance(exc, _GatewayStreamError):
        # 🔴 **상태코드가 없는 자리다**(D-24b). 게이트웨이가 200 을 낸 뒤 본문 안에서 끊었으므로
        #    아래 「…(HTTP {code})」를 쓸 수 없다 — 없는 코드를 지어내는 대신 코드를 말하지 않는다.
        #    방문자에게 필요한 것은 코드가 아니라 «지금 무엇인가»다: 잠정 문장은 걷히고 순위는
        #    결정적 집계로 남는다(그 뒷문장은 화면이 이미 말한다).
        if exc.code == "evidence_binding":
            # 🔴 **정보를 경계 때문에 버리지 않는다**(오케 판정 14:59). 「모델 답이 우리가 준
            #    근거에 묶이지 않았다」는 운영자의 행동을 바꾸는 사실이다 — 게이트웨이의 «말»은
            #    올리지 않되, 같은 사실을 «우리 어휘»로 다시 쓴다(원문 id·헤더명은 로그에만).
            return "합성 결과가 근거 검증을 통과하지 못했습니다"
        return "게이트웨이가 응답 도중 요청을 거부했습니다"
    if isinstance(exc, urllib.error.HTTPError):
        # 🔴 **URLError 보다 «먼저» 본다.** HTTPError 는 URLError 의 하위형이라 순서를 바꾸면
        #    「게이트웨이가 답했다(401)」가 「게이트웨이가 답하지 않는다」로 뒤집힌다 — 방문자가
        #    할 일이 같지 않은 두 상태다(설정을 본다 vs 게이트웨이를 켜야 한다).
        # 🔴 **상태코드까지가 공개 한계다.** 본문 사유는 게이트웨이 «내부» 문면이라 싣지 않는다
        #    — 그 자리가 헤더 이름을 내보낸 구멍이다.
        return f"게이트웨이가 요청을 거부했습니다(HTTP {exc.code})"
    if isinstance(exc, (TimeoutError, asyncio.TimeoutError)):
        return "응답 시간 초과"
    if isinstance(exc, (urllib.error.URLError, ConnectionError, OSError)):
        # URLError 는 연결 거부·DNS·경로 없음을 한꺼번에 덮는다. 셋 다 방문자에게는 같은
        # 사실이다 — 게이트웨이가 지금 답하지 않는다.
        return "소유자 게이트웨이 OFF(미도달)"
    return "합성 중 오류"


async def synthesize(
    candidates: list[Candidate],
    *,
    on_sentence: Callable[[dict[str, Any]], None] | None = None,
    anchor: Any,
    state: dict[str, Any],
    evidence_ids: list[str],
) -> LiveResult:
    """live 축 1회. 예외를 밖으로 내보내지 않는다 — 실패도 «드러난 결과»로 돌려준다."""
    url = gateway_url()
    if not url:
        return LiveResult(axis="live-rejected", candidates=candidates, rejected_reason="게이트웨이 주소가 비었다")

    evidence_text = build_evidence_text(state)
    if not evidence_text:
        return LiveResult(axis="live-rejected", candidates=candidates, rejected_reason="보낼 근거 발췌가 0건이다")

    budget_sec = (timeout_ms() + CLIENT_MARGIN_MS) / 1000.0
    safety_rules = safety_rules_in_evidence(evidence_text)

    model: str | None = None
    notice: str | None = None
    safety_omitted = False
    # 🔴 **최대 두 회차 · 그 이상 없다**(D-84). 규정 누락은 「답이 틀렸다」가 아니라 「덜 말했다」라
    #    거부로 승격시키지 않는다 — 거부하면 결정적 순위로 내려앉아 방문자가 보는 것이 더 나빠진다.
    #    그래서 재요청은 **1회**, 2회째 답은 누락이 남아도 **그대로 채택**하고 계측에만 표기한다.
    for attempt in (1, 2):
        body = _request_body(anchor, candidates, evidence_text, notice)
        try:
            # 🔴 **스트리밍은 1회차에만** 흘린다. 2회차까지 흘리면 같은 run 의 잠정 문장이 두 벌
            #    겹쳐 화면에 쌓인다 — 어느 회차의 말인지 방문자가 가릴 수 없다. 잠정 문장이 최종과
            #    다를 수 있다는 것은 이 화면이 이미 말하고 있고(걷히는 자리), 최종은 아래 결과가 준다.
            response = await asyncio.to_thread(
                _post, url, body, budget_sec, on_sentence if attempt == 1 else None
            )
            model = response.get("model") if isinstance(response.get("model"), str) else UNKNOWN_MODEL
            reordered, rationale = apply_guard(response, candidates, set(evidence_ids))
        except _Rejected as exc:
            return LiveResult(
                axis="live-rejected",
                candidates=candidates,
                model=model,
                rejected_reason=str(exc),
            )
        except Exception as exc:                              # noqa: BLE001 — 축 하나가 run 을 죽이지 않는다
            # 🔴 원문은 «여기서만» 남는다. 아래 사유에는 클래스명이 들어가지 않는다(D-23).
            log.warning("live 합성 실패 — %s: %s", type(exc).__name__, exc)
            return LiveResult(
                axis="live-rejected",
                candidates=candidates,
                model=model,
                rejected_reason=_refusal_wording(exc),
            )

        missing = unnamed_safety_rules(safety_rules, rationale)
        if not missing:
            break
        if attempt == 1:
            log.warning(
                "%s — 규정 %d건 미호명, 재요청 1회: %s",
                SAFETY_OMITTED_REASON,
                len(missing),
                ", ".join(missing[:MAX_NOTICE_RULES]),
            )
            notice = _guard_notice(missing)
            continue
        # 2회차에도 남았다 — 채택하되 계측이 볼 수 있게 표기한다(화면 문면은 바꾸지 않는다).
        safety_omitted = True
        log.warning("%s — 재요청 뒤에도 %d건 미호명, 그대로 채택", SAFETY_OMITTED_REASON, len(missing))

    return LiveResult(
        axis="live",
        candidates=reordered,
        model=model,
        rationale=rationale,
        safety_omitted=safety_omitted,
    )


def attach_rationale(
    payload: list[dict[str, Any]], rationale: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    """`runCompleted.candidates[].rationale` 를 얹는다 — 채택된 축에서만 부른다."""
    for item in payload:
        entry = rationale.get(item.get("failureModeId", ""))
        if entry:
            item["rationale"] = entry
    return payload
