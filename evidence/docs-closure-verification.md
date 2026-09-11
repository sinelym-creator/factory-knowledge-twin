# DOCS-V — 완결 문서 문면 독검 (검증 좌석 리바이2 63대 · 2026-09-12)

> **대상** = `lane/suzaku-60-docs` `147995d`(README·CHANGELOG·INDEX·runbook 4파일 · 코드 0 · PR #1009) ·
> **기준** = `origin/develop` `c800bda`. 내 트리는 develop 에서 출발했고, 대상 문면은 lane sha 에서 직독했다.
> **측정 모델** — 문서가 «주장»이고, 대조 상대는 리포 실물·`git log`·드릴 실행·시스템 실측이다.
> 구독 0 · production 쓰기 0(읽기도 없음) · 추가 줄 32행.

## 1. 판정

| 축 | 결과 |
|---|---|
| ① 새 링크 경로 실재 | 🟢 **전건 실재** |
| ② CHANGELOG 승격 10~32 sha·PR ↔ `git log origin/main --first-parent` | 🟢 **23행 전건 일치 · 어긋남 0** |
| ③ 인용 수치 ↔ 실물 | 🟡 **대부분 일치 · 회부 2**(README 안에서 갈리는 값 1 · 원장 머리글과 갈리는 값 1) |
| ④ runbook Funnel 복원 행 재실측 | 🟢 **재현 가능한 축 전건 일치** · 🟡 경미 1(계수 범위 미명시) |
| ⑤ 절대경로·secret | 🟢 **0 / 0**(교정 칸 물림 확인) |

**종합** — ②는 FAIL 조건(하나라도 어긋나면)에 걸리지 않았다. ③의 두 줄과 ④의 한 줄만 고치면 전건 일치다.

## 2. ① 링크 축

| 구분 | 계수 | 결과 |
|---|---|---|
| 마크다운 링크 `](path)` | 7 | **7/7 실재** |
| 백틱 파일·디렉터리 이름 | 66 | 전건 실재(행의 디렉터리 문맥 기준) |
| 패턴 표기(`t{n}-{m}-*-verification.md` · `tools/t51_*aggregate.py`) | 2 | 판정 밖(이름틀이지 경로가 아니다) |

실재 확인한 7 링크: `evidence/e2e-stub-stage.md` · `evidence/t5-2-gate7-close.md` ·
`evidence/promo32-external-recheck.md` · `evidence/d21-ws-layer-split.md` · `evidence/t5-5-gate-verdict.md` ·
`docs/decisions/004-release-gate-verdict.md` · `docs/plan/ticket-ledger.md`.
`evidence/promo{26..32}-external-recheck.md` 는 7본 전부 실재한다(`promo26`~`promo32` · `ls` 실측).

🔴 **자수** — 1차 그물은 백틱 이름을 **리포 루트 기준 경로**로 읽어 «없음» 55건을 냈다. 실제로는 INDEX 표의
각 행이 자기 디렉터리(`evidence/`·`benchmarks/`…)를 문맥으로 갖는 이름이다. **문서가 아니라 내 그물이 틀렸다.**
2차에서 문맥 해석을 넣자 미해결 0이 됐다. 55건을 그대로 회부했으면 없는 결함을 지어낼 뻔했다.

## 3. ② 승격 sha·PR 축

`git log origin/main --first-parent` 실물과 1:1 대조.

| 축 | 값 |
|---|---|
| 문서가 주장한 승격 행 | **23**(10~32) |
| sha 가 main first-parent 에 실재 | **23/23** |
| PR 번호가 그 병합의 실제 PR 과 일치 | **18/18**(PR 을 적은 행 전부) |
| PR 번호를 적지 않은 행 | 5(16~20) — 불일치가 아니라 «안 적힘» |
| 서수 단조성(서수 ↑ = main 에서 더 최신) | **참** |

표본: 10 `0c2bc38`#602 · 15 `56d5730`#684 · 21 `d4ebe35`#796 · 23 `2cd75f4`#834 · 26 `30274ba`#909 ·
32 `c35377d`#1006 — 전부 실물과 같다.

## 4. ③ 인용 수치 축

| 주장 | 대조 상대 | 실측 | 결과 |
|---|---|---|---|
| 티켓 원장 68/68 | `docs/plan/ticket-ledger.md` 머리글 | `✅ 68 / 총 68` | 🟢 일치 |
| API 계약 케이스 99건(v0.2.5) | `node tests/contract/run.js` **실행** | **99/99 통과 · 실패 0 · 자기 검증 PASS · 커버리지 63/63** | 🟢 일치(문서를 읽은 게 아니라 돌려서 셌다) |
| 「CI 가 매 PR 에 돌린다」 | `.github/workflows/ci.yml` | `on: pull_request` + `node tests/contract/run.js --quiet --strict-coverage` | 🟢 일치 |
| Gate 7 부분 2건 종결 | `evidence/t5-2-gate7-close.md` | PASS 11 · 조건부 1 · 구조적 면역 1 · 정적 감사 1 · 부분 0 | 🟢 일치 |
| E2E 3 failed = 무대 조건 · 대상 결함 0 | `evidence/e2e-stub-stage.md` | 「대상 결함이 아니라 무대 조건」 · 두 축 모두 대상 결함으로 세지 않았다 | 🟢 일치 |
| 승격 26~32 외부 재검 PASS | `evidence/promo26..32-external-recheck.md` 7본 | **7/7 PASS** | 🟢 일치 |

### 🔴 회부 1 — README 안에서 값이 갈린다 (`README.md:97` vs 새 문단)

`README.md:97` 검증 요약 표 = `| API 계약 | 74/74 |`. 같은 문서의 새 문단(추가분)은 「계약 v0.2.5 기준 **99건**」.
**실측은 99/99**이므로 새 문단이 맞고 **표의 74/74 가 낡았다**. 한 문서 안에 두 숫자가 남아 있으면
독자는 어느 쪽을 믿을지 알 수 없다. → 표 값을 99/99 로 고치거나, 표에 「(v0.1 시점)」 같은 시대 표기를 단다.

### 🔴 회부 2 — 원장 머리글이 아직 「부분 2」다 (`docs/plan/ticket-ledger.md:15`)

머리글은 여전히 **09-06 판정**을 서술한다: `Gate 7 종결 09-06 08:25 … PASS 11 · 조건부 1(③) · **부분 2(①⑨)** …
T5-2 = 부분 착지 유지`. README 는 「부분 2건을 닫아 종결」이라고 말한다. 원장 머리글에 09-11 종결
(`evidence/t5-2-gate7-close.md` · #1004)이 **한 줄도 없다** — 두 SSOT 급 문서가 서로 다른 상태를 말한다.
🔴 원장은 검증 좌석 write scope 밖이라 **고치지 않고 회부**한다.

## 5. ④ runbook Funnel 복원 행 — 내가 직접 다시 쟀다 (`date 00:09:10` · 09-12)

| runbook 주장 | 내 실측 | 결과 |
|---|---|---|
| 재부팅 2026-09-11 09:11:47(`LastBootUpTime`) | `Win32_OperatingSystem.LastBootUpTime` = **2026-09-11 09:11:47** | 🟢 일치 |
| 재부팅 뒤 손대지 않은 상태에서 `funnel status` = `:8443` on | `tailscale funnel status` = **Funnel on** `https://harry.tail488f52.ts.net:8443` → proxy `127.0.0.1:8010` | 🟢 일치(E1 재현) |
| 게이트웨이 `:8787` 생존 | `GET :8787/health` = **401**(문이 살아 있다 · 미인증 거절) | 🟢 일치 |
| 컨테이너 **3본** 생존 | 지금 **running 6본** · 전부 00:03 KST 이전 기동 | 🟡 **범위 미명시** |

🔴 **「3본」이 어느 3본인지 문면에 없다.** 이름이 아니라 **네트워크·DSN 으로 귀속**해 보면
production 스택은 정확히 3본이다: `fkt-deploy-ai-api`(네트워크 `fkt-senku2-t15_default` · DSN 이 별칭
`postgres`·`neo4j` 를 가리킨다) + 그 별칭이 붙은 DB 2본. 나머지 3본은 develop 무대(`fkt-dev-ai-api` ·
`host.docker.internal:5534`/`:7587`)와 그 DB다. **production 3면으로 읽으면 주장은 참**이고,
총계로 읽으면 6이다. → 「production 스택 3본」으로 범위를 적으면 해소된다.

🔴 **이 축의 값은 1회 관측이다**(runbook 도 `E1 (1회)`로 적었다). 재부팅을 다시 일으켜 재현하지 않았다.

## 6. ⑤ hygiene 축

| 축 | 추가 줄 | 4파일 현행본 |
|---|---|---|
| 절대경로(윈도 드라이브 + 사용자 홈 형태·`/home/…`) | **0** | **0** |
| secret 패턴(`ghp_`·`github_pat_`·`sk-…`·`AKIA…`·PEM 머리·평문 password/token) | **0** | — |

🔴 **교정 칸**: 같은 패턴을 심은 줄 3행에 걸어 절대경로 1건·secret 2건을 **물었다**. 그래서 위 0 은
「안 훑어서 0」이 아니다.

## 7. 안 잰 것

- **문장의 «사실 여부»가 아니라 «수치·경로의 일치»만** 쟀다. 서술형 문장(예: 「같은 날 수리·재검증했다」)의
  내용은 이번 축 밖이다.
- **CHANGELOG 09-04·09-05·09-06 절의 산문 주장**(D-84·D-88 등 개별 사건)은 sha·PR 축 밖이라 대조하지 않았다.
- **④ 재부팅 재현 0** — 부팅을 다시 일으키지 않았다. 1회 관측 그대로다.
- **README 표의 다른 행**(골든 10/10 · 예외 25건 23 PASS)은 발주 ③ 목록 밖이라 재지 않았다.
- 승격 16~20 의 PR 번호는 **문서에 없어서** 대조하지 않았다(없는 것을 틀렸다고 하지 않는다).

## 8. 재현

```
git log origin/main --first-parent --format='%h|%s'
node tests/contract/run.js
tailscale funnel status
docker inspect fkt-deploy-ai-api --format '{{range .Config.Env}}{{println .}}{{end}}'
```
