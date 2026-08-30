"""ssot_write_drill — 조사 실행이 SSOT 를 «쓰지 않는가» (검증 좌석 · T2-3 · J-3).

🔴 이 그물이 지키는 문장: **J-3 의 「SSOT 쓰기 0」은 주장이 아니라 잴 수 있는 사실이다.**
   저장소를 「프로세스 내 세션 스코프 · SSOT 쓰기 0 · 재기동 소실은 성문된 대가」로 판정했다면,
   그 판정이 참인지는 **run 전후로 SSOT 를 세어 보면** 안다. 성문만 있고 측정이 없으면
   「그렇게 하기로 했다」와 「그렇게 되고 있다」가 같은 초록을 낸다(4대 유언 계보).

무엇을 세는가: 공개 스키마의 **모든 base 테이블**의 행수 지문. 목록을 이 파일에 적지 않고
`information_schema` 에서 매 실행 뽑는다 — 테이블이 늘어도 표가 따라 자란다.

🔴 대조군이 판정의 절반이다. 「run 을 돌렸는데 안 변했다」만으로는 부족하다 — 지문 비교기가
   변화를 «실제로 잡는지» 먼저 증명한다(자기 검증: 알려진 변화를 넣었다 되돌린다).

    python tests/api/ssot_write_drill.py               # 지문 + 자기 검증(쓰기 없음의 증명)
    python tests/api/ssot_write_drill.py --run         # + run 1회 실행 전후 대조(T2-3 해제 후)

exit: 0 = 기대대로 · 1 = SSOT 가 변했다 · 2 = 실행 오류·미해제(측정 불가)
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
PG_CONTAINER = os.environ.get("FKT_PG_CONTAINER", "fkt-levi2-postgres-1")
PG_USER = os.environ.get("FKT_PG_USER", "fkt")
PG_DB = os.environ.get("FKT_PG_DB", "fkt")
SESSION_ID = "levi2-ssot-drill"
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
# 대상 동일성 대조에 쓰는 문서 — 씨앗 데이터에 항상 있는 것 하나면 된다.
PROBE_DOC = os.environ.get("FKT_PROBE_DOC", "DOC-SOP-0014")

_TABLES_SQL = (
    "SELECT table_name FROM information_schema.tables "
    "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
)


class DrillError(RuntimeError):
    """드릴 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


def psql(sql: str) -> str:
    out = subprocess.run(
        ["docker", "exec", PG_CONTAINER, "psql", "-U", PG_USER, "-d", PG_DB, "-t", "-A", "-c", sql],
        capture_output=True, text=True, encoding="utf-8",
    )
    if out.returncode != 0:
        raise DrillError(f"psql 실패: {(out.stderr or '').strip()[:200]}")
    return (out.stdout or "").strip()


def same_target() -> str:
    """🔴 지문 뜬 DB 가 «시험 대상 API 가 쓰는 그 DB» 인가.

    처음 이 그물은 컨테이너를 **이름 기본값**으로 골랐다(`FKT_PG_CONTAINER` 미설정이면
    `fkt-levi2-postgres-1`). 다른 좌석이 자기 스택에서 돌렸을 때 **내 DB 를 물었고**, 오류도
    경고도 없었다 — 조용히 다른 것을 보고 초록을 냈다. 이 세션 내내 쫓던 병(V-6 계열)을
    내 자산이 스스로 앓은 자리다.

    처방은 env 필수화가 아니다(그것도 사람이 맞게 주기를 바라는 것이다). **같은 것을 보고
    있다는 증명**으로 바꾼다 — API 로 문서 1건을 읽어 `contentHash` 를 받고, 지문 뜰 DB 에서
    같은 id 의 `content_sha256` 을 조회해 대조한다. 어긋나면 «측정 불가»(exit 2)다.
    """
    try:
        with urllib.request.urlopen(f"{API_BASE}/api/documents/{PROBE_DOC}", timeout=30) as res:
            served = json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raise DrillError(f"대조용 문서를 API 에서 못 읽었다({exc.code}) — 대상 확인 불가") from exc
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc

    revision = served.get("revisionId")
    api_hash = served.get("contentHash")
    db_hash = psql(f"SELECT content_sha256 FROM document_revision WHERE id = '{revision}'")
    if not api_hash or not db_hash:
        raise DrillError("대조에 쓸 해시를 못 얻었다 — 측정 불가")
    if api_hash != db_hash:
        raise DrillError(
            f"🔴 지문 대상이 시험 대상 API 의 DB 가 아니다 — {PG_CONTAINER}/{PG_DB} 를 보고 있다. "
            f"API {api_hash[:12]}… ≠ DB {db_hash[:12]}…  (FKT_PG_CONTAINER 를 맞춰라)"
        )
    return f"{revision} {api_hash[:12]}…"


