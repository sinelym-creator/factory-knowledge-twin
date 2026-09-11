#!/usr/bin/env python3
"""T5-1F 재집계 — 최종 리포트의 모든 수를 **raw 에서 다시 센다**.

🔴 **값을 옮기지 않는다.** `eval-report-v0.3.md` 의 표는 「전대가 적은 값」이고 전언이다.
   이 스크립트는 `benchmarks/eval-raw-v0.3.jsonl` + `benchmarks/datasets/ground-truth.v0.3.jsonl`
   에서 다시 세고, 문면과 갈리면 **갈림을 값으로 출력**한다(둘 중 무엇이 맞는지는 판정문이 적는다).

🔴 **못 재는 축은 0 으로 적지 않는다.** 지표 4(간선 실재)·지표 7(인용 실재)의 «실재» 판정은
   SSOT(그래프·DB)를 읽어야 한다. 이 창은 무대 없이 도는 집계라 **문서 파일로 확인 가능한 부분만**
   재확인하고, 나머지는 `notRederivable` 로 **이름을 남긴다**.

사용: `python benchmarks/tools/t51_final_aggregate.py [--json]`(레포 루트)
"""

from __future__ import annotations

import sys as _sys

for _s in (_sys.stdout, _sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:                                        # noqa: BLE001
        pass

import hashlib
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "benchmarks" / "eval-raw-v0.3.jsonl"
GT = ROOT / "benchmarks" / "datasets" / "ground-truth.v0.3.jsonl"
DOCS = ROOT / "data" / "documents"
K = 5

# `DOC-x@rN#NNN` 에서 문서·판까지 — 보고서 §3 이 명시한 매칭 규칙(같은 문서·판의 chunk 인정)
CHUNK_RE = re.compile(r"^(?P<doc>[^#]+)#\d+$")
# 🔴 `findall` 은 **겹치지 않게** 뇐서 `A -[R]- B -[R]- C` 에서 둘째 간선을 버린다.
#    첫 판이 바로 그래서 255 를 냈고, 보고서 문면(413)과 갈렸다 — 대상이 아니라 내 계측기였다.
#    그래서 경로를 **순차 분해**해 연쇄의 모든 마디를 센다.
SEG_RE = re.compile(r"\s*-\[([A-Z_]+)\]-\s*")
NODE_RE = re.compile(r"[A-Za-z0-9_\-\.]+$")


def edges_in(excerpt: str) -> list[tuple[str, str, str]]:
    """`[라벨] A -[REL]- B -[REL]- C` 를 간선 목록으로."""
    text = re.sub(r"^\[[^\]]*\]\s*", "", (excerpt or "").strip())
    parts = SEG_RE.split(text)
    if len(parts) < 3:
        return []
    nodes = parts[0::2]
    rels = parts[1::2]
    out = []
    for i, rel in enumerate(rels):
        a = nodes[i].strip().split()[-1] if nodes[i].strip() else ""
        b = nodes[i + 1].strip().split()[0] if nodes[i + 1].strip() else ""
        if a and b:
            out.append((a, rel, b))
    return out


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def doc_of(evidence_id: str) -> str:
    m = CHUNK_RE.match(evidence_id)
    return m.group("doc") if m else evidence_id


def matched(expected: str, hit_ids: list[str]) -> bool:
    """기대 1건이 상위 K 안에 잡혔는가 — 완전 일치 또는 같은 문서·판의 chunk."""
    if expected in hit_ids:
        return True
    exp_doc = doc_of(expected)
    return any(doc_of(h) == exp_doc for h in hit_ids)


def main() -> int:
    raw = jsonl(RAW)
    gt = {g["id"]: g for g in jsonl(GT)}
    out: dict = {
        "source": {
            "raw": {"path": str(RAW.relative_to(ROOT)).replace(os.sep, "/"), "rows": len(raw), "sha256": sha256(RAW)},
            "groundTruth": {"path": str(GT.relative_to(ROOT)).replace(os.sep, "/"), "rows": len(gt), "sha256": sha256(GT)},
        },
        "K": K,
    }

    # 분모를 «먼저» 센다 — 분모가 0 이거나 빈 집합이면 그 축은 판정이 아니다
    with_ev = [q for q in gt.values() if q.get("required_evidence")]
    with_sop = [q for q in gt.values() if any(str(e).startswith("SOP-") for e in (q.get("required_evidence") or []))]
    out["denominators"] = {"recall": len(with_ev), "sop": len(with_sop), "rawRows": len(raw),
                           "rawIdsNotInGroundTruth": sorted({r["id"] for r in raw} - set(gt))}

    by_id = {r["id"]: r for r in raw}
    strategies = sorted({s for r in raw for s in (r.get("strategies") or {})})

    metric2: dict = {}
    metric3: dict = {}
    for st in strategies:
        any_hit = all_hit = 0
        missing_any: list[str] = []
        for q in with_ev:
            row = by_id.get(q["id"])
            hits = [h.get("evidenceId") for h in ((row or {}).get("strategies", {}).get(st, {}) or {}).get("hits", [])[:K]]
            flags = [matched(e, hits) for e in q["required_evidence"]]
            if any(flags):
                any_hit += 1
            else:
                missing_any.append(q["id"])
            if flags and all(flags):
                all_hit += 1
        metric2[st] = {"any": any_hit, "all": all_hit, "denominator": len(with_ev), "missedAll": missing_any}

        sop_ok = 0
        sop_missed: list[str] = []
        for q in with_sop:
            row = by_id.get(q["id"])
            hits = [h.get("evidenceId") for h in ((row or {}).get("strategies", {}).get(st, {}) or {}).get("hits", [])[:K]]
            sops = [e for e in q["required_evidence"] if str(e).startswith("SOP-")]
            if all(matched(s, hits) for s in sops):
                sop_ok += 1
            else:
                sop_missed.append(q["id"])
        metric3[st] = {"caught": sop_ok, "denominator": len(with_sop), "missed": sop_missed}

    out["metric2_recallAtK"] = metric2
    out["metric3_sopAccuracy"] = metric3

    # 지표 4 — 간선을 «세는» 것까지가 이 창의 사정거리
    edges = []
    for r in raw:
        for h in (r.get("strategies", {}).get("graphrag", {}) or {}).get("hits", []):
            edges.extend(edges_in(h.get("excerpt") or ""))
    out["metric4_graphPath"] = {
        "edgesParsed": len(edges),
        "distinctPairs": len({(a, b) for a, _, b in edges}),
        "distinctRelations": sorted({rel for _, rel, _ in edges}),
        "notRederivable": "간선이 Ontology 에 «실재»하는가 = 그래프 SSOT 필요. 이 창은 무대 없이 돌았다.",
    }

    # 지표 7 — 인용 «수»는 다시 세고, 실재는 문서 파일로 확인 가능한 것만
    docs_on_disk = {p.name.replace(".md", "") for p in DOCS.glob("*.md")} if DOCS.exists() else set()
    cites: dict = {}
    for st in strategies:
        ids = [h.get("evidenceId") for r in raw for h in (r.get("strategies", {}).get(st, {}) or {}).get("hits", [])]
        doc_ids = [i for i in ids if str(i).startswith("DOC-")]
        resolvable = [i for i in doc_ids if doc_of(i) in docs_on_disk]
        cites[st] = {
            "citations": len(ids),
            "docPrefixed": len(doc_ids),
            "docResolvedOnDisk": len(resolvable),
            "nonDocPrefixed": len(ids) - len(doc_ids),
        }
    out["metric7_citationValidity"] = {
        "perStrategy": cites,
        "documentsOnDisk": sorted(docs_on_disk),
        "notRederivable": "EQ-*·SOP-* 등 비문서 id 의 실재는 DB SSOT 필요 — 이 창에서 재확인 못 했다.",
    }

    out["latencyMs"] = {
        "rows": len(raw),
        "wallMsMin": min(r.get("wallMs", 0) for r in raw),
        "wallMsMax": max(r.get("wallMs", 0) for r in raw),
        "wallMsMean": round(sum(r.get("wallMs", 0) for r in raw) / len(raw), 1),
        "note": "이것은 검색 왕복이다 — 지표 8(합성 지연)이 아니다. 이름을 섞지 않는다.",
    }

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
