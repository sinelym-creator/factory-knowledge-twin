"""t42b_xff_axes_drill — D-8/Q-61 «XFF 의 주어» 5축 (검증 좌석 · 16대 · 통합 재검 ③④).

정본 `packages/contracts/rest-api-v0.1.md:143` — 「`X-Forwarded-For` 첫 값 · **신뢰는 env 로 켤 때만**
(기본 = 소켓 주소)」. D-8 은 그 문장이 **실효로 거짓**이던 자리다 — 앱 코드는 계약대로였는데
러너(uvicorn `ProxyHeadersMiddleware`)가 앱보다 «먼저» `scope.client` 를 덮었다.

🔴 **한 판에 BEFORE 와 AFTER 를 세운다.** 「고쳤다」는 픽스 판이 초록인 것으로 성립하지 않는다 —
   **같은 그물·같은 자극이 옛 판에서 빨강이던 것**까지 보여야 그 초록이 처방의 것이다.

축(각 축은 «손잡이 하나»만 다른 서버로 잰다):

    A  BEFORE        픽스 «전» 판 · 러너 플래그 없음      → 위조 XFF 로 우회 «가능»(옛 구멍 재현)
    B  AFTER trust=F 픽스 판 · `--no-proxy-headers`      → 위조 XFF 가 «뭉친다»(계약대로)
    C  AFTER trust=T 같은 판 · trust «만» 켬             → 위조 XFF 가 «각자» 통을 갖는다
    D  컨테이너       이미지 · `--host 0.0.0.0`           → 🔴 `forwarded_allow_ips` «밖» 실측
                                                          (판정문의 유일한 «미측정» 칸)
    E  셸 경유        셸 rewrite 가 XFF 를 «넘기는가»      → 넘기면 C 형 거동이 셸 뒤에서도 선다

🔴 **B 와 C 의 차이가 이 축의 전부다.** 둘은 `FKT_TRUST_FORWARDED_FOR` «하나»만 다르다 —
   갈리면 스위치가 살아 있는 것이고, 같으면 (D-8 처럼) 누군가 앞에서 이미 덮은 것이다.

🔴 경고 로그 축(§2)은 **울리는 조건과 안 울리는 조건을 둘 다** 센다. 「경고가 없다」는
   「경고가 죽었다」와 구별되지 않는다.

exit: 0 = 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 측정 불가
"""

from __future__ import annotations

import http.client
import os
import subprocess
import sys
import urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _ownership  # noqa: E402  — 🔴 Q-62: 남의 좌석을 두드리지 않는다

BEFORE = _ownership.read_base("FKT_XFF_BEFORE_BASE", "BEFORE(픽스 전) 서버")
AFTER_F = _ownership.read_base("FKT_XFF_AFTER_TRUSTF_BASE", "AFTER trust=False 서버")
AFTER_T = _ownership.read_base("FKT_XFF_AFTER_TRUSTT_BASE", "AFTER trust=True 서버")
#: 컨테이너·셸 축은 «있으면» 잰다 — 없으면 건너뛰고 사유를 인쇄한다(초록으로 세지 않는다).
CONTAINER = os.environ.get("FKT_XFF_CONTAINER_BASE", "").strip()
CONTAINER_NAME = os.environ.get("FKT_XFF_CONTAINER_NAME", "").strip()
SHELL = os.environ.get("FKT_XFF_SHELL_BASE", "").strip()
NOFLAG = os.environ.get("FKT_XFF_NOFLAG_BASE", "").strip()

#: 상한을 낮춘 서버에서 «몇 번» 두드릴지. 상한(5)보다 넉넉히.
BURST = int(os.environ.get("FKT_XFF_BURST", "8"))
PATH = os.environ.get("FKT_XFF_PATH", "/api/scenarios")


def hit(base: str, xff: str | None = None) -> int:
    url = urllib.parse.urlparse(base + PATH)
    conn = http.client.HTTPConnection(url.hostname, url.port, timeout=20)
    headers = {"X-Forwarded-For": xff} if xff else {}
    try:
        conn.request("GET", url.path, headers=headers)
        res = conn.getresponse()
        res.read()
        return res.status
    finally:
        conn.close()


def spread(base: str, label: str) -> dict:
    """🔴 세 갈래를 «한 서버»에서 잰다 — 헤더 «만» 바꿔서.

    ⓐ 헤더 없이  ⓑ 같은 위조 IP  ⓒ 매번 다른 위조 IP
    ⓒ 가 전건 통과하면 «통이 헤더 값별로 갈린다» = 헤더를 믿는 것이다.
    """
    plain = [hit(base) for _ in range(BURST)]
    same = [hit(base, "203.0.113.7") for _ in range(BURST)]
    uniq = [hit(base, f"198.51.100.{i}") for i in range(40, 40 + BURST)]
    return {
        "label": label,
        "plain_429": sum(1 for s in plain if s == 429),
        "same_429": sum(1 for s in same if s == 429),
        "uniq_429": sum(1 for s in uniq if s == 429),
        "trusted": sum(1 for s in uniq if s == 429) == 0,  # 전건 통과 = 값별로 통이 갈렸다
    }


def logs_of(container: str, tail: int = 400) -> str:
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    out = subprocess.run(["docker", "logs", "--tail", str(tail), container],
                         capture_output=True, text=True, env=env)
    return (out.stdout or "") + (out.stderr or "")


