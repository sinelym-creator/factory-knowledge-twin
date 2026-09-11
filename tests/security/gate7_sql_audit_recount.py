#!/usr/bin/env python
"""Gate 7 ① 독검 — SQL 정적 감사 «다른 방법으로» 계수 재산출 (T5-2F · 검증 좌석)

대상 = `evidence/t5-2-gate7-sql-audit.md`(센쿠2 · develop `ac49d02`)의 4수:
    훑은 파일 47 · 실행 호출 42 · SQL 문자열 상수 28 · 동적 조립 5(식별자만) · 값 연결 0.

🔴 **같은 방법으로 다시 세면 독검이 아니다.** 여기서는 두 갈래를 «따로» 돌려 서로를 교차한다.
   ① AST 갈래 — 호출의 **모든 인자**를 본다(첫 인자만 보면 상수에 조립해 두고 변수로 넘기는
      자리를 놓친다 · 원문 §1 이 자기 1차 감사기의 그 시야를 자수했다). 이름으로 넘어온 인자는
      모듈 상수 표에서 되짚는다.
   ② 정규식 갈래 — AST 를 전혀 쓰지 않는다. 파서가 공유되면 두 갈래의 일치는
      「같은 파서의 일치」일 뿐이다.
   두 갈래가 갈리면 갈렸다고 적는다. 합치지 않는다.

🔴 **검출력 먼저.** 0건·일치를 내기 전에 위반 2종을 심어 두 갈래가 각각 집는지 본다
   (값 연결 f-string 1건 · % 포맷 1건). 못 집으면 그 갈래의 0 은 「깨끗해서 0」이 아니다 → exit 2.

🔴 이 그물은 **정적**이다. 런타임 도달은 재지 않는다(원문 §5 와 같은 칸으로 남는다).

사용: python gate7_sql_audit_recount.py [services/ai-api/app 경로] [out.json]
"""
import ast, io, json, os, re, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else "services/ai-api/app"
OUT = sys.argv[2] if len(sys.argv) > 2 else None

EXEC_NAMES = {"execute", "executemany", "fetch", "fetchrow", "fetchval"}
# SQL 상수로 셀 문자열 — 원문과 같은 「모듈 수준 문자열 상수 중 SQL 로 보이는 것」
SQL_HEAD = re.compile(r"^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|MATCH|MERGE|CREATE)\b", re.I | re.S)


def py_files(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d != "__pycache__"]
        for f in filenames:
            if f.endswith(".py"):
                out.append(os.path.join(dirpath, f))
    return sorted(out)


# ---------------------------------------------------------------- ① AST 갈래
class AstAudit(ast.NodeVisitor):
    def __init__(self, path, src):
        self.path, self.src = path, src
        self.consts = {}          # 모듈/클래스 수준 이름 -> ast 노드
        self.calls = []           # (줄, 호출명, 조립종류)
        self.sql_consts = []      # (줄, 이름)
        self.dynamic = []         # (줄, 호출명, 조립종류, 보간대상)

    def collect_consts(self, tree):
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and len(node.targets) == 1 \
                    and isinstance(node.targets[0], ast.Name):
                self.consts[node.targets[0].id] = node.value

    def shape(self, node, depth=0):
        """이 표현식이 «조립»인가 — 그렇다면 어떤 조립인가."""
        if depth > 4 or node is None:
            return None
        if isinstance(node, ast.JoinedStr):
            return "fstring"
        if isinstance(node, ast.BinOp):
            if isinstance(node.op, ast.Mod):
                return "percent"
            if isinstance(node.op, ast.Add):
                return "concat"
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if node.func.attr in ("format", "join"):
                return node.func.attr
        if isinstance(node, ast.Name) and node.id in self.consts:
            return self.shape(self.consts[node.id], depth + 1)
        return None

    def interpolated(self, node, depth=0):
        """f-string 안에서 보간되는 표현식의 소스 조각(식별자인지 값인지 사람이 본다)."""
        if depth > 4 or node is None:
            return []
        if isinstance(node, ast.Name) and node.id in self.consts:
            return self.interpolated(self.consts[node.id], depth + 1)
        out = []
        for sub in ast.walk(node):
            if isinstance(sub, ast.FormattedValue):
                try:
                    out.append(ast.get_source_segment(self.src, sub.value) or "?")
                except Exception:
                    out.append("?")
        return out

    def visit_Call(self, node):
        name = node.func.attr if isinstance(node.func, ast.Attribute) else \
            (node.func.id if isinstance(node.func, ast.Name) else None)
        if name in EXEC_NAMES:
            kinds = []
            # 🔴 첫 인자만 보지 않는다 — 모든 위치·키워드 인자를 본다.
            for arg in list(node.args) + [k.value for k in node.keywords]:
                s = self.shape(arg)
                if s:
                    kinds.append((s, self.interpolated(arg)))
            self.calls.append((node.lineno, name, [k for k, _ in kinds]))
            for k, interp in kinds:
                self.dynamic.append((node.lineno, name, k, interp))
        self.generic_visit(node)