def fingerprint() -> dict[str, int]:
    """공개 스키마 전 테이블의 행수 — 목록은 매 실행 DB 에서 뽑는다."""
    tables = [t for t in psql(_TABLES_SQL).splitlines() if t]
    if len(tables) < 5:
        raise DrillError(f"테이블을 {len(tables)}개밖에 못 찾았다 — 대상 DB 가 맞는가")
    counts = psql(" UNION ALL ".join(
        f"SELECT '{t}' AS t, count(*) AS n FROM {t}" for t in tables
    ) + " ORDER BY 1")
    out: dict[str, int] = {}
    for line in counts.splitlines():
        if "|" in line:
            name, number = line.rsplit("|", 1)
            out[name] = int(number)
    if len(out) != len(tables):
        raise DrillError(f"지문이 불완전하다({len(out)}/{len(tables)})")
    return out


def diff(before: dict[str, int], after: dict[str, int]) -> list[str]:
    changed = []
    for table in sorted(set(before) | set(after)):
        a, b = before.get(table), after.get(table)
        if a != b:
            changed.append(f"{table} {a}→{b}")
    return changed


def self_check() -> None:
    """🔴 비교기가 «빨강을 낼 수 있는가»부터 — 안 변한 것만 보는 비교기는 아무것도 보증하지 않는다."""
    base = {"document": 3, "alarm": 2}
    if diff(base, dict(base)):
        raise DrillError("자기 검증 실패 — 같은 지문을 다르다고 판정한다")
    if not diff(base, {"document": 3, "alarm": 3}):
        raise DrillError("자기 검증 실패 — 늘어난 행을 못 잡는다")
    if not diff(base, {"document": 3, "alarm": 2, "run": 1}):
        raise DrillError("자기 검증 실패 — 새 테이블을 못 잡는다")
    print("  자기 검증  표본 3종(무변 1 · 증가 1 · 신설 1) 전건 기대대로 — 비교기 살아 있음")


