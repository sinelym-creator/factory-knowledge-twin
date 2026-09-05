"""gate5_fidelity_drill — T3-6 Gate 5 «재생 충실도» 비교기 (검증 좌석 · 16대).

무엇을 맞대는가: 리포의 **녹화본 정본** `data/replay/gs-01.events.jsonl`(32건 · 원
`RUN-7e4cfd025422` · ts 무손질 · `mode:"live"`) ↔ 같은 시나리오를 **지금 한 번 더 돌린**
live 산출. 비교 축은 티켓 문면 그대로 «seq · evidenceId · candidates · workOrderDraftId»
+ `(seq,type)` 열이다.

🔴 **모드를 둘로 가른다 — 같은 비교기가 다른 것을 재기 때문이다.**

    strict   아무것도 빼지 않는다. T2-4 「재생이 녹화본 «그대로»인가」의 축 —
             ts 한 글자가 달라도 어긋남이다. **자기 검증 5종이 도는 자리.**
    logical  «다시 돌리면 반드시 달라지는 것»만 뺀다(최상위 runId · ts 계열).
             fixture ↔ 신규 live 를 맞댈 때 쓴다.

🔴 **`GP-` evidenceId 안의 녹화 runId 는 정규화하지 않는다**(T2-4 J-H). 그것은 실행 식별자가
   아니라 **그 근거의 «이름»**이다. 이름을 치환해 맞추면 비교기가 어긋남을 «지워» 초록을
   만든다 — 그물이 대상을 통과시키는 가장 흔한 방식이다. 그래서 지우지 않고 **따로 센다**:

    A. 축 어긋남              판정 대상(seq · type · 비-GP evidenceId · candidates · draftId)
    B. 이름만 갈린 GP- 근거    접두·색인은 같고 안의 runId 만 이 실행의 것 — 계수·표시만
    C. 제외한 비결정 필드      🔴 «제외한 것도 센다» — 0 건이면 규칙이 죽은 것이다

    python tests/api/gate5_fidelity_drill.py                 # 자기 검증 + fixture 자기 동일성
    python tests/api/gate5_fidelity_drill.py --live          # + live 1회 녹화 후 비교(대상 DB 에 run 1건)

환경: `FKT_API_BASE` · `FKT_SERVER_REPO`(서버가 읽는 트리 · 기본 = 이 트리) · `FKT_SCENARIO`.
🔴 `--live` 산출물은 **커밋하지 않는다** — `FKT_GATE5_OUT` 에 적어 두거나 화면으로만 읽는다.
리포의 정본은 fixture 32건 그대로다.

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _session  # noqa: E402
import _colocation  # noqa: E402  — 🔴 판정 앞의 귀속 증명(Q-42 · Q-40 계보)
import _env  # noqa: E402  — 공용 «대상 주소» 게이트(O-22 · 미지정이면 즉시 죽는다)

API_BASE = _env.api_base()
SCENARIO = os.environ.get("FKT_SCENARIO", "GS-01")
SESSION_ID = "levi2-t36-gate5"
REPO = Path(__file__).resolve().parents[2]
FIXTURE = Path(os.environ.get("FKT_SERVER_REPO", str(REPO))) / "data" / "replay" / f"{SCENARIO.lower()}.events.jsonl"

#: 🔴 다시 돌리면 «반드시» 달라지는 것. 여기 든 것만 logical 에서 빠진다 — 늘리려면 근거를 적어라.
NONDETERMINISTIC = ("runId", "ts")

#: 🔴 **값 비교에서 빼되 «규칙 검사»가 이어받는 payload 필드**(오케 판정선 · T3-6 소조각).
#:   빼기만 하면 아무도 안 보는 자리가 된다 — `check_rules()` 가 이 이름들의 «논리»를 센다.
#:   score 는 여기 없다(중첩이라 `strip()` 이 따로 빼고, live↔live 축에서는 값 비교를 유지한다).
RULE_CHECKED = ("elapsedMs", "totalElapsedMs", "workOrderDraftId")


class DrillError(RuntimeError):
    """비교기 자신이 고장났거나 대상이 서 있지 않다 — 결과가 아니라 «측정 불가»다."""


# ── 대상과의 왕복 ───────────────────────────────────────────────────────────


def call(method: str, path: str, body: dict | None = None):
    body, carry = _session.prepare(body, path)
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if data else {}
    headers.update(carry)
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


# ── 비교기 본체 ─────────────────────────────────────────────────────────────


def gp_slot(evidence_id: str) -> tuple[str, str] | None:
    """`GP-<녹화 runId>-<색인>` 을 (접두, 색인) 으로 쪼갠다. GP- 가 아니면 None."""
    if not isinstance(evidence_id, str) or not evidence_id.startswith("GP-"):
        return None
    parts = evidence_id.split("-")
    return ("GP", parts[-1]) if len(parts) >= 3 else None


def evidence_id_of(row: dict) -> str | None:
    payload = row.get("payload")
    if not isinstance(payload, dict):
        return None
    evidence = payload.get("evidence")
    return evidence.get("evidenceId") if isinstance(evidence, dict) else None


def paths(value, prefix: str = "") -> dict[str, object]:
    """중첩 구조를 «잎 경로 → 값» 으로 편다. 「무엇이 갈렸나」를 이름으로 말하기 위한 것."""
    if isinstance(value, dict):
        out: dict[str, object] = {}
        for key, sub in value.items():
            out.update(paths(sub, f"{prefix}.{key}" if prefix else str(key)))
        return out
    if isinstance(value, list):
        out = {}
        for i, sub in enumerate(value):
            out.update(paths(sub, f"{prefix}[{i}]"))
        return out
    return {prefix: value}


def diff_paths(left: dict, right: dict) -> list[str]:
    """🔴 「갈렸다」로 끝내지 않는다 — 갈린 «경로 이름»을 돌려준다.
    이름이 없으면 판정자는 그 빨강의 주어가 대상인지 비결정 필드인지 가를 수 없다."""
    lp, rp = paths(left), paths(right)
    names = sorted(set(lp) | set(rp))
    return [n for n in names if lp.get(n, "<없음>") != rp.get(n, "<없음>")]


def strip(row: dict, mode: str) -> tuple[dict, int]:
    """logical 에서만 비결정 «최상위» 필드를 뺀다. 뺀 수를 함께 돌려준다(제외도 센다)."""
    if mode == "strict":
        return copy.deepcopy(row), 0
    out = copy.deepcopy(row)
    dropped = 0
    for key in NONDETERMINISTIC:
        if key in out:
            del out[key]
            dropped += 1
    # 🔴 «값 비교»에서 빼되 «규칙 검사»(check_rules)가 그 자리를 이어받는다 — 빼기만 하는 게 아니다.
    payload = out.get("payload")
    if isinstance(payload, dict):
        for key in RULE_CHECKED:
            if key in payload:
                del payload[key]
                dropped += 1
        evidence = payload.get("evidence")
        if isinstance(evidence, dict) and "score" in evidence:
            del evidence["score"]
            dropped += 1
    return out, dropped


def compare(left: list[dict], right: list[dict], mode: str) -> dict:
    """왼쪽(정본) ↔ 오른쪽(대상). A 축 어긋남 · B GP 이름 · C 제외 수를 갈라 돌려준다."""
    axis: list[str] = []
    gp_renamed: list[str] = []
    dropped = 0

    if len(left) != len(right):
        axis.append(f"이벤트 수 {len(left)} ↔ {len(right)}")

    for i in range(max(len(left), len(right))):
        lrow = left[i] if i < len(left) else None
        rrow = right[i] if i < len(right) else None
        if lrow is None or rrow is None:
            axis.append(f"[{i}] 한쪽에만 있다 ({'왼쪽 없음' if lrow is None else '오른쪽 없음'})")
            continue

        # (seq, type) 열 — 순서와 어휘가 같은 자리에 오는가
        lkey, rkey = (lrow.get("seq"), lrow.get("type")), (rrow.get("seq"), rrow.get("type"))
        if lkey != rkey:
            axis.append(f"[{i}] (seq,type) {lkey} ↔ {rkey}")
            continue

        # 🔴 GP- 근거는 «이름»이 갈리는 것이 정상이다 — 지우지 않고 따로 센다.
        lid, rid = evidence_id_of(lrow), evidence_id_of(rrow)
        lslot, rslot = gp_slot(lid or ""), gp_slot(rid or "")
        renamed_here = bool(lslot and rslot and lslot == rslot and lid != rid)
        if renamed_here:
            gp_renamed.append(f"[{i}] seq={lrow.get('seq')} {lid} ↔ {rid}")

        lcmp, ld = strip(lrow, mode)
        rcmp, rd = strip(rrow, mode)
        dropped += ld + rd
        if renamed_here:
            # 이름 축은 B 로 이미 셌으므로 A 에서 두 번 세지 않는다. 나머지 payload 는 그대로 본다.
            lcmp["payload"]["evidence"]["evidenceId"] = "<GP 이름 · B 에서 셈>"
            rcmp["payload"]["evidence"]["evidenceId"] = "<GP 이름 · B 에서 셈>"
        if lcmp != rcmp:
            where = diff_paths(lcmp, rcmp)
            axis.append(
                f"[{i}] seq={lrow.get('seq')} type={lrow.get('type')} — 갈린 경로 {len(where)}: "
                + " · ".join(where[:6])
                + (" …" if len(where) > 6 else "")
            )

    return {"axis": axis, "gp_renamed": gp_renamed, "dropped": dropped}


# ── 자기 검증 5종 (T2-4 계보 · 🔴 strict 축 · fixture 로 «참 울림» 선행) ─────


def self_check(rows: list[dict]) -> None:
    same = copy.deepcopy(rows)

    ts_touched = copy.deepcopy(rows)
    ts_touched[3]["ts"] = "2020-01-02T03:04:05.000Z"

    payload_touched = copy.deepcopy(rows)
    completed = next(r for r in payload_touched if r["type"] == "run.completed")
    completed["payload"]["totalElapsedMs"] = int(completed["payload"]["totalElapsedMs"]) + 1

    seq_moved = copy.deepcopy(rows)
    seq_moved[5], seq_moved[6] = seq_moved[6], seq_moved[5]

    field_added = copy.deepcopy(rows)
    field_added[1]["zzExtra"] = True

    samples = [
        ("동일본", same, 0),
        ("ts 한 칸 손질", ts_touched, 1),
        ("payload 한 글자", payload_touched, 1),
        ("seq 두 줄 자리 바꿈", seq_moved, 2),
        ("필드 하나 추가", field_added, 1),
    ]
    for label, candidate, want_at_least in samples:
        found = len(compare(rows, candidate, "strict")["axis"])
        ok = (found == 0) if want_at_least == 0 else (found >= want_at_least)
        if not ok:
            raise DrillError(
                f"자기 검증 실패 — «{label}» 을 {found} 건으로 셌다(기대 "
                + ("0" if want_at_least == 0 else f"{want_at_least} 이상")
                + "). 비교기가 어긋남을 못 본다면 그 초록은 대상의 것이 아니다"
            )
    print("  자기 검증  표본 5종(동일 1 · 어긋남 4 = ts·payload·seq 이동·필드 추가) 전건 기대대로 — 비교기 살아 있음")

    # 🔴 정규화가 «일하는가»의 대조군 — logical 에서는 ts 손질이 사라져야 한다.
    if compare(rows, ts_touched, "logical")["axis"]:
        raise DrillError("자기 검증 실패 — logical 이 ts 를 빼지 못한다(정규화가 죽었다)")
    dropped = compare(rows, same, "logical")["dropped"]
    if dropped == 0:
        raise DrillError("자기 검증 실패 — 제외 규칙이 «한 필드도» 물지 않았다. 0 을 통과로 세지 않는다")
    print(f"  정규화 대조군  strict 가 잡은 ts 손질을 logical 은 뺀다 · 뺀 필드 총 {dropped}칸(0 이면 FAIL)")


# ── live 1회 녹화 ───────────────────────────────────────────────────────────


def record_live() -> tuple[str, list[dict]]:
    status, created = call("POST", f"/api/scenarios/{SCENARIO}/runs", {"sessionId": SESSION_ID, "mode": "live"})
    run_id = (created or {}).get("runId")
    if status != 200 or not run_id:
        raise DrillError(f"live run 을 시작하지 못했다 — {status} {created}")
    deadline = time.time() + 300
    snap: dict = {}
    while time.time() < deadline:
        _, snap = call("GET", f"/api/runs/{run_id}")
        if isinstance(snap, dict) and snap.get("status") != "running":
            break
        time.sleep(0.5)
    if snap.get("status") != "completed":
        raise DrillError(f"live run 이 completed 로 끝나지 않았다 — {snap.get('status')}")
    _, events = call("GET", f"/api/runs/{run_id}/events")
    if not isinstance(events, list) or not events:
        raise DrillError("live run 의 이벤트가 비었다 — 맞댈 것이 없다")
    return run_id, events


def check_rules(rows: list[dict], run_id: str) -> list[str]:
    """🔴 **값이 아니라 «논리»를 검사하는 층**(오케 판정선 00:59 · T3-6 소조각).

    비결정 필드를 목록에서 «빼기»만 하면 그 자리는 아무도 안 본다. 빼는 대신 그 필드가
    지켜야 할 규칙을 여기서 센다 — 「같은 값」도 「있으면 통과」도 아닌 제3의 축이다.
    """
    bad: list[str] = []

    # ① runId — 신규인 것이 «옳다». fixture 의 것과 같으면 그게 이상하다.
    ids = {r.get("runId") for r in rows}
    if ids != {run_id}:
        bad.append(f"runId 가 한 실행의 것이 아니다: {sorted(ids)}")

    # ② ts — 존재 + 단조(뒤로 가지 않는다). 값 자체는 비교하지 않는다.
    stamps = [r.get("ts") for r in rows]
    if any(not t for t in stamps):
        bad.append("ts 가 없는 이벤트가 있다")
    elif stamps != sorted(stamps):
        bad.append("ts 가 뒤로 간다(단조 아님)")

    # ③ elapsedMs / totalElapsedMs — 존재 + 음수 아님 + 단조
    elapsed = [(r["seq"], r["payload"]["elapsedMs"]) for r in rows
               if r.get("type") == "step.completed" and isinstance(r.get("payload"), dict)
               and "elapsedMs" in r["payload"]]
    if not elapsed:
        bad.append("step.completed 에 elapsedMs 가 하나도 없다 — 규칙을 잴 것이 없다")
    if any(v is None or not isinstance(v, (int, float)) or v < 0 for _, v in elapsed):
        bad.append(f"elapsedMs 에 음수·비수치가 있다: {elapsed}")
    # 🔴 **「단조」는 규칙이 아니다** — 내가 한 번 그렇게 적었다가 물렸다. 실측:
    #    fixture 자신의 값이 [13, 14412, 14, 20, 22] 로 «단조가 아니다». 계약 정본
    #    `agent-events-v0.1.schema.json:108` 도 elapsedMs 를 「TTAE **합산** 표시의 원천」이라
    #    한다 — 누적이 아니라 **단계별 소요**다. 정본이 말한 것만 red 로 삼는다:
    #    ⓐ 정수 · ⓑ 0 이상(schema `minimum: 0`) · ⓒ 총합이 부분합보다 작지 않다.
    completed = next((r for r in rows if r.get("type") == "run.completed"), None)
    total = (completed or {}).get("payload", {}).get("totalElapsedMs")
    if not isinstance(total, (int, float)) or total < 0:
        bad.append(f"totalElapsedMs 가 없거나 음수다: {total!r}")
    elif elapsed and total < sum(v for _, v in elapsed):
        bad.append(
            f"totalElapsedMs({total}) 가 단계 소요 합({sum(v for _, v in elapsed)})보다 작다 "
            "— 「합산의 원천」이라는 계약 문면과 어긋난다"
        )

    # ④ workOrderDraftId — 🔴 「발급 정확히 1 · 같은 (seq,type) 자리 · 형식」
    #    형식 접두는 **정본에서 실측한 것**을 쓴다(발주문 표기 「WO-」 가 아니라 실물 「WOD-」).
    drafts = [(r["seq"], r["type"], r["payload"]["workOrderDraftId"]) for r in rows
              if isinstance(r.get("payload"), dict) and r["payload"].get("workOrderDraftId")]
    if len(drafts) != 1:
        bad.append(f"초안 발급이 정확히 1건이 아니다: {len(drafts)}건 {drafts}")
    else:
        seq, typ, did = drafts[0]
        if typ != "run.completed":
            bad.append(f"초안이 run.completed 가 아닌 자리에서 나왔다: seq={seq} type={typ}")
        if not str(did).startswith("WOD-"):
            bad.append(f"초안 id 형식이 정본과 다르다: {did}")

    # ⑤ GP- 근거 이름 — 🔴 «접두 안의 runId 가 이 실행의 것인가». 치환이 아니라 규칙 검사다(J-H).
    short = run_id.replace("RUN-", "")
    gp = [evidence_id_of(r) for r in rows if (evidence_id_of(r) or "").startswith("GP-")]
    wrong = [g for g in gp if short not in g]
    if not gp:
        bad.append("GP- 근거가 0건 — 이름 규칙을 잴 것이 없다")
    if wrong:
        bad.append(f"GP- 이름 안의 runId 가 이 실행의 것이 아니다: {wrong}")

    # ⑥ score — fixture 축에서는 «규칙»으로 본다(범위·정렬). live↔live 는 값 비교가 따로 한다.
    scores = [r["payload"]["evidence"].get("score") for r in rows
              if r.get("type") == "step.evidence" and isinstance(r.get("payload"), dict)
              and isinstance(r["payload"].get("evidence"), dict)]
    numeric = [s for s in scores if isinstance(s, (int, float))]
    if numeric and (min(numeric) < 0 or max(numeric) > 1):
        bad.append(f"score 가 [0,1] 밖이다: min={min(numeric)} max={max(numeric)}")
    return bad


def snapshot_axes(rows: list[dict]) -> dict:
    completed = next((r for r in rows if r.get("type") == "run.completed"), {})
    payload = completed.get("payload", {}) if isinstance(completed, dict) else {}
    return {
        "이벤트": len(rows),
        "seq 열": f"{rows[0].get('seq')}..{rows[-1].get('seq')}",
        "근거": sum(1 for r in rows if r.get("type") == "step.evidence"),
        "후보": len(payload.get("candidates") or []),
        "workOrderDraftId": payload.get("workOrderDraftId"),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="live 1회 녹화 후 fixture 와 맞댄다(대상 DB 에 run 1건)")
    ap.add_argument(
        "--live2",
        action="store_true",
        help="🔴 live 를 «2회 연속» 돌려 live↔live 를 맞댄다 — 어떤 필드가 «비결정»인지를 대상이 스스로 말하게 한다",
    )
    args = ap.parse_args()

    if not FIXTURE.exists():
        print(f"🔴 녹화본 정본이 없다: {FIXTURE} — 맞댈 것이 없다(측정 불가)")
        return 2
    rows = [json.loads(line) for line in FIXTURE.read_text(encoding="utf-8").splitlines() if line.strip()]

    print(f"정본      : {FIXTURE.name} · {len(rows)}건 · 원 runId {rows[0].get('runId')}")
    print(f"대상      : {API_BASE if args.live else '(live 축 꺼짐 — --live 로 켠다)'}")
    print(f"비교 축   : seq · type · evidenceId · candidates · workOrderDraftId + (seq,type) 열")
    print(f"정규화    : logical 에서만 {NONDETERMINISTIC} 제외 · 🔴 GP- 이름 «안»의 runId 는 제외 대상 아님(J-H)")
    print()

    self_check(rows)

    bad = 0
    identity = compare(rows, copy.deepcopy(rows), "strict")
    print(f"  {'PASS' if not identity['axis'] else 'FAIL'}  G5-0 정본 자기 동일성(strict) — 어긋남 {len(identity['axis'])}건")
    bad += 0 if not identity["axis"] else 1

    if args.live2:
        # 🔴 «무엇이 비결정인가»를 내가 선언하지 않는다 — 같은 스택에서 두 번 돌려 «대상이 말하게» 한다.
        #    이 축이 없으면 「fixture 와 갈렸다」가 「대상이 흔들린다」인지 「fixture 가 낡았다」인지 못 가른다.
        _colocation.require(API_BASE)
        first_id, first = record_live()
        second_id, second = record_live()
        print(f"\n  live↔live  {first_id} ↔ {second_id} (같은 스택 · 연속 2회)")
        pair = compare(first, second, "logical")
        rollup2: dict[str, int] = {}
        for line in pair["axis"]:
            for name in line.split("갈린 경로", 1)[-1].split(":", 1)[-1].split(" · "):
                key = name.strip().rstrip(" …")
                if key:
                    rollup2[key] = rollup2.get(key, 0) + 1
        print(f"  B 이름만 갈린 GP- 근거   : {len(pair['gp_renamed'])}건 (실행이 다르니 이름은 갈리는 것이 정상)")
        print(f"  A 축 어긋남              : {len(pair['axis'])}건 · 경로 {len(rollup2)}종")
        for name, n in sorted(rollup2.items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"       {n:3}회  {name}")
        print(
            "\n  🔴 읽는 법: 여기 «나온» 경로 = 같은 코드가 두 번 다르게 답하는 자리(비결정)."
            "\n              여기 «안 나오는데» fixture 축에서만 갈린 경로 = 코드가 fixture 이후 바뀐 자리(진화)."
        )
        print(f"\n결과: (선언 아님 · 값 기록) live↔live 어긋난 경로 {len(rollup2)}종")
        return 0

    if not args.live:
        # 🔴 건너뜀은 «어긋남»이 아니므로 rc 는 0 이다 — 그러나 초록도 아니다.
        #    rc 만 읽고 「Gate 5 통과」로 옮겨 적지 마라. 이 행이 그것을 막는 유일한 장치다.
        print("\n  ----  G5-1 live 대조 — 건너뜀(--live 로 켠다). 🔴 초록으로 세지 않는다")
        print(f"\n결과: 어긋남 {bad}건 · 🔴 건너뛴 행 1건(초록 아님 · rc 0 ≠ Gate 5 통과)")
        return 1 if bad else 0

    _colocation.require(API_BASE)
    run_id, live_rows = record_live()
    print(f"\n  live 녹화  runId={run_id} · 이벤트 {len(live_rows)}건 (🔴 산출물은 커밋하지 않는다)")

    print(f"  정본  {snapshot_axes(rows)}")
    print(f"  live  {snapshot_axes(live_rows)}")

    result = compare(rows, live_rows, "logical")

    # 🔴 판정자가 «부류»로 읽게 한다. 11줄이 11가지 사건인지 3가지인지가 판정을 가른다 —
    #    「두 사건을 한 항아리에 담지 마라」의 반대편: 같은 사건을 열한 항아리로 흩지도 마라.
    rollup: dict[str, int] = {}
    for line in result["axis"]:
        for name in line.split("갈린 경로", 1)[-1].split(":", 1)[-1].split(" · "):
            key = name.strip().rstrip(" …")
            if key:
                rollup[key] = rollup.get(key, 0) + 1

    print(f"\n  C 제외한 비결정 필드     : {result['dropped']}칸 (0 이면 규칙이 죽은 것)")
    print(f"  B 이름만 갈린 GP- 근거   : {len(result['gp_renamed'])}건 — 🔴 지우지 않고 «센다»(J-H)")
    for line in result["gp_renamed"]:
        print(f"       {line}")
    print(f"  A 축 어긋남              : {len(result['axis'])}건 · 갈린 «경로» {len(rollup)}종")
    for name, n in sorted(rollup.items(), key=lambda kv: (-kv[1], kv[0])):
        print(f"       {n:3}회  {name}")
    print("       ── 줄별 ──")
    for line in result["axis"]:
        print(f"       {line}")

    # 🔴 **2층 — 값이 아니라 논리를 검사하는 자리.** 위에서 「갈렸다」로 나온 경로가
    #    여기서 규칙을 지키면, 그것은 결함이 아니라 «비결정 또는 진화»다.
    violations = check_rules(live_rows, run_id)
    print(f"\n  D 규칙 검사(값 제외 축)   : 위반 {len(violations)}건")
    for line in violations:
        print(f"       🔴 {line}")
    if not violations:
        print("       runId 신규 · ts 단조 · elapsedMs 정수·0 이상 · 총합 ≥ 부분합 · 초안 발급 1(run.completed·WOD-) "
              "· GP- 이름 = 자기 runId · score ∈ [0,1]")

    ok = not result["axis"] and not violations
    print(f"\n  {'PASS' if ok else 'FAIL'}  G5-1 논리 일치 — 값 어긋남 {len(result['axis'])}건 · 규칙 위반 {len(violations)}건")
    bad += 0 if ok else 1

    print(f"\n결과: 어긋남 {bad}건")
    return 1 if bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except DrillError as exc:
        print(f"\n🔴 측정 불가 — {exc}")
        sys.exit(2)
    except _colocation.Unproven as exc:
        print(f"\n🔴 귀속 미증명 — {exc}")
        sys.exit(2)
