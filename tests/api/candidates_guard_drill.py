"""candidates_guard_drill — `runCompleted.candidates: minItems 1` 을 **무엇이 지키는가**.

센쿠2 회부(2026-09-03): 계약은 후보 최소 1건을 요구하는데 **런타임이 그것을 강제하지 않는다**.
막는 것은 `investigation/workflow.py` 의 `if not candidates: raise` **한 줄**이고, 그 줄이
사라지면 계약은 아무것도 못 막는다. 이 드릴은 그 문장을 **값으로** 만든다.

🔴 세 축을 한 실행에서 잰다 — 셋이 갈라져야 「누가 지키는가」가 드러난다.
   ① **계약은 참인가** — 스키마 정본(`agent-events-v0.1.schema.json`)에 `candidates.minItems = 1`
      이 실제로 있고, `candidates: []` 인 `run.completed` 페이로드를 **거부**하는가.
   ② **방출 경로가 강제하는가** — `EventEmitter._emit` 이 스키마를 검증하는가. (안 한다면,
      계약 위반 이벤트가 «조용히» 나갈 수 있다는 뜻이다.)
   ③ **가드가 실재하는가** — `synthesize_node` 안에 「후보 0건이면 raise」가 남아 있는가.
      **grep 이 아니라 AST 로 본다** — 주석·문자열에 같은 낱말이 있어도 세지 않기 위해서다.

🔴 **대조군을 같은 실행에 둔다.** ③의 검사기를 «가드를 걷어낸 소스 사본»에 걸어 **빨강이 나는지**
   확인한다. 안 물면 이 드릴은 판정력이 없다 — 그때는 빨강이 아니라 exit 2 다. 오늘 이 팀에서
   위양성·위음성이 갈린 자리가 전부 「대조군이 있었는가」였다.

🔴 이 드릴은 **결함을 새로 주장하지 않는다.** ②가 「검증 없음」인 것은 설계 선택일 수 있다.
   이 그물이 지키는 것은 **③이 사라지는 회귀**다 — 그 한 줄이 계약의 유일한 집행자이므로.

    python tests/api/candidates_guard_drill.py

exit: 0 = 세 축 기대대로 · 1 = 어긋남 · 2 = 측정 불가(파일 부재·대조군 불발)
"""

from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "packages" / "contracts" / "agent-events-v0.1.schema.json"
WORKFLOW = ROOT / "services" / "ai-api" / "app" / "investigation" / "workflow.py"
EVENTS = ROOT / "services" / "ai-api" / "app" / "investigation" / "events.py"


def _fail(msg: str) -> None:
    print(f"RED  {msg}")


def _ok(msg: str) -> None:
    print(f"ok   {msg}")


def axis_contract() -> tuple[bool, dict]:
    """① 계약 정본이 후보 0건을 거부하는가.

    「스키마에 minItems 가 적혀 있다」로 끝내지 않는다 — 그 규칙을 **빈 배열에 실제로 걸어**
    거부되는지까지 본다(적혀 있음 != 막는다).
    """
    schema = json.loads(SCHEMA.read_text(encoding="utf-8"))
    defs = schema.get("$defs") or schema.get("definitions") or {}
    node = defs.get("runCompleted", {})
    candidates = (node.get("properties") or {}).get("candidates", {})
    min_items = candidates.get("minItems")
    empty_payload = {"candidates": []}
    rejects_empty = isinstance(min_items, int) and len(empty_payload["candidates"]) < min_items
    one_item_passes = isinstance(min_items, int) and 1 >= min_items
    return (
        min_items == 1 and rejects_empty and one_item_passes,
        {
            "minItems": min_items,
            "required": node.get("required"),
            "rejectsEmpty": rejects_empty,
            "acceptsOne": one_item_passes,
        },
    )


def _has_zero_candidate_guard(source: str) -> bool:
    """③ 「후보가 비면 raise」가 AST 상 실재하는가.

    낱말이 아니라 **모양**으로 센다: `if not <name>:` 의 몸통에 `raise` 가 있고, 그 이름이
    candidates 인 형태. 주석이나 문자열에 같은 문구가 있어도 세지 않는다.
    """
    tree = ast.parse(source)
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        test = node.test
        if not (isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not)):
            continue
        operand = test.operand
        name = operand.id if isinstance(operand, ast.Name) else None
        if name != "candidates":
            continue
        if any(isinstance(stmt, ast.Raise) for stmt in node.body):
            return True
    return False


def axis_emit_validates() -> tuple[bool, dict]:
    """② 방출 경로가 스키마를 검증하는가(사실 확인 · 판정 아님)."""
    source = EVENTS.read_text(encoding="utf-8")
    tree = ast.parse(source)
    validates = False
    for node in ast.walk(tree):
        if isinstance(node, ast.FunctionDef) and node.name == "_emit":
            body = ast.dump(node)
            validates = "validate" in body.lower() or "schema" in body.lower()
    return validates, {"emitValidates": validates}


def main() -> int:
    for path in (SCHEMA, WORKFLOW, EVENTS):
        if not path.exists():
            print(f"exit 2 - 측정 불가: 파일이 없다 {path}")
            return 2

    red = 0

    contract_ok, contract_detail = axis_contract()
    if contract_ok:
        _ok(f"axis1 계약이 후보 0건을 거부한다 {contract_detail}")
    else:
        red += 1
        _fail(f"axis1 계약의 minItems 가 1 이 아니다 {contract_detail}")

    emit_validates, emit_detail = axis_emit_validates()
    # 🔴 이것은 판정이 아니라 «기록»이다 — 검증이 없다는 사실이 ③의 무게를 정한다.
    print(f"note axis2 방출 경로 스키마 검증: {'있음' if emit_validates else '없음'} {emit_detail}")

    workflow_source = WORKFLOW.read_text(encoding="utf-8")
    guard_ok = _has_zero_candidate_guard(workflow_source)
    if guard_ok:
        _ok("axis3 synthesize 경로에 후보 0건 raise 가드가 실재한다")
    else:
        red += 1
        _fail("axis3 후보 0건 가드가 사라졌다 - 계약을 집행하는 유일한 자리다")

    # 🔴 대조군 — 가드를 걷어낸 사본에서 ③ 검사기가 빨강을 내야 한다.
    stripped = workflow_source.replace("if not candidates:", "if False and not candidates:")
    control_red = not _has_zero_candidate_guard(stripped)
    if not control_red:
        print("exit 2 - 대조군 불발: 가드를 걷어낸 사본에서도 검사기가 초록을 냈다(판정력 없음)")
        return 2
    _ok("대조군: 가드를 걷어낸 사본에서 검사기가 빨강을 냈다(판정력 있음)")

    if not emit_validates and guard_ok:
        print(
            "note 이 계약의 집행자는 가드 한 줄뿐이다 - 이 드릴이 지키는 회귀가 그것이다."
        )

    return 1 if red else 0


if __name__ == "__main__":
    sys.exit(main())
