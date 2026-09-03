"""근거 결속 가드 실측 드릴 — T6-1.

가드는 「LLM 이 준 응답」을 판정한다. 그 자극을 실제 LLM 으로 만들면 재현이 안 되므로,
여기서는 **응답을 손으로 지어** 가드에 직접 먹인다(가드는 응답 객체만 보는 순수 함수다).

🔴 이 드릴이 세는 것 두 가지:
  ① 각 케이스가 **가드까지 도달했는가**(자극 도달 건수) — 도달 0 이면 그 줄은 PASS 가 아니라 무효다.
  ② 「참」 대조군이 **채택되는가** — 전부 거부하는 가드는 고장이지 안전이 아니다.

실행:
    cd services/ai-api
    .venv\\Scripts\\python.exe -m tools.live_synthesis_guard_drill
"""

from __future__ import annotations

import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

# 가드 모듈은 게이트 env 뒤에서만 import 된다 — 드릴은 그 게이트를 «자기 프로세스에만» 세운다.
os.environ.setdefault("FKT_LOCAL_SYNTHESIS_GATEWAY", "http://127.0.0.1:8787")

from app.investigation import live_synthesis as live  # noqa: E402
from app.investigation.synthesize import Candidate    # noqa: E402

RUN_EVIDENCE = ["AL-1", "SN-2", "HX-3", "GP-RUN-01"]

CANDIDATES = [
    # 결정적 1순위 — 받친 근거 3건.
    Candidate(
        failureModeId="FM-A",
        label="베어링 마모",
        pattern="진동 상승 후 온도 급상승",
        evidenceIds=["AL-1", "SN-2", "HX-3"],
        history=["HX-3"],
        citations=["SN-2"],
        graphHops=1,
    ),
    # 받친 근거 0 — 승격 거부 규칙의 대상.
    Candidate(
        failureModeId="FM-B",
        label="윤활 불량",
        pattern="온도만 상승",
        evidenceIds=["AL-1"],
    ),
]


def _rationale(*fm_ids: str, cited: list[str] | None = None) -> dict:
    return {
        fm: {"sentences": [f"{fm} 는 근거로 받쳐진다."], "citedEvidenceIds": list(cited or ["AL-1"])}
        for fm in fm_ids
    }


