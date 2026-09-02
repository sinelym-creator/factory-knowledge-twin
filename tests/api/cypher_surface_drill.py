"""cypher_surface_drill — 사용자 문자열이 Cypher 의 «구조»가 되지 않는가 (검증 좌석 · T5-2 신설 ② · §32.8 ②).

🔴 이 축에는 그물이 **하나도 없었다**(축소 안 §3 ②). `tests/graph/graph_drill.py` 는 그래프
   «정합» 축이지 injection 축이 아니다 — 같은 저장소를 만진다고 같은 것을 재는 게 아니다.

🔴 **두 층으로 잰다. 한 층만이면 문장이 반쪽이 된다.**

   층 A «도달» — HTTP 표면 5문에 Cypher 조각을 던진다. 여기서 4xx 가 나면 그것은
      「Cypher 가 안전하다」가 아니라 **「닿지 못했다」**다(앞문이 막은 것일 수 있다).
   층 B «구조» — 그래프 질의로 실제로 들어가는 값을 만드는 자리(`app.retrieval.anchors.extract`)에
      같은 조각을 직접 먹인다. 실측(2026-09-02): Neo4j 호출은 `app/retrieval/graphrag.py`
      **2곳뿐**이고 둘 다 파라미터 바인딩(`$anchor`·`$targets`·`$per_label`)이며, `$anchor` 로 가는
      값은 이 추출기가 정규식으로 뽑은 **ID 토큰**이다. 그러니 「구조가 되지 않는다」는
      **추출기가 무엇을 내놓는가**로 직접 증명된다 — 조각을 넣어도 나오는 것은 ID 토큰뿐이고
      Cypher 구조 문자(백틱·중괄호·괄호·`;`·공백 키워드)는 한 글자도 실려 나가지 않아야 한다.

🔴 대가를 적어 둔다: 층 B 는 대상 모듈을 import 한다(`anchor_extraction_probe` 선례). 도구가
   대상 안으로 들어가는 만큼, 층 B 의 초록은 «그 함수»에 대한 것이지 표면 전체에 대한 것이 아니다.

🔴 대조군이 판정의 절반이다 — 층 A 는 「정상 질문이 통과한다」, 층 B 는 「정상 ID 는 추출된다」를
   먼저 울린다. 그게 없으면 「전부 거절·전부 빈 목록」도 초록으로 보인다.

    python tests/api/cypher_surface_drill.py
    python tests/api/cypher_surface_drill.py --layer-b-only   # 서버 없이 층 B 만

exit: 0 = 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류·측정 불가
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402
import _colocation  # noqa: E402

API_BASE = os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")
SERVICE_DIR = Path(__file__).resolve().parents[2] / "services" / "ai-api"

# 자극 5종 — 「사용자 문자열이 Cypher 구조가 되려 한다」의 대표형.
#
# 🔴 앵커 ID 를 **박지 않는다**(폐하 하명 09-02 「하드코딩 금지」). 자극의 앞머리에 붙는 ID 는
#    seed 에서 오는 값이라, 박아 두면 seed 가 바뀌는 날 **대조군이 조용히 죽는다** — 그리고
#    대조군이 죽으면 층 B 의 「구조 문자 0」은 판정이 아니라 «빈 목록끼리의 일치»가 된다.
#    그래서 승인 질문 정본에서 앵커를 뽑아 실행 시점에 조립한다(아래 `anchor_from_canon`).
def payloads(anchor: str) -> list[tuple[str, str]]:
    return [
        ("절 종결·삭제", f'{anchor}"}}) MATCH (n) DETACH DELETE n //'),
        ("라벨 주입", f"{anchor}' OR 1=1 WITH n MATCH (x:User) RETURN x //"),
        ("절차 호출", "CALL dbms.components() YIELD name RETURN name //"),  # 앵커 없는 자극(의도)
        ("주석 종결", f"{anchor} /* }} */ MATCH (m) RETURN m"),
        ("관계 와일드카드", f"{anchor}]-() -[r*1..99]-() RETURN r //"),
    ]

# Cypher 「구조」가 되려면 반드시 실려 나가야 하는 문자·키워드.
STRUCT = re.compile(r"[`{}()\[\];\"']|\b(MATCH|RETURN|DELETE|CALL|WITH|WHERE|CREATE|MERGE|UNION)\b", re.I)

# 드라이버가 울면 그 문구가 새면 안 된다.
LEAK = [
    ("traceback", re.compile(r"Traceback \(most recent call last\)")),
    ("neo4j 드라이버", re.compile(r"neo4j\.exceptions|CypherSyntaxError|Neo\.ClientError|bolt://")),
    ("파일 경로", re.compile(r"[A-Za-z]:[\\/]|/usr/|/srv/|site-packages")),
]


class DrillError(RuntimeError):
    """측정 불가 — 결과가 아니다."""


def call(method: str, path: str, body: dict | None = None) -> tuple[int, str]:
    body, carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", "replace")
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def approved_question() -> str:
    status, raw = call("GET", "/api/scenarios")
    if status != 200:
        raise DrillError(f"/api/scenarios 가 {status} 를 냈다 — 대조군을 세울 수 없다")
    data = json.loads(raw)
    items = data if isinstance(data, list) else data.get("scenarios", [])
    for it in items:
        for key in ("question", "questions"):
            v = it.get(key)
            if isinstance(v, str) and v.strip():
                return v
            if isinstance(v, list) and v and isinstance(v[0], str):
                return v[0]
    raise DrillError("승인 질문을 한 개도 못 찾았다")


def code_of(raw: str) -> str:
    try:
        return json.loads(raw).get("error", {}).get("code", "?")
    except Exception:
        return "?"


def leaks(text: str) -> list[str]:
    return [name for name, rx in LEAK if rx.search(text)]


def layer_a(anchor: str) -> int:
    """도달 층 — 그래프를 타는 다섯 문."""
    bad = 0
    ctrl_q = approved_question()
    status, raw = call("POST", "/api/retrieval/compare",
                       {"sessionId": "levi2-t52-cypher", "question": ctrl_q, "strategies": ["graphrag"]})
    hits = 0
    if status == 200:
        try:
            hits = sum(len(r.get("hits") or []) for r in json.loads(raw))
        except Exception:
            hits = 0
    ctrl_ok = status == 200 and hits > 0
    bad += 0 if ctrl_ok else 1
    print(f"  {'PASS' if ctrl_ok else 'FAIL'}  대조군 A — 승인 질문의 graphrag 가 경로를 낸다   {status} · hits {hits}")
    if not ctrl_ok:
        print("  🔴 대조군이 죽었다 — 아래 전건 거절은 「그래프가 비었다」와 구분되지 않는다")

    for i, (what, payload) in enumerate(payloads(anchor), start=1):
        q = urllib.parse.quote(payload, safe="")
        doors = [
            ("compare", lambda p=payload: call("POST", "/api/retrieval/compare",
                                               {"sessionId": "levi2-t52-cypher", "question": p,
                                                "strategies": ["graphrag"]})),
            ("byRun", lambda q=q: call("GET", f"/api/graph/paths?byRun={q}")),
            ("evidence", lambda q=q: call("GET", f"/api/evidence/{q}")),
        ]
        for tag, fn in doors:
            status, raw = fn()
            found = leaks(raw)
            ok = (status < 500) and (status != 200) and not found
            bad += 0 if ok else 1
            why = code_of(raw)
            if status >= 500:
                why += " · 🔴 5xx"
            if status == 200:
                why += " · 🔴 결과를 냈다"
            if found:
                why += " · 🔴 내부 노출 " + ",".join(found)
            print(f"  {'PASS' if ok else 'FAIL'}  A-{i:02}/{tag:8} {what:14} {status} {why}")
    return bad


def _service_modules():
    """대상 모듈 두 개를 한 자리에서 연다(층 B 와 앵커 출처가 같은 트리를 보게)."""
    if not SERVICE_DIR.exists():
        raise DrillError(f"대상 없음 {SERVICE_DIR}")
    sys.path.insert(0, str(SERVICE_DIR))
    try:
        from app.retrieval import anchors, allowlist  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover
        raise DrillError(f"app.retrieval 모듈을 못 읽었다: {exc}") from exc
    return anchors, allowlist


def anchor_from_canon() -> tuple[str, str]:
    """🔴 앵커를 «정본에서» 얻는다 — 박지 않는다.

    승인 질문 목록(`allowlist.APPROVED_QUESTIONS`)을 읽어 추출기가 실제로 뽑아내는 첫 ID 를
    쓴다. 서버가 없어도 되고(층 B 단독 실행), seed·승인 목록이 바뀌면 자극과 대조군이 **함께**
    따라간다. 하나도 못 뽑으면 그것은 초록도 빨강도 아니라 **측정 불가**다.
    """
    anchors, allowlist = _service_modules()
    for question in allowlist.APPROVED_QUESTIONS.values():
        found = anchors.extract(question)
        if found:
            return found[0], question
    raise DrillError(
        "승인 질문 어디에서도 앵커를 못 뽑았다 — 추출기가 죽었거나 목록이 비었다(측정 불가)"
    )


def layer_b(anchor: str, ctrl_question: str) -> int:
    """구조 층 — `$anchor` 로 가는 값을 만드는 자리에 직접 먹인다."""
    anchors, _ = _service_modules()

    bad = 0
    ctrl = anchors.extract(ctrl_question)
    ctrl_ok = anchor in ctrl
    bad += 0 if ctrl_ok else 1
    print(f"  {'PASS' if ctrl_ok else 'FAIL'}  대조군 B — 정상 문장에서 ID 가 추출된다        {ctrl}")
    if not ctrl_ok:
        print("  🔴 추출기가 아무것도 안 내놓는다 — 아래 «구조 문자 0» 은 판정이 아니다")

    for i, (what, payload) in enumerate(payloads(anchor), start=1):
        out = anchors.extract(payload)
        offenders = [t for t in out if STRUCT.search(t)]
        ok = not offenders
        bad += 0 if ok else 1
        why = f"토큰 {out}" + (" · 🔴 구조 문자 실림 " + str(offenders) if offenders else " · 구조 문자 0")
        print(f"  {'PASS' if ok else 'FAIL'}  B-{i:02} {what:14} {why}")
    return bad


def main() -> int:
    only_b = "--layer-b-only" in sys.argv
    anchor, ctrl_question = anchor_from_canon()
    print(f"자극      : Cypher 조각 {len(payloads(anchor))}종 · 앵커 {anchor} "
          f"(승인 질문 정본에서 추출 — 박은 값 아님)")
    print("🔴 층 A = «닿는가»(4xx 는 앞문일 수 있다) · 층 B = «구조가 되는가»(그래프로 가는 값 자체)\n")

    bad = 0
    if not only_b:
        _colocation.require(API_BASE)
        print(f"  ── 층 A · 도달 (대상 {API_BASE})")
        bad += layer_a(anchor)
        print()
    print("  ── 층 B · 구조 (app.retrieval.anchors — 서버 불요)")
    bad += layer_b(anchor, ctrl_question)

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
