"""_ownership — 남의 스택을 흔들지 않기 위한 **2단 안전장치** (Q-62 · 검증 좌석 공용 전처리).

🔴 **무엇을 막는가.** 드릴의 env «기본값»이 어느 좌석의 실물 포트·컨테이너를 가리키고 있었다.
   다른 좌석이 그 기본값을 확인하지 않고 돌리자 **남의 계측기를 두드렸다** — rate limit 창을
   소모했고, 그 자취는 「통과 0건 · 429 8건」처럼 «대상의 성질»로 보였다. 값이 섞인 원인은
   «부재»가 아니라 **기본값이 남을 가리킨 것**이었다(센쿠2 18대 자수 · 04:05).

🔴 **읽기와 파괴는 무게가 다르다.** 읽기는 창을 소모하고 끝나지만, `docker stop` 은 되돌려도
   그 사이 남이 재던 것을 이미 죽인다 — **파괴는 되돌려도 흔적이 남는다**(`ssot_write_drill`
   계보: 「대상을 이름으로 «믿지» 않고 실측으로 «확인»한다」).

    ① 읽기   좌석 포트를 기본값으로 든 자산은 **대상 명시 필수** — 미지정이면 `exit 2`
    ② 파괴   대상 명시 + 🔴 **소유 확인** + 실재 확인. 셋 중 하나라도 못 세우면 손대지 않는다

**소유 확인**은 「이 이름이 내 것인가」다. `FKT_OWNER_PREFIX` 를 **스스로 선언**하게 하고,
대상 이름이 그 접두로 시작하는지 본다 — 접두를 안 주면 그것부터 `exit 2` 다.
**무언가를 부수려면 자기가 누구인지부터 말해야 한다.**

    import _ownership
    BASE = _ownership.read_base("FKT_T42B_API_BASE", "재는 ai-api")
    PG   = _ownership.own_container("FKT_T42B_PG_CONTAINER", "멈췄다 되살릴 postgres")

🔴 한계: 접두 대조는 «이름 규약»에 기댄다. 규약 밖으로 나간 컨테이너는 이 문이 못 막는다 —
   그때는 `docker inspect` 라벨로 올려야 한다. 지금 이 리포의 이름 규약(`fkt-<slug>-…`)에서만
   참이라는 것을 여기 적어 둔다.
"""

from __future__ import annotations

import os
import subprocess


class Unowned(RuntimeError):
    """대상을 «내 것»으로 세우지 못했다 — 결과가 아니라 «측정 불가»다(exit 2)."""


def read_base(env_name: str, what: str, *, fallback: str | None = None) -> str:
    """① 읽기 대상. 좌석 포트를 기본값으로 들던 자리는 `fallback` 없이 부른다 — 미지정 = exit 2.

    🔴 `fallback` 은 「누구의 자리도 아닌 자리표시자」(예: `:8000`)에만 준다. 어느 좌석의
       실물 포트를 fallback 으로 주면 이 함수는 아무것도 막지 못한다.
    """
    value = os.environ.get(env_name, "").strip()
    if value:
        return value
    if fallback:
        return fallback
    # 🔴 이 확인은 «import 시점»에 걸린다 — 예외로 던지면 호출부의 try 가 못 잡아 rc 가 1 이 된다.
    #    규약은 「미지정 = exit 2(측정 불가)」이므로 여기서 그 값으로 죽인다.
    print(
        f"\n🔴 측정 불가 — {what} 대상이 미지정이다. `{env_name}` 을 명시하라.\n"
        "   기본값을 두지 않는다: 기본값이 남의 좌석을 가리키면, 확인 없이 돌린 사람이"
        " 남의 계측기를 두드린다(Q-62).",
    )
    raise SystemExit(2)


