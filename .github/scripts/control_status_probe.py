"""대조군 前 열의 «요청별 상태코드»를 남긴다 (T5-3 G1c 소조각 · 리바이2 회부).

🔴 왜 러너의 `--out` 이 아니라 이 스크립트인가 — **러너는 그 파일을 못 쓴다.**
   `run-benchmark-smoke.mjs` 는 구조 가드(`anyHit` 없음 → `process.exit(5)`)에서 «먼저» 끝나고,
   `--out` 쓰기는 그 뒤 줄에 있다(현 develop 판 118행 exit 5 · 172행 writeFileSync). 색인 0
   국면에서는 exit 5 가 항상 먼저 나므로 `--out /tmp/ctrl.json` 을 줘도 **파일이 안 생긴다**.
   러너를 고쳐 쓰기를 가드 앞으로 옮기는 것이 정공이지만 그건 `benchmarks/**`(검증 좌석) 이라
   이 티켓의 write scope 밖이다 — 그래서 «두 번째 계측기»로 같은 질문에 답한다.

🔴 두 번째 계측기라는 사실을 숨기지 않는다. 다만 **표본은 러너와 같은 정본에서 읽는다**
   (`benchmarks/datasets/*.jsonl` · 같은 「근거가 DOC-* 를 가리키는 질문」 필터). 손으로 옮겨
   적은 질문 목록을 쓰면 러너가 실제로 보낸 것과 조용히 갈라진다.

이 스크립트가 답하는 것 하나: **대조군의 hit 0 이 «200 응답 위에서» 난 것인가.**
   4xx/5xx 위에서 난 hit 0 은 「색인이 없어서」가 아니라 「요청이 도달하지 못해서」일 수 있고,
   그 둘은 같은 0 으로 보인다.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("BENCH_BASE", "http://127.0.0.1:8000").rstrip("/")
DS = os.path.join("benchmarks", "datasets")
DOC = re.compile(r"DOC-[A-Z]{3,4}-\d{4}")


def _read(name: str) -> list[dict]:
    with open(os.path.join(DS, name), encoding="utf-8") as f:
        return [json.loads(l) for l in f if l.strip()]


def _post(path: str, body: dict, cookie: str | None) -> tuple[int, dict | None, str]:
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode("utf-8"),
        headers={"content-type": "application/json", **({"cookie": cookie} if cookie else {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read().decode("utf-8", "replace")
            set_cookie = (r.headers.get("set-cookie") or "").split(";")[0]
            return r.status, (json.loads(raw) if raw else None), set_cookie
    except urllib.error.HTTPError as e:      # 4xx·5xx 도 «응답»이다 — 상태코드를 살려서 돌려준다
        return e.code, None, ""
    except Exception as e:                    # noqa: BLE001 — 도달 실패는 상태코드가 «없다»
        print(f"  도달 실패: {e}", file=sys.stderr)
        return 0, None, ""


def main() -> int:
    questions = _read("questions.v0.3.jsonl")
    gt = {g["id"]: g for g in _read("ground-truth.v0.3.jsonl")}

    def ev_of(q: dict) -> list[str]:
        return list(gt.get(q["id"], {}).get("required_evidence", [])) + list(q.get("expected_evidence", []))

    sample = [q for q in questions if DOC.search(" ".join(ev_of(q)))]
    if len(sample) < 8:
        print(f"::error::표본 {len(sample)} < 8 — 러너와 같은 필터인데 표본이 다르다", file=sys.stderr)
        return 3

    status, body, cookie = _post("/api/sessions", {}, None)
    if status != 200 or not body:
        print(f"::error::/api/sessions {status} — 세션을 못 열어 상태코드 열 자체가 성립하지 않는다", file=sys.stderr)
        return 4
    sid = body["sessionId"]

    print(f"표본 {len(sample)}문 × 전략 2 (러너와 같은 정본·같은 필터)")
    print("id                strategy | status | hits")
    rows, codes, hits_total = [], set(), 0
    for q in sample:
        for strat in ("vector", "hybrid"):
            st, jb, _ = _post("/api/retrieval/compare",
                              {"sessionId": sid, "question": q["question"], "strategies": [strat]}, cookie)
            n = len(jb[0].get("hits", [])) if (st == 200 and isinstance(jb, list) and jb) else None
            codes.add(st)
            hits_total += n or 0
            rows.append({"id": q["id"], "strategy": strat, "status": st, "hits": n})
            print(f"{q['id']:<17} {strat:<8} | {st:>6} | {'-' if n is None else n}")

    out = os.environ.get("CONTROL_PROBE_OUT")
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"base": BASE, "n": len(rows), "statuses": sorted(codes),
                       "hitsTotal": hits_total, "rows": rows}, f, ensure_ascii=False, indent=2)
        print("JSON →", out)

    print(f"\n상태코드 집합 {sorted(codes)} · 요청 {len(rows)}건 · hit 총합 {hits_total}")
    # 🔴 이 스크립트의 판정선은 «hit 0» 이 아니라 «200 위의 hit 0» 이다. 200 이 아니면 그 0 은
    #    색인 부재의 증거가 되지 못한다(도달 실패도 같은 0 으로 보인다).
    if codes != {200}:
        print(f"::error::상태코드가 200 뿐이 아니다 {sorted(codes)} — 이 hit 0 은 색인 부재의 증거가 아니다", file=sys.stderr)
        return 1
    if hits_total != 0:
        print(f"::error::색인 0 인데 hit 총합 {hits_total} — 대조군 전제가 깨졌다", file=sys.stderr)
        return 1
    print("판정: 前 열 status 전건 200 · hit 0 — hit 0 은 «응답 위에서» 났다")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
