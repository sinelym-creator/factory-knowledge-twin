"""U-08 — `CHUNK_ID_RE` 단위 케이스 (T7-25).

대상: `app/reading/evidence.py` 의 `CHUNK_ID_RE`
소비처 둘이 이 정규식의 «판정»과 «그룹»을 함께 읽는다 — 그래서 케이스도 둘 다 본다.

  · `evidence.py:fetch` — `match is not None` 이면 **doc-chunk 경로**로 간다.
     느슨해지면 chunk 가 아닌 ID 가 chunk 조회로 새고, 그건 404 가 나야 할 자리에서
     다른 답이 나오는 일이다.
  · `documents.py:fetch` — `group("document")` 를 요청 문서와 대조하고,
     `group("revision")` 에서 revision 번호를, `group("index")` 에서 chunk 자리를 «정수로» 꺼낸다.
     🔴 그래서 「매치됐다」만 보는 케이스는 부족하다 — 매치되고도 그룹이 어긋나면
        소비처는 **다른 문서의 다른 자리**를 편다.

러너 = 표준 `unittest`(pytest 는 이 venv·requirements 에 없다 — 새 의존 0).

  services/ai-api/.venv/Scripts/python.exe -m unittest discover -s services/ai-api/tests_unit -v
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

# `app` 패키지를 찾게 한다 — 이 파일이 어디서 호출되든 서비스 루트를 기준으로 잡는다.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.reading.evidence import CHUNK_ID_RE  # noqa: E402

VALID = "DOC-MAN-0021@r1#006"

# 🔴 위반 4형태 — 각 줄의 셋째 칸은 «이 케이스를 무르게 만드는 완화»다.
#    케이스가 일을 하는지 보려면 「지금 통과한다」로는 모자라고, **그 완화를 넣었을 때
#    이 값이 실제로 통과해 버리는 것**을 봐야 한다(아래 mutation 케이스가 매 실행 확인한다).
VIOLATIONS = [
    (
        "prefix",
        "XYZ-MAN-0021@r1#006",
        r"^(?P<revision>(?P<document>[A-Z]{3}-[A-Z]{3,4}-\d{4})@r\d+)#(?P<index>\d{3})$",
    ),
    (
        "no-revision",
        "DOC-MAN-0021#006",
        r"^(?P<revision>(?P<document>DOC-[A-Z]{3,4}-\d{4})(@r\d+)?)#(?P<index>\d{3})$",
    ),
    (
        "index-width",
        "DOC-MAN-0021@r1#06",
        r"^(?P<revision>(?P<document>DOC-[A-Z]{3,4}-\d{4})@r\d+)#(?P<index>\d+)$",
    ),
    (
        "empty",
        "",
        r"^((?P<revision>(?P<document>DOC-[A-Z]{3,4}-\d{4})@r\d+)#(?P<index>\d{3}))?$",
    ),
]


class ValidChunkId(unittest.TestCase):
    """정상 형태 — 매치와 «그룹»을 함께 본다."""

    def test_matches(self) -> None:
        self.assertIsNotNone(CHUNK_ID_RE.match(VALID))

    def test_groups_are_what_consumers_read(self) -> None:
        m = CHUNK_ID_RE.match(VALID)
        assert m is not None
        self.assertEqual(m.group("document"), "DOC-MAN-0021")
        self.assertEqual(m.group("revision"), "DOC-MAN-0021@r1")
        self.assertEqual(m.group("index"), "006")
        # documents.py 가 실제로 하는 두 변환 — 그룹이 맞아도 여기서 깨지면 소비처가 깨진다.
        self.assertEqual(int(m.group("revision").rsplit("@r", 1)[1]), 1)
        self.assertEqual(int(m.group("index")), 6)


class ViolationsRejected(unittest.TestCase):
    """위반 4형태 — 전부 «매치 안 됨»이어야 한다."""

    def test_each_violation_is_rejected(self) -> None:
        for name, bad, _loose in VIOLATIONS:
            with self.subTest(violation=name, value=bad):
                self.assertIsNone(
                    CHUNK_ID_RE.match(bad),
                    f"{name}: {bad!r} 가 통과했다 — 소비처가 chunk 아닌 것을 chunk 로 다룬다",
                )

    def test_anchored_at_both_ends(self) -> None:
        """🔴 `^`·`$` 가 살아 있는지 — 앵커가 빠지면 위 4형태는 그대로 막아도
        `쓰레기DOC-MAN-0021@r1#006쓰레기` 가 새어 들어온다(위반 형태와 다른 축)."""
        self.assertIsNone(CHUNK_ID_RE.match(f"X{VALID}"))
        self.assertIsNone(CHUNK_ID_RE.match(f"{VALID}X"))


class CasesHaveTeeth(unittest.TestCase):
    """🔴 케이스가 «일을 하는지»를 매 실행 확인한다.

    위반 케이스는 정규식이 고장 나도 조용히 초록일 수 있다 — 값이 원래 안 맞는 형태라면
    어떤 정규식을 써도 통과한다. 그래서 각 위반마다 **그 축만 무르게 한 정규식**을 컴파일해
    「그때는 실제로 통과해 버린다」를 확인한다. 여기가 빨강이면 그 위반 케이스는 장식이다.
    """

    def test_each_violation_passes_under_its_loosening(self) -> None:
        for name, bad, loose in VIOLATIONS:
            with self.subTest(violation=name, value=bad):
                self.assertIsNotNone(
                    re.compile(loose).match(bad),
                    f"{name}: 완화한 정규식에서도 {bad!r} 가 안 통과한다 — "
                    "이 케이스는 무엇도 가르지 못한다(완화가 그 축을 안 건드렸다)",
                )

    def test_loosenings_still_accept_the_valid_form(self) -> None:
        """완화본이 정상 형태까지 깨뜨렸다면, 위 통과는 «축이 무너져서»지 그 축 때문이 아니다."""
        for name, _bad, loose in VIOLATIONS:
            with self.subTest(violation=name):
                self.assertIsNotNone(re.compile(loose).match(VALID), f"{name}: 완화본이 정상 형태를 깼다")


if __name__ == "__main__":
    unittest.main()
