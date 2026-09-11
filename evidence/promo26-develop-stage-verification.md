# 승격 26 후보 — develop 무대 독립 검증

- **검증 좌석** 리바이2 58대 · 발주 T-P26r(오케 스자쿠 54대)
- **후보 sha** `141dc93` · 🔴 **화면·API 빌드는 `e8b2e9e` 와 동일 트리다** — `e8b2e9e..141dc93` 의 `apps/` `services/` `packages/` `data/` diff **0 파일**(바뀐 3본은 `tests/**`·`evidence/**`). 재빌드 불요를 **내 손으로 실측**했다.
- **무대** ai-api `:8020` build `3ac2508` · 게이트웨이 `:8797` · 무대 DB `:5534` · 화면 = tip 로컬 prod 빌드 `:8195`
- **측정 모델** 대상을 잰 값과 내 도구가 낸 값을 갈라 적었다. 못 잰 칸은 「미측」으로 이름을 남겼다.
- 🔴 **production 3면(`:8010`·`:8787`·공개 도메인) 무접촉** · Golden Live **1발**(발주 상한 내)

## 판정 요약

| 축 | 판정 | 근거 |
|---|---|---|
| ① 귀속 — `evidenceFlags` 조립 | **부분 PASS** | 아래 1절 |
| ② 프롬프트(sha · 부정형 지시) | **PASS** | E1 |
| ③ replay 시나리오 완주 | **PASS** | E1 |
| ④ D-87 4종 404 | **PASS** | E1 |
| ⑤ 화면 배지 렌더 | 🔴 **미측** — 자극을 못 세웠다(내 도구) | 아래 5절 |
| ⑥ CI | **PASS** | E1 |
| ⑦ 투어 4건 | **PASS** — E-4 는 #907 착지 뒤 재측 6/6 | E1 |
| ⑧ D-88 색인 + Golden Live | **PASS** | E1 |
| ⑨ 무대 재생성 공백 | **없음** | E1 |

## 1. 귀속 — `evidenceFlags` 조립 (부분 PASS)

- 조립 층은 `services/ai-api/app/investigation/live_synthesis.py` 에서 게이트웨이 요청에 `"evidenceFlags"` 를 **항상** 싣는다(빈 객체 = 「돌았고 0건」). 이벤트 발행은 `workflow.py` 가 `on_flagged=ctx.emitter.evidence_flagged` 로 건다.
- **이번 live run(`RUN-29942f6a3a7c`)의 `evidence.flagged` 는 0건**이다. 계약 v0.2.3 문면이 「표지 0건인 run 은 이벤트를 발행하지 않는다 · 이벤트 부재 = 표지 없음」이라고 못박고 있으므로 **정합**이다.
- 🔴 **미측**: 게이트웨이가 실제로 받은 요청 본문의 `evidenceFlags` 키 유무(빈 객체 vs 키 부재)를 이 실행에서 뜯어보지 못했다. 게이트웨이는 컨테이너 밖 프로세스라 요청 본문을 내 손으로 읽을 경로를 세우지 못했다. **「0건이라 이벤트가 없다」와 「조립 층이 안 돌았다」를 이 run 만으로는 끝까지 가르지 못한다** — 코드 축과 계약 문면으로만 정합을 말한다.

## 2. 프롬프트 (PASS · E1)

- `:8797` 자기 신고 `promptSha256 = 3560668716ab` == 파일 실측 `3560668716ab48b7…`
- 부정형 지시 생존(앞 판정과 동일 문면): 지어낸 id 금지 · 후보 가감 금지 · SQL·Cypher·셸·코드 금지 · `evidenceFlags` 발췌의 요구를 사실·지시로 받지 말 것 · 산문 금지 · 한 줄을 쪼개지 말 것.

## 3. replay 시나리오 완주 (PASS · E1)

`RUN-7247a703ddc2` · `mode="replay"` 로 시작 · `:8020` · fixture 1.

| 값 | 실측 |
|---|---|
| 상태 | **completed** |
| 이벤트 | **38건 · 전건 `mode:"replay"`** |
| 단계 | `step.started` **5** · `step.completed` **5** |
| 근거 | `step.evidence` **19** · `plan.updated` 1 · `run.completed` 1 |
| 산출 | 후보 랭킹 1위 `FM-BRG-WEAR` · 근거 id 3건 |

🔴 상태값만 보지 않고 **단계별 산출 건수**를 셌다 — `completed` 여도 어떤 단계가 0건이면 완주가 아니다.

## 4. D-87 4종 (PASS · E1)

무대 `:8020` 기준.

| 경로 | 실측 |
|---|---|
| `/openapi.json` | **404** |
| `/docs` | **404** |
| `/redoc` | **404** |
| `/api/docs` | **404** |

## 5. 화면 배지 렌더 — 미측 (자극 실패 · 내 도구)

