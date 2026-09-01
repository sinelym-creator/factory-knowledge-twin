r"""chunk 정책 후보안 실측 — T1-4 게이트 ①.

실행:

```powershell
services\indexer\.venv\Scripts\python.exe services\indexer\probe_chunking.py
```

무엇을 재는가:

1. **토크나이저 환산 실측** — 전임(T1-3)의 `1 token ~= 1.3자`(E3)를 실 토크나이저로 대조한다.
   토크나이저를 못 받으면 그 사실을 그대로 적고 E3 계수기로 내려간다(조용히 대체하지 않는다).
2. **후보안별 chunk 수 · 크기 분포** — 정책이 앵커를 얼마나 흔드는지.
3. 🔴 **GS-01 S4·S7 기대 인용 온전성** — `data/generators/config.py`의 `EXPECTED_QUOTES`가
   정본이다. 화면 스니펫 조각뿐 아니라 «그 조각이 속한 문장 전체»가 한 chunk 안에 온전한지
   함께 본다. 조각만 보면 「진동 RMS가」처럼 짧은 문구가 어디서 잘려도 통과해버린다.
"""

from __future__ import annotations

import json
import re
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chunking import (  # noqa: E402
    CANDIDATES,
    ChunkPolicy,
    HFCounter,
    RatioCounter,
    TiktokenCounter,
    chunk,
    normalize,
)

DOC_DIR = ROOT / "data" / "documents"

# 화면 앵커가 걸린 4개 문서(= wireframes `#014`·`#009`·`#007`·`#003`).
ANCHOR_DOCS = [
    ("DOC-MAN-0021@r1", "#014"),
    ("DOC-MAN-0022@r1", "#009"),
    ("DOC-SOP-0014@r2", "#007"),
    ("DOC-MRP-0087@r1", "#003"),
]

# 후보 임베딩 모델의 토크나이저 — 게이트 ③ 택일 후보와 같은 계열이어야 의미가 있다.
HF_CANDIDATES = [
    ("intfloat/multilingual-e5-small", "e5-small(XLM-R 250k)"),
    ("BAAI/bge-m3", "bge-m3(XLM-R 250k)"),
    ("sentence-transformers/all-MiniLM-L6-v2", "MiniLM-L6(영어 30k)"),
]


def expected_quotes() -> list[tuple[str, str, str]]:
    from data.generators.config import EXPECTED_QUOTES

    return list(EXPECTED_QUOTES)


def load_bodies() -> dict[str, str]:
    return {
        p.stem: normalize(p.read_text(encoding="utf-8"))
        for p in sorted(DOC_DIR.glob("*.md"))
        if p.name != "README.md"
    }


# --- 계수기 확보 ----------------------------------------------------------------


def build_counters() -> tuple[list, list[str]]:
    counters, notes = [], []
    try:
        from tokenizers import Tokenizer

        for repo, label in HF_CANDIDATES:
            try:
                tok = Tokenizer.from_pretrained(repo)
                # 🔴 모델 기본 truncation(MiniLM = 128 tok)이 켜져 있으면 긴 문서가 조용히
                #    잘려 「자/token」이 터무니없이 커진다. 분할 실측은 전문을 봐야 한다.
                tok.no_truncation()
                tok.no_padding()
                counters.append(HFCounter(tok, label))
            except Exception as exc:  # 네트워크·권한 등 — 사실대로 적는다.
                notes.append(f"HF {repo} 로드 실패: {type(exc).__name__}: {str(exc)[:120]}")
    except ImportError as exc:
        notes.append(f"tokenizers import 실패: {exc}")

    try:
        import tiktoken

        counters.append(TiktokenCounter(tiktoken.get_encoding("cl100k_base"), "tiktoken/cl100k"))
    except Exception as exc:
        notes.append(f"tiktoken 로드 실패: {type(exc).__name__}: {str(exc)[:120]}")

    counters.append(RatioCounter())  # 전임 환산 — 대조군으로 항상 넣는다.
    return counters, notes


