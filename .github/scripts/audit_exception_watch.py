"""audit 예외 «수정판 감시»(S69-5 · 주간 schedule).

예외 목록(`.github/audit-exceptions.json`)의 항목마다 두 가지를 묻는다:
  ① 권고에 **수정판이 생겼는가** — GitHub 권고 API 의 `first_patched_version`.
  ② 사슬을 묶고 있는 **상위의 고정이 풀렸는가** — npm 레지스트리 `<parent>@latest` 의
     `dependencies[<dependency>]` 가 항목의 `pinned` 와 다른가.
어느 쪽이든 «예」면 실패한다 — 그것이 신호다(예외를 걷고 갱신하라).

🔴 «못 물었다»도 실패다(네트워크·API 오류). 묻지 못한 주의 초록은 「수정판 없음」이 아니다.
🔴 판정과 무관하게 **매 run 관측 1줄씩**을 찍는다(S69-8) — 상위 버전과 그 지정값 · 권고 patched(null
   포함) · 조회 시각. 「PASS 인데 무엇을 봤는지 모름」은 감시가 아니다. 관측값이 비면 조회 실패로 FAIL.
🔴 시험용: `WATCH_ADVISORY_API` · `WATCH_NPM_REGISTRY` 로 조회처를 바꿀 수 있다(기본 = 공식).
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

ADVISORY_API = os.environ.get("WATCH_ADVISORY_API", "https://api.github.com/advisories/")
NPM_REGISTRY = os.environ.get("WATCH_NPM_REGISTRY", "https://registry.npmjs.org/")


def get_json(url: str) -> dict:
    headers = {"Accept": "application/json", "User-Agent": "fkt-audit-exception-watch"}
    token = os.environ.get("GH_TOKEN")
    if token and url.startswith("https://api.github.com/"):
        headers["Authorization"] = f"Bearer {token}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=20) as r:
        return json.load(r)


class EmptyObservation(Exception):
    """조회는 됐는데 판정에 쓸 값이 비었다 — 「변화 없음」이 아니라 측정 실패다."""


def observed_at() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def check_patch(x: dict) -> str | None:
    """수정판이 있으면 그 사유 문장, 없으면 None. 판정과 무관하게 관측 1줄을 찍는다."""
    adv = get_json(ADVISORY_API + x["id"])
    mine = [v for v in adv.get("vulnerabilities") or [] if (v.get("package") or {}).get("name") == x["package"]]
    # 🔴 우리 패키지 항목이 0이면 「수정판 없음」이 아니다 — 아무것도 못 본 것이다(S69-8).
    if not mine:
        raise EmptyObservation(f"권고 {x['id']} 응답에 {x['package']} 항목이 없다")
    patched = [v.get("first_patched_version") for v in mine]
    print(f"  관측 advisory={x['id']} package={x['package']} "
          f"patched={json.dumps(patched)} ranges={json.dumps([v.get('vulnerable_version_range') for v in mine])} "
          f"at={observed_at()}")
    hit = next((p for p in patched if p), None)
    return f"수정판 나옴: {x['package']} {x['id']} → {hit}" if hit else None


def check_pin(x: dict) -> str | None:
    """상위 고정이 풀렸으면 그 사유 문장, 아니면 None. 판정과 무관하게 관측 1줄을 찍는다."""
    w = x.get("watch") or {}
    if not w:
        return None
    meta = get_json(NPM_REGISTRY + urllib.parse.quote(w["parent"], safe="@") + "/latest")
    version = meta.get("version")
    deps = meta.get("dependencies")
    # 🔴 버전이나 의존 표가 비면 조회 실패다. 표는 있는데 그 이름만 빠진 것은 «사슬이 끊긴» 신호다.
    if not version or not isinstance(deps, dict):
        raise EmptyObservation(f"{w['parent']}@latest 응답에 version/dependencies 가 없다")
    now = deps.get(w["dependency"])
    print(f"  관측 upstream={w['parent']}@{version} {w['dependency']}={json.dumps(now)} "
          f"pinned={json.dumps(w['pinned'])} at={observed_at()}")
    if now == w["pinned"]:
        return None
    return f"상위 고정 풀림: {w['parent']}@{version} 의 {w['dependency']} = {now!r} (기록 {w['pinned']!r})"


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print("사용법: audit_exception_watch.py <audit-exceptions.json>")
        return 2
    items = json.loads(Path(argv[1]).read_text(encoding="utf-8")).get("exceptions", [])
    if not items:
        print("예외 0건 — 감시할 것이 없다")
        return 0
    today = dt.datetime.now(dt.timezone.utc).date()
    fail = 0
    for x in items:
        days = (dt.date.fromisoformat(x["expires"]) - today).days
        print(f"[{x['package']} {x['id']}] 만료 {x['expires']}(D{-days:+d}) · 근거 {x['doc']}")
        for check in (check_patch, check_pin):
            try:
                why = check(x)
            except Exception as e:  # 네트워크·형식 오류 = 측정 실패
                print(f"::error::{check.__name__} 조회 실패 — {type(e).__name__}: {e}")
                fail = 1
                continue
            if why:
                print(f"::error::{why} — 예외를 걷고 의존을 갱신하라")
                fail = 1
            else:
                print(f"  {check.__name__}: 변화 없음")
    print(f"감시 판정 = {'FAIL(신호)' if fail else 'PASS(변화 없음)'}")
    return fail


if __name__ == "__main__":
    sys.exit(main(sys.argv))