def ast_pass(files):
    stats = {"files": 0, "calls": 0, "sqlConsts": 0, "dynamic": []}
    for path in files:
        src = io.open(path, encoding="utf-8").read()
        tree = ast.parse(src, path)
        a = AstAudit(path, src)
        a.collect_consts(tree)
        a.visit(tree)
        stats["files"] += 1
        stats["calls"] += len(a.calls)
        for nm, val in a.consts.items():
            txt = val.value if isinstance(val, ast.Constant) and isinstance(val.value, str) else None
            if txt is None and isinstance(val, ast.JoinedStr):
                txt = "".join(v.value for v in val.values if isinstance(v, ast.Constant))
            if txt and SQL_HEAD.match(txt):
                stats["sqlConsts"] += 1
        for lineno, nm, kind, interp in a.dynamic:
            stats["dynamic"].append({
                "file": os.path.relpath(path, ROOT).replace("\\", "/"),
                "line": lineno, "call": nm, "kind": kind, "interpolates": interp,
            })
    return stats


# ------------------------------------------------------------- ② 정규식 갈래
CALL_RE = re.compile(r"\.(execute|executemany|fetch|fetchrow|fetchval)\s*\(")
FSTR_ARG_RE = re.compile(r"\.(execute|executemany|fetch|fetchrow|fetchval)\s*\(\s*f[\"']")
PCT_ARG_RE = re.compile(r"\.(execute|executemany|fetch|fetchrow|fetchval)\s*\([^)\n]*%\s*[\(\w]")
CONST_RE = re.compile(r"^[A-Z_][A-Z0-9_]*\s*=\s*f?[\"']{1,3}\s*(SELECT|INSERT|UPDATE|DELETE|WITH|MATCH|MERGE|CREATE)\b",
                      re.I | re.M)


def regex_pass(files):
    stats = {"files": 0, "calls": 0, "sqlConsts": 0, "fstringCalls": 0, "percentCalls": 0}
    for path in files:
        src = io.open(path, encoding="utf-8").read()
        stats["files"] += 1
        stats["calls"] += len(CALL_RE.findall(src))
        stats["sqlConsts"] += len(CONST_RE.findall(src))
        stats["fstringCalls"] += len(FSTR_ARG_RE.findall(src))
        stats["percentCalls"] += len(PCT_ARG_RE.findall(src))
    return stats


# ------------------------------------------------------------------- 교정 칸
CONTROL = '''"""심은 대조 — 두 갈래가 각각 집는지 보는 칸(측정 직후 지운다)."""
import typing

BAD_CONST = "SELECT * FROM equipment WHERE id = 1"


async def planted_value_concat(conn: typing.Any, user_id: str) -> typing.Any:
    # 값 연결 f-string — 값이 문자열로 들어간다
    return await conn.fetchrow(f"SELECT * FROM equipment WHERE id = '{user_id}'")


async def planted_percent(conn: typing.Any, user_id: str) -> typing.Any:
    return await conn.execute("SELECT * FROM equipment WHERE id = '%s'" % (user_id,))
'''


