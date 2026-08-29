"""egress 차단 — LangChain 계열 텔레메트리를 «확인»하지 않고 «강제»한다 (T2-3 · 오케 승인 J-5).

무엇을 막는가: `langgraph` 는 `langchain-core` 와 `langsmith` 를 끌고 온다. langsmith 는
트레이싱이 켜지면 **실행 입력·출력을 외부 엔드포인트로 보낸다** — 이 서비스에서 그 입력은
공장 질의와 문서 인용문이다. baseline §15.2·§34.6 의 공개 경계가 정확히 이 경로를 금한다.

🔴 왜 「끄도록 문서에 적기」로 충분하지 않은가: 환경변수는 배포마다 다르고, 켜져 있어도
   서비스는 «아무 오류 없이» 돈다. 나가는 것이 보이지 않으므로 사람 눈으로는 발견되지
   않는다. 그래서 이 모듈은 값을 «읽어 확인»하지 않고 **덮어써서 강제**한다.

🔴 플래그만 끄지 않고 **자격 증명도 프로세스 환경에서 지운다**. 플래그는 코드 한 줄이면
   다시 켜지지만, 키가 없으면 켜져도 인증이 안 된다 — 두 겹이라 한 겹이 뚫려도 나가지 않는다.

이 모듈은 **langgraph/langchain 을 import 하기 전에** 실행되어야 뜻이 있다. 라이브러리가
자기 설정을 import 시점에 읽어 캐시하기 때문이다(`workflow.py` 가 이 순서를 지킨다).
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger("fkt.investigation.guards")

# 끄는 것이 아니라 «false 로 못박는» 플래그. 값이 무엇이었든 덮어쓴다.
_FORCED_FALSE = (
    "LANGSMITH_TRACING",
    "LANGCHAIN_TRACING_V2",
    "LANGCHAIN_TRACING",
    "LANGSMITH_OTEL_ENABLED",
)

# 프로세스 환경에서 지우는 자격 증명·엔드포인트. 남겨 두면 플래그가 뒤집힐 때 곧바로 나간다.
_PURGED = (
    "LANGSMITH_API_KEY",
    "LANGCHAIN_API_KEY",
    "LANGSMITH_ENDPOINT",
    "LANGCHAIN_ENDPOINT",
    "LANGSMITH_PROJECT",
    "LANGCHAIN_PROJECT",
)


class EgressGuardFailed(RuntimeError):
    """강제 후에도 텔레메트리 경로가 열려 있다 — 부팅을 멈춘다.

    🔴 여기서 「경고만 찍고 계속」을 고르지 않는 이유: 경고는 로그에 묻히고, 그동안 데이터는
       계속 나간다. 공개 경계 위반은 되돌릴 수 없다(보낸 것은 회수되지 않는다).
    """


def enforce_no_telemetry() -> dict[str, str]:
    """텔레메트리 플래그를 false 로 덮어쓰고 자격 증명을 지운다. 무엇을 바꿨는지 돌려준다.

    돌려주는 값은 로그·보고용이다 — 🔴 **키의 값은 담지 않는다**(지웠다는 사실만 담는다).
    자격 증명이 로그로 새면 막으려던 것을 로그가 대신 해 준다.
    """
    changed: dict[str, str] = {}

    for name in _FORCED_FALSE:
        before = os.environ.get(name)
        os.environ[name] = "false"
        if before is not None and before.strip().lower() not in ("false", "0", ""):
            changed[name] = "forced_false"

    for name in _PURGED:
        if os.environ.pop(name, None) is not None:
            changed[name] = "purged"      # 값이 아니라 «있었다»만 남긴다

    _assert_closed()
    if changed:
        log.warning("egress guard 가 환경을 바꿨다: %s", sorted(changed))
    return changed


def _assert_closed() -> None:
    """강제가 실제로 먹었는지 되읽어 확인한다 — 강제와 확인은 다른 층이다."""
    for name in _FORCED_FALSE:
        value = os.environ.get(name, "")
        if value.strip().lower() not in ("false", "0"):
            raise EgressGuardFailed(f"{name} 가 false 가 아니다: 트레이싱 경로가 열려 있다")
    for name in _PURGED:
        if name in os.environ:
            raise EgressGuardFailed(f"{name} 가 환경에 남아 있다: 자격 증명 경로가 열려 있다")