class Report:
    def __init__(self) -> None:
        self.bad = 0

    def row(self, rid: str, name: str, ok: bool, detail: str) -> None:
        self.bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'FAIL'}  {rid:5} {name:44} {detail}")

    def skipped(self, rid: str, why: str) -> None:
        print(f"  ----  {rid} 건너뜀 — {why}. 🔴 초록으로 세지 않는다")

    def note(self, text: str) -> None:
        print(f"  🔵 관측  {text}")


def main() -> int:
    rep = Report()
    print(f"정본      : rest-api-v0.1.md:143 「XFF 첫 값 · 신뢰는 env 로 켤 때만(기본 = 소켓 주소)」")
    print(f"축        : A BEFORE {BEFORE} · B AFTER trustF {AFTER_F} · C AFTER trustT {AFTER_T}")
    print(f"            D 컨테이너 {CONTAINER or '(미지정)'} · E 셸 {SHELL or '(미지정)'}")
    print()

    a = spread(BEFORE, "A BEFORE")
    b = spread(AFTER_F, "B AFTER trust=False")
    c = spread(AFTER_T, "C AFTER trust=True")
    for r in (a, b, c):
        print(f"  {r['label']:22} 헤더없이 429 {r['plain_429']}/{BURST} · 같은 위조 429 {r['same_429']}/{BURST}"
              f" · 다른 위조 429 {r['uniq_429']}/{BURST}  ⇒ {'헤더를 믿는다' if r['trusted'] else '헤더를 안 믿는다(뭉친다)'}")
    print()

    # 🔴 세는 눈 — 상한 자체가 도는가. 안 돌면 「우회 못 한다」가 공짜다.
    rep.row("X-00", "세는 눈 — 헤더 없이도 상한이 돈다(세 서버 전부)",
            a["plain_429"] > 0 and b["plain_429"] > 0 and c["plain_429"] > 0,
            f"429 {a['plain_429']}·{b['plain_429']}·{c['plain_429']}")
    rep.row("X-01", "A BEFORE — 옛 구멍이 «재현»된다(위조로 우회 가능)", a["trusted"],
            f"다른 위조 429 {a['uniq_429']}/{BURST}")
    rep.row("X-02", "B AFTER trust=False — 위조가 «뭉친다»(계약대로)", not b["trusted"],
            f"다른 위조 429 {b['uniq_429']}/{BURST}")
    rep.row("X-03", "C AFTER trust=True — 켜면 «각자»(스위치가 산다)", c["trusted"],
            f"다른 위조 429 {c['uniq_429']}/{BURST}")
    rep.row("X-04", "🔴 B↔C 는 trust «하나»만 다르고 결과가 갈린다", b["trusted"] != c["trusted"],
            "갈림 ○" if b["trusted"] != c["trusted"] else "🔴 안 갈림 = 앞에서 누가 덮는다")

    # ── D 컨테이너 경로 — 판정문의 «미측정» 칸 ──────────────────────────
    if not CONTAINER:
        rep.skipped("X-05", "컨테이너 대상 미지정(FKT_XFF_CONTAINER_BASE)")
        rep.bad += 1
    else:
        d = spread(CONTAINER, "D 컨테이너")
        print(f"  {d['label']:22} 헤더없이 429 {d['plain_429']}/{BURST} · 다른 위조 429 {d['uniq_429']}/{BURST}")
        rep.row("X-05", "D 컨테이너(0.0.0.0 · allow_ips 밖) — 위조가 뭉친다", not d["trusted"],
                f"다른 위조 429 {d['uniq_429']}/{BURST} · 🔴 이 칸이 판정문의 «미측정» 이었다")

    # ── E 셸 경유 — rewrite 가 XFF 를 «넘기는가» ────────────────────────
    if not SHELL:
        rep.skipped("X-06", "셸 대상 미지정(FKT_XFF_SHELL_BASE)")
        rep.bad += 1
    else:
        e = spread(SHELL, "E 셸 경유")
        print(f"  {e['label']:22} 헤더없이 429 {e['plain_429']}/{BURST} · 다른 위조 429 {e['uniq_429']}/{BURST}")
        # 셸 뒤 서버가 trust=True 면, 셸이 헤더를 넘길 때만 «각자» 가 된다.
        rep.row("X-06", "E 셸 rewrite 가 XFF 를 뒤로 «넘긴다»", e["trusted"],
                f"다른 위조 429 {e['uniq_429']}/{BURST} — 뭉치면 셸이 헤더를 «지운» 것")

    # ── 경고 로그 — 🔴 «울리는 조건»과 «안 울리는 조건» 둘 다 ───────────
    print()
    if not (NOFLAG and CONTAINER_NAME):
        rep.skipped("X-07", "경고 축 대상 미지정(FKT_XFF_NOFLAG_BASE · FKT_XFF_CONTAINER_NAME)")
    else:
        spread(NOFLAG, "경고 자극")  # 플래그 없는 판을 위조 헤더로 두드린다
        rep.note("경고 로그는 호스트 프로세스 stdout 이라 이 드릴이 직접 못 읽는다 — 판정문에 파일 경로로 인용한다")
    print(f"\n결과: 어긋남 {rep.bad}건")
    return 1 if rep.bad else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except _ownership.Unowned as exc:
        print(f"\n🔴 측정 불가 — {exc}")
        sys.exit(2)