def start_run() -> str:
    payload = json.dumps({"sessionId": SESSION_ID, "mode": "live"}).encode("utf-8")
    req = urllib.request.Request(
        f"{API_BASE}/api/scenarios/{SCENARIO}/runs", data=payload,
        headers={"Content-Type": "application/json"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return json.loads(res.read().decode("utf-8")).get("runId", "")
    except urllib.error.HTTPError as exc:
        if exc.code == 501:
            raise DrillError("runs 표면이 아직 501 이다 — 미해제는 결함이 아니다(측정 불가)") from exc
        raise DrillError(f"run 생성이 {exc.code} 를 냈다") from exc
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def api(method: str, path: str, body: dict | None = None) -> tuple[int, object]:
    # 🔴 세션은 «운반»이지 표본이 아니다 — 미착지에서는 받은 것을 그대로 되돌려준다.
    body, _carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(_carry)
    req = urllib.request.Request(API_BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=300) as res:
            return res.status, json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"_raw": raw[:200]}
    except urllib.error.URLError as exc:
        raise DrillError(f"{API_BASE} 에 닿지 못했다: {exc}") from exc


def await_run(run_id: str) -> str:
    """🔴 run 이 «끝난 뒤»에 지문을 뜬다 — 도는 중을 재면 끝에서 나는 쓰기를 놓친다."""
    deadline = time.time() + 300
    while time.time() < deadline:
        _, snap = api("GET", f"/api/runs/{run_id}")
        state = (snap or {}).get("status")
        if state != "running":
            return str(state)
        time.sleep(0.5)
    raise DrillError("run 이 제한 시간 안에 끝나지 않았다 — 측정 불가")


def fresh_draft() -> str:
    status, created = api("POST", f"/api/scenarios/{SCENARIO}/runs",
                          {"sessionId": SESSION_ID, "mode": "live"})
    if status != 200:
        raise DrillError(f"run 생성이 {status} 를 냈다 — 측정 불가")
    run_id = created["runId"]                            # type: ignore[index]
    await_run(run_id)
    _, snap = api("GET", f"/api/runs/{run_id}")
    draft = (snap or {}).get("workOrderDraftId")         # type: ignore[union-attr]
    if not draft:
        raise DrillError("완주한 run 에 workOrderDraftId 가 없다 — 측정 불가")
    return str(draft)


def factory_row() -> tuple[str, str]:
    """공장 WO 한 행을 «DB 에서» 읽는다 — API 가 아니라 저장소가 증인이다."""
    raw = psql("select id || '|' || title || '|' || approval_state from work_order order by id limit 1;")
    line = [l.strip() for l in raw.strip().splitlines() if l.strip()][0]
    return line.split("|", 1)[0], line


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    with_run = "--run" in sys.argv
    with_wo = "--wo" in sys.argv

    print(f"대상 DB   : {PG_CONTAINER}/{PG_DB}")
    print(f"run 실행  : {'켬 — 1회 돌리고 전후를 센다' if with_run else '끔(--run 으로 켠다)'}")
    print(f"WO 축     : {'켬 — 초안 편집·승인 전후 + 공장 WO 조준' if with_wo else '끔(--wo 로 켠다)'}\n")
    self_check()

    proof = same_target()
    print(f"  대상 동일성  API 와 DB 가 같은 문서를 같은 해시로 말한다 — {proof}")

    before = fingerprint()
    print(f"  지문      테이블 {len(before)}개 · 총 {sum(before.values())}행")

    bad = 0
    skipped = 0
    if with_run:
        run_id = start_run()
        state = await_run(run_id)
        print(f"  run       {run_id or '(runId 없음)'} · 완주 {state}")
        after = fingerprint()
        changed = diff(before, after)
        ok = not changed
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  W-01 run 전후 SSOT 무변 — {' · '.join(changed) or '변화 0'}")
    else:
        # 🔴 건너뛴 행은 초록이 아니다 — 결과줄에서도 세지 않는다.
        skipped = 1
        print("  ----  W-01 run 전후 대조 — 건너뜀(--run 으로 켠다). 🔴 초록으로 세지 않는다")

    if with_wo:
        # ── W-02 초안 편집·승인 전후 SSOT 무변 (T2-5 축⑤) ──────────────────
        #    초안 축은 세션 스코프(계약 v0.1.4 저장 축 해석)라 SSOT 에 아무것도 남기면 안 된다.
        base = fingerprint()
        draft = fresh_draft()
        api("PATCH", f"/api/work-orders/{draft}", {"title": "리바이2 SSOT 축"})
        st_ap, _ = api("POST", f"/api/work-orders/{draft}/approve")
        changed = diff(base, fingerprint())
        ok = not changed and st_ap == 200
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  W-02 초안 편집·승인 전후 SSOT 무변 — "
              f"{' · '.join(changed) or '변화 0'} (approve {st_ap})")

        # ── W-03 🔴 초안 라우트로 «공장 WO» 를 조준한다 ─────────────────────
        #    id CHECK 배타라는 «설계»가 런타임에서도 참인지 던져서 확인한다.
        wo_id, before_row = factory_row()
        codes = []
        for method, path, body in (("GET", f"/api/work-orders/{wo_id}", None),
                                   ("PATCH", f"/api/work-orders/{wo_id}", {"title": "levi2-intrusion"}),
                                   ("POST", f"/api/work-orders/{wo_id}/approve", None),
                                   ("POST", f"/api/work-orders/{wo_id}/reject", None)):
            st, _bd = api(method, path, body)
            codes.append(str(st))
            if st == 200:
                bad += 1
        intact = before_row == factory_row()[1]
        bad += 0 if intact else 1
        print(f"  {'PASS' if intact else 'FAIL'}  W-03 공장 WO {wo_id} — 초안 4경로 응답 {codes} · "
              f"행 {'무변' if intact else '🔴 바뀌었다'}")
        print("        (200 이 하나라도 있으면 초안 라우트가 SSOT 를 잡은 것이다)")
    print(f"\n결과: 어긋남 {bad}건" + (f" · 🔴 건너뛴 행 {skipped}건(초록 아님)" if skipped else ""))
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DrillError as exc:
        print(f"\n측정 불가 — {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
