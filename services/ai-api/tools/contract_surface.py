"""계약 v0.1 문서 ↔ 실제 라우트 표면 대조 (T1-8 AC).

    python -m tools.contract_surface            # 표 출력 · 불일치 시 exit 1
    python -m tools.contract_surface --markdown # README 에 붙일 표만

🔴 기대 목록을 이 파일에 «적어 두지» 않는다. 계약 문서에서 매 실행 뽑는다 — 상수로 베껴
   두면 계약이 개정될 때 이 도구가 옛 계약을 기준으로 green 을 말한다. 정본은 언제나
   `packages/contracts/rest-api-v0.1.md` 한 곳이다.

읽는 법: 「계약에 있는데 라우트가 없다」가 진짜 결함이다. 「라우트가 있는데 계약에 없다」는
더 나쁘다 — 계약 밖 경로는 baseline §16.2 위반 후보다.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_DIR.parents[1]
CONTRACT = REPO_ROOT / "packages" / "contracts" / "rest-api-v0.1.md"
API_PREFIX = "/api"

METHODS = ("GET", "POST", "PATCH", "PUT", "DELETE", "WS")
# 메서드 «바로 뒤»의 백틱 경로만 취한다. 줄의 백틱을 전부 긁으면 설명문의 필드명까지
# 딸려 온다 — `effectiveFrom`/`effectiveTo` 처럼 백틱 두 개가 슬래시를 사이에 두면
# 그 슬래시가 경로 `/` 로 잡힌다(실측으로 걸렸다).
_PAIR_RE = re.compile(rf"\b({'|'.join(METHODS)})\s+`(/[^`]+)`")
# 계약의 축약 표기: POST `/work-orders/{woId}/approve` \| `/reject`
# 이스케이프된 파이프까지 포함해야 표 셀 구분자와 섞이지 않는다.
_ALT_RE = re.compile(r"\\\|\s*`(/[^`]+)`")


def contract_routes() -> set[tuple[str, str]]:
    """계약 문서의 표에서 (메서드, 경로)를 뽑는다.

    한 줄이 두 경로를 말하는 자리가 있다(`…/approve` \\| `/reject`). 뒤엣것은 앞 경로의
    형제 자리를 가리키는 축약이라, 앞 경로의 부모에 붙여 완전한 경로로 되돌린다.
    """
    routes: set[tuple[str, str]] = set()
    for line in CONTRACT.read_text(encoding="utf-8").splitlines():
        if not line.startswith("|"):
            continue
        for match in _PAIR_RE.finditer(line):
            method, raw = match.group(1), match.group(2)
            path = _strip_query(raw)
            routes.add((method, path))
            parent = path.rsplit("/", 1)[0]
            for alt in _ALT_RE.findall(line[match.end():]):
                routes.add((method, parent + _strip_query(alt)))
    return routes


def _strip_query(raw: str) -> str:
    """`?window=24h|3w` 같은 질의는 경로가 아니다."""
    return raw.split("?", 1)[0].strip()


def app_routes() -> set[tuple[str, str]]:
    """실제 앱에 등록된 (메서드, 경로). WebSocket 은 OpenAPI 에 안 실려 라우트 표에서 본다."""
    sys.path.insert(0, str(SERVICE_DIR))
    from starlette.routing import Route, WebSocketRoute

    from app.main import app  # noqa: PLC0415 — 경로 주입 후에 임포트해야 한다

    found: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith(API_PREFIX):
            continue
        rel = path[len(API_PREFIX):] or "/"
        if isinstance(route, WebSocketRoute):
            found.add(("WS", rel))
        elif isinstance(route, Route):
            for method in route.methods or set():
                if method in METHODS:
                    found.add((method, rel))
    return found


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="계약 표면 대조")
    ap.add_argument("--markdown", action="store_true", help="마크다운 표만 출력")
    args = ap.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    expected = contract_routes()
    actual = app_routes()
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)

    if args.markdown:
        print(f"| 계약 v0.1 경로 | 메서드 | 라우트 | ")
        print("|---|---|---|")
        for method, path in sorted(expected, key=lambda x: (x[1], x[0])):
            print(f"| `{path}` | {method} | {'✅' if (method, path) in actual else '❌ 없음'} |")
        return 0

    print(f"계약 정본 : {CONTRACT.relative_to(REPO_ROOT)}")
    print(f"계약 표면 : {len(expected)}개 · 앱 등록: {len(actual)}개 (prefix {API_PREFIX})")
    for method, path in sorted(expected, key=lambda x: (x[1], x[0])):
        mark = "✓" if (method, path) in actual else "✗"
        print(f"  {mark} {method:<6} {path}")
    if extra:
        print("\n🔴 계약에 없는 경로 — 계약 밖 표면은 baseline §16.2 검토 대상이다:")
        for method, path in extra:
            print(f"  + {method:<6} {path}")
    if missing:
        print(f"\nFAIL: 계약에 있으나 라우트가 없다 {len(missing)}건")
        return 1
    if extra:
        print(f"\nFAIL: 계약 밖 라우트 {len(extra)}건")
        return 1
    print("\nPASS: 계약 표면 전건 일치 · 계약 밖 경로 0")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
