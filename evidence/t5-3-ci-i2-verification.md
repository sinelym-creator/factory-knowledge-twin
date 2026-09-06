# #859 독립 검증 — CI I2(benchmark-smoke.yml 배선 + O-52 install 핀) (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 09:29 (`date` 실측)
- 대상: develop `a3125ff`(#859 병합) push 가 트리거한 GitHub Actions run — **Actions 로그 실물 직독**(코드 축 아님)
- write = `evidence/` 만 · 무대·production·구독 무접촉(로그 읽기만)

## 1. benchmark-smoke.yml run (a3125ff · run `34001368214`) — **success**

job = 「benchmark smoke (골격 · G1b 대기)」 · 러너 = **ubuntu-24.04**. 골격 4 step 로그 직독:

| step | 로그 실측 | 판정 |
|---|---|---|
| 러너 실재 | `러너 176줄`(`benchmarks/run-benchmark-smoke.mjs` 실재) | PASS |
| 인자 계약(--base 필수 = exit 2) | `node … \|\| rc=$?` → **`rc=2 (기대 2)`** | PASS |
| 표본 계수(≥8) | `--base http://127.0.0.1:9`(죽은 무대) → **`rc=4`(기대 4=서버 미도달)** · **`표본 10문`**(Q-DIRECT-002·GOLD-004·MULTIHOP-001/002·DIRECT-003·REV-001~004·SAFETY-001) | PASS |
| SKIP 사유 | `이 워크플로는 오늘 retrieval 을 «재지 않는다» — 측정 불성립(G1b)` · 막는 것 = `data/seed.ps1 이 컨테이너 cp 전제라 러너에서 적재 불성립` · G1b 착지 뒤 켤 절차 명시 | 실재 |

run conclusion = **success** · rc 계약(2)·구조 가드(4)·표본(10)·skip 사유 줄 **전건 Actions 로그에 실재**.

## 2. ci.yml `unit-ai-api` (같은 push · run `34001368242`) — **success**

- step 「pin source is requirements.txt」: `정본에서 읽은 핀: fastapi==0.133.0`(requirements.txt **정본에서 읽음** · 손 핀 아님 · O-52 수리 확증). docker-build 도 `Collecting fastapi==0.133.0 (from -r requirements.txt)` 로 교차.
- **단위 계수(내가 로그에서 센 값 · E1)**: `unit-ai-api` = **72 passed, 12 subtests passed** in 0.66s · `synthesis-gateway` = **16 passed** in 0.07s.
  - 센쿠2 신고 「72+12」와 일치 · **gw 16 은 전언이 아니라 이 로그에서 내가 직독**(전언→E1 승격).
- ci run 8 job 전건 success(unit-ai-api·docker-build·unit-web-console·fixture-schema-db·fixture-schema·hygiene·replay-e2e-smoke·lint-web-console).

## 3. 대조군 — 「수리가 그 자리를 고쳤다」 (같은 step · 前 실패 → 後 rc 0)

직전 실패 run `34001023137`(`ff7c585` · benchmark-smoke) `--log-failed` 직독:

- 실패 step = **「인자 계약 (--base 필수 = exit 2)」** · `##[error]Process completed with exit code 2.`
- 실패판 스크립트: `node … > /dev/null 2>&1` + 다음 줄 `rc=$?`(**`|| rc=$?` 부재**) · shell `bash -e {0}` → 🔴 `bash -e` 가 node 의 «기대된» exit 2 에서 step 을 통째로 죽였다(I1 형태 — 실패를 값으로 못 받음).
- a3125ff(후): 같은 step 이 `node … **\|\| rc=$?**` → `rc=2 (기대 2)` = **rc 0**.

→ 前 실패(exit 2 가 step 을 죽임) → 後 성공(exit 2 를 값으로 받음). **수리가 정확히 그 자리를 고쳤다**(같은 step · 차이 = `|| rc=$?`). 이는 benchmark-smoke.yml 배선 수리다(O-52 install 핀은 §2 별 축).

## 4. 안 본 축 (이름으로)

- **러너 OS = ubuntu-24.04 만** — 다른 OS 미측.
- **실제 검색(retrieval) 축 = skip**(G1b 대기 · `data/seed.ps1` 컨테이너 cp 전제로 러너 적재 불성립) — 이 job 은 «측정 불성립」을 스스로 선언. hit@k 실측은 G1b 착지 후.
- `--gate` off(회귀 판정선 도입은 #852 별건) · 이 검증은 «골격 배선 + 핀 정본 + 대조군» 축만.

## 5. 판정

**#859 PASS** — benchmark-smoke.yml run success(골격 4 계수 로그 실재: 러너 176줄·인자계약 rc2·구조가드 rc4·표본 10·skip 사유) · ci unit-ai-api success(핀 `fastapi==0.133.0` 정본 읽기 · 단위 72+12 / gw 16 로그 직독) · 대조군(ff7c585 인자계약 step 실패 → a3125ff 같은 step rc 0). 안 본 축(OS·retrieval skip·gate)은 이름으로.

🔴 범위: **CI 배선·핀·대조군의 Actions 로그 실측**이다. 실제 retrieval 품질(hit@k)은 이 창에서 «안 봤다»(G1b 대기 — job 자신이 그렇게 선언).
