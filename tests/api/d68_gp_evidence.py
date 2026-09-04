r"""d68_gp_evidence — `GET /evidence/GP-*` 그래프 경로 근거 조회 독립 검증 (검증 좌석 · 45대 · D-68 a).

판정선 = `packages/contracts/rest-api-v0.1.md` **v0.1.17 append** 의 «판정선(독립 검증)» 줄.
서버 축만 잰다(화면 축 ③④ 는 b 셸 PR 소관 — 여기서 «안 잼»).

🔴 **대조군의 404 는 주어가 둘이다.**
   ⓐ 처방이 없다(= 우리가 재려는 것) · ⓑ 그 프로세스가 그 run 을 아예 모른다.
   run 저장소는 **프로세스 메모리**(`RunStore`)라, 대상 서버에서 만든 GP id 를 대조군에 물으면
   처방이 있든 없든 404 다 — 그 열은 **판정력이 0** 이다.
   그래서 대조군 열은 **대조군 서버 자신이 만든 run 의 GP id** 로 세운다. 같은 DB · 같은 그물 ·
   자기가 아는 run · 그런데도 404 여야 «처방 부재»가 그 404 의 주어다.

🔴 **무대가 안 울면 색을 내지 않는다** — 세션·run·GP 표본 중 하나라도 0 이면 `exit 2`(안 잼).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request

TIMEOUT = 90


# ── 왕복 ────────────────────────────────────────────────────────────────────

def _lower(headers):
    """🔴 uvicorn 은 헤더를 소문자로 보낸다 — `dict()` 로 바꾸는 순간 대소문자 무시가 죽어
       `Set-Cookie` 가 «없는 헤더»가 된다(45대 자수 1). 키를 소문자로 눕혀서 돌려준다."""
    return {k.lower(): v for k, v in headers.items()}


def call(base, method, path, body=None, cookie=None):
    req = urllib.request.Request(base + path, method=method)
    data = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    if cookie:
        req.add_header("Cookie", cookie)
    try:
        with urllib.request.urlopen(req, data, timeout=TIMEOUT) as r:
            return r.status, r.read().decode("utf-8"), _lower(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8"), _lower(e.headers)
    except Exception as e:  # 연결 자체가 안 된 회차 — 빨강이 아니라 «안 잼»
        return 0, f"__transport__ {type(e).__name__}: {e}", {}


def jload(text):
    try:
        return json.loads(text)
    except Exception:
        return None


# ── 무대 세우기 ─────────────────────────────────────────────────────────────

def new_session(base):
    st, body, hdr = call(base, "POST", "/sessions", {})
    if st != 200:
        return None, None
    sc = hdr.get("set-cookie") or ""
    cookie = sc.split(";")[0] if sc else None
    sid = (jload(body) or {}).get("sessionId")
    return sid, cookie


def start_run(base, cookie, scenario_id, sid, mode="live"):
    # 본문 `{ sessionId, mode }` 는 계약 본문 `rest-api-v0.1.md:34` 의 성문이다
    # (45대 초판이 v0.1.17 절만 읽고 「문면에 없다」고 적었던 것을 오케가 정정 — 내 미독).
    # 쿠키와 «같은» 값을 보낸다(v0.1.6 규칙).
    st, body, _ = call(base, "POST", f"/scenarios/{scenario_id}/runs",
                       {"mode": mode, "sessionId": sid}, cookie)
    if st not in (200, 201):
        return None, (st, body[:200])
    return (jload(body) or {}).get("runId"), None


def wait_run(base, cookie, run_id, budget_s=75):
    """완주까지 기다리되 «기다린 시간을 값으로» 돌려준다(고정 대기 금지 · 44대 교훈 6)."""
    t0 = time.monotonic()
    last = None
    while time.monotonic() - t0 < budget_s:
        st, body, _ = call(base, "GET", f"/runs/{run_id}", cookie=cookie)
        if st == 200:
            last = jload(body) or {}
            if last.get("status") in ("completed", "stopped", "failed"):
                return last, round(time.monotonic() - t0, 2)
    return last, round(time.monotonic() - t0, 2)


def graph_path_refs(base, cookie, run_id):
    """🔴 스냅샷이 아니라 **이벤트 정본**에서 뽑는다(스냅샷은 이벤트 정본이 아니다)."""
    st, body, _ = call(base, "GET", f"/runs/{run_id}/events", cookie=cookie)
    if st != 200:
        return [], [], (st, body[:200])
    events = jload(body) or []
    if isinstance(events, dict):
        events = events.get("events") or events.get("items") or []
    gp, dc = [], []
    for ev in events:
        payload = ev.get("payload") or {}
        for key in ("evidence", "evidenceRefs", "refs", "citedEvidence"):
            val = payload.get(key)
            # 🔴 `step.evidence` 의 `evidence` 는 **단수 dict** 다(실측). 리스트로 가정하고
            #    순회하면 dict 의 «키 문자열»을 돌게 되어 근거가 0건으로 보인다(45대 자수 2).
            refs = [val] if isinstance(val, dict) else (val or [])
            for ref in refs:
                if not isinstance(ref, dict):
                    continue
                if ref.get("kind") == "graph-path":
                    gp.append(ref)
                elif ref.get("kind") in ("document-chunk", "record"):
                    dc.append(ref)
    # id 중복 제거(같은 근거가 여러 이벤트에 실린다) — 순서 보존
    def dedup(rows):
        seen, out = set(), []
        for r in rows:
            i = r.get("evidenceId") or r.get("id")
            if i and i not in seen:
                seen.add(i)
                out.append(r)
        return out

    return dedup(gp), dedup(dc), None


# ── 축 ──────────────────────────────────────────────────────────────────────

def axis1_shape(base, cookie, gp_refs, rows):
    ok = 0
    for ref in gp_refs:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(base, "GET", f"/evidence/{eid}", cookie=cookie)
        got = jload(body) or {}
        meta_path = (got.get("meta") or {}).get("path") or {}
        checks = {
            "200": st == 200,
            "kind": got.get("kind") == "graph-path",
            # sourceId = 경로 «종단» targetId. 이벤트 ref 가 이미 그 값을 들고 있다.
            "sourceId": got.get("sourceId") == ref.get("sourceId"),
            # 🔴 excerpt 는 «이벤트 문면과 동일 문자열» — 조립이 아니라 == 대조.
            "excerpt==event": got.get("excerpt") == ref.get("excerpt"),
            "meta.path keys": all(k in meta_path for k in ("label", "hops", "nodes", "edges")),
            # 🔴 구현이 schemas.py 에서 «`text` 와 `excerpt` 는 같은 문자열» 이라고 스스로
            #    신고한다. 자기 신고는 알리바이가 아니다 — 같은 실행에서 값으로 물린다.
            "text==excerpt": got.get("text") == got.get("excerpt"),
        }
        passed = all(checks.values())
        ok += passed
        rows.append(("①", eid, "PASS" if passed else "FAIL",
                     f"st={st} " + " ".join(f"{k}={'o' if v else 'X'}" for k, v in checks.items())))
    return ok


def axis2_other_session(base, other_cookie, gp_refs, rows):
    ok = 0
    for ref in gp_refs:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(base, "GET", f"/evidence/{eid}", cookie=other_cookie)
        passed = st == 404
        ok += passed
        rows.append(("②", eid, "PASS" if passed else "FAIL", f"타 세션 st={st}"))
    return ok


def axis3_no_cookie(base, gp_refs, rows):
    ok = 0
    for ref in gp_refs:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(base, "GET", f"/evidence/{eid}")
        code = ((jload(body) or {}).get("error") or {}).get("code")
        passed = st == 401 and code == "session_required"
        ok += passed
        rows.append(("③", eid, "PASS" if passed else "FAIL", f"무쿠키 st={st} code={code}"))
    return ok


def axis4_bad_idx(base, cookie, run_id, rows):
    eid = f"GP-{run_id.removeprefix('RUN-')}-99"
    st, _, _ = call(base, "GET", f"/evidence/{eid}", cookie=cookie)
    passed = st == 404
    rows.append(("④", eid, "PASS" if passed else "FAIL", f"범위 밖 idx st={st}"))
    return passed


def axis6_docchunk(base, cookie, ctl_base, ctl_cookie, dc_refs, rows):
    """⑥ 회귀 — 🔴 본문 칸은 `text` 다.

    45대 초판은 `excerpt` 로 물어 5/5 FAIL 을 냈는데, 그건 **내 판정선의 오답**이었다
    (`excerpt` 는 GP 갈래가 «더» 채우는 이름 · record·doc-chunk 는 v0.1.1 의 `text`).
    그리고 「형상 불변」은 필드 유무가 아니라 **대조군과 같은 응답인가**로 잰다 —
    처방 «전» 서버에 같은 근거를 물어 **키 집합과 값을 통째로 대조**한다.
    """
    ok = 0
    for ref in dc_refs[:5]:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(base, "GET", f"/evidence/{eid}", cookie=cookie)
        got = jload(body) or {}
        cst, cbody, _ = call(ctl_base, "GET", f"/evidence/{eid}", cookie=ctl_cookie)
        ctl = jload(cbody) or {}
        # 🔴 판정선 정정(45대 2차 자수) — 「키 집합 동일」은 **과한 자**였다.
        #    처방은 응답 모델에 `excerpt`·`meta`·`score`·`sourceId` 를 **더한다**(additive).
        #    회귀의 뜻은 「새 키가 없다」가 아니라 «기존 키의 값이 그대로이고 새 키가
        #    이 kind 에서는 비어 있다» 이다 — 그래야 기존 소비자가 무영향이다(v0.1.16 선례).
        added = sorted(set(got) - set(ctl))
        kept_same = all(got.get(k) == ctl.get(k) for k in ctl)
        added_null = all(got.get(k) is None for k in added)
        missing = sorted(set(ctl) - set(got))
        passed = (st == 200 and cst == 200 and got.get("kind") == ref.get("kind")
                  and bool(got.get("text")) and kept_same and added_null and not missing)
        ok += passed
        rows.append(("⑥", eid, "PASS" if passed else "FAIL",
                     f"회귀 st={st} kind={got.get('kind')} 대조군st={cst} "
                     f"기존키값동일={'o' if kept_same else 'X'} 사라진키={missing or 0} "
                     f"추가키={added}(전부null={'o' if added_null else 'X'})"))
    return ok


def axis7_replay(base, cookie, sid, rows):
    """관측만 — 판정 아님. 값만 적는다."""
    # 🔴 `STATIC-GS-01` 은 «승인된 시나리오»가 아니다(404 실측) — 재생 run 은 시나리오 id 가
    #    아니라 **mode 로** 만든다(계약 v0.1.14 「재생 run 은 생성과 동시에 종결」).
    run_id, err = start_run(base, cookie, "GS-01", sid, mode="replay")
    if run_id is None:
        rows.append(("⑦", "STATIC-GS-01", "관측", f"run 시작 불가 {err}"))
        return
    snap, _ = wait_run(base, cookie, run_id, budget_s=30)
    gp, _, _ = graph_path_refs(base, cookie, run_id)
    if not gp:
        rows.append(("⑦", run_id, "관측", f"replay run 의 graph-path 근거 0건(status={(snap or {}).get('status')})"))
        return
    # 🔴 왜 501 이 아닌가를 «값»으로 남긴다 — 재생본의 GP id 는 **녹화 당시 run id** 를
    #    담고 있어, 지금 만든 replay run 과 접두가 다르다. 라우트가 되세운 run 을 서버가
    #    모르니 `record` 가 None 이고, `record.mode == "replay"` 인 501 갈래는 **도달하지
    #    못한다**. 계약 v0.1.17 이 말한 「`/graph/paths?byRun=` 과 같은 판정」이 이 표면에서는
    #    성립하지 않는다(그쪽은 run id 로 직접 물으므로 501 을 낸다). 판정 아님 · 관측.
    pointed = "RUN-" + gp[0]["evidenceId"].removeprefix("GP-").rsplit("-", 1)[0]
    rows.append(("⑦", run_id, "관측",
                 f"이 replay run={run_id} · GP 가 가리키는 run={pointed} · 같은가={pointed == run_id}"))
    st, body, _ = call(base, "GET", f"/graph/paths?byRun={run_id}", cookie=cookie)
    code = ((jload(body) or {}).get("error") or {}).get("code")
    rows.append(("⑦", "graph/paths?byRun", "관측", f"대조 표면 st={st} code={code}"))
    for ref in gp[:3]:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(base, "GET", f"/evidence/{eid}", cookie=cookie)
        code = ((jload(body) or {}).get("error") or {}).get("code")
        rows.append(("⑦", eid, "관측", f"replay GP st={st} code={code}"))


# ── 열 하나 = 서버 하나 ─────────────────────────────────────────────────────

def build_stage(base, label):
    """세션·run·GP 표본을 세운다. 못 세우면 (None, 사유)."""
    st, body, _ = call(base, "GET", "/health")
    if st != 200:
        return None, f"{label}: /health st={st}"
    # 🔴 임베딩 모델 warm-up 중에 시작한 run 은 vector 단계에서 죽는다(45대 실측 · 부팅 창).
    #    그 실패는 **대상의 결함이 아니라 내 무대의 시각**이다 — 빨강이 아니라 «안 잼»으로 낸다.
    models = (jload(body) or {}).get("models") or {}
    if models.get("embedding") != "ready":
        return None, f"{label}: embedding={models.get('embedding')} (warm-up 중 — 안 잼)"
    sid, cookie = new_session(base)
    if not cookie:
        return None, f"{label}: 세션 발급 실패"
    run_id, err = start_run(base, cookie, "GS-01", sid)
    if run_id is None:
        return None, f"{label}: run 시작 실패 {err}"
    snap, waited = wait_run(base, cookie, run_id)
    gp, dc, gerr = graph_path_refs(base, cookie, run_id)
    return {
        "base": base, "label": label, "sid": sid, "cookie": cookie,
        "run_id": run_id, "status": (snap or {}).get("status"), "waited": waited,
        "gp": gp, "dc": dc, "events_err": gerr,
    }, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", required=True, help="처방 서버 API base (…/api)")
    ap.add_argument("--control", required=True, help="대조군 서버 API base (…/api)")
    args = ap.parse_args()

    rows = []
    print("=" * 78)
    print("D-68 a 서버 축 — GET /evidence/GP-* (계약 v0.1.17 ①~⑥ + ⑦ 관측)")
    print("=" * 78)

    # ── 무대 증인부터 «수»로 ───────────────────────────────────────────────
    tgt, err = build_stage(args.target, "대상")
    if tgt is None:
        print(f"🔴 무대 미성립 — {err}")
        return 2
    ctl, err = build_stage(args.control, "대조군")
    if ctl is None:
        print(f"🔴 무대 미성립 — {err}")
        return 2

    for st in (tgt, ctl):
        print(f"  {st['label']:>4} {st['base']}  run={st['run_id']} status={st['status']} "
              f"대기={st['waited']}s  GP={len(st['gp'])}본  doc/rec={len(st['dc'])}본")
    if not tgt["gp"]:
        print("🔴 대상 GP 표본 0 — 자극이 실재하지 않았다. 어느 색도 내지 않는다.")
        return 2
    if not ctl["gp"]:
        print("🔴 대조군 GP 표본 0 — 대조군 열을 세울 수 없다(그 서버 자신의 run 으로 물어야 한다).")
        return 2

    # ── ⑤ 빨강 먼저 (대조군이 자기 run 의 GP 를 404 로 내는가) ────────────
    print("\n[⑤ 대조군 — 처방 «전» · 같은 그물 · 자기 run 의 GP id]")
    red = 0
    for ref in ctl["gp"]:
        eid = ref.get("evidenceId") or ref.get("id")
        st, body, _ = call(ctl["base"], "GET", f"/evidence/{eid}", cookie=ctl["cookie"])
        passed = st == 404
        red += passed
        rows.append(("⑤", eid, "PASS" if passed else "FAIL", f"대조군 st={st}"))
        print(f"  {eid}  st={st}  {'404 = 빨강 확인' if passed else '🔴 404 아님'}")
    if red != len(ctl["gp"]):
        print("🔴 대조군이 전건 404 가 아니다 — 대상의 초록은 판정력을 잃는다. 여기서 멈춘다.")
        for r in rows:
            print("   ", r)
        return 1

    # ── ①~④·⑥·⑦ ────────────────────────────────────────────────────────
    other_sid, other_cookie = new_session(tgt["base"])
    print("\n[①~④·⑥ 대상]")
    a1 = axis1_shape(tgt["base"], tgt["cookie"], tgt["gp"], rows)
    a2 = axis2_other_session(tgt["base"], other_cookie, tgt["gp"], rows)
    a3 = axis3_no_cookie(tgt["base"], tgt["gp"], rows)
    a4 = axis4_bad_idx(tgt["base"], tgt["cookie"], tgt["run_id"], rows)
    a6 = axis6_docchunk(tgt["base"], tgt["cookie"], ctl["base"], ctl["cookie"], tgt["dc"], rows)
    print("\n[⑦ 관측 — 판정 아님]")
    axis7_replay(tgt["base"], tgt["cookie"], tgt["sid"], rows)

    n = len(tgt["gp"])
    print("\n" + "-" * 78)
    for ax, eid, verdict, note in rows:
        print(f"  {ax} {verdict:<4} {eid:<28} {note}")
    print("-" * 78)
    print(f"① 형상·excerpt 동일   {a1}/{n}")
    print(f"② 타 세션 404         {a2}/{n}")
    print(f"③ 무쿠키 401          {a3}/{n}")
    print(f"④ 범위 밖 idx 404     {int(a4)}/1")
    print(f"⑤ 대조군 404(빨강)    {red}/{len(ctl['gp'])}")
    print(f"⑥ doc/record 회귀     {a6}/{min(5, len(tgt['dc']))}")
    print("⑦ replay GP           관측만(위 표)")
    print("\n안 잰 것 — 화면 축(③④ 문면·경로 본문 = b 셸 PR) · 재기동 뒤 404 · 다중 워커")

    hard = [a1 == n, a2 == n, a3 == n, bool(a4), red == len(ctl["gp"]), a6 == min(5, len(tgt["dc"]))]
    return 0 if all(hard) else 1


if __name__ == "__main__":
    sys.exit(main())
