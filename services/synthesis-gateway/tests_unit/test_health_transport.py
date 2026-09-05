"""O-40 §④ — `/health` 가 «어느 인자 세트로 떴는가»를 값으로 말하는가.

🔴 **무엇을 무는가.** production 게이트웨이를 켜는 경로가 둘이었다. `promote-artifacts.ps1
   -Restart` 는 산출물 `run.ps1` 을 `-PromptFile` 만 주고 켰고(→ `-Token` 0 · `-Bind` 기본
   127.0.0.1), `gw-autostart.ps1` 은 `-Bind 0.0.0.0 -Token <값>` 을 줬다. 두 무대는 실제로
   다르게 굴었는데(무인증 200 vs 401 · 컨테이너 도달 가능 vs 루프백 한정) `/health` 본문에는
   그 갈림을 말하는 칸이 **없었다** — 그래서 검증은 상태코드로 «추론»할 수밖에 없었고,
   추론은 「어느 경로로 떴나」와 「토큰을 안 들고 갔나」를 구별하지 못한다.

🔴 **토큰은 있다/없다만 낸다.** 값을 실으면 이 응답 자체가 유출 경로가 된다 —
   `_authorized()` 가 토큰을 요구하는 라우트에서 그 토큰을 되돌려주는 꼴이다.

실행: `pytest tests_unit -q`(cwd = `services/synthesis-gateway`)
🔴 이 파일은 **CI 회로에 없다** — CI 는 `services/ai-api/tests_unit` 만 부른다(ci.yml).
   `test_prompt_source.py` 와 같은 자리다. CI 편입 = O-41 후보로 회부함.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
GATEWAY_PY = HERE.parent / "gateway.py"

# 이 파일이 만지는 env 전부. 🔴 한 곳에 적어 두고 매 로드마다 **전량을 지운다** —
#    앞 케이스가 남긴 값이 뒤 케이스의 결과가 되면, 두 번째부터는 무엇을 쟀는지 모른다.
_ENV = ("SYNTHESIS_GATEWAY_BIND", "SYNTHESIS_GATEWAY_TOKEN", "SYNTHESIS_GATEWAY_PROMPT_FILE")


def _load(monkeypatch, **env: str):
    """env 를 먼저 세우고 모듈을 **새로** 들인다 — BIND·TOKEN 은 import 시점에 굳는다."""
    for name in _ENV:
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    spec = importlib.util.spec_from_file_location(f"gw_health_{id(monkeypatch)}", GATEWAY_PY)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_health_reports_the_autostart_shape(monkeypatch):
    """`gw-autostart.ps1` 판 = 비루프백 bind + 토큰. 두 칸이 그 사실을 그대로 말해야 한다."""
    gw = _load(monkeypatch, SYNTHESIS_GATEWAY_BIND="0.0.0.0", SYNTHESIS_GATEWAY_TOKEN="s3cr3t-value")
    payload = gw.health_payload()
    assert payload["bind"] == "0.0.0.0"
    assert payload["authRequired"] is True
    # 🔴 bool 이지 값이 아니다 — 토큰 문자열이 본문 어디에도 새면 안 된다.
    assert "s3cr3t-value" not in repr(payload)


def test_health_reports_the_bare_promote_shape(monkeypatch):
    """옛 `promote -Restart` 판 = 인자 0. 기본값(루프백 · 토큰 없음)이 그대로 보여야 한다.

    이 조합은 「이 머신 안에서는 무인증 200」이라 컨테이너가 못 닿는다 — 두 무대를 가르는
    바로 그 형상이므로, 값으로 읽히지 않으면 검증이 상태코드로 추론하게 된다.
    """
    gw = _load(monkeypatch)
    payload = gw.health_payload()
    assert payload["bind"] == "127.0.0.1"
    assert payload["authRequired"] is False


@pytest.mark.parametrize("key", ["bind", "authRequired"])
def test_both_keys_are_always_present(monkeypatch, key):
    """빠진 칸과 false 는 다른 사실이다 — 소비자가 `payload.get(k)` 로 둘을 섞지 않게 한다."""
    gw = _load(monkeypatch, SYNTHESIS_GATEWAY_BIND="127.0.0.1")
    assert key in gw.health_payload()


def test_bind_is_what_the_process_actually_bound(monkeypatch):
    """`/health` 의 bind 는 «주장»이 아니라 서버가 실제로 연 주소와 같은 값이어야 한다.

    🔴 두 칸을 따로 만들면 표면마다 답이 갈린다(한 번만 직렬화하라). 여기서는 모듈 전역
       `BIND` 하나가 `HTTPServer((BIND, PORT))` 와 `/health` 를 **함께** 먹이는지를 본다.
    """
    gw = _load(monkeypatch, SYNTHESIS_GATEWAY_BIND="0.0.0.0", SYNTHESIS_GATEWAY_TOKEN="t")
    assert gw.health_payload()["bind"] == gw.BIND