# --- 인용 온전성 ----------------------------------------------------------------

SENT_SPLIT = re.compile(r"(?<=[.!?])\s+|\n")


def sentence_around(text: str, quote: str) -> str | None:
    """quote를 품은 «문장 전체»(개행/종결부호 경계)를 돌려준다."""
    i = text.find(quote)
    if i < 0:
        return None
    j = i + len(quote)
    start = 0
    for m in SENT_SPLIT.finditer(text[:i]):
        start = m.end()
    end = len(text)
    m = SENT_SPLIT.search(text, j)
    if m:
        end = m.start() + 1 if text[m.start()] in ".!?" else m.start()
    return text[start:end].strip()


def paragraph_around(text: str, quote: str) -> str | None:
    """quote를 품은 «문단 전체»(빈 줄 경계)를 돌려준다.

    마크다운 본문은 한 문장이 여러 줄로 감긴다 — 개행만 보면 문장이 짧게 끊겨 온전성 판정이
    실제보다 느슨해진다. 화면이 인용을 띄울 때 필요한 것은 문단 단위 맥락이므로 함께 잰다.
    """
    i = text.find(quote)
    if i < 0:
        return None
    start = text.rfind("\n\n", 0, i)
    start = 0 if start < 0 else start + 2
    end = text.find("\n\n", i + len(quote))
    end = len(text) if end < 0 else end
    return text[start:end].strip()


def intact_seq(chunks, needle: str) -> int | None:
    """needle이 «통째로» 들어간 chunk의 0-based 좌표(없으면 None = 경계에서 절단).

    🔴 좌표가 0-based이므로 호출부는 반드시 `is None`으로 판정한다. 첫 chunk(`#000`)가
       falsy라, 진리값으로 보면 「인용이 절단됐다」로 뒤집힌다.
    """
    for c in chunks:
        if needle and needle in c.text:
            return c.index
    return None


# --- 실측 ----------------------------------------------------------------------


def measure(counter, bodies: dict[str, str], quotes: list[tuple[str, str, str]]) -> dict:
    rows = []
    for policy in CANDIDATES:
        per_doc = {rid: chunk(body, counter, policy) for rid, body in bodies.items()}
        sizes = [c.n_tokens for cs in per_doc.values() for c in cs]
        total = sum(len(cs) for cs in per_doc.values())

        quote_rows = []
        for rid, q, screen in quotes:
            cs = per_doc.get(rid)
            if cs is None:
                quote_rows.append({"rev": rid, "quote": q, "status": "문서 없음"})
                continue
            frag = intact_seq(cs, q)
            sent = sentence_around(bodies[rid], q)
            para = paragraph_around(bodies[rid], q)
            sent_seq = intact_seq(cs, sent) if sent else None
            para_seq = intact_seq(cs, para) if para else None
            quote_rows.append(
                {
                    "rev": rid,
                    "quote": q,
                    "screen": screen,
                    "frag_seq": frag,
                    "sent_seq": sent_seq,
                    "para_seq": para_seq,
                    "sent_len": len(sent) if sent else 0,
                    "para_len": len(para) if para else 0,
                }
            )

        broken = sum(1 for r in quote_rows if r.get("sent_seq") is None)
        broken_para = sum(1 for r in quote_rows if r.get("para_seq") is None)
        # 절 경계 정렬률 = chunk 시작이 마크다운 헤딩인 비율(맥락 유실의 역지표).
        starts_at_heading = sum(
            1 for cs in per_doc.values() for c in cs if c.text.lstrip().startswith("#")
        )
        rows.append(
            {
                "policy": policy.label,
                "total_chunks": total,
                "anchor_docs": {rid: len(per_doc[rid]) for rid, _ in ANCHOR_DOCS if rid in per_doc},
                "tok_min": min(sizes) if sizes else 0,
                "tok_med": int(statistics.median(sizes)) if sizes else 0,
                "tok_max": max(sizes) if sizes else 0,
                "over_budget": sum(1 for s in sizes if s > policy.max_tokens),
                "heading_aligned": round(100 * starts_at_heading / total) if total else 0,
                "quote_broken": broken,
                "quote_broken_para": broken_para,
                "quotes": quote_rows,
            }
        )
    return {"counter": counter.name, "grade": counter.grade, "rows": rows}


