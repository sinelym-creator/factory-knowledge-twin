"""_env — 드릴 공용 «측정 대상 주소» 게이트 (O-22 · D-74 동형).

🔴 **기본값을 두지 않는다.** 앞판은 27 파일이 각자
   `os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")` 을 들고 있었다. 그 값은 이 리포에서
   **다른 좌석의 대역**이고(한 곳은 배포 대역 `:8010` 이었다), 지정 없이 돌린 드릴은 **실패하지
   않고** 남의 서버를 재서 그 초록·빨강을 이 리포의 판정으로 적었다. 실패하지 않는 오지정이라
   아무도 알아채지 못한다 — 그것이 이 게이트가 존재하는 이유다.

🔴 **죽는 자리는 여기 하나다.** 27 파일에 같은 판정을 복붙하면 문면이 27 벌 생기고, 그중 하나만
   고쳐지는 날 「같은 사건에 다른 말」이 남는다. 드릴은 이 함수를 부르기만 한다.

🔴 **여기서 무접촉 대역을 «검사»하지는 않는다.** 지정된 주소가 남의 것인지는 이 모듈이 알 수
   없고(포트 배치는 그날그날 바뀐다), 안다고 믿으면 그 목록이 대상보다 먼저 늙는다. 이 게이트가
   보증하는 것은 **「사람이 명시적으로 골랐다」** 하나다.

    FKT_API_BASE=http://127.0.0.1:<내 포트> python tests/api/<drill>.py
"""

from __future__ import annotations

import os
import sys

#: 미지정일 때 내보내는 단 하나의 문면 — 드릴마다 다르게 말하지 않는다.
#: 🔴 **이 문자열은 cp949 로 찍힐 수 있는 글자만 쓴다** — 이모지·em dash 는 Windows
#: 콘솔에서 `UnicodeEncodeError` 를 낸다. `stderr` 는 backslashreplace 로 버티지만
#: 그때 문면이 `🔴 ...` 처럼 깨져 나가고, `stdout` 은 그대로 죽는다.
#: «미지정 = 문면 1줄» 을 지키려면 문면 자체가 그 인코딩을 타지 않아야 한다(46대 실측).
MESSAGE = (
    "[FKT] 측정 불가: `FKT_API_BASE` 를 지정하라"
    "(기본값 없음, O-22, 무접촉 대역 :8000 :8010 :8787 금지)."
)


def api_base() -> str:
    """측정 대상 ai-api 의 base URL. 미지정이면 **즉시 죽는다**(rc 2).

    🔴 `SystemExit` 로 죽인다 — 예외를 올리면 드릴의 `try/except` 가 삼켜 「연결 실패」로
       접히고, 그 빨강은 대상의 것처럼 보인다. 여기서 나가는 길은 하나여야 한다.
    """
    value = os.environ.get("FKT_API_BASE")
    if not value:
        sys.stderr.write(MESSAGE + "\n")
        raise SystemExit(2)
    return value.rstrip("/")


if __name__ == "__main__":
    # 자기 검증 — 이 게이트가 «미지정»에 실제로 무는가(대조군은 값이 있을 때 통과).
    saved = os.environ.pop("FKT_API_BASE", None)
    try:
        api_base()
    except SystemExit as exc:
        print("unset -> SystemExit(" + str(exc.code) + ") | msg = " + MESSAGE)
    else:  # pragma: no cover - 여기 오면 게이트가 뚫린 것이다
        print("[FKT] self-check FAILED - unset passed through")
        raise SystemExit(1)
    os.environ["FKT_API_BASE"] = "http://127.0.0.1:9999/"
    print("set   -> " + api_base() + "  (trailing slash stripped here)")
    if saved is not None:
        os.environ["FKT_API_BASE"] = saved
    else:
        os.environ.pop("FKT_API_BASE", None)
