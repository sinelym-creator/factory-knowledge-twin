"""error_shape_drill — 오류가 «언제나» 계약 형상으로 나오는가 (검증 좌석 · T2-1).

계약 v0.1 (`packages/contracts/rest-api-v0.1.md`):

    base = /api · **전 응답 JSON** · 오류 = { "error": { "code", "message" } } + HTTP 4xx/5xx

🔴 이 그물이 지키는 문장: **오류 «전건»이 그 형상이다.** 「대부분 그렇다」는 계약 준수가 아니다.
   골격 단계(T1-8)에는 라우트가 즉시 501 을 던져 예외가 핸들러 밖으로 나갈 길이 없었다.
   실제 IO 가 열린 T2-1 부터는 드라이버 예외가 그 길을 낸다 — V-2 가 그 자리다.

   V-2(2026-08-30 적발): neo4j 정지 후 `POST /retrieval/compare` →
   `HTTP 500 · Content-Type: text/plain · "Internal Server Error"`.
   `errors.install_error_handlers` 가 덮는 것은 `StarletteHTTPException` 과
   `RequestValidationError` 둘뿐이라, `neo4j.exceptions.ServiceUnavailable` 은 밖으로 나갔다.

🔴 의존 단절 축은 «쓴다» — 컨테이너를 정지했다 되돌린다. 기본은 끄고, `--cut-neo4j` 로만 켠다
   (타 좌석 스택에 겨누지 않게 · 되감기 실측을 마지막에 둔다).

    python tests/api/error_shape_drill.py                 # 도달 가능한 오류 경로만
    python tests/api/error_shape_drill.py --cut-neo4j     # + 런타임 의존 단절(내 스택 한정)

환경: `FKT_API_BASE`(기본 http://127.0.0.1:8000) · `FKT_NEO4J_CONTAINER`(기본 fkt-levi2-neo4j-1)

exit: 0 = 전건 계약 형상 · 1 = 이탈 1건 이상 · 2 = 실행 오류
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
NEO4J_CONTAINER = os.environ.get("FKT_NEO4J_CONTAINER", "fkt-levi2-neo4j-1")

# 승인 질문 1건 — 게이트를 통과해 «검색까지» 가야 의존 단절이 재현된다.
# 🔴 정본 문구 그대로다(백틱 포함). 표기를 바꾸면 다른 것을 재게 된다 — anchor_boundary_drill 참조.
APPROVED_Q = (
    "알람 `AL-20260826-0041`이 발생했다. 이 알람에서 출발해 관련 설비·부품·고장 모드·"
    "대응 절차·필수 안전 규정까지 이어지는 경로 전체를 제시하라."
)
SID = "levi2-errshape-01"


def request(method: str, path: str, body: dict | None = None) -> tuple[int, str, str]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as res:
            return res.status, res.headers.get("Content-Type", ""), res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("Content-Type", ""), e.read().decode("utf-8", "replace")


def conforms(status: int, ctype: str, body: str) -> tuple[bool, str]:
    """계약 오류 형상인가 — 형상만 본다(문구·코드값은 계약이 정하지 않았다)."""
    if not (400 <= status < 600):
        return False, f"오류 상태코드가 아니다({status})"
    if "application/json" not in ctype.lower():
        return False, f"Content-Type 이 JSON 이 아니다({ctype!r})"
    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        return False, "본문이 JSON 이 아니다"
    err = parsed.get("error") if isinstance(parsed, dict) else None
    if not isinstance(err, dict):
        return False, f"최상위 error 객체가 없다(키: {list(parsed)[:4] if isinstance(parsed, dict) else type(parsed).__name__})"
    missing = [k for k in ("code", "message") if not isinstance(err.get(k), str) or not err[k]]
    if missing:
        return False, f"error 에 {'·'.join(missing)} 이 없다"
    return True, err["code"]


def self_check() -> None:
    """🔴 검사기가 «빨강을 낼 수 있는가»부터. 통과만 하는 검사기는 아무것도 보증하지 않는다."""
    samples = [
        (500, "text/plain; charset=utf-8", "Internal Server Error", False, "V-2 원문 형상"),
        (422, "application/json", '{"detail":[{"msg":"x"}]}', False, "FastAPI 기본 형상"),
        (400, "application/json", '{"error":{"code":"","message":"x"}}', False, "code 공란"),
        (400, "application/json", '{"error":{"code":"c","message":"m"}}', True, "계약 형상"),
    ]
    for status, ctype, body, expected, what in samples:
        ok, why = conforms(status, ctype, body)
        if ok is not expected:
            raise SystemExit(f"실행 오류: 자기 검증 실패 — {what} 을 {ok} 로 판정했다({why})")
    print("  자기 검증  표본 4종(계약 형상 1 · 이탈 3) 전건 기대대로 — 검사기 살아 있음\n")


def docker(*args: str) -> str:
    out = subprocess.run(["docker", *args], capture_output=True, text=True)
    return out.stdout.strip()


CASES: list[tuple[str, str, str, str, dict | None]] = [
    ("E-01", "sessionId 형식 위반", "POST", "/api/retrieval/compare",
     {"sessionId": "ab", "question": APPROVED_Q, "strategies": ["vector"]}),
    ("E-02", "승인 목록 밖 질문", "POST", "/api/retrieval/compare",
     {"sessionId": SID, "question": "아무 질문", "strategies": ["vector"]}),
    ("E-03", "계약 밖 전략명", "POST", "/api/retrieval/compare",
     {"sessionId": SID, "question": APPROVED_Q, "strategies": ["bm25"]}),
    ("E-04", "필수 필드 누락", "POST", "/api/retrieval/compare", {"sessionId": SID}),
    ("E-05", "미구현 라우트(501)", "POST", "/api/sessions", None),
    ("E-06", "없는 경로(404)", "GET", "/api/does-not-exist", None),
    # 🔴 T2-2 로 표면이 자랐다 — 읽기 3라우트의 오류 경로도 같은 형상이라야 한다.
    #    자라난 표면을 표에 올리지 않으면 그것은 「내가 안 본다」는 뜻이다.
    ("E-07", "없는 근거(404)", "GET", "/api/evidence/EQ-CNC-999", None),
    ("E-08", "없는 문서(404)", "GET", "/api/documents/DOC-ZZZ-9999", None),
    ("E-09", "강조 좌표 불일치(400)", "GET",
     "/api/documents/DOC-SOP-0014?highlight=DOC-MAN-0021%40r1%23000", None),
]


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    cut = "--cut-neo4j" in sys.argv

    print(f"대상      : {API_BASE}")
    print(f"의존 단절 : {'켬 — ' + NEO4J_CONTAINER + ' 정지 후 되돌린다' if cut else '끔(--cut-neo4j 로 켠다)'}\n")
    self_check()

    bad: list[str] = []
    for cid, what, method, path, body in CASES:
        status, ctype, raw = request(method, path, body)
        ok, why = conforms(status, ctype, raw)
        print(f"  {'PASS' if ok else 'FAIL'}  {cid} {what:22} {status}  {why}")
        if not ok:
            bad.append(cid)
            print(f"        본문: {raw[:160]}")

    if cut:
        print(f"\n  -- 런타임 의존 단절 — {NEO4J_CONTAINER} 정지")
        docker("stop", NEO4J_CONTAINER)
        time.sleep(2)
        try:
            status, ctype, raw = request(
                "POST", "/api/retrieval/compare",
                {"sessionId": SID, "question": APPROVED_Q, "strategies": ["graphrag"]},
            )
            ok, why = conforms(status, ctype, raw)
            print(f"  {'PASS' if ok else 'FAIL'}  E-10 neo4j 단절 중 compare  {status}  {why}")
            if not ok:
                bad.append("E-10")
                print(f"        Content-Type: {ctype!r} · 본문: {raw[:160]}")
            elif "traceback" in raw.lower() or "\\\\" in raw or "site-packages" in raw:
                # 🔴 형상만 맞추고 내부 경로를 흘리면 그것대로 공개 경계 위반이다(baseline §34.6).
                bad.append("E-10x")
                print("  FAIL  E-10x message 에 내부 경로·traceback 이 보인다")
        finally:
            print(f"  -- 되감기 — {NEO4J_CONTAINER} 재기동")
            docker("start", NEO4J_CONTAINER)
            health = ""
            for _ in range(40):
                time.sleep(2)
                health = docker("inspect", NEO4J_CONTAINER, "--format", "{{.State.Health.Status}}")
                if health == "healthy":
                    break
            status, _, _ = request(
                "POST", "/api/retrieval/compare",
                {"sessionId": SID, "question": APPROVED_Q, "strategies": ["graphrag"]},
            )
            restored = status == 200 and health == "healthy"
            print(f"  {'PASS' if restored else 'FAIL'}  E-0 되감기 — health {health} · compare {status}")
            if not restored:
                bad.append("E-0")

    total = len(CASES) + (2 if cut else 0)
    print(f"\n결과: {total - len(bad)}/{total} 계약 형상 · 이탈 {len(bad)}건" + (f" ({', '.join(bad)})" if bad else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