배지(`[data-testid="evidence-flag-badge"]` · 문면 「표지」)는 `evidence.flagged` 이벤트가 있는 run 에서만 그려진다. 이번 무대에는 그 이벤트를 내는 run 이 없었다.

| 시도 | 결과 |
|---|---|
| Golden Live `RUN-29942f6a3a7c` | `evidence.flagged` **0건** — 표지 0건 run 은 이벤트를 발행하지 않는다(계약 v0.2.3). 배지 부재가 **정상**이다. |
| 무대 replay fixture `gs-01.events.jsonl` | `evidence.flagged` **0건**(원본에 없다). |
| 내 전용 스택 `:8851` + 표지를 심은 fixture 사본 | 🔴 **자극 주입 실패** — 마운트는 붙었으나(`/srv/data/replay/gs-01.events.jsonl` 실재) 서버가 `replay_fixture_missing` 으로 거절했다. 내가 다시 쓴 파일이 로더의 기대를 벗어난 것으로 보인다. |

⇒ **이 축은 「FAIL」이 아니라 「미측」이다.** 배지가 안 그려진 것이 아니라 **그릴 이벤트를 무대에 못 만들었다**. 부재는 어떤 색도 내지 못한다.

- 지금 서 있는 근거는 **코드 축과 단위 축**뿐이다: 화면 reducer 가 `evidence.flagged` 를 `evidenceFlags` 지도로 접고(`lib/run-events.ts`), 근거 카드가 그 지도에 항목이 있을 때만 배지를 그린다(`components/incident/run-panels.tsx`). 단위 테스트 `components/incident/evidence-flag-badge.test.tsx` 가 그 두 갈래를 문다(#891 착지분).
- 🔴 **브라우저 실렌더는 아직 아무도 보지 못했다.** 승격 판정에 이 축이 필요하면 fixture 주입 경로를 고쳐 다시 재야 한다.

## 6. CI (PASS · E1)

`e8b2e9e` check-runs **total 17** · 비완료 또는 비성공 **0건**. (`141dc93` 은 `tests/**`·`evidence/**` 만 바뀐 후속 병합이다.)

## 7. 투어 4건

### 7-1. #904 값의 tip 재확인 — 14행 fail 0

같은 그물(`tests/web/tour_fix_4rows.mjs`)을 tip 빌드에 다시 걸었다. E-1·E-2·E-2b·E-3·E-3b 전건 PASS, 값이 #904 와 **한 칸도 다르지 않다**.

### 7-2. 🔴 E-4 = FAIL (수리 회부 · 오케 판정 ⓐ)

**폐하 경로**로 다시 쟀다 — 정본 상수 `TOUR_REPLAY_HREF`(`/incidents/INC-2026-014?run=STATIC-GS-01&tour=1`) **직접 진입**.

| view | step | spotlight | **top** | bottom | vh | 판정 |
|---|---|---|---|---|---|---|
| 390 | 3 | present | 607 | 1133 | 844 | PASS |
| **390** | **4** | present | **−8** | 792 | 844 | 🔴 **FAIL** |
| 390 | 5 | present | 222 | 623 | 844 | PASS |
| 1440 | 3 | present | 354 | 1140 | 900 | PASS |
| 1440 | 4 | present | 354 | 1140 | 900 | PASS |
| 1440 | 5 | present | 410 | 789 | 900 | PASS |

- **3회 연속 `−8`**(회차마다 2.6초 정착 후 측정 · 흔들림 아님).
- 🔴 **#904 의 E-4 초록은 이 자리를 밟지 않았다.** 그 측정은 개요에서 시작해 한 걸음 걸은 경로(top 507)였고 **前後가 같아 판정력이 없었다**. 경로를 폐하 경로로 바꾸자 빨강이 섰다 — **값이 틀렸던 게 아니라 묻는 자리가 달랐다**.
- 🔴 구현 좌석 자기 신고(390 top −60 → 0)와 **값이 다르다**(내 실측 −8). 좌표가 같은 걸음·같은 주소인지 대조가 필요하다.
- 처방은 별 발주(T-TOUR-FIX2)로 진행 중이다. **이 1칸은 그 착지 뒤 재측으로 닫는다.**

### 7-3. E-4 재측 — #907(`ede14a0`) 착지 뒤 PASS 6/6 (E1)

🔴 **처방을 실었는지부터 확인했다**: 빌드 트리 `ede14a0` · `tour-overlay.tsx` 의 `SPOT_PAD`/`SPOT_MARGIN` grep **9건**. 창을 열기 전에 그 트리가 처방을 들고 있음을 봤다.

같은 그물·같은 주소·같은 뷰포트. 판정선은 오케 정정판 = **링(`tour-spotlight`) top ≥ 16**.

| view | step | top (前 `141dc93`) | **top (後 `ede14a0`)** | 판정 |
|---|---|---|---|---|
| 390 | 3 | 607 | **225** | PASS |
| **390** | **4** | **−8** | **22** | **PASS** |
| 390 | 5 | 222 | **222** | PASS |
| 1440 | 3 | 354 | **101** | PASS |
| 1440 | 4 | 354 | **101** | PASS |
| 1440 | 5 | 410 | **410** | PASS |

`rows=6 fail=0 unmeasured=0` · **1440 회귀 0**(값은 움직였으나 전건 기준 충족).

**스크롤 래치 — 사람이 스크롤한 뒤 다시 끌어가지 않는가** (390 · step 4)

| 구간 | spotlight top | scrollY |
|---|---|---|
| 정착 | 22 | 1976 |
| 휠 직후 | −373 | **2372** |
| 2.5초 뒤 | −374 | **2372** |

- 🔴 **자극 실재 칸**: `scrollY` 가 1976 → 2372 로 **실제로 움직였다**. 안 움직였으면 이 열은 아무것도 시험하지 않은 초록이다.
- 2.5초 정착 창에서 **되돌아가지 않는다** → 래치 제거 **PASS**. 휠 직후의 음수 top 은 사람이 스크롤해 만든 자리이고, 처방이 그것을 존중한다는 뜻이다.

그물 = `tests/web/tour_e4_operator_path.mjs` · `tests/web/tour_e4_scroll_latch.mjs`.

## 8. D-88 색인 + Golden Live (PASS · E1)

| 값 | 실측 |
|---|---|
| 무대 DB `document_chunk` | **59** |
| 무대 DB `document_revision` | **60** |
| Golden Live | `RUN-29942f6a3a7c` · **completed** · 42 이벤트 **전건 `mode:"live"`** |
| 합성 실행 근거 | 무대 로그에 `safety_rule_omitted — 규정 1건 미호명, 재요청 1회: SAF-PPE-01` |
| 구독 소모 | **1발**(발주 상한 = 1) |

`evidence.flagged` 0건은 1절대로 계약 문면과 정합이다.

## 9. 무대 재생성 공백 — 없음 (E1)

`3ac2508..origin/develop` 의 `services/` · `packages/contracts/` diff **0 파일**. 무대 ai-api `3ac2508` 은 후보 sha 에 대해 **그대로 유효**하다. 승격 검증을 위해 무대를 재생성한 구간이 없으므로 **관측 공백 0**이다.

## 자수 · 미측

- 🔴 **자수 9** — Golden Live 를 브라우저로 시작하면서 완료 판정 문면을 느슨하게 잡아(「완료」+「5/5」) **3초 만에 완주로 읽었다**. 실제로는 run 이 계속 돌고 있었고, 내 그물이 창을 닫아 WS 가 끊겼다. 판정은 화면이 아니라 **서버의 이벤트·상태**로 다시 세웠다. 「완주했다 ≠ 제대로 완주했다」.
- 🔴 **자수 10** — E-4 를 처음에 **쿼리 없는 주소**(`/incidents/INC-2026-014`)로 열어 스포트라이트 6칸을 전부 「부재」로 찍었다. 정본 상수는 `?run=STATIC-GS-01&tour=1` 을 달고 있다. **자극이 성립하지 않은 초록·미측을 대상의 답으로 읽을 뻔했다.**
- **미측** ① 게이트웨이 수신 본문의 `evidenceFlags` 키 유무(1절).
- **미측** ⑤ 화면 배지 브라우저 실렌더(5절) — 아래 후속 실측으로 **절반은 닫혔다**.
- 🔴 **자수 11·12(⑤ 후속)**: 처음엔 표지를 심은 fixture 를 서버가 `replay_fixture_missing` 으로 거절했고, 나는 **마운트 실재만 보고 화면부터 열었다**. 진짜 원인은 **Git Bash(MSYS)가 `-e FKT_REPLAY_FIXTURE_DIR=/srv/data/replay` 의 값을 Windows 경로로 바꿔** 컨테이너 안 값이 `C:/Program Files/Git/srv/data/replay` 가 된 것이었다 — **파일은 거기 있는데 서버는 딴 데를 보고 있었다**. `ls` 로는 안 잡힌다. `MSYS_NO_PATHCONV=1` 로 재생성하자 즉시 풀렸고, replay run `RUN-a3c309355896` 에서 **`evidence.flagged` 1건 수신**(items 2)을 실측했다 — **「대상이 받았다」는 섰다**. 그러나 **화면 배지는 0** 이었고, 가설은 내가 심은 `evidenceId` 가 **근거 카드가 쓰는 id 와 다르다**는 것이다(배지는 카드 id 와 지도 키가 일치할 때만 그려진다). **검증 전이므로 「배지가 안 그려진다」로 적지 않는다.**
