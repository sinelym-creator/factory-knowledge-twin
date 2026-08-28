r"""임베딩 런타임 택일 실측 — T1-4 게이트 ③.

실행:

```powershell
$env:PYTHONUTF8 = '1'
services\indexer\.venv\Scripts\python.exe services\indexer\probe_embedding.py
```

무엇을 재는가 — 「최신이라서」는 근거가 아니다. **설치되는가 · 재현되는가 · 상한 안에 드는가**다.

1. **설치 실측** — 이 환경(win · py3.14)에서 wheel이 오는가, 소스 빌드로 떨어지는가.
2. **모델 확보 시간** — 첫 로드(다운로드 포함)와 재로드(캐시)를 나눠 잰다. 둘을 섞으면
   「느리다」의 원인이 네트워크인지 런타임인지 구분되지 않는다.
3. **임베딩 시간** — 동결 정책(`chunking_policy_version=1`)으로 자른 실제 chunk를 넣는다.
   합성 문자열로 재면 한국어 토큰 길이가 빠져 시간이 낙관적으로 나온다.
4. 🔴 **입력 상한 대조** — chunk가 모델 `max_seq_length`를 넘으면 **조용히 잘린다**.
   동결 근거가 「512는 상한 안」이었으므로, 이 대조가 곧 동결의 재확인이다.
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chunking import FROZEN_POLICY, HFCounter, chunk  # noqa: E402
from probe_chunking import load_bodies  # noqa: E402

# 목표 규모 — data-ontology-spec §5 「DocumentChunk ~= 900」. 실측 시간을 여기로 외삽한다.
TARGET_CHUNKS = 900


def frozen_chunks() -> list[str]:
    """동결 정책으로 자른 실제 chunk 본문."""
    from tokenizers import Tokenizer

    tok = Tokenizer.from_pretrained("intfloat/multilingual-e5-small")
    tok.no_truncation()
    tok.no_padding()
    counter = HFCounter(tok, "e5-small")
    out: list[str] = []
    for body in load_bodies().values():
        out.extend(c.text for c in chunk(body, counter, FROZEN_POLICY))
    return out


def probe_sentence_transformers(model_id: str, texts: list[str]) -> dict:
    from sentence_transformers import SentenceTransformer

    t0 = time.perf_counter()
    m = SentenceTransformer(model_id)
    load_cold = time.perf_counter() - t0

    t0 = time.perf_counter()
    m2 = SentenceTransformer(model_id)
    load_warm = time.perf_counter() - t0

    t0 = time.perf_counter()
    vecs = m.encode(texts, batch_size=16, show_progress_bar=False)
    enc = time.perf_counter() - t0

    max_seq = getattr(m, "max_seq_length", None)
    tok = m.tokenizer
    over = sum(1 for t in texts if len(tok.encode(t)) > (max_seq or 10**9))
    tok_max = max(len(tok.encode(t)) for t in texts)
    del m2
    return {
        "runtime": "sentence-transformers",
        "model": model_id,
        "dim": int(vecs.shape[1]),
        "max_seq_length": max_seq,
        "chunk_tok_max": tok_max,
        "over_limit": over,
        "load_cold_s": round(load_cold, 2),
        "load_warm_s": round(load_warm, 2),
        "encode_s": round(enc, 3),
        "per_chunk_ms": round(1000 * enc / len(texts), 1),
        "est_900_s": round(enc / len(texts) * TARGET_CHUNKS, 1),
    }


def probe_fastembed(model_id: str, texts: list[str]) -> dict:
    from fastembed import TextEmbedding

    t0 = time.perf_counter()
    m = TextEmbedding(model_name=model_id)
    load_cold = time.perf_counter() - t0

    t0 = time.perf_counter()
    TextEmbedding(model_name=model_id)
    load_warm = time.perf_counter() - t0

    t0 = time.perf_counter()
    vecs = list(m.embed(texts))
    enc = time.perf_counter() - t0

    meta = next(x for x in TextEmbedding.list_supported_models() if x["model"] == model_id)
    return {
        "runtime": "fastembed",
        "model": model_id,
        "dim": int(len(vecs[0])),
        "max_seq_length": meta.get("tasks", {}).get("max_length") or meta.get("max_length"),
        "size_gb": meta.get("size_in_GB"),
        "load_cold_s": round(load_cold, 2),
        "load_warm_s": round(load_warm, 2),
        "encode_s": round(enc, 3),
        "per_chunk_ms": round(1000 * enc / len(texts), 1),
        "est_900_s": round(enc / len(texts) * TARGET_CHUNKS, 1),
    }


CASES = [
    ("st", "intfloat/multilingual-e5-small"),
    ("fe", "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"),
]


def main() -> int:
    texts = frozen_chunks()
    print(f"# T1-4 게이트 ③ — 임베딩 런타임 택일 실측\n")
    print(f"입력 = 동결 정책 `{FROZEN_POLICY.label}`로 자른 실제 chunk **{len(texts)}건** "
          f"(문서 7건) · 900 chunk 외삽 병기\n")

    rows = []
    for kind, model_id in CASES:
        try:
            r = (probe_sentence_transformers if kind == "st" else probe_fastembed)(model_id, texts)
        except Exception as exc:
            r = {"runtime": kind, "model": model_id,
                 "error": f"{type(exc).__name__}: {str(exc)[:200]}"}
        rows.append(r)
        print(json.dumps(r, ensure_ascii=False))

    out = ROOT / ".workspace" / "scratch" / "embed-probe.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n(원자료: {out.relative_to(ROOT)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
