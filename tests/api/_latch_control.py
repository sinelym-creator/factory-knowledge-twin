"""걸쇠 대조군 — `_ownership` 의 «자물쇠 안 검사»가 실제로 무는지 양면으로 민다.

🔴 **케이스 1건 = 새 프로세스 1개.** 걸쇠는 모듈 상태라 한 프로세스에서 두 케이스를 돌리면
   앞 케이스가 뒤 케이스의 답을 정한다 — 그러면 재는 것은 걸쇠가 아니라 실행 순서다.

    FKT_LATCH_TARGET   내 접두 · **실재하는** 컨테이너 이름(`exited` 도 실재다)
    FKT_OWNER_PREFIX   내 접두 — 🔴 둘 다 기본값을 두지 않는다(Q-62: 기본값이 남을 가리킨다)

usage: FKT_OWNER_PREFIX=... FKT_LATCH_TARGET=... python _latch_control.py <repo> <case>
"""

import io
import contextlib
import os
import sys

REPO, CASE = sys.argv[1], sys.argv[2]
sys.path.insert(0, os.path.join(REPO, "tests", "api"))
import _ownership  # noqa: E402

# 🔴 대상 이름을 이 파일에 «박지 않는다». 좌석 이름이 박히면 다른 좌석이 확인 없이 돌렸을 때
#    남의 컨테이너를 겨눈다 — 이 문이 막으려던 바로 그 모양이다.
TARGET = (os.environ.get("FKT_LATCH_TARGET") or "").strip()
PREFIX = (os.environ.get("FKT_OWNER_PREFIX") or "").strip()
if not TARGET or not PREFIX:
    print("🔴 측정 불가 — `FKT_LATCH_TARGET` 과 `FKT_OWNER_PREFIX` 를 명시하라(기본값 없음)")
    sys.exit(2)
if not TARGET.startswith(PREFIX):
    print(f"🔴 측정 불가 — `{TARGET}` 은 선언한 접두 `{PREFIX}` 의 것이 아니다")
    sys.exit(2)
os.environ["ZZ_TARGET"] = TARGET


def sabotage():
    """문을 부순다 — `_exists` 가 «전부 있다»고 답하게. self_check 는 이걸 잡아야 한다."""
    _ownership._exists = lambda name: True


def grab():
    """파괴 대상을 «받아내 본다». 걸쇠가 물면 여기서 못 받는다."""
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:
            got = _ownership.own_container("ZZ_TARGET", "표본")
            verdict = f"받아냄({got})"
        except BaseException as exc:  # noqa: BLE001
            verdict = f"거절({type(exc).__name__})"
    out = buf.getvalue()
    runs = out.count("표본 6종 전건 기대대로")
    return verdict, runs


if CASE == "A-문부서짐":
    sabotage()
    verdict, runs = grab()
    print(f"{verdict} · self_check 실행 {runs}회")

elif CASE == "A-대조군-정상문":
    verdict, runs = grab()
    print(f"{verdict} · self_check 실행 {runs}회")

elif CASE == "C-드릴처럼-명시호출뒤":
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        _ownership.self_check()          # 6본 진입점이 하는 것과 같다
    first = buf.getvalue().count("표본 6종 전건 기대대로")
    verdict, runs = grab()
    print(f"{verdict} · 진입점 {first}회 + 걸쇠 {runs}회 = 총 {first + runs}회")

elif CASE == "D-env-무결":
    # 🔴 드릴이 «자기 env 를 읽은 뒤» 걸쇠가 그 env 를 흔들면 경합이 난다(오케 지목).
    os.environ["FKT_OWNER_PREFIX"] = PREFIX
    os.environ["ZZ_T"] = "드릴이-쓰던-값"
    before = dict(os.environ)
    mine_before = os.environ.get("FKT_OWNER_PREFIX")
    verdict, runs = grab()
    after = dict(os.environ)
    changed = {k for k in set(before) | set(after) if before.get(k) != after.get(k)}
    print(f"{verdict} · self_check {runs}회 · 바뀐 env 키 {sorted(changed) or '없음'}"
          f" · 접두 {mine_before!r}→{os.environ.get('FKT_OWNER_PREFIX')!r}"
          f" · ZZ_T {after.get('ZZ_T')!r}")

elif CASE == "E-남의접두-보존":
    # 다른 좌석이 돌릴 때 — self_check 안에서 접두를 fkt-levi2- 로 «잠깐» 바꾼다. 되돌아오는가.
    other = "fkt-someone-else-"     # 🔴 남의 접두 표본 — 실재하지 않는 이름만 쓴다
    os.environ["FKT_OWNER_PREFIX"] = other
    os.environ["ZZ_TARGET"] = other + "nonexistent"
    verdict, runs = grab()
    print(f"{verdict} · self_check {runs}회 · 접두 남은 값 = {os.environ.get('FKT_OWNER_PREFIX')!r}")

elif CASE == "F-실패한문-재사용금지":
    sabotage()
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            _ownership.self_check()
    except BaseException:
        pass                                  # 🔴 호출부가 «삼킨» 상황을 흉내낸다
    verdict, runs = grab()
    print(f"{verdict} · self_check 재실행 {runs}회 · 상태 {_ownership._CHECK_STATE!r}")

else:
    print(f"알 수 없는 케이스 {CASE}")
    sys.exit(2)
