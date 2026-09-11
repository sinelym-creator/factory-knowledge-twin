# CAP3 — 계약 v0.2.4 구현 (센쿠2 55대)

base = `origin/develop` **6544615**(생성) → `adcc08c`(v0.2.4 화면 문면 개정 병합분) 위 · lane `lane/senku2-cap3`
값은 전부 **정본**(`packages/contracts/rest-api-v0.1.md` v0.2.4)에서 읽었다 — 발주 요지의 숫자를 코드·검사기에 박지 않았다.

## 1. 한 것

**ai-api** — `run_cap_per_session` 5→**3**(「3→5」 사유 문단을 «역방향»으로 갱신: 원칙은 그대로고 문서값이 바뀌었다) ·
`run_cap_global_per_hour` **3** 신설 · 전역 계수기는 **같은 `SessionRunCap`** 을 고정 키(`GLOBAL_RUN_CAP_KEY`)로 쓴다
(창 만료·`admit`/`peek` 분리·`limit<=0`=끄기 규율이 이미 거기 성문돼 있어 베끼면 둘이 갈린다 · 창은 계약대로 3600 고정) ·
`LiveHourlyCapExceeded`(429 `live_hourly_cap_exceeded` · `Retry-After` + 본문 4칸 · `remaining` 상수 0) ·
판정 순서 **세션 → 전역 → 동시**(거절은 다음 축에 도달하지 않으므로 «거절 미계수»가 순서로 집행된다) ·
`/live/status` = `online` 3조건 AND · `reason` 3종(우선순위 = 계약 순서) · `until`(서버가 계산) · `hourlyCap`(세션 쿼리 회차) ·
`probe_live_state()` 가 **한 번의 `/health`** 에서 도달+걸쇠를 함께 읽는다(둘이 다른 순간의 사실이 되지 않게).

**게이트웨이** — `synth { lastOutcome, lastAt, consecutiveFailures, latchedUntil }` 를 `/health` 에 싣는다 ·
기록 축 **넷**(CLI 부재·타임아웃·종료코드·봉투 `is_error`) · 🔴 `evidence_binding` 거부는 **세지 않는다**(품질 실패로 Live 를 닫지 않는다) ·
실패 1회 = 걸쇠(`FKT_SYNTH_FAIL_LATCH_SEC` 900) · 성공 1회 = 즉시 해제 · 만료는 **읽는 자리에서** 없는 것으로 낸다(주기 태스크 0) · 값·문구 유출 0.

**화면** — `data-mode` 집합 불변 · `online:false` 의 `why` = `reason` 별 문장 3종(금칙어 0 · 시각은 `until` 을 **받아** HH:MM 표기만) ·
🔴 **횟수도 응답에서 읽는다**(`hourlyCap.limit`) — 화면에 3 을 박으면 운영자가 상한을 바꾼 날 화면만 옛 숫자를 말한다 ·
`data-why` 속성 추가(터치 기기엔 `title` 이 안 보여 「문장이 섰는가」를 아무도 못 잰다 · 레이아웃 무변) ·
`RunCapCounter` 에 시간당 잔여 **있을 때만** 덧붙임.

**문서** — `services/ai-api/README.md` 기본값 표 3 + 전역 상한 행(프로세스 단위 한계 명시).

## 2. rc (전건 실측)

| 축 | 값 |
|---|---|
| ai-api `pytest` | **97 passed + 12 subtests**(신규 5본 포함) |
| gateway `pytest` | **23 passed** |
| web-console `lint` | **0** |
| web-console `test:unit` | **0** |
| web-console `build` | **0** |
| `npx tsc --noEmit`(build 뒤) | **0** |

## 3. 🔴 안 한 것 / 안 잰 것 — 다음 조각의 첫 줄

1. **거동 판정선(ⓔ) 미측**: 「4발째 429」·「세션 3개×1발 뒤 전역 429」·「거절 미계수(peek 불변)」·
   「CLI 오경로 주입 → `/health.synth` → `/live/status` → 배지」·「`online:true` 바이트 前後 동일」은
   **무대를 세워 재야 하고, 상한 60분 안에 들어가지 않았다**. 단위 축(계수기·걸쇠 판독)만 섰다.
2. ~~run 화면 후보 카드 문구 순화 미적용~~ → **CAP3-2 에서 닫았다**(§4).
3. **프로세스 단위 한계**(오케 승인분): 전역 계수기는 재기동하면 창이 0 으로 리셋되고 워커가 여럿이면
   워커별로 센다. 지금 형상(컨테이너 1본)에서 전역과 동치인 것은 **배치가 그래서**이지 이 코드가
   분산 정확성을 주기 때문이 아니다 — 주장하지 않는다.

## 4. CAP3-2 — 화면 자리 특정분 (오케가 실물 grep 으로 짚어 준 좌표)

- `run-panels.tsx:155~164` `SynthesisBadge` — `live-rejected` 낱말 「live 거부」 → **「기록 기반 집계」**.
  아이콘·`data-testid`·`data-axis` **불변**(계측 그물 보존 · 낱말만 바뀐다).
- `run-panels.tsx:249~` 안내 문단 — 🔴 **조건을 `axis === "live-rejected"` 하나로 좁혔다**(오케 승인).
  앞판은 `&& synthesis.rejectedReason` 이라, `live-rejected` 가 CLI 오류·타임아웃으로 온 회차에
  사유 문자열이 비면 **안내가 통째로 사라졌다** — 「run 완주 안내 1줄 = 이 문단」이라는 전제가
  바로 그 회차에서 깨지는 자리였다. 이제 **문장은 항상**, 원문은 **있을 때만** `<details>` 안에.
