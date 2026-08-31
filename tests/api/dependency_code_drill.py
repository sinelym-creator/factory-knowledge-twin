"""dependency_code_drill — 「의존이 죽었다」와 「우리 코드가 틀렸다」를 «다르게» 말하는가 (검증 좌석 · T2-2).

🔴 이 그물이 지키는 문장: **같은 사건은 같은 코드로 말한다.** 런타임 의존이 끊긴 순간
   `POST /retrieval/compare` 는 `503 dependency_unavailable` 을, `GET /evidence` 는
   `500 internal_error` 를 낸다면 화면은 «한 사건»을 두 가지로 읽는다 — 한쪽은
   「잠시 후 다시」, 다른 쪽은 「서비스 결함」이다. 하나는 반드시 거짓이다.

   V-2(T2-1 적발)는 «형상»의 문제였다 — 오류가 계약 JSON 이 아니라 `text/plain` 으로 샜다.
   `error_shape_drill` 이 그 자리를 지킨다. 이 드릴은 그 다음 칸 — **형상은 맞는데 «코드»가
   다른 사건을 가리키는** 자리다. 형상만 재는 그물은 이것을 초록으로 넘긴다.

   근거: `app/errors.py` 의 `DependencyUnavailable` 성문 —
   「의존에 닿지 못했다 — «서비스 결함»과 구분되는 사건이다」.

🔴 「미연결」과의 관계(오케 소견②). 화면(`apps/web-console/lib/contract.ts`)은 백엔드 부재·
   501·타임아웃을 `unavailable` 로 접어 «미연결»로 표시한다 — 오류로 붉히지 않기 위한 옳은
   선택이다. 그 접힘이 성립하려면 서버가 «접어도 되는 것»(503)과 «접으면 안 되는 것»(500)을
   갈라 주어야 한다. 이 드릴이 재는 것이 그 갈라짐이다.

🔴 의존 단절 축은 «쓴다» — 자기 스택 컨테이너를 정지했다 되돌린다. 기본은 꺼져 있고
   `--cut-postgres` 로만 켠다. 되감기 실측을 마지막에 둔다.

    python tests/api/dependency_code_drill.py                  # 단절 없이 기준선만
    python tests/api/dependency_code_drill.py --cut-postgres   # + 의존 단절(내 스택 한정)

환경: `FKT_API_BASE`(기본 http://127.0.0.1:8000) · `FKT_PG_CONTAINER`(기본 fkt-levi2-postgres-1)

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 스택 무접촉)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
PG_CONTAINER = os.environ.get("FKT_PG_CONTAINER", "fkt-levi2-postgres-1")

# 정본 표기 그대로의 승인 질문 1건 — 게이트를 지나 «검색까지» 가야 의존 단절이 재현된다.
APPROVED_Q = (
    "`SOP-BRG-INSP-014`(베어링 점검 절차)가 요구하는 필수 공구와 예상 작업 시간은 무엇인가?"
)
SID = "levi2-depcode-01"
CHUNK = "DOC-SOP-0014@r2#001"
DOC = "DOC-SOP-0014"

DEPENDENCY_CODE = "dependency_unavailable"


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


def request(method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    """(status, error code) — 200 이면 code 는 빈 문자열."""
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, ""
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw).get("error", {}).get("code", "")
        except json.JSONDecodeError:
            return exc.code, f"<비JSON:{raw[:40]}>"
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def health() -> tuple[str, str]:
    """(status, postgres state) — 배지가 «구분을 실을 수 있는» 자리."""
    try:
        with urllib.request.urlopen(API_BASE + "/api/health", timeout=30) as res:
            body = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        raise DrillError(f"/health 가 {exc.code} 를 냈다: {raw[:120]}") from exc
    return body.get("status", "?"), body.get("dependencies", {}).get("postgres", {}).get("state", "?")


def docker(*args: str) -> str:
    out = subprocess.run(["docker", *args], capture_output=True, text=True)
    if out.returncode != 0 and args[0] in ("stop", "start"):
        raise DrillError(f"docker {' '.join(args)} 실패: {out.stderr.strip()[:160]}")
    return out.stdout.strip()


# postgres 를 지나는 라우트 — 단절 중 «같은 코드»로 말해야 한다.
DB_ROUTES: list[tuple[str, str, str, str, dict | None]] = [
    ("D-01", "POST /retrieval/compare", "POST", "/api/retrieval/compare",
     {"sessionId": SID, "question": APPROVED_Q, "strategies": ["vector"]}),
    ("D-02", "GET /evidence/{id}", "GET",
     "/api/evidence/" + urllib.parse.quote(CHUNK, safe=""), None),
    ("D-03", "GET /documents/{id}", "GET", f"/api/documents/{DOC}", None),
]


def self_check() -> None:
    """🔴 판정자가 «빨강을 낼 수 있는가»부터."""
    samples = [
        ((503, DEPENDENCY_CODE), True, "의존 단절을 의존 단절이라 말한다"),
        ((500, "internal_error"), False, "의존 단절을 서비스 결함이라 말한다"),
        ((200, ""), False, "단절 중에 200 을 낸다"),
        ((503, "http_503"), False, "형상은 맞는데 코드가 일반 HTTP 코드다"),
    ]
    for (status, code), expected, what in samples:
        verdict = status == 503 and code == DEPENDENCY_CODE
        if verdict is not expected:
            raise DrillError(f"자기 검증 실패 — {what} 를 {verdict} 로 판정했다")
    print("  자기 검증  표본 4종(기대 형상 1 · 이탈 3) 전건 기대대로 — 판정자 살아 있음\n")


def baseline() -> int:
    bad = 0
    for cid, what, method, path, body in DB_ROUTES:
        status, code = request(method, path, body)
        ok = status == 200
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {cid} {what:26} {status} {code}")
    status, code = request("GET", "/api/scenarios")
    ok = status == 200
    bad += 0 if ok else 1
    print(f"  {'PASS' if ok else 'FAIL'}  D-04 GET /scenarios{'':9} {status} {code}")
    return bad


def cut_and_measure() -> int:
    bad = 0
    print(f"\n  -- 런타임 의존 단절 — {PG_CONTAINER} 정지")
    # 🔴 **Q-62 — 부수기 «전» 소유 확인.** 이름 기본값으로 남의 컨테이너를 멈추면
    #    되돌려도 그 사이 남이 재던 것은 이미 죽는다. 통과 못 하면 손대지 않는다.
    target = _ownership.own_container("FKT_PG_CONTAINER", "멈췄다 되살릴 postgres")
    docker("stop", target)
    time.sleep(2)
    try:
        seen: dict[str, tuple[int, str]] = {}
        for cid, what, method, path, body in DB_ROUTES:
            status, code = request(method, path, body)
            seen[cid] = (status, code)
            ok = status == 503 and code == DEPENDENCY_CODE
            bad += 0 if ok else 1
            print(f"  {'PASS' if ok else 'FAIL'}  {cid} {what:26} {status} {code}"
                  f"{'' if ok else f'  (기대 503 {DEPENDENCY_CODE})'}")

        codes = {c for _, c in seen.values()}
        consistent = len(codes) == 1
        bad += 0 if consistent else 1
        print(f"  {'PASS' if consistent else 'FAIL'}  D-05 한 사건을 한 코드로 말한다"
              f"{'':9} {' · '.join(f'{k}={v[0]} {v[1]}' for k, v in seen.items())}")

        hstatus, pg_state = health()
        told = hstatus != "ok" and pg_state == "unavailable"
        bad += 0 if told else 1
        print(f"  {'PASS' if told else 'FAIL'}  D-06 /health 가 단절을 말한다"
              f"{'':11} status={hstatus} postgres={pg_state}")

        sstatus, scode = request("GET", "/api/scenarios")
        # /scenarios 는 DB 를 지나지 않는다 — 「미연결」이 전역이 아님을 화면이 알 수 있다.
        served = sstatus == 200
        bad += 0 if served else 1
        print(f"  {'PASS' if served else 'FAIL'}  D-07 /scenarios 는 단절과 무관{'':4} {sstatus} {scode}")
    finally:
        print(f"\n  -- 되감기 — {PG_CONTAINER} 재기동")
        docker("start", target)
        state = ""
        for _ in range(45):
            time.sleep(2)
            state = docker("inspect", target, "--format", "{{.State.Health.Status}}")
            if state == "healthy":
                break
        time.sleep(2)
        restored = state == "healthy" and baseline() == 0
        print(f"  {'PASS' if restored else 'FAIL'}  D-0 되감기 — health {state}")
        if not restored:
            bad += 1
    return bad


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _ownership.self_check()  # 🔴 Q-62 — 대상을 건드리기 전에 «문»부터. 입구에 안 걸려 있으면 잊는 순간 파괴 축이 그냥 돌아간다
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)
    cut = "--cut-postgres" in sys.argv

    print(f"대상      : {API_BASE}")
    print(f"의존 단절 : {'켬 — ' + PG_CONTAINER + ' 정지 후 되돌린다' if cut else '끔(--cut-postgres 로 켠다)'}\n")
    self_check()

    print("  ── 기준선 — 의존이 살아 있을 때")
    bad = baseline()
    if bad:
        raise DrillError("기준선부터 200 이 아니다 — 단절을 재기 전에 대상이 아프다")

    if cut:
        bad += cut_and_measure()

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
