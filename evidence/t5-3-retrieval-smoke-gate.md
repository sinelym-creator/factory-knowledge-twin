# T5-3 benchmark-smoke 회귀 판정선(잠정) — 실측 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 09:00~09:02 (`date` 실측)
- 무대: 내 스택 ai-api `127.0.0.1:8853`(`fkt-ai-api:dev-dd1a2e1`) + 내 postgres · **live 합성 0 · 구독 0** · develop `:8020`·production 무접촉
- 산출: 러너 `benchmarks/run-benchmark-smoke.mjs`(`--gate` 추가) + 기준선 `benchmarks/baselines/retrieval-smoke-v0.6.json` + 근거 이 문서

## 0. 오케 설계 결정 (내 몫으로 등재 · 그대로 구현)

- **판정 단위 = doc_hit@5.** 잠정 목표 = **첫 기준선 자기 자신**(vector ≥ 8/10 · hybrid ≥ 9/10 · 하락 = FAIL).
- **chunk 바인딩 = 보고 전용**(multi-evidence 문항 top-5 밖 = 설계 사안 **O-51**).
- **「잠정 목표」 표기 유지**(baseline §0.2 실측 전 수치) — 기준선 파일 `provisional:true`, 게이트 출력에 명시.

## 1. 기준선 파일 `benchmarks/baselines/retrieval-smoke-v0.6.json`

- `sampleIds` = 10문(§34.3 smoke 표본과 동일) · `k=5`
- `thresholds` = vector `docHitAtK_min:8` · hybrid `docHitAtK_min:9`(n=10)
- `measured` = sha·시각·model(`claude-opus-4-8`)·image(`fkt-ai-api:dev-dd1a2e1`)·vector 8/10·hybrid 9/10
- `provisional:true` + note(「잠정 목표 · baseline §0.2」)

기준선 값은 이 창에서 재측해 확정(vector **8/10** · hybrid **9/10** · #847 값 재현).

## 2. 러너 `--gate` (기본 off)

- `--gate` off(기본): 구조 가드만(측정 성립 여부). 회귀 판정 안 함.
- `--gate` on: doc_hit@5 를 기준선 threshold 와 대조. 표본 id 불일치 시 「비교 불가 FAIL」.
- 🔴 **exit code 분리**: 구조 가드 = **exit 3~6**(「측정 성립」 — 표본<8·서버 미도달·전체 hit0·교정 대조군 hit) · 회귀 게이트 = **exit 10**(「기준선 아래로 하락」). 둘을 한 코드로 섞지 않는다 —
  「검색이 죽었다」와 「기준선 아래」는 다른 사건이고 CI 가 원인을 갈라야 한다.

## 3. 자기 검증 (게이트가 실제로 무는가)

| # | 실행 | 기대 | 실측 |
|---|---|---|---|
| 1 | `--gate` off | rc 0 (구조만) | **rc 0** |
| 2 | `--gate` on · 기준선 그대로 | PASS · rc 0 | **rc 0** · `vector 8≥8 PASS · hybrid 9≥9 PASS` |
| 3 | `--gate` on · 기준선 +1 상향 임시본 | FAIL · rc 10 | **rc 10** · `vector 8<9 FAIL · hybrid 9<10 FAIL` |

- 임시 상향 기준선(vector min 8→9 · hybrid 9→10)은 **scratchpad 에만**(커밋 0 · 워크트리 `status` 에 없음).
- #3 이 게이트의 판정력을 증명한다 — 기준선이 실측보다 높으면 실제로 rc≠0 로 운다.

## 4. 대조군 (유지 · 같은 실행)

- A 무의미 질의 → `/compare` 400 거부(무의미→hit0 불성립 · allowlist 거부가 실거동).
- B 허구 needle `DOC-ZZZ-9999#000` → hit 0(hit@k 가 실제 겹침만 셈).

## 5. 판정

**게이트 자기 검증 PASS** — off/기준선-PASS(rc0)/상향-FAIL(rc10) 3갈래가 기대대로.
회귀 판정선은 **잠정**(doc_hit@5 · 목표 = 첫 기준선 자기 자신) · chunk 바인딩은 보고 전용(O-51).
실제 회귀 PASS/FAIL 운용은 CI 배선(security/bench job = 센쿠2 후속) 이후.

🔴 범위: 판정선 «기계»의 자기 검증이다. 「이 목표가 옳은 회귀 기준인가」(doc vs chunk 단위 ·
목표 상향 여부)는 오케 설계 사안(O-51)으로, 실측 데이터가 쌓인 뒤 다음 대가 재론한다.

## 6. 정리

- 내 컨테이너 `fkt-levi2-bench2`(:8853) 제거(무응답 실측) · postgres 무변(읽기 검색만) · 무대·production 무접촉.
