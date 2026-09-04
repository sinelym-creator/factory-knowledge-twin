"""T7-41a 서버 축 그물 — `GET /runs?sessionId=` (계약 v0.1.16) 독립 검증.

🔴 이 그물은 «대상»과 «대조군»에 똑같이 걸린다. 대조군(v0.1.15 ai-api)에서는
   `GET /api/runs` 가 없으므로 축 1~4·6 이 404 로 죽는 것이 «정상»이다 — 그 죽음이
   그물의 생존 증명이다(같은 실행 · 같은 코드).

🔴 무대 울림을 «수»로 먼저 센다. 만들어진 run 이 0 이면 어느 색도 내지 않고 exit 2.
🔴 replay 모드만 쓴다(구독 0 · live 는 이 축과 무관하며 값이 비싸다).

usage: python t741a_session_runs.py --base http://127.0.0.1:8152 --out C:/path/out.json
       [--runs 21] [--scenario GS-01] [--plant FAC-A]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from http.cookiejar import CookieJar
from typing import Any


class Client:
    """쿠키 하나를 들고 다니는 최소 클라이언트 = «한 세션»."""

    def __init__(self, base: str) -> None:
        self.base = base.rstrip("/")
        self.jar = CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.jar)
        )

    def call(self, method: str, path: str, body: Any = None, cookie: str | None = None):
        """(status, json|text) — 4xx/5xx 도 «답»이므로 예외로 삼키지 않는다."""
        data = None
        headers = {}
        if body is not None:
            data = json.dumps(body).encode()
            headers["content-type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method=method)
        if cookie is not None:
            # 🔴 「쿠키 없음」과 「남의 쿠키」를 만들려면 jar 를 우회해야 한다.
            if cookie:
                req.add_header("Cookie", cookie)
            opener = urllib.request.build_opener()
        else:
            opener = self.opener
        try:
            with opener.open(req, timeout=30) as res:
                raw = res.read().decode("utf-8", "replace")
                return res.status, _maybe_json(raw)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", "replace")
            return e.code, _maybe_json(raw)

    def sid_cookie(self) -> str | None:
        for c in self.jar:
            if c.name == "fkt_sid":
                return "fkt_sid=" + c.value
        return None


def _maybe_json(raw: str):
    try:
        return json.loads(raw)
    except Exception:
        return raw


def _code(body: Any) -> Any:
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict):
            return err.get("code")
        return body.get("detail") if "detail" in body else body
    return body


def _save(path: str, out: dict) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--runs", type=int, default=21)
    ap.add_argument("--scenario", default="GS-01")
    ap.add_argument("--plant", default="FAC-A")
    ap.add_argument("--wait", type=float, default=25.0, help="완주 대기 상한(초)")
    a = ap.parse_args()

    out: dict = {"base": a.base, "startedWall": time.strftime("%Y-%m-%d %H:%M:%S")}

    A = Client(a.base)
    st, sess = A.call("POST", "/api/sessions", {})
    if st != 200 or not isinstance(sess, dict) or "sessionId" not in sess:
        out["stage"] = {"sessionCreate": st, "body": sess}
        _save(a.out, out)
        print("STAGE FAIL: 세션을 못 만들었다 - 어느 색도 내지 않는다", file=sys.stderr)
        return 2
    sid_a = sess["sessionId"]
    out["sessionA"] = sid_a

    # --- 무대: replay run 을 «수»로 만든다 ------------------------------------
    made: list = []
    codes: dict = {}
    for _ in range(a.runs):
        st, body = A.call(
            "POST", "/api/scenarios/" + a.scenario + "/runs",
            {"sessionId": sid_a, "mode": "replay"},
        )
        codes[str(st)] = codes.get(str(st), 0) + 1
        if st == 200 and isinstance(body, dict) and body.get("runId"):
            made.append(body["runId"])
    out["stage"] = {"requested": a.runs, "created": len(made), "codes": codes}
    if not made:
        _save(a.out, out)
        print("STAGE 0: run 0건 - 안 잼(exit 2). codes=" + str(codes), file=sys.stderr)
        return 2

    # 완주 대기 — finishedAt 축(⑥)은 종결된 run 이 있어야 잰다.
    deadline = time.time() + a.wait
    settled = 0
    while time.time() < deadline:
        st, lst = A.call("GET", "/api/runs?sessionId=" + sid_a)
        if st == 200 and isinstance(lst, list):
            settled = sum(1 for r in lst if r.get("status") != "running")
            if settled >= min(len(made), 20):
                break
        elif st == 404:
            break  # 대조군 = 이 엔드포인트가 없다. 기다릴 것이 없다.
        time.sleep(1.0)
    out["stage"]["settledWithinWait"] = settled

    # --- 축 ① 형상 · 최신순 · 상한 20 -----------------------------------------
    st, lst = A.call("GET", "/api/runs?sessionId=" + sid_a)
    ax1: dict = {"status": st}
    if st == 200 and isinstance(lst, list):
        req_keys = {"runId", "incidentId", "scenarioId", "mode", "status", "startedAt"}
        allowed = req_keys | {"finishedAt"}
        ax1["count"] = len(lst)
        ax1["madeMoreThanLimit"] = len(made) > 20
        ax1["limit20"] = len(lst) == 20 and len(made) > 20
        ax1["shapeOk"] = all(req_keys <= set(r) and set(r) <= allowed for r in lst)
        ax1["extraKeys"] = sorted({k for r in lst for k in r} - allowed)
        starts = [r.get("startedAt") for r in lst]
        ax1["descOk"] = all(starts[i] >= starts[i + 1] for i in range(len(starts) - 1))
        # 최신순의 «내용» 증인: 가장 늦게 만든 run 이 머리에 있는가.
        ax1["newestFirstIsLastMade"] = bool(lst) and lst[0].get("runId") == made[-1]
        ax1["oldestMadeDropped"] = made[0] not in {r.get("runId") for r in lst}
        ax1["sample"] = lst[0] if lst else None
    else:
        ax1["body"] = lst
    out["ax1_shape_order_limit"] = ax1

    # --- 축 ② 세션 B 격리 ------------------------------------------------------
    B = Client(a.base)
    stb, sessb = B.call("POST", "/api/sessions", {})
    ax2: dict = {"sessionCreate": stb}
    if stb == 200 and isinstance(sessb, dict):
        sid_b = sessb["sessionId"]
        ax2["sessionB"] = sid_b
        st, lst_b = B.call("GET", "/api/runs?sessionId=" + sid_b)
        ax2["status"] = st
        ax2["count"] = len(lst_b) if isinstance(lst_b, list) else None
        ax2["isolated"] = st == 200 and lst_b == []
        # 🔴 «자기 것은 보인다»까지 확인해야 「전부 빈 목록」과 갈린다.
        stm, bodym = B.call(
            "POST", "/api/scenarios/" + a.scenario + "/runs",
            {"sessionId": sid_b, "mode": "replay"},
        )
        if stm == 200 and isinstance(bodym, dict):
            st2, lst_b2 = B.call("GET", "/api/runs?sessionId=" + sid_b)
            ax2["afterOwnRun"] = {
                "status": st2,
                "count": len(lst_b2) if isinstance(lst_b2, list) else None,
                "mineOnly": isinstance(lst_b2, list)
                and len(lst_b2) == 1
                and lst_b2[0].get("runId") == bodym.get("runId"),
            }
        # 남의 세션 id 를 «내 쿠키»로 묻기 = 침입 시도
        st3, body3 = B.call("GET", "/api/runs?sessionId=" + sid_a)
        ax2["crossSessionQuery"] = {"status": st3, "code": _code(body3)}
    out["ax2_isolation"] = ax2

    # --- 축 ③ 422 / 401 --------------------------------------------------------
    cookie_a = A.sid_cookie()
    st, body = A.call("GET", "/api/runs?sessionId=someone-elses-session-id")
    ax3 = {"mismatch": {"status": st, "code": _code(body)}}
    st, body = A.call("GET", "/api/runs?sessionId=" + sid_a, cookie="")
    ax3["noCookie"] = {"status": st, "code": _code(body)}
    st, body = A.call("GET", "/api/runs")
    ax3["missingParam"] = {"status": st, "code": _code(body)}
    out["ax3_422_401"] = ax3
    out["cookieA"] = cookie_a

    # --- 축 ⑤ overview activeAlarms[].incidentId -------------------------------
    st, ov = A.call("GET", "/api/plants/" + a.plant + "/overview")
    ax5: dict = {"status": st}
    if st == 200 and isinstance(ov, dict):
        alarms = ov.get("activeAlarms") or []
        ax5["alarmCount"] = len(alarms)
        ax5["withField"] = sum(1 for x in alarms if "incidentId" in x)
        ax5["pairs"] = [
            {"alarmId": x.get("alarmId"), "incidentId": x.get("incidentId")} for x in alarms
        ]
        # 🔴 「실재만」 = 값이 있으면 그 incident 를 실제로 열 수 있어야 한다.
        checks = []
        for x in alarms:
            iid = x.get("incidentId")
            if iid:
                sti, _ = A.call("GET", "/api/incidents/" + iid)
                checks.append({"incidentId": iid, "getStatus": sti})
        ax5["incidentResolves"] = checks
        ax5["allResolve"] = all(c["getStatus"] == 200 for c in checks) if checks else None
    else:
        ax5["body"] = ov
    out["ax5_overview_incidentid"] = ax5

    # --- 축 ⑥ finishedAt >= startedAt -----------------------------------------
    st, lst = A.call("GET", "/api/runs?sessionId=" + sid_a)
    ax6: dict = {"status": st}
    if st == 200 and isinstance(lst, list):
        fin = [r for r in lst if r.get("finishedAt")]
        ax6["finishedCount"] = len(fin)
        ax6["runningCount"] = len(lst) - len(fin)
        bad = [r for r in fin if r["finishedAt"] < r["startedAt"]]
        ax6["violations"] = [
            {"runId": r["runId"], "startedAt": r["startedAt"], "finishedAt": r["finishedAt"]}
            for r in bad
        ]
        ax6["ok"] = len(fin) > 0 and not bad
        ax6["sample"] = fin[0] if fin else None
        # 🔴 도는 run 에는 칸이 «없다»(null 을 지어 넣지 않는다) — 계약 문면.
        ax6["noNullFinished"] = all(("finishedAt" not in r) or r["finishedAt"] for r in lst)
    out["ax6_finished_ge_started"] = ax6

    _save(a.out, out)
    print(json.dumps(out.get("stage"), ensure_ascii=False))
    print(json.dumps(out.get("ax1_shape_order_limit"), ensure_ascii=False)[:600])
    print(json.dumps(out.get("ax3_422_401"), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
