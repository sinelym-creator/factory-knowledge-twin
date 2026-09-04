"""freshness_badge_drill — 색인 «낡음»이 배지가 되어 표면까지 오는가 (검증 좌석 · T2-2).

🔴 이 그물이 지키는 문장 둘:
   ① **신선이 «실증»되지 않은 모든 상태는 배지가 true 다.** `stale` 은 「낡았는가」가 아니라
      「신선이 실증됐는가」의 부정이다(구현 성문 · 계약 v0.1.1). 뷰가 가르는 상태는 여섯이고
      계약의 배지는 boolean 하나라, 그 압축에서 «모르는 것이 신선으로 새는» 자리가 생긴다.
   ② **낡음이 실제로 생기면 배지가 «표면까지» 바뀐다.** 매핑 함수가 옳아도 응답까지
      실려 오지 않으면 화면은 낡은 근거를 신선하다고 말한다.

🔴 상태 목록을 이 파일에 «상수로 베끼지 않는다». 정본은 색인 신선도 뷰
   (`services/ai-api/db/migrations/007_freshness_unverified_and_integrity.sql`)이며 매 실행
   거기서 뽑는다. 베껴 두면 뷰에 상태가 하나 늘어도 이 표는 옛 목록으로 green 을 말한다.

🔴 ①은 대상 모듈(`app.reading.evidence.is_stale`)을 직접 부른다. 도달할 수 없는 상태
   (`SKIPPED`·`NOT_INDEXED` 는 chunk 를 만들지 않으므로 doc-chunk 응답에 오지 못하고,
   `BUILD_FAILED`·`ONTOLOGY_UNVERIFIED` 는 현 데이터에 없다)를 HTTP 로는 관측할 표면이
   없기 때문이다. 결합 대가는 1대 계보 F-3 그대로이며, 순수 함수 하나로 좁히고 임포트가
   깨지면 그 자체를 «측정 불가»(exit 2)로 죽인다. ②는 HTTP 표면만 상대한다.

--inject-stale 는 **쓴다**. 자기 스택(`FKT_PG_CONTAINER`)의 `index_build` 한 행에서
`source_sha256` 한 칸만 바꿔 뷰를 `STALE` 로 만들고, 원값을 되돌린다. SSOT(문서 본문·
`content_sha256`)·임베딩·그래프는 건드리지 않는다 — 낡음의 «정의»가 그 한 칸이다.
기본은 꺼져 있고, 타 좌석 스택에 겨누지 않는다.

    python tests/api/freshness_badge_drill.py                # 상태표만(쓰기 없음)
    python tests/api/freshness_badge_drill.py --inject-stale # + 실주입 왕복(원복 포함)

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류(그물이 죽었다)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402  — 공용 «세션 운반» 어댑터(T3-6 · 가드 미착지에서는 엄격 no-op)
import _ownership  # noqa: E402  — 🔴 Q-62 2단 안전장치(남의 스택 무접촉)
import _colocation  # noqa: E402  — 🔴 판정 앞의 «귀속 증명»(Q-42 · Q-40 계보)
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

REPO = Path(__file__).resolve().parents[2]
VIEW_SQL = (
    REPO / "services" / "ai-api" / "db" / "migrations"
    / "007_freshness_unverified_and_integrity.sql"
)
API_BASE = _env.api_base()
PG_CONTAINER = os.environ.get("FKT_PG_CONTAINER", "fkt-levi2-postgres-1")
PG_USER = os.environ.get("FKT_PG_USER", "fkt")
PG_DB = os.environ.get("FKT_PG_DB", "fkt")

# 주입 대상 — chunk 를 갖고 compare 가 실제로 인용하는 revision 이라야 «표면까지» 를 잰다.
TARGET_REVISION = "DOC-SOP-0014@r2"
TARGET_CHUNK = "DOC-SOP-0014@r2#001"
TARGET_DOC = "DOC-SOP-0014"
# 무접촉 대조군 — 주입이 «그 행에만» 들었는지 본다. 전역으로 번지면 이 열이 함께 물든다.
CONTROL_CHUNK = "DOC-MAN-0021@r1#001"
CONTROL_DOC = "DOC-MAN-0021"
# 값은 형식(64 hex)을 지키되 어느 문서의 해시도 아니다 — 제약을 우회하지 않는다.
DUMMY_SHA = "0" * 63 + "1"

PROVEN_FRESH = "FRESH"


class DrillError(RuntimeError):
    """드릴 자신이 고장난 상태 — 결과가 아니라 «측정 불가»다."""


# ── 정본에서 상태 목록을 뽑는다 ──────────────────────────────────────────────

# CASE 의 분기 결과만 — 조건절의 소문자 리터럴(`'skipped'`·`'failed'`)은 걸리지 않는다.
_STATE = re.compile(r"(?:THEN|ELSE)\s+'([A-Z_]+)'")


def view_states() -> list[str]:
    """뷰가 `freshness` 로 낼 수 있는 상태 전부. 🔴 구현 상수를 읽지 않는다."""
    if not VIEW_SQL.exists():
        raise DrillError(f"정본 없음: {VIEW_SQL}")
    text = VIEW_SQL.read_text(encoding="utf-8")
    end = text.find("END AS freshness")
    if end < 0:
        raise DrillError("뷰에서 freshness CASE 를 찾지 못했다 — 추출 규칙이 뷰와 어긋났다")
    head = text.rfind("CASE", 0, end)
    seen = list(dict.fromkeys(_STATE.findall(text[head:end])))
    if PROVEN_FRESH not in seen or len(seen) < 4:
        # 🔴 「0건 통과」를 만들지 않는다 — 빈 표는 결과가 아니라 고장이다.
        raise DrillError(f"뽑아낸 상태가 이상하다: {seen}")
    return seen


# ── HTTP ────────────────────────────────────────────────────────────────────


def get(path: str) -> tuple[int, dict]:
    try:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 헤더가 비어 no-op 이다.
        _carry = _session.prepare(None, path)[1]
        _req = urllib.request.Request(API_BASE + path, headers=_carry)
        with urllib.request.urlopen(_req, timeout=60) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def badge(path: str) -> bool:
    status, body = get(path)
    if status != 200:
        raise DrillError(f"{path} 가 {status} 를 냈다 — 대상이 아프다: {body}")
    return bool(body["stale"])


# ── psql ────────────────────────────────────────────────────────────────────


def psql(sql: str) -> str:
    out = subprocess.run(
        ["docker", "exec", PG_CONTAINER, "psql", "-U", PG_USER, "-d", PG_DB, "-t", "-A", "-c", sql],
        capture_output=True,
        text=True,
    )
    if out.returncode != 0:
        raise DrillError(f"psql 실패: {out.stderr.strip()[:200]}")
    return out.stdout.strip()


def freshness_of(revision: str) -> str:
    return psql(f"SELECT freshness FROM v_index_freshness WHERE revision_id = '{revision}'")


def latest_build(revision: str) -> str:
    """뷰가 고르는 그 빌드 — `built_at DESC, build_id DESC LIMIT 1`(007 §LATERAL)."""
    return psql(
        f"SELECT build_id FROM index_build WHERE revision_id = '{revision}' "
        "ORDER BY built_at DESC, build_id DESC LIMIT 1"
    )


# ── ① 상태표 (쓰기 없음) ────────────────────────────────────────────────────


def state_table() -> int:
    sys.path.insert(0, str(REPO / "services" / "ai-api"))
    try:
        from app.reading.evidence import is_stale
    except Exception as exc:         # noqa: BLE001
        raise DrillError(f"배지 매핑 함수를 부르지 못했다: {exc}") from exc

    states = view_states()
    print(f"  정본 뷰 상태 {len(states)}종: {' · '.join(states)}")

    # 🔴 자기 검증 — 정정 «전» 매핑(「STALE 만 true」)을 다시 만들어 이 표에 건다.
    #    옛 결함을 못 잡는 표는 약한 표다.
    def pre_fix(state: str | None) -> bool:
        return state == "STALE"

    caught = [s for s in states if pre_fix(s) != (s != PROVEN_FRESH)]
    if len(caught) < 2:
        raise DrillError("자기 검증 실패 — 정정 전 매핑을 이 표가 잡지 못한다")
    print(f"  자기 검증  정정 전 매핑(「STALE 만 true」)을 {len(caught)}건에서 잡는다 — 표가 살아 있다")
    print(f"             예: {caught[0]} · {caught[-1]}")
    print()

    rows = [(s, s != PROVEN_FRESH) for s in states] + [(None, True)]
    bad = 0
    for state, want in rows:
        got = is_stale(state)
        ok = got == want
        bad += 0 if ok else 1
        label = "값 없음(None)" if state is None else state
        print(f"  {'PASS' if ok else 'FAIL'}  {label:22} stale={str(got):5} 기대={want}")
    print(f"\n  상태표: {len(rows) - bad}/{len(rows)} 기대대로 · 어긋남 {bad}건")
    return bad


# ── ② 실주입 왕복 (쓴다) ────────────────────────────────────────────────────


def injection_round_trip() -> int:
    build = latest_build(TARGET_REVISION)
    if not build:
        raise DrillError(f"{TARGET_REVISION} 의 빌드 기록이 없다")
    original = psql(
        f"SELECT source_sha256 FROM index_build "
        f"WHERE revision_id = '{TARGET_REVISION}' AND build_id = '{build}'"
    )
    if not re.fullmatch(r"[0-9a-f]{64}", original):
        raise DrillError(f"원값이 sha256 형식이 아니다: {original[:20]!r}")
    print(f"  대상    index_build[{TARGET_REVISION} · {build}].source_sha256")
    print(f"  원값    {original}   ← 🔴 실패해도 이 값으로 되돌린다")

    before = freshness_of(TARGET_REVISION)
    if before != PROVEN_FRESH:
        raise DrillError(f"주입 «전»이 이미 {before} 다 — 전이를 잴 수 없다")

    ev = f"/api/evidence/{urllib.parse.quote(TARGET_CHUNK, safe='')}"
    doc = f"/api/documents/{TARGET_DOC}?highlight={urllib.parse.quote(TARGET_CHUNK, safe='')}"
    ctl_ev = f"/api/evidence/{urllib.parse.quote(CONTROL_CHUNK, safe='')}"
    ctl_doc = f"/api/documents/{CONTROL_DOC}"

    pre = {"evidence": badge(ev), "documents": badge(doc)}
    pre_ctl = {"evidence": badge(ctl_ev), "documents": badge(ctl_doc)}
    print(f"  주입 전  freshness={before} · 배지 {pre} · 대조군 {pre_ctl}")

    failed = 0
    try:
        psql(
            f"UPDATE index_build SET source_sha256 = '{DUMMY_SHA}' "
            f"WHERE revision_id = '{TARGET_REVISION}' AND build_id = '{build}'"
        )
        during = freshness_of(TARGET_REVISION)
        post = {"evidence": badge(ev), "documents": badge(doc)}
        post_ctl = {"evidence": badge(ctl_ev), "documents": badge(ctl_doc)}
        print(f"  주입 후  freshness={during} · 배지 {post} · 대조군 {post_ctl}")

        checks = [
            ("뷰가 STALE 로 바뀐다", during == "STALE"),
            ("/evidence 배지가 false→true", pre["evidence"] is False and post["evidence"] is True),
            ("/documents 배지가 false→true", pre["documents"] is False and post["documents"] is True),
            # 🔴 대조군은 «전후 같음» 만으로 부족하다 — 둘 다 true 여도 «같다». false 로 머무는 것까지 본다.
            ("대조군 /evidence 는 false 로 머문다", pre_ctl["evidence"] is False and post_ctl["evidence"] is False),
            ("대조군 /documents 는 false 로 머문다", pre_ctl["documents"] is False and post_ctl["documents"] is False),
        ]
        print()
        for name, ok in checks:
            failed += 0 if ok else 1
            print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    finally:
        psql(
            f"UPDATE index_build SET source_sha256 = '{original}' "
            f"WHERE revision_id = '{TARGET_REVISION}' AND build_id = '{build}'"
        )
        rewound = freshness_of(TARGET_REVISION)
        back = badge(ev)
        ok = rewound == PROVEN_FRESH and back is False
        failed += 0 if ok else 1
        print(f"\n  {'PASS' if ok else 'FAIL'}  되감기 — freshness={rewound} · /evidence stale={back}")
    return failed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inject-stale", action="store_true", help="실주입 왕복(쓴다 · 원복 포함)")
    args = parser.parse_args()
    _ownership.self_check()  # 🔴 Q-62 — 대상을 건드리기 전에 «문»부터. 입구에 안 걸려 있으면 잊는 순간 파괴 축이 그냥 돌아간다
    _colocation.require()  # 🔴 재기 전에 «저 서버가 이 트리를 읽는가»부터(Q-42)

    print(f"정본      : {VIEW_SQL.relative_to(REPO)}")
    print(f"대상      : {API_BASE}")
    print(f"실주입    : {'켬 — index_build 1칸 · 원복한다' if args.inject_stale else '끔(--inject-stale 로 켠다)'}\n")

    print("  ── ① 배지 매핑 상태표(쓰기 없음)")
    bad = state_table()

    if args.inject_stale:
        # 🔴 Q-62 — 남의 DB 한 칸이라도 «쓰기» 전에 소유 확인. 원복해도 남의 측정은 이미 흔들린다.
        _ownership.own_container("FKT_PG_CONTAINER", "한 칸을 손질했다 되돌릴 postgres")
        print("\n  ── ② 실주입 왕복 — 낡음이 표면까지 오는가")
        bad += injection_round_trip()

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        sys.exit(2)