def char_per_token(counter, bodies: dict[str, str]) -> dict[str, float]:
    out = {}
    for rid, body in bodies.items():
        n = len(counter.offsets(body))
        out[rid] = round(len(body) / n, 3) if n else 0.0
    return out


def main() -> int:
    bodies = load_bodies()
    quotes = expected_quotes()
    counters, notes = build_counters()

    print("# T1-4 게이트 ① — chunk 정책 후보안 실측\n")
    print(f"문서 {len(bodies)}건 · 인용 문구 {len(quotes)}건 · 후보안 {len(CANDIDATES)}종\n")
    if notes:
        print("## 계수기 확보 실패 기록\n")
        for n in notes:
            print(f"- {n}")
        print()

    print("## 1. 토크나이저 환산 실측 (자 / token)\n")
    header = "| revision | 자 | " + " | ".join(f"{c.name}({c.grade})" for c in counters) + " |"
    print(header)
    print("|" + "---|" * (2 + len(counters)))
    ratios = {c.name: char_per_token(c, bodies) for c in counters}
    for rid in sorted(bodies):
        cells = " | ".join(f"{ratios[c.name][rid]}" for c in counters)
        print(f"| `{rid}` | {len(bodies[rid])} | {cells} |")
    print()

    results = []
    for c in counters:
        res = measure(c, bodies, quotes)
        results.append(res)
        print(f"## 2. 후보안별 실측 — 계수기 `{c.name}` ({c.grade})\n")
        print("| 정책 | 전체 chunk | MAN-0021 | MAN-0022 | SOP-0014@r2 | MRP-0087 "
              "| tok min/중앙/max | 예산초과 | 절머리시작% | 🔴문장파손 | 🔴문단파손 |")
        print("|" + "---|" * 11)
        for r in res["rows"]:
            a = r["anchor_docs"]
            print(
                f"| `{r['policy']}` | {r['total_chunks']} "
                f"| {a.get('DOC-MAN-0021@r1', '-')} | {a.get('DOC-MAN-0022@r1', '-')} "
                f"| {a.get('DOC-SOP-0014@r2', '-')} | {a.get('DOC-MRP-0087@r1', '-')} "
                f"| {r['tok_min']}/{r['tok_med']}/{r['tok_max']} | {r['over_budget']} "
                f"| {r['heading_aligned']} | {r['quote_broken']} | {r['quote_broken_para']} |"
            )
        print()

    # 3. 인용 온전성 상세 — 정본 계수기(첫 E1) 기준.
    primary = next((r for r in results if r["grade"] == "E1"), results[-1])
    print(f"## 3. GS-01 인용 온전성 상세 — 계수기 `{primary['counter']}`\n")
    print("| 정책 | " + " | ".join(f"Q{i+1}" for i in range(len(quotes))) + " |")
    print("|" + "---|" * (1 + len(quotes)))
    for r in primary["rows"]:
        cells = []
        for q in r["quotes"]:
            if q.get("para_seq") is not None:
                cells.append(f"#{q['para_seq']:03d}")
            elif q.get("sent_seq") is not None:
                cells.append(f"#{q['sent_seq']:03d}⚠문단")
            else:
                cells.append("🔴절단")
        print(f"| `{r['policy']}` | " + " | ".join(cells) + " |")
    print()
    print("문구 색인:\n")
    for i, (rid, q, screen) in enumerate(quotes):
        print(f"- Q{i+1} `{rid}` — 「{q}」 · {screen}")
    print()

    out = ROOT / ".workspace" / "scratch" / "chunk-probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n(원자료: {out.relative_to(ROOT)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