def main():
    if not os.path.isdir(ROOT):
        print("[stage] EXIT2 — 모집단 경로가 없다: %s" % ROOT)
        return 2

    base_files = py_files(ROOT)
    print("[recount] root=%s" % ROOT)

    # --- 검출력 먼저: 위반 2종을 심는다 ---
    planted = os.path.join(ROOT, "_recount_control.py")
    io.open(planted, "w", encoding="utf-8", newline="\n").write(CONTROL)
    try:
        files_p = py_files(ROOT)
        ast_p, rx_p = ast_pass(files_p), regex_pass(files_p)
    finally:
        os.remove(planted)
    files_c = py_files(ROOT)
    ast_c, rx_c = ast_pass(files_c), regex_pass(files_c)

    ast_delta = len(ast_p["dynamic"]) - len(ast_c["dynamic"])
    rx_delta = (rx_p["fstringCalls"] + rx_p["percentCalls"]) - (rx_c["fstringCalls"] + rx_c["percentCalls"])
    print("[cal] 심은 위반 2종 검출: AST +%d · regex +%d (각 2 여야 한다)" % (ast_delta, rx_delta))
    if ast_delta < 2 or rx_delta < 2:
        print("[cal] EXIT2 — 한 갈래가 심은 것을 못 집었다. 그 갈래의 0 은 값이 아니다.")
        return 2
    if len(files_c) != len(base_files):
        print("[cal] EXIT2 — 대조 파일 잔여. 모집단이 오염됐다.")
        return 2

    # --- 값(value) 축: 보간 대상이 식별자인가 값인가 ---
    for d in ast_c["dynamic"]:
        d["identifiersOnly"] = all(
            not re.search(r"\b(id|input|user|query|q|text|value|param)\b", (e or "").lower())
            for e in d["interpolates"])

    value_joined = [d for d in ast_c["dynamic"] if not d["identifiersOnly"]]

    print("[ast   ] files=%d calls=%d sqlConsts=%d dynamic=%d valueJoined=%d"
          % (ast_c["files"], ast_c["calls"], ast_c["sqlConsts"],
             len(ast_c["dynamic"]), len(value_joined)))
    print("[regex ] files=%d calls=%d sqlConsts=%d fstringCalls=%d percentCalls=%d"
          % (rx_c["files"], rx_c["calls"], rx_c["sqlConsts"],
             rx_c["fstringCalls"], rx_c["percentCalls"]))
    for d in ast_c["dynamic"]:
        print("   dyn %-34s:%-4d %-9s %-8s %s"
              % (d["file"], d["line"], d["call"], d["kind"], d["interpolates"]))

    claimed = {"files": 47, "calls": 42, "sqlConsts": 28, "dynamic": 5, "valueJoined": 0}
    mine = {"files": ast_c["files"], "calls": ast_c["calls"], "sqlConsts": ast_c["sqlConsts"],
            "dynamic": len(ast_c["dynamic"]), "valueJoined": len(value_joined)}
    split = {k: (claimed[k], mine[k]) for k in claimed if claimed[k] != mine[k]}
    print("[cross ] 원문 주장 vs 내 AST: %s" % ("일치" if not split else "갈림 %s" % split))
    print("[cross ] AST vs regex 갈래(파일·호출): files %d/%d · calls %d/%d"
          % (ast_c["files"], rx_c["files"], ast_c["calls"], rx_c["calls"]))

    if OUT:
        json.dump({"root": ROOT, "claimed": claimed, "ast": mine, "regex": rx_c,
                   "dynamic": ast_c["dynamic"], "split": split,
                   "calDelta": {"ast": ast_delta, "regex": rx_delta}},
                  io.open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    # 값 연결이 1건이라도 있으면 그것만으로 빨강. 계수 갈림은 「갈림」으로 보고한다.
    return 1 if mine["valueJoined"] else 0


if __name__ == "__main__":
    sys.exit(main())