CASES: list[tuple[str, dict, bool, str]] = [
    (
        "참-대조군 · 결정적 순위 그대로",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        True,
        "가드가 아무것도 채택 못 하면 나머지 줄의 「거부」는 근거가 아니다",
    ),
    (
        "참-대조군 · 재정렬(support 있는 쪽이 1순위 유지)",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B", cited=["SN-2", "HX-3"]), "insufficient": False},
        True,
        "재정렬 자체는 허용된다",
    ),
    (
        "🔴 가짜 evidenceId 1건 주입",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A", "FM-B", cited=["AL-1", "EV-FAKE-999"]), "insufficient": False},
        False,
        "run 근거집합 밖 인용 = 전량 거부(부분 채택 0)",
    ),
    (
        "🔴 support 0 후보를 1순위로 승격",
        {"ranking": ["FM-B", "FM-A"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        False,
        "재정렬은 허용하되 이 승격만은 거부",
    ),
    (
        "ranking 에서 후보 1건 누락",
        {"ranking": ["FM-A"], "rationale": _rationale("FM-A"), "insufficient": False},
        False,
        "후보 집합이 갈리면 화면과 초안이 어긋난다",
    ),
    (
        "ranking 에 없던 후보 추가",
        {"ranking": ["FM-A", "FM-B", "FM-Z"], "rationale": _rationale("FM-A", "FM-B"), "insufficient": False},
        False,
        "지어낸 후보는 근거가 없다",
    ),
    (
        "rationale 문장이 비었다",
        {"ranking": ["FM-A", "FM-B"], "rationale": {"FM-A": {"sentences": [], "citedEvidenceIds": ["AL-1"]}, "FM-B": {"sentences": ["x"], "citedEvidenceIds": ["AL-1"]}}, "insufficient": False},
        False,
        "빈 근거 문장은 계약(minItems 1) 위반",
    ),
    (
        "rationale 이 후보 전부를 안 덮는다",
        {"ranking": ["FM-A", "FM-B"], "rationale": _rationale("FM-A"), "insufficient": False},
        False,
        "덮이지 않은 후보는 근거 표기가 없는 채로 화면에 뜬다",
    ),
    (
        "citedEvidenceIds 가 비었다",
        {"ranking": ["FM-A", "FM-B"], "rationale": {"FM-A": {"sentences": ["x"], "citedEvidenceIds": []}, "FM-B": {"sentences": ["y"], "citedEvidenceIds": ["AL-1"]}}, "insufficient": False},
        False,
        "인용 0 은 「근거 없음」이지 채택이 아니다",
    ),
]


def run_guard_cases() -> tuple[int, int, int]:
    """(통과 줄 수, 전체 줄 수, 가드 도달 건수)."""
    reached = 0
    passed = 0
    print(f"run 근거집합 = {RUN_EVIDENCE}\n")
    for name, response, expect_accept, why in CASES:
        verdict: str
        try:
            reached += 1                      # apply_guard 를 실제로 부른 건수
            ordered, cleaned = live.apply_guard(response, CANDIDATES, set(RUN_EVIDENCE))
            accepted = True
            verdict = f"채택 · 1순위 {ordered[0].failureModeId} · rationale {len(cleaned)}건"
        except live._Rejected as exc:         # noqa: SLF001 — 드릴은 이 층을 직접 본다
            accepted = False
            verdict = f"거부 · {exc}"
        ok = accepted is expect_accept
        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        print(f"       기대={'채택' if expect_accept else '거부'} · 실제={verdict}")
        print(f"       왜: {why}")
    return passed, len(CASES), reached


def probe_gateway() -> None:
    """게이트웨이가 떠 있으면 그 층의 형상 검사도 한 번 울려 본다(없으면 건너뛴다)."""
    url = live.gateway_url()
    print(f"\n게이트웨이 = {url or '(미설정)'}")
    if not url:
        return
    try:
        with urllib.request.urlopen(f"{url}/health", timeout=3) as res:  # noqa: S310
            print(f"  /health → {res.status} {res.read().decode('utf-8')}")
    except (urllib.error.URLError, TimeoutError) as exc:
        print(f"  /health → 미도달({type(exc).__name__}) — 게이트웨이 층 검사는 건너뛴다")
        return
    body = json.dumps({"candidates": [{"failureModeId": "FM-A"}], "evidenceText": {}}).encode()
    req = urllib.request.Request(                                        # noqa: S310
        f"{url}/synthesize", data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        urllib.request.urlopen(req, timeout=5)                            # noqa: S310
        print("  🔴 빈 evidenceText 를 통과시켰다 — 게이트웨이 입력 검사가 고장이다")
    except urllib.error.HTTPError as exc:
        print(f"  빈 evidenceText → {exc.code} {exc.read().decode('utf-8')}")


# ── D-24 · 거부 «문면» 축 (리바이2 #444 회부 2) ────────────────────────────────
#
# 🔴 여기서 재는 것은 가드의 판정이 아니라 **방문자가 읽는 문장**이다. 게이트웨이가 401 에
#    실어 보내는 사유는 내부 인증 헤더 이름을 담고 있고, 그 문자열은 `rejectedReason` →
#    run 타임라인 → 공개 화면까지 그대로 흐른다(D-23 과 같은 형태의 누출).
#
# 🔴 **「헤더 이름이 없다」만 보지 않는다.** 그 검사는 문면이 비어도, 케이스가 한 번도 안
#    돌아도 통과한다. 그래서 ① 기대 문면과의 «정확 일치» ② 누출 스캐너의 «참» 대조군
#    (원문을 그대로 넣으면 반드시 잡혀야 한다) ③ 자극 도달 계수 — 셋을 함께 센다.

LEAK_NEEDLES = ("X-FKT", "Token", "token", "Bearer")

# 게이트웨이가 실제로 401 에 싣는 본문(`gateway.py` 의 `TOKEN_HEADER` 보간 결과).
GATEWAY_401_BODY = {"rejectedReason": "X-FKT-Gateway-Token 가 없거나 맞지 않는다"}


def _leaks(text: str) -> list[str]:
    return [n for n in LEAK_NEEDLES if n in text]


def _http_error(code: int, body: dict) -> urllib.error.HTTPError:
    """게이트웨이가 «답한» 상태. HTTPError 는 URLError 의 하위형이라 분기 «순서»도 함께 시험된다."""
    return urllib.error.HTTPError(
        "http://127.0.0.1:8787/synthesize",
        code,
        "Unauthorized",
        {},                                                   # type: ignore[arg-type]
        io.BytesIO(json.dumps(body, ensure_ascii=False).encode("utf-8")),
    )


def run_wording_cases() -> tuple[int, int, int]:
    """(통과 줄 수, 전체 줄 수, 자극 도달 건수) — `_post` 와 `_refusal_wording` 을 직접 친다."""
    original = urllib.request.urlopen
    reached = 0
    passed = 0
    rows: list[tuple[str, str, str]] = []

    def _raise(exc):
        def _fake(*_args, **_kwargs):
            raise exc
        return _fake

    # ① `_post` 를 통과하는 경로 — 방문자 문면이 «실제로» 만들어지는 자리다.
    post_cases = [
        ("🔴 401 · 본문이 내부 헤더 이름을 싣고 있다", _http_error(401, GATEWAY_401_BODY),
         "게이트웨이가 요청을 거부했습니다(HTTP 401)"),
        ("502 · 본문 사유 없음", _http_error(502, {}),
         "게이트웨이가 요청을 거부했습니다(HTTP 502)"),
        ("대조군 · 미도달(URLError) 문면 불변", urllib.error.URLError(ConnectionRefusedError(61, "refused")),
         "소유자 게이트웨이 OFF(미도달)"),
    ]
    try:
        for name, exc, expect in post_cases:
            urllib.request.urlopen = _raise(exc)
            reached += 1
            try:
                live._post("http://127.0.0.1:8787", b"{}", 1.0)      # noqa: SLF001 — 드릴은 이 층을 직접 본다
                actual = "(거부하지 않았다)"
            except live._Rejected as rejected:                       # noqa: SLF001
                actual = str(rejected)
            rows.append((name, expect, actual))
    finally:
        urllib.request.urlopen = original

    # ② 남은 두 분류가 그대로인가 — 새 분기가 앞 분류를 삼키지 않는지 본다.
    for name, exc, expect in [
        ("대조군 · 시간 초과 문면 불변", TimeoutError(), "응답 시간 초과"),
        ("대조군 · 그 밖의 오류 문면 불변", ValueError("내부 사정"), "합성 중 오류"),
    ]:
        reached += 1
        rows.append((name, expect, live._refusal_wording(exc)))      # noqa: SLF001

    for name, expect, actual in rows:
        leaked = _leaks(actual)
        ok = actual == expect and not leaked
        passed += ok
        print(f"[{'PASS' if ok else 'FAIL'}] {name}")
        print(f"       기대={expect!r}")
        print(f"       실제={actual!r}" + (f"  🔴 누출 {leaked}" if leaked else " · 누출 0"))

    # ③ 🔴 누출 스캐너 «참» 대조군 — 원문을 그대로 넣으면 반드시 잡혀야 한다. 안 잡히면
    #    위의 「누출 0」은 스캐너가 죽어서 난 0 이고, 그때 이 표는 초록이 아니라 무효다.
    raw = GATEWAY_401_BODY["rejectedReason"]
    alive = bool(_leaks(raw))
    print(f"[{'PASS' if alive else 'FAIL'}] 누출 스캐너 참-대조군 · 원문 {raw!r} → 검출 {_leaks(raw)}")
    passed += alive
    return passed, len(rows) + 1, reached


def main() -> int:
    passed, total, reached = run_guard_cases()
    print()
    print("── D-24 · 거부 문면 ──")
    w_passed, w_total, w_reached = run_wording_cases()
    probe_gateway()
    print(f"\n가드 도달 {reached}/{total}건 · 판정 {passed}/{total} PASS")
    print(f"문면 자극 도달 {w_reached}건 · 판정 {w_passed}/{w_total} PASS")
    if reached != total or w_reached == 0:
        print("🔴 자극이 가드까지 안 갔다 — 이 표는 무효다")
        return 1
    if passed != total or w_passed != w_total:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