- 문면 = 「실시간 분석 대신 기록 기반 집계로 이어서 보여드립니다. 아래 순위는 집계 결과입니다.」
  (원인을 말하지 않는다 — 회차마다 다르고 화면은 그것을 가를 정보가 없다 · 금칙어 0)
- 원문은 **숨기지 않고 접는다**: `<details>` 는 터치에서도 열린다(툴팁은 hover 없는 기기에서 사라진다).
- 단위 그물 1본(`components/incident/synthesis-wording.test.tsx` · 4 케이스) — 🔴 판정선은
  「사유가 비어 오는 회차에도 문장이 선다」다. 「문장이 보인다」만 재면 앞판의 구멍이 그대로 통과한다.
- rc 재측: web-console `lint` **0** · `test:unit` **47 passed**(신규 4) · `build` **0** · `tsc`(build 뒤) **0**.

## 5. CAP3-FIX — 독검 결함 1(D-1) + 회부 1(O-2)

### ⓐ D-1 — 전역 거절이 세션 1회를 먹었다 (리바이2 4/4 재현)

- **뿌리**: 두 축이 각자 `admit`(판정+기록 한 호출)이었다. 세션이 먼저 세고 나서 전역이
  거절하면 **되돌릴 자리가 없다** — 거절인데 소모된다(계약 v0.2.4 ① 「어느 하나라도 거절이면
  계수하지 않는다」 위반). 앞판 주석의 「순서가 그 규율을 집행한다」는 **한 방향만** 참이었다.
- **처방 = 예약-확정 2단**: `SessionRunCap.check`(판정 · 기록 0) + `.commit`(기록)으로 가르고,
  라우트는 **두 축을 `check` → 둘 다 통과한 뒤 두 축을 `commit`** 한다. `admit` 은 `check+commit`
  으로 남겨 축이 하나뿐인 호출부와 기존 단위를 그대로 통과시킨다.
- 두 축이 **같은 `now`** 를 본다(각자 시계를 읽으면 창 경계에서 판정이 시각 차로 갈린다) ·
  `check`~`commit` 사이에 `await` 없음(동기라야 마지막 자리를 둘이 함께 받지 않는다).
- 🔴 순서 규칙을 **라우트 밖 함수**(`_admit_run_caps`)로 꺼냈다 — 인라인이면 「거절 뒤 계수
  불변」을 무대 없이 증명할 수 없다. 규칙이면 단위로 재야 한다.
- 단위 4본(`tests_unit/test_cap3.py`): 전역 거절 뒤 세션 `used` 불변 · 세션 거절 뒤 전역 `used`
  불변 · 🔴 **대조군「통과는 양쪽 다 정확히 1」**(없으면 「아무것도 안 세기」가 위 둘을 통과시킨다) ·
  `check` 는 안 세고 `commit` 은 센다.
- 🔴 **known-true 실측**: 낡은 순서(`admit`×2)를 일부러 되살리니 `test_global_refusal_…` 이
  `assert 1 == 0` 으로 **빨강**(= 결함의 정확한 모양) · 되돌리니 9/9 초록. 그물이 이 결함을
  실제로 잡는다는 것을 본 뒤에 초록을 값으로 쓴다.

### ⓑ O-2 — 배지 사유가 툴팁 전용이었다

- `live-status.tsx` `ModeBadge` 에 사유를 **본문 한 줄**로 세웠다(`data-testid="mode-badge-why"`).
  `title` 은 hover 가 있어야 보이고 폐하 기기는 터치라 그 표면뿐이면 「숨긴 것과 같다」
  (`run-panels.tsx:150~153` 규약). 기존 배지 레이아웃 **안** · `data-mode`·`data-why` **불변**.
- **혼잡 회차에는 붙이지 않는다** — 혼잡 문장이 이미 자기 사유를 말한다(같은 말 2회 방지).
- 단위 4본(`components/mode-badge-why.test.tsx`): 🔴 판정선은 **`title="…"` 를 지운 마크업에
  사유가 남는가** · 대조군 2(사유 없음 = 조각 없음 · 혼잡 = 조각 없음) · `data-mode` 불변.
- known-true: 본문 조각을 빼니 판정선 1본만 빨강 · 되돌리니 4/4 초록.
- `LiveContext` 를 export 했다 — **단위 측정 하나 때문**이다(Provider 는 fetch·폴링을 함께
  끌고 온다). 앱 소비 경로는 `useLiveStatus()` 그대로.

### ⓒ rc 전수 재측 (`date 17:16:37`)

| 축 | 값 |
|---|---|
| web-console `eslint .` | rc **0** |
| web-console `next build`(`FKT_API_BASE` 지정) | rc **0** |
| web-console `tsc --noEmit`(build 뒤) | rc **0** |
| web-console `vitest run` | **51 passed**(신규 4) |
| ai-api `pytest tests_unit` | **101 passed + 12 subtests** |
| synthesis-gateway `pytest` | **23 passed** |

### 안 잰 것 (CAP3-FIX)

- **동시성**: 2단 사이가 동기라는 것은 코드로 보증했을 뿐, 워커 다수·경합 부하로 **재지 않았다**.
- **거동 축**: 실제 429 두 종이 화면에서 어떻게 보이는가는 무대 몫(독검) — 이번에도 안 세웠다.
- **색·대비·좁은 폭 겹침**: 사유가 배지 안에서 한 줄 늘어난 만큼 폭이 는다. `renderToStaticMarkup`
  은 CSS 를 모른다 — 브라우저 층에서 재야 한다(재검 ③ 후보).