def _exists(name: str) -> bool:
    env = dict(os.environ, MSYS_NO_PATHCONV="1")
    out = subprocess.run(
        ["docker", "ps", "-a", "--filter", f"name=^{name}$", "--format", "{{.Names}}"],
        capture_output=True, text=True, env=env,
    )
    return name in (out.stdout or "").split()


def own_container(env_name: str, what: str) -> str:
    """② 파괴·쓰기 대상. 명시 + 소유 확인 + 실재 확인을 «모두» 통과해야 이름을 돌려준다."""
    name = os.environ.get(env_name, "").strip()
    if not name:
        raise Unowned(
            f"{what} 대상이 미지정이다 — `{env_name}` 을 명시하라.\n"
            "   🔴 파괴 자산에는 기본값을 두지 않는다. 되돌려도 남의 측정은 이미 죽는다."
        )
    prefix = os.environ.get("FKT_OWNER_PREFIX", "").strip()
    if not prefix:
        raise Unowned(
            "🔴 `FKT_OWNER_PREFIX` 가 없다 — **무언가를 부수려면 자기가 누구인지부터 선언해야 한다**.\n"
            f"   예: FKT_OWNER_PREFIX=fkt-levi2- (그러면 `{name}` 이 내 것인지 대조할 수 있다)"
        )
    if not name.startswith(prefix):
        raise Unowned(
            f"🔴 `{name}` 은 내 것이 아니다(선언한 접두 `{prefix}`).\n"
            "   남의 컨테이너를 멈추면 되돌려도 그 사이 남이 재던 것은 이미 죽는다 — 손대지 않는다."
        )
    if not _exists(name):
        raise Unowned(f"`{name}` 이 실재하지 않는다 — 이름을 확인하라(멈출 것이 없다).")
    return name


def self_check() -> None:
    """🔴 문이 «실제로 닫히는가». 판정 앞에 이 문 자신을 먼저 시험한다."""
    saved = {k: os.environ.get(k) for k in ("ZZ_T", "FKT_OWNER_PREFIX")}
    try:
        os.environ.pop("ZZ_T", None)
        # 🔴 `read_base` 는 «import 시점 설정 오류»라 `SystemExit(2)` 로 죽고, `own_container` 는
        #    호출부가 받아 처리하도록 `Unowned` 를 던진다 — **거절의 «모양»이 둘이다**.
        #    앞판 자기 검증은 `Unowned` 만 잡아서, 내가 read_base 를 exit 2 로 바꾼 순간
        #    자기 검증 자신이 죽었다. 문을 고치면 문을 시험하는 눈도 함께 고쳐야 한다.
        for label, fn in (("읽기 미지정", lambda: read_base("ZZ_T", "표본")),
                          ("파괴 미지정", lambda: own_container("ZZ_T", "표본"))):
            try:
                fn()
            except (Unowned, SystemExit):
                continue
            raise RuntimeError(f"자기 검증 실패 — «{label}» 을 통과시킨다")

        os.environ["ZZ_T"] = "someone-elses-postgres-1"
        os.environ.pop("FKT_OWNER_PREFIX", None)
        try:
            own_container("ZZ_T", "표본")
        except Unowned:
            pass
        else:
            raise RuntimeError("자기 검증 실패 — 접두 «선언 없이» 파괴를 통과시킨다")

        os.environ["FKT_OWNER_PREFIX"] = "fkt-levi2-"
        try:
            own_container("ZZ_T", "표본")
        except Unowned:
            pass
        else:
            raise RuntimeError("자기 검증 실패 — «남의 이름»을 통과시킨다")

        if read_base("ZZ_UNSET_BASE", "표본", fallback="http://127.0.0.1:8000") != "http://127.0.0.1:8000":
            raise RuntimeError("자기 검증 실패 — 자리표시자 fallback 이 안 선다")
    finally:
        for key, value in saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    print("  안전장치  표본 4종(읽기 미지정 · 파괴 미지정 · 접두 미선언 · 남의 이름) 전건 막힘 — 문이 닫힌다")
