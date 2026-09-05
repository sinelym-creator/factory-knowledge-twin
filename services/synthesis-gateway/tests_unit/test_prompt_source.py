"""T7-42 §A-1·A-2 — 프롬프트를 «어디서 읽는가»와 그것을 무대가 말하는가.

🔴 **무엇을 무는가.** production 게이트웨이는 `HERE/system_prompt.txt`(= 메인 체크아웃)를
   **호출마다** 읽었고, 그래서 develop 병합 + `git merge --ff-only` 만으로 production 의
   프롬프트가 재기동 없이 바뀌었다(09-05 19:58 실측). 처방은 읽을 경로를 밖에서 정하게 하는 것
   (`SYNTHESIS_GATEWAY_PROMPT_FILE`)과, 지금 무엇으로 도는지를 `/health` 가 말하게 하는 것이다.

🔴 **가장 중요한 케이스는 「캐시하지 않는다」**(`test_sha_follows_the_file_not_the_boot`).
   기동 시 한 번 재서 캐시하면 게이트 1 의 판정(「메인 체크아웃 파일을 바꿔도 promptSha256
   불변」)이 **언제나 참**이 되어, 검사가 대상이 아니라 자기 자신을 증명한다.

실행: `pytest tests_unit -q`(cwd = `services/synthesis-gateway`)
🔴 이 파일은 **CI 회로에 없다** — CI 는 `services/ai-api/tests_unit` 만 부른다(ci.yml). 회부함.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
GATEWAY_PY = HERE.parent / "gateway.py"


def _load(monkeypatch, prompt_env: str | None):
    """env 를 먼저 세우고 모듈을 **새로** 들인다 — 경로는 import 시점에 굳는다(프로세스 설정)."""
    if prompt_env is None:
        monkeypatch.delenv("SYNTHESIS_GATEWAY_PROMPT_FILE", raising=False)
    else:
        monkeypatch.setenv("SYNTHESIS_GATEWAY_PROMPT_FILE", prompt_env)
    spec = importlib.util.spec_from_file_location(f"gw_{id(monkeypatch)}", GATEWAY_PY)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_default_path_is_unchanged_when_env_is_absent(monkeypatch):
    """미설정 = 지금까지의 거동 그대로. 하위 호환이 깨지면 좌석 무대가 전부 죽는다."""
    gw = _load(monkeypatch, None)
    assert gw.prompt_file() == GATEWAY_PY.parent / "system_prompt.txt"
    assert gw.SYSTEM_PROMPT_FILE == GATEWAY_PY.parent / "system_prompt.txt"


def test_env_wins_when_set(monkeypatch, tmp_path):
    target = tmp_path / "promoted_prompt.txt"
    target.write_text("PROMOTED", encoding="utf-8")
    gw = _load(monkeypatch, str(target))
    assert gw.SYSTEM_PROMPT_FILE == target
    assert gw.health_payload()["promptPath"] == str(target)


def test_home_prefix_is_expanded(monkeypatch):
    """산출물 경로는 `~/.fkt/...` 로 적힌다 — 그대로 두면 `~` 라는 이름의 디렉터리를 찾는다."""
    gw = _load(monkeypatch, "~/.fkt/prod/gateway/system_prompt.txt")
    assert "~" not in str(gw.SYSTEM_PROMPT_FILE)
    assert str(gw.SYSTEM_PROMPT_FILE).endswith("system_prompt.txt")


def test_sha_is_twelve_hex_and_splits_two_contents(monkeypatch, tmp_path):
    """🔴 계측기를 «참»으로 먼저 울린다 — 다른 내용에서 다른 값이 나와야 판정이 성립한다."""
    gw = _load(monkeypatch, None)
    a = tmp_path / "a.txt"
    b = tmp_path / "b.txt"
    a.write_text("one", encoding="utf-8")
    b.write_text("two", encoding="utf-8")
    sha_a = gw.prompt_sha256(a)
    sha_b = gw.prompt_sha256(b)
    assert len(sha_a) == 12 and all(c in "0123456789abcdef" for c in sha_a)
    assert sha_a != sha_b
    assert gw.prompt_sha256(a) == sha_a, "같은 내용은 같은 값(자기 재현성)"


def test_missing_file_reads_as_none_not_as_a_value(monkeypatch, tmp_path):
    """🔴 「못 쟀다」와 「나쁘다」를 같은 칸에 담지 않는다. 없는 파일은 예외도 아니고 빈 문자열도 아니다."""
    gw = _load(monkeypatch, None)
    assert gw.prompt_sha256(tmp_path / "없는파일.txt") is None


def test_health_carries_both_fields_and_they_agree(monkeypatch, tmp_path):
    target = tmp_path / "p.txt"
    target.write_text("HELLO", encoding="utf-8")
    gw = _load(monkeypatch, str(target))
    payload = gw.health_payload()
    assert payload["promptPath"] == str(target)
    assert payload["promptSha256"] == gw.prompt_sha256(target)
    # 앞판이 이미 내던 칸은 그대로 있어야 한다 — 새 칸을 더하느라 옛 칸을 떨어뜨리지 않는다.
    for key in ("ok", "timeoutMs", "model", "effort"):
        assert key in payload


def test_sha_follows_the_file_not_the_boot(monkeypatch, tmp_path):
    """🔴 **캐시 금지의 판정선.** 뜬 뒤에 파일이 바뀌면 `/health` 도 따라 바뀌어야 한다 —
    이 성질이 없으면 게이트 1(「불변」)이 대상이 아니라 캐시를 증명하게 된다."""
    target = tmp_path / "p.txt"
    target.write_text("BEFORE", encoding="utf-8")
    gw = _load(monkeypatch, str(target))
    before = gw.health_payload()["promptSha256"]
    target.write_text("AFTER", encoding="utf-8")
    after = gw.health_payload()["promptSha256"]
    assert before != after, "기동 시점 값을 캐시하고 있다 — 게이트 1 이 무효가 된다"


@pytest.mark.parametrize("verb", ["synthesize", "health_payload", "prompt_file", "prompt_sha256"])
def test_public_names_exist(monkeypatch, verb):
    """이름이 바뀌면 스크립트·검증이 조용히 빈 값을 읽는다 — 그 자리를 이름으로 막는다."""
    gw = _load(monkeypatch, None)
    assert callable(getattr(gw, verb))
