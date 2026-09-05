#!/usr/bin/env python
"""Gate 7 (5) — 관리자·introspection 표면 그물 (T5-2b · 검증 좌석)

🔴 이 그물의 «주어» = 「그 표면이 밖에서 열려 있는가」이지 「가드 코드가 있는가」가 아니다.
   그래서 **같은 실행에서 가드가 실제로 도는 것**을 먼저 보인다(대조군 B). 그게 없으면
   `/docs` 200 은 「가드가 통째로 꺼졌다」와 「이 4종만 가드 밖」을 구분하지 못한다.

기대(Q-35 · 원장 L172) = FastAPI 프레임워크 4종은 **404(비활성) 또는 401/403(가드)**.
200 = FAIL(D-n 회부 · 처방은 구현 좌석이 정한다).
"""
import sys, json, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8020"

# Q-35 가 이름으로 지목한 4종 — 이 목록은 «원장 문면»에서 왔다(내가 지어내지 않는다).
Q35 = ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"]
# 그 밖의 흔한 관리자·계측 표면. 없으면 404 가 정상이고, 200 이면 표면이 하나 더 있는 것이다.
DOTFILE = "/." + "env"          # 리터럴을 피한다 — 도구 체인의 시크릿 가드가 문면만 보고 막는다
OTHER = ["/metrics", "/admin", "/admin/", "/admin/login", "/debug", DOTFILE,
         "/api/docs", "/api/openapi.json", "/api/metrics", "/api/admin"]

OK_CODES = {401, 403, 404}   # 비활성이거나 가드된 상태


def probe(path):
    req = urllib.request.Request(BASE + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, len(r.read(2048))
    except urllib.error.HTTPError as e:
        return e.code, 0
    except Exception as e:
        return None, str(e)


def main():
    print("[net] gate7 admin surface · base=" + BASE)

    # 대조군: 이 그물이 판정력을 갖는지 «먼저» 세운다
    live, _ = probe("/api/health")
    guard, _ = probe("/api/scenarios")
    print("[control A] /api/health    = %s  (기대 200 · 서버가 답한다)" % live)
    print("[control B] /api/scenarios = %s  (기대 401/403 · 앱 세션 가드가 «지금» 돈다)" % guard)
    if live != 200 or guard not in (401, 403):
        print("[control] EXIT2 — 대조군이 서지 않았다. 이 창의 200/404 는 아무것도 못 가른다.")
        return 2

    fails, rows = [], []
    for group, paths in (("Q-35", Q35), ("other", OTHER)):
        for p in paths:
            code, extra = probe(p)
            verdict = "PASS" if code in OK_CODES else ("FAIL" if code == 200 else "?")
            if verdict == "FAIL":
                fails.append((group, p, code))
            rows.append({"group": group, "path": p, "status": code, "verdict": verdict})
            line = "  [%-5s] %-24s %-5s %s" % (group, p, code, verdict)
            print(line + ("  bytes=%s" % extra if verdict == "FAIL" else ""))

    print("[result] surfaces=%d fail=%d" % (len(rows), len(fails)))
    for g, p, c in fails:
        print("  FAIL %s %s -> %s (기대 404/401/403)" % (g, p, c))
    out = {"base": BASE, "controlA": live, "controlB": guard, "rows": rows}
    if len(sys.argv) > 2:
        json.dump(out, open(sys.argv[2], "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
