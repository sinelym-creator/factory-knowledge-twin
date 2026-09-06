"""O-48 ⓐ-1c — 인구조사가 **무엇을 뺐는지** 말하는가.

🔴 **무엇을 무는가.** 앞판 sweep 은 `README.md` 를 이름으로 조용히 걸렀다. 읽는 쪽에는
   `population=7` 만 남아 「문서가 7본」으로 읽히고, 뺀 사실은 코드를 열어야만 보였다.
   무표시 제외는 코퍼스가 자랄수록 위험해진다 — 규칙에 걸리는 파일이 늘어도 표는 조용하다.

🔴 **제외는 삭제가 아니라 표시다.** 그래서 이 케이스는 「README 가 인구에 들어왔는가」를 묻지
   않는다(인구는 그대로 7이 맞다). 묻는 것은 **뺀 목록이 출력에 실리는가** 하나다.

실행: `pytest tests_unit/test_directive_flag_sweep.py`(cwd = `services/ai-api`)
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

TOOL = Path(__file__).resolve().parents[1] / "tools" / "directive_flag_sweep.py"


def _load():
    spec = importlib.util.spec_from_file_location("directive_flag_sweep", TOOL)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_excluded_names_reach_the_output(capsys):
    """뺀 이름이 값으로 나오고, 인구는 그대로다."""
    mod = _load()

    units, excluded = mod._documents()
    assert excluded == ["README.md"]                        # 무엇을 뺐는지 말할 수 있다
    names = [name for name, _ in units]
    assert "README.md" not in names                         # 제외는 여전히 제외다(삭제가 아니라 표시)
    assert len(names) == len(set(names)) and names          # 인구가 비지 않았다 — 빈 무대는 초록을 지어낸다

    mod.main()
    line = next(ln for ln in capsys.readouterr().out.splitlines() if ln.startswith("[corpus]"))
    assert "excluded=['README.md']" in line
