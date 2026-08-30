# -*- coding: utf-8 -*-
"""T2-4 최종 재검 — 문맥 6 × 키 6 전수 + 형제 5칸 + 오탐 대조군.
   🔴 남의 보고를 초록으로 받지 않는다: 형제 5칸도 내 손으로 다시 잰다."""
import json, subprocess, tempfile
from pathlib import Path
REPO = Path(r"C:\Users\sinel\repos\factory-knowledge-twin"); SVC = REPO / "services" / "ai-api"
FX = REPO / "data" / "replay" / "gs-01.events.jsonl"; AUDIT = SVC / "tools" / "audit_replay_fixture.py"
PY = str(SVC / ".venv" / "Scripts" / "python.exe")
BS = chr(92)
rows = [json.loads(l) for l in FX.read_text(encoding="utf-8").splitlines() if l.strip()]

def run(question):
    with tempfile.TemporaryDirectory() as tmp:
        doc = json.loads(json.dumps(rows[0])); doc["payload"]["question"] = question
        lines = [json.dumps(doc, ensure_ascii=False)] + [json.dumps(r, ensure_ascii=False) for r in rows[1:]]
        (Path(tmp) / FX.name).write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        out = subprocess.run([PY, str(AUDIT), "--fixture-dir", tmp], cwd=str(SVC),
                             capture_output=True, text=True, encoding="utf-8")
        return out.returncode == 1

KEYS = {
    "sk-ant «값만»": "sk-ant-api03-LEVI2PROBE0000000000AAAA",
    "ghp «값만»": "ghp_LEVI2PROBE0000000000000000000000",
    "AKIA «값만»": "AKIALEVI2PROBE000000",
    "claude.ai 단독": "claude.ai",
    "api.claude.ai/URL": "api.claude.ai/v1/messages",
    "JWT": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.LEVI2PROBEsig",
}
CTX = [("단독", "{k}"), ("공백 뒤", "값은 {k} 이다"), ("한글 조사 인접", "알람 {k}이 발생했다"),
       ("한글 바로 뒤", "{k}입니다"), ("한글이 앞에", "주소{k} 를 쓴다"), ("괄호 인접", "({k})")]

print("== 문맥 6 × 키 6 (전 칸이 «운다»여야 한다) ==")
print(f"{'키':18}" + "".join(f"{n:>14}" for n, _ in CTX))
miss = 0
for kname, key in KEYS.items():
    cells = []
    for _, tpl in CTX:
        cried = run(tpl.format(k=key)); miss += 0 if cried else 1
        cells.append("운다" if cried else "🔴통과")
    print(f"{kname:18}" + "".join(f"{c:>14}" for c in cells))
print(f"  → 불발 칸 {miss} / {len(KEYS) * len(CTX)}")

print("\n== 형제 5칸 (센쿠2 보고 · 내 손으로 재현) ==")
SIB = [("network_endpoint", "localhost + 조사", "접속은 localhost에서 한다"),
       ("network_endpoint", "IP + 조사", "주소 10.0.3.44에서 받는다"),
       ("network_endpoint", "한글이 IP 앞에", "주소10.0.3.44 를 쓴다"),
       ("connection_string", "한글이 DSN 앞에", "접속은postgresql://u:p@h:5432/db 이다"),
       ("absolute_path", "경로 + 한글 바로 뒤", "C:" + BS + "Users" + BS + "someone" + BS + "repo입니다")]
sib_miss = 0
for axis, ctx, q in SIB:
    cried = run(q); sib_miss += 0 if cried else 1
    print(f"  {'PASS' if cried else 'FAIL'}  {axis:20} {ctx:22} {'운다' if cried else '🔴통과'}")
print(f"  → 불발 칸 {sib_miss} / {len(SIB)}")

print("\n== 오탐 대조군 (전 칸이 «통과»여야 한다) ==")
FALSE = [("sha256 64자", "59457442ce3f642b2cf711218ee088fd604afe9ee81a5c3010ec4847ef77f5e8"),
         ("chunk ID", "DOC-MAN-0021@r1#006"), ("GP- evidenceId", "GP-7e4cfd025422-03"),
         ("정비 이력 ID", "MR-2025-0087"), ("알람 ID", "AL-20260826-0041"),
         ("긴 한국어", "스핀들 베어링 마모가 의심되므로 절차에 따라 점검한다 " * 3),
         ("버전 문자열", "버전 1.2.3 을 쓴다"), ("설비 ID", "EQ-CNC-204의 상태")]
fp = 0
for name, q in FALSE:
    cried = run(q); fp += 1 if cried else 0
    print(f"  {'FAIL' if cried else 'PASS'}  {name:18} {'🔴운다(오탐)' if cried else '통과'}")
print(f"  → 오탐 {fp} / {len(FALSE)}")
print(f"\n총계: 키 불발 {miss} · 형제 불발 {sib_miss} · 오탐 {fp}")
