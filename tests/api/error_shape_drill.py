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
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 스택 무접촉)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
NEO4J_CONTAINER = os.environ.get("FKT_NEO4J_CONTAINER", "fkt-levi2-neo4j-1")

# 승인 질문 1건 — 게이트를 통과해 «검색까지» 가야 의존 단절이 재현된다.
# 🔴 정본 문구 그대로다(백틱 포함). 표기를 바꾸면 다른 것을 재게 된다 — anchor_boundary_drill 참조.
APPROVED_Q = (
    "알람 `AL-20260826-0041`이 발생했다. 이 알람에서 출발해 관련 설비·부품·고장 모드·"
    "대응 절차·필수 안전 규정까지 이어지는 경로 전체를 제시하라."
)
SID = "levi2-errshape-01"


def request(method: str, path: str, body: dict | None = None, *,
            sample: bool = False) -> tuple[int, str, str]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path, sample=sample)
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


# 🔴 이 sentinel 은 «런타임에 찾는 경로»의 자리다 — 아래 find_unimplemented() 가 채운다.
UNIMPLEMENTED = "@@runtime-501@@"

CASES: list[tuple[str, str, str, str, dict | None]] = [
    # 🔴 이 칸은 «세션 값 자체»가 표본이라 어댑터가 비켜선다(아래 dispatch 의 sample=True).
    #    v0.1.6 착지 후 서버가 무엇으로 거절하는지는 갈릴 수 있다 — 형식 위반이든
    #    쿠키↔본문 불일치든, 이 드릴이 묻는 것은 하나다: **오류가 계약 «형상»인가.**
    ("E-01", "sessionId 형식/불일치 위반", "POST", "/api/retrieval/compare",
     {"sessionId": "ab", "question": APPROVED_Q, "strategies": ["vector"]}),
    ("E-02", "승인 목록 밖 질문", "POST", "/api/retrieval/compare",
     {"sessionId": SID, "question": "아무 질문", "strategies": ["vector"]}),
    ("E-03", "계약 밖 전략명", "POST", "/api/retrieval/compare",
     {"sessionId": SID, "question": APPROVED_Q, "strategies": ["bm25"]}),
    ("E-04", "필수 필드 누락", "POST", "/api/retrieval/compare", {"sessionId": SID}),
    # 🔴 이 칸의 표본은 «런타임에 찾는다»(경로가 아래 sentinel 이다).
    #    두 번 갈아 봤다: `POST /api/sessions`(T3-1 이 구현) → `GET /api/plants`(T3-2 가 구현).
    #    한 시간 안에 두 번 죽었다 — 「아직 미구현인 라우트」를 **이름으로** 박아 두는 형태 자체가
    #    틀렸다는 뜻이다. 재는 것은 「그 경로가 501 인가」가 아니라 **「501 도 계약 형상인가」**다.
    #    그래서 지금 501 을 내는 라우트를 계약 표면에서 «찾아» 쓴다. 하나도 없으면 그때는
    #    측정 불가로 적는다 — 없는 표본 위에서 초록을 만들지 않는다.
    ("E-05", "미구현 라우트(501)", "GET", UNIMPLEMENTED, None),
    ("E-06", "없는 경로(404)", "GET", "/api/does-not-exist", None),
    # 🔴 T2-2 로 표면이 자랐다 — 읽기 3라우트의 오류 경로도 같은 형상이라야 한다.
    #    자라난 표면을 표에 올리지 않으면 그것은 「내가 안 본다」는 뜻이다.
    ("E-07", "없는 근거(404)", "GET", "/api/evidence/EQ-CNC-999", None),
    ("E-08", "없는 문서(404)", "GET", "/api/documents/DOC-ZZZ-9999", None),
    ("E-09", "강조 좌표 불일치(400)", "GET",
     "/api/documents/DOC-SOP-0014?highlight=DOC-MAN-0021%40r1%23000", None),
]


# 계약 표면 중 «지금» 501 인 것을 찾을 후보. 순서는 안정성 기대순이다 —
# `?from&to` 는 Q-26 판정상 Phase 3 그래프 화면 전까지 열리지 않는다(오케 단서 08-30).
UNIMPLEMENTED_CANDIDATES = (
    "/api/graph/paths?from=EQ-CNC-204&to=FM-BRG-WEAR",
    "/api/plants",
    "/api/plants/PLANT-SEOSAN/overview",
    "/api/equipment/EQ-CNC-204",
    "/api/equipment/EQ-CNC-204/sensors/SN-204-VIB/series?window=24h",
    "/api/incidents/INC-2026-014",
)


def find_unimplemented() -> str | None:
    """🔴 지금 501 을 내는 라우트를 «찾는다». 이름을 박아 두면 구현되는 날 표본이 죽는다."""
    for path in UNIMPLEMENTED_CANDIDATES:
        status, _ctype, _raw = request("GET", path)
        if status == 501:
            return path
    return None


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    _ownership.self_check()  # 🔴 Q-62 — 대상을 건드리기 전에 «문»부터. 입구에 안 걸려 있으면 잊는 순간 파괴 축이 그냥 돌아간다
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)
    cut = "--cut-neo4j" in sys.argv

    print(f"대상      : {API_BASE}")
    print(f"의존 단절 : {'켬 — ' + NEO4J_CONTAINER + ' 정지 후 되돌린다' if cut else '끔(--cut-neo4j 로 켠다)'}\n")
    self_check()

    bad: list[str] = []
    skipped: list[str] = []
    unimplemented = find_unimplemented()
    if unimplemented:
        print(f"  표본 발견  미구현 라우트 = {unimplemented}")
    else:
        print("  ----  E-05 미구현 라우트 표본: 🔴 계약 표면에 501 이 하나도 없다 — 측정 불가"
              "(초록으로 세지 않는다)")

    for cid, what, method, path, body in CASES:
        if path is UNIMPLEMENTED:
            if not unimplemented:
                skipped.append(cid)
                continue
            path = unimplemented
        # 🔴 E-01 은 세션 «값 자체»가 표본이다 — 어댑터가 비켜서야 표본이 서버까지 간다.
        status, ctype, raw = request(method, path, body, sample=(cid == "E-01"))
        ok, why = conforms(status, ctype, raw)
        print(f"  {'PASS' if ok else 'FAIL'}  {cid} {what:22} {status}  {why}")
        if not ok:
            bad.append(cid)
            print(f"        본문: {raw[:160]}")

    if cut:
        print(f"\n  -- 런타임 의존 단절 — {NEO4J_CONTAINER} 정지")
        # 🔴 **Q-62 — 부수기 «전» 소유 확인.** 이름 기본값으로 남의 컨테이너를 멈추면
        #    되돌려도 그 사이 남이 재던 것은 이미 죽는다. 통과 못 하면 손대지 않는다.
        target = _ownership.own_container("FKT_NEO4J_CONTAINER", "멈췄다 되살릴 neo4j")
        docker("stop", target)
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
            docker("start", target)
            health = ""
            for _ in range(40):
                time.sleep(2)
                health = docker("inspect", target, "--format", "{{.State.Health.Status}}")
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

    # 🔴 «잰» 칸만 분모에 넣는다. 건너뛴 칸을 통과로도 이탈로도 세지 않는다.
    total = len(CASES) + (2 if cut else 0) - len(skipped)
    print(f"\n결과: {total - len(bad)}/{total} 계약 형상 · 이탈 {len(bad)}건"
          + (f" ({', '.join(bad)})" if bad else "")
          + (f" · 🔴 건너뛴 칸 {len(skipped)}건({', '.join(skipped)}) — 초록 아님" if skipped else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
