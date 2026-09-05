r"""public_endpoint_policy_drill — ai-api 라우트 «전수»가 정책 분류를 갖는가 (검증 좌석 · §34.3).

이 그물이 지키는 문장: **ai-api 의 모든 라우트는 «세션 가드 뒤»이거나 «명시 공개/예외»다.
어느 쪽도 아닌 라우트(미분류)는 0 이어야 한다.** 미분류 1건이라도 = 세션 없이 열린 구멍일 수
있으므로 rc 1 + 그 라우트를 이름으로 낸다.

🔴 **정본을 손으로 적지 않는다.** 공개 예외 목록·분류 규칙·「가드가 닿는가」 판정은 전부
   `app/session_guard.py` 의 실물(`GUARD_EXEMPT`·`READ_ONLY_EXCEPTIONS`·`FRAMEWORK_UNGUARDED`·
   `_mode`·`_guard_reaches`·`route_keys`·`audit_guard_coverage`)에서 «읽어» 온다. 손 목록은
   정본보다 낡아 「지어낸 초록」을 만든다(리바이2 계보 · allowlist 는 여집합/정본으로 확증).

🔴 **서버 불요** — FastAPI `app.routes` 를 코드에서 만들어 읽는다(lifespan=DB 연결은 startup
   이라 import 만으로는 안 돈다). 기본 형상(`expose_api_docs=False`)에서 잰다.

    python tests/security/public_endpoint_policy_drill.py \
        --ai-api <워크트리>/services/ai-api

exit: 0 = 미분류 0 + 대조군이 미분류를 검출 · 1 = 미분류 ≥ 1(구멍) · 2 = 실행 오류(라우트 0 등).
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ai-api", required=True, help="services/ai-api 디렉토리(그 안의 app 패키지를 import)")
    a = ap.parse_args()

    sys.path.insert(0, os.path.abspath(a.ai_api))
    # 🔴 문서 표면이 꺼진 «기본(공개) 형상»으로 만든다 — env 로 켜면 대조가 흐려진다.
    os.environ.pop("FKT_EXPOSE_API_DOCS", None)

    from app.main import create_app  # noqa: E402
    from app import session_guard as sg  # noqa: E402

    model = os.environ.get("FKT_MEASURE_MODEL", "(env FKT_MEASURE_MODEL 미지정)")
    print(f"측정 모델: {model}")

    app = create_app()
    keys = sg.route_keys(app)
    if not keys:
        print("실행 오류: 라우트를 하나도 열거하지 못했다 — 검사기 고장", file=sys.stderr)
        return 2

    framework = sg.expected_framework_routes(app)

    def classify(app, keys, framework):
        """라우트별 (mode, reaches) → 3분류. 미분류 = 가드도 안 닿고 공개/예외 목록에도 없다."""
        declared = set(sg.GUARD_EXEMPT) | set(sg.READ_ONLY_EXCEPTIONS) | framework
        guarded_behind, declared_open, unclassified = [], [], []
        for k in keys:
            reaches = sg._guard_reaches(app, k)
            mode = sg._mode(*k)
            if k in declared:
                declared_open.append((k, mode))          # 명시 공개/예외(면제·읽기·프레임워크)
            elif reaches:
                guarded_behind.append((k, mode))          # 세션 가드 뒤
            else:
                unclassified.append((k, mode, reaches))   # 미분류 = 구멍 후보
        return guarded_behind, declared_open, unclassified

    guarded_behind, declared_open, unclassified = classify(app, keys, framework)

    # --- 표 ---
    print(f"\n== 라우트 정책 분류 (전수 {len(keys)}) · 형상 expose_api_docs={bool(framework)} ==")
    print(f"  세션 가드 뒤 : {len(guarded_behind)}")
    print(f"  명시 공개/예외: {len(declared_open)}  (exempt {len(sg.GUARD_EXEMPT)} · read-only {len(sg.READ_ONLY_EXCEPTIONS)} · framework {len(framework)})")
    print(f"  미분류        : {len(unclassified)}   ← 판정선 = 0")
    print("  -- 명시 공개/예외 목록:")
    for (k, mode) in sorted(declared_open):
        print(f"       {mode:9} {k[0]:9} {k[1]}")
    if unclassified:
        print("  🔴 미분류(구멍 후보):")
        for (k, mode, reaches) in unclassified:
            print(f"       {mode:9} {k[0]:9} {k[1]}  (guard_reaches={reaches})")

    # --- 부팅 정합 정본 검사(같은 실물) ---
    try:
        sg.audit_guard_coverage(app)
        audit = "PASS (예외 목록 ↔ 실재 라우트 1:1 · 가드 도달 전수)"
    except Exception as e:  # noqa: BLE001
        audit = f"RAISED: {e}"
    print(f"  audit_guard_coverage: {audit}")

    # --- 대조군: 가짜 «비가드» 라우트 주입 → 미분류 1 이 되는가(그물이 무는가) ---
    from starlette.routing import Route  # noqa: E402
    app2 = create_app()
    async def _fake(_req):  # pragma: no cover
        return None
    app2.router.routes.append(Route("/api/__fake_open__", _fake, methods=["GET"]))
    _, _, unc2 = classify(app2, sg.route_keys(app2), sg.expected_framework_routes(app2))
    fake_detected = any(k[1] == "/api/__fake_open__" for k, *_ in unc2)
    print(f"\n대조군(가짜 비가드 라우트 주입): 미분류 {len(unc2)}건 · 가짜 검출={fake_detected}")
    try:
        sg.audit_guard_coverage(app2)
        ctrl_audit = "🔴 통과함(그물이 안 물었다)"
        ctrl_ok = False
    except Exception:
        ctrl_audit = "RAISED(정상 · 그물이 물었다)"
        ctrl_ok = True
    print(f"대조군 audit: {ctrl_audit}")

    # --- 공개면 통로 대조: next.config.ts rewrites(/api/* · /api/ws/*) 도달 집합 ⊆ 가드/예외 ---
    shell_note = _shell_reachability(a.ai_api, keys, framework, sg)
    for line in shell_note:
        print(line)

    # --- 이 드릴이 «안 보는 것» (이름으로) ---
    print("\n안 보는 것(이름으로):")
    print("  · 런타임 미들웨어 순서(CORS→rate→body) — 이 드릴은 라우트 의존 체인만 본다")
    print("  · 합성 게이트웨이 :8787 라우트 — ai-api 앱 밖(별 프로세스)")
    print("  · Vercel 셸 층 307(루트 /docs 등) — 셸 rewrite/redirect 는 ai-api 라우트가 아니다")

    ok = (len(unclassified) == 0) and fake_detected and ctrl_ok and audit.startswith("PASS")
    if len(unclassified) > 0:
        print(f"\n판정: FAIL — 미분류 {len(unclassified)}건(세션 없이 열린 구멍일 수 있다)")
        return 1
    if not ok:
        print("\n판정: FAIL — 대조군이 미분류를 검출하지 못했다(그물 판정력 0) 또는 audit 불일치")
        return 1
    print("\n판정: PASS — 전 라우트가 «가드 뒤» 또는 «명시 공개/예외» · 미분류 0 · 대조군이 구멍을 검출")
    return 0


def _shell_reachability(ai_api_dir, keys, framework, sg):
    """공개면 통로(next.config.ts rewrites)로 ai-api 에 닿는 집합이 가드/예외 안에 있는가."""
    import re
    # next.config.ts 는 워크트리 루트 기준 apps/web-console 에 있다.
    root = os.path.abspath(os.path.join(ai_api_dir, "..", ".."))
    cfg = os.path.join(root, "apps", "web-console", "next.config.ts")
    out = ["\n공개면 통로 대조(next.config.ts rewrites):"]
    if not os.path.exists(cfg):
        out.append(f"  🔴 next.config.ts 를 찾지 못했다: {cfg} — 통로 대조 미측(이름으로)")
        return out
    text = open(cfg, encoding="utf-8").read()
    sources = re.findall(r'source:\s*"([^"]+)"', text)
    api_sources = [s for s in sources if s.startswith("/api")]
    out.append(f"  rewrite source(/api*): {api_sources}")
    # 공개면에서 /api/* 는 전부 ai-api 로 프록시된다 → 공개 도달 집합 = 모든 /api/* 라우트.
    # 그 중 미분류(=가드도 안 닿고 예외도 아님)가 있으면 공개면에 열린 구멍이다.
    declared = set(sg.GUARD_EXEMPT) | set(sg.READ_ONLY_EXCEPTIONS) | framework
    open_api = [k for k in keys if k[1].startswith("/api") and k not in declared]
    # 이 중 실제로 가드가 닿지 않는 것만 구멍
    return out + [
        f"  /api/* 라우트 중 명시 예외 아님: {len(open_api)}건(전부 세션 가드 뒤여야 정상)",
        "  → 위 «미분류» 계수가 0 이면 공개 도달 집합 ⊆ 가드/예외 집합이 성립한다",
    ]


if __name__ == "__main__":
    sys.exit(main())
