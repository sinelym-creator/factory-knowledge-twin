# T5-3 benchmark-smoke 검색 러너 — 실측 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 08:49 (`date` 실측)
- 러너: `benchmarks/run-benchmark-smoke.mjs` (rc=0)
- 무대: 내 스택 ai-api `127.0.0.1:8852`(`fkt-ai-api:dev-dd1a2e1`) + 내 postgres `fkt-levi2-postgres-1` · **live 합성 0 · 구독 0**
- develop `:8020`·production 무접촉

## 0. 발주 전제 정정 (실물이 발주문을 이긴다)

발주 축은 `/api/search` 라 적었으나 **그 라우트는 ai-api 에 없다**. 실물 검색 표면은
`POST /api/retrieval/compare`(`services/ai-api/app/routers/knowledge.py:245` · 전략 vector·hybrid·graphrag).
러너는 compare 로 간다. compare 는 **allowlist 질문만** 받으므로 표본은 승인 질문에서 고른다.

## 1. 고정 표본 (10문 · 선정 기준 1줄)

**기준**: ground-truth/expected 근거가 «문서(DOC-*)»를 가리키는 질문 — RAG chunk 검색으로
hit@k 채점이 성립하는 것. 구조화 속성 전용(알람 threshold 등)은 제외.

`Q-DIRECT-002 · Q-GOLD-004 · Q-MULTIHOP-001 · Q-MULTIHOP-002 · Q-DIRECT-003 · Q-REV-001 · Q-REV-002 · Q-REV-003 · Q-REV-004 · Q-SAFETY-001` (10문 · 전건 allowlist 소속)

## 2. 지표 (k=5 · 보고 전용)

| id | type | vec doc@5 / chunk-bind / ms | hyb doc@5 / chunk-bind / ms |
|---|---|---|---|
| Q-DIRECT-002 | golden_hard | Y · 1/1 · 107ms | Y · 0/1 · 59ms |
| Q-GOLD-004 | golden_hard | Y · 0/0 · 45ms | Y · 0/0 · 59ms |
| Q-MULTIHOP-001 | multihop | n · 0/2 · 37ms | n · 0/2 · 55ms |
| Q-MULTIHOP-002 | multihop | Y · 1/1 · 39ms | Y · 1/1 · 54ms |
| Q-DIRECT-003 | revision_conflict | Y · 0/1 · 32ms | Y · 0/1 · 38ms |
| Q-REV-001 | revision_conflict | n · 0/1 · 32ms | Y · 0/1 · 48ms |
| Q-REV-002 | revision_conflict | Y · 0/0 · 35ms | Y · 0/0 · 41ms |
| Q-REV-003 | revision_conflict | Y · 0/0 · 32ms | Y · 0/0 · 41ms |
| Q-REV-004 | revision_conflict | Y · 1/2 · 38ms | Y · 1/2 · 41ms |
| Q-SAFETY-001 | safety_rule | Y · 2/3 · 32ms | Y · 1/3 · 40ms |

**요약**:

| 전략 | doc_hit@5 | chunk 바인딩 | ms 중앙값 |
|---|---|---|---|
| vector | **8/10** | 5/11 | 37ms |
| hybrid | **9/10** | 3/11 | 48ms |

- `doc_hit@k` = 기대 문서(DOC-*)의 어떤 chunk 라도 top-k 에 들었는가.
- `chunk 바인딩` = 정본이 지목한 **정확한 chunk id**(`DOC-…@r#`)가 top-k 에 든 수 / 기대 수.
- `ms` = compare 응답의 `elapsedMs`(그 전략 1회 관측치 · baseline §0.2 · 벤치마크 아님).

## 3. 대조군 (같은 실행)

- **A. 무의미 질의**(off-allowlist 랜덤 문자열) → compare **400 거부**. 🔴 vector 검색은
  어떤 질의에도 top-k 를 돌려주므로 「무의미 → hit 0」은 성립하지 않는다 — 무의미 질의의
  실제 거동은 **allowlist 거부**다. 발주의 「hit 0」 프레이밍을 그 사실로 정정해 기록한다.
- **B. 허구 needle**(`DOC-ZZZ-9999#000`) → 전 결과에서 **hit 0**. 실재 needle(정답 chunk)은
  answerable 질문에서 잡히고 허구 needle 은 안 잡힌다 — 그 대비가 hit@k 가 «실제 겹침»만
  센다는 교정 증거다(빈 집합 비교 회피).

## 4. 구조 가드 (실패 조건 · 전건 통과)

| 가드 | exit | 이번 |
|---|---|---|
| 표본 < 8 | 3 | 통과(10) |
| 서버 미도달 | 4 | 통과 |
| answerable 전체 hit 0 | 5 | 통과(doc_hit 있음) |
| 교정 대조군(허구 needle) hit>0 | 6 | 통과(hit 0) |

## 5. Target — 인용 대상 부재 (지어내지 않는다)

발주는 «Target = v0.6 기준선 수치 인용»이라 했으나, **v0.6 기준선은 answer-synthesis/latency
축**(`eval-answer-raw-v0.6-report.json` = perRun·m8 latency·gateCells)이고 **retrieval hit@k
Target 은 존재하지 않는다**(grep 실측 · 리포에 선례 0). 따라서 이 스모크는 **최초의 retrieval
hit@k 기준선**이다 — 위 수치를 그 기준선으로 남기고, **회귀 PASS/FAIL 판정은 다음 대**가 낸다
(§34.3 · T5-3 지시 「판정선 = 보고 전용」).

## 6. 소견 (다음 대 회귀 판정용 · 값 아니라 관찰)

- doc_hit@5 는 높으나(8~9/10) **정확 chunk 바인딩은 낮다**(vec 5/11 · hyb 3/11) — 기대 chunk 가
  top-5 밖에 있거나, multi-evidence 질문(MULTIHOP·SAFETY)에서 일부만 잡힌다. 회귀 기준을 chunk
  단위로 세울지 doc 단위로 세울지는 다음 대의 판정선 설계 사안.
- 이 표본에서 hybrid 가 doc_hit 는 더 높고(9 vs 8) chunk 바인딩은 더 낮다(3 vs 5) — 두 전략의
  순위 산출이 다르므로(코사인 vs RRF) 크기 비교가 아니라 «각 전략 내»에서만 읽는다.

## 7. 정리

- 내 컨테이너 `fkt-levi2-bench`(`:8852`) 측정 후 제거 · postgres 무변(읽기 검색만) · 무대·production 무접촉.
- 러너는 판정선을 보고 전용으로 두고 구조 가드만 실패로 만든다 — 초록이 「무엇이든 잡는다」가
  아님을 대조군 B 가, 「무의미도 통과」가 아님을 대조군 A 가 각각 가른다.
