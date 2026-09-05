# O-33 검증 판정문 — GS-01 live run n=3 (리바이2 52대 · 2026-09-05)

> 대상 = #777 `dd023d0`(O-33 처방 · graph 단계 문서 투영) · 무대 = develop 스택 `:8020`
> 판정 = 🔶 **부분 해소** — 검색 축(「찾지도 못했다」)은 해소 · **인용 축(「말하지 않았다」)은 미해소**
> 구독 소비 **3발**(발주 상한과 동일 · 재시도 0) · production 3면 호출 **0**

## 0. 전제 — 이 창이 무엇을 쟀는가

| 축 | 값(내 손 실측) |
|---|---|
| 무대 `build` | **`dd023d0`** = `origin/develop` tip (`/api/health` 직독 · 전언 아님) |
| `/api/live/status` | `online: true` |
| `:8797` 귀속 | `python.exe -u …/_wt/develop-stage/services/synthesis-gateway/gateway.py` (명령줄) |
| 채점기 | `benchmarks/run-eval-answer-v0.3.mjs` — develop 판 **수정 0** |
| 🔴 교정 게이트 | **13/13 PASS 를 «쏘기 전»에** 세웠다(구독 0). 안 섰으면 `exit 2` 로 전수 거부였다 |
| 대조군 | #758 raw(`02e186f`)를 **같은 채점기로 재채점**(구독 0) · `baselineStable_expect_all_1 = true` |

발사 run: `RUN-5461661f85ad` · `RUN-c3a08a367f91` · `RUN-008cdcab1cba` (usable 3/3 · excluded 0).

## 1. 판정 표 — before(#758 재채점 3 run) vs after(3 run @ `dd023d0`)

| 축 | before | after | 판정 |
|---|---|---|---|
| 근거집합 크기 `runEvidenceCount` | 19 · 19 · 19 | **23 · 23 · 23** | ✅ **19→23** |
| 중복(내 손 raw 직독) | — | raw 23 = unique 23 → **0** | ✅ (그물 밖 축 — §4②) |
| 자극 실재 `DOC-SOP-0014@r2#001` | **False** ×3 | **True** ×3 | ✅ |
| 자극 실재 `DOC-SAF-0029@r3#000` | **False** ×3 | **True** ×3 | ✅ |
| 🔴 **지표 7 `requiredHit`** | **0/2** ×3 | **0/2** ×3 | ❌ **불변 — 개선 없음** |
| 지표 6 `byId`/`byAlias` | 1/1 ×3 | **0/0** ×3 | 🔵 **개선**(발주 기대 「6 불변」과 다르다) |
| 지표 1 narrow/wide | False/False ×3 | False/False ×3 | ✅ 불변 |
| 지표 5 entry / 문장 면 | 0 / 0 | 0 / 0 | ✅ 불변 |
| 지표 8 총 ms | 13156 · 11802 · 13225 (중앙 13156) | 14418 · 13098 · 14310 (중앙 **14310**) | 🔵 중앙 **+1.15s** |
| crossRun 동일성 | 답변 길이·인용 집합 매 run 다름 | 동일 | 비결정 정상(두 열 모두) |

**처방 자기 신고 대조** — graph 단계가 세 run 모두 같은 줄을 냈다:
`경로 5건 · 종단 [CP-204-BRG-01, FM-BRG-WEAR, MR-2024-0004, SAF-LOTO-01, SOP-BRG-INSP-014] · 문서 투영 4건(중복 제외 0건)`
🔴 **산식을 내가 재현했다**: 19 + 4 = **23** — 자기 신고와 내 계수가 맞는다(신고만 믿지 않았다).

## 2. 판정 — 🔶 부분 해소

O-33 은 **B 열(「run 이 찾지도 못했다」)을 고쳤다**: 두 기대 근거가 근거집합에 **들어왔고**(before 전부 False → after 전부 True), 집합이 19→23 으로 늘었다.

그러나 **A 열(「답변이 말하지 않았다」)은 그대로다**: 세 run 모두 `requiredHit = 0/2`.
**근거집합 안에 있는데 인용하지 않는다** ⇒ 남은 0 의 주어는 **검색이 아니라 합성 단계의 인용 선택**이다.
🔴 발주가 기대한 「지표 7 0/2 → 개선」은 **미달**이다.

부수로 갈린 축: 지표 6 이 1→0 으로 내려갔다(`after_safetyNamedInAnswer` True ×3). 즉 **본문에는 안전 규정을 쓰지만, 그 근거를 인용으로 달지는 않는다** — 「본문에 나온다」와 「인용한다」가 갈린 자리다.

## 3. 근거 등급

- **E1(실측)** — §1 표 전부 · 게이트 13/13 · 3 run raw · 자기 신고 대조.
- **E3(소견)** — 남은 원인 후보 = 합성 단계의 인용 선택(또는 인용 허용 목록). 코드 추적은 이 창 밖이다.

## 4. 🔴 회부 2건

① **채점기의 기본 `--out` 이 정본 raw 를 가리킨다.** `--out` 없이 돌리면 `writeFileSync(OUT, '')` 가
   **기준선 raw(`benchmarks/eval-answer-raw-v0.3.jsonl`)를 비운다.** 대조군이 사라지면 이후의 모든 「전후」가 죽는다
   — 되돌릴 수 없는 자원으로 산 3발이 판정력을 잃는다. 처방 = 기본 OUT 을 **정본이 아닌 경로**로 바꾼다.
② **「중복 0」축이 그물에 없다.** 채점기는 근거 id 를 `Set` 으로 접어 `runEvidenceCount`(=unique)만 낸다 —
   **중복은 Set 뒤에서 사라진다.** 이번 「중복 0」은 내가 raw 를 직독해 **raw 개수(23) 대 unique(23)** 로 잰 값이다.
   그물에 넣으려면 두 수를 함께 내고 **심은 중복 1칸**을 교정 게이트에 세워야 한다(늘린 검사가 무는지 같은 실행에서).

## 5. 🔴 자수 1

`--gate-only` 를 **기본 `--out` 으로** 돌려 추적 파일 `benchmarks/eval-answer-raw-v0.3-gate.json` 을 덮었다
(10:37 판 → 12:42 판 · 필드가 달라 diff 369줄). `git checkout` 으로 원복했고 **기준선 raw 3줄은 무사**함을 확인했다.
회부 ①은 이 사고에서 나온 것이다 — 한 칸만 어긋났으면 대조군 자체가 날아갔다.

## 6. 산출물

| 파일 | 내용 |
|---|---|
| `benchmarks/eval-answer-raw-v0.4-o33.jsonl` | 3 run raw(이벤트 원문 · 발사 즉시 파일화) |
| `benchmarks/eval-answer-raw-v0.4-o33-report.json` | 채점 + `calibration` 열(before/after) |
| `benchmarks/eval-answer-raw-v0.4-o33-gate.json` | 교정 게이트 13칸 |
