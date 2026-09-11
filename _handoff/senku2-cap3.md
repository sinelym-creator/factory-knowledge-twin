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
2. **run 화면 후보 카드 문구 순화 미적용**: 서버 문자열은 `workflow.py:388`(무변이 맞다)인데,
   그것을 «화면에서» 그리는 자리를 이 조각 안에 특정하지 못했다. 못 찾은 채 비슷한 자리를
   고치면 엉뚱한 문장을 바꾸므로 **손대지 않았다**. 안내 1줄(「녹화 재생으로 이어서 보여드립니다」)도 같은 이유로 보류.
3. **프로세스 단위 한계**(오케 승인분): 전역 계수기는 재기동하면 창이 0 으로 리셋되고 워커가 여럿이면
   워커별로 센다. 지금 형상(컨테이너 1본)에서 전역과 동치인 것은 **배치가 그래서**이지 이 코드가
   분산 정확성을 주기 때문이 아니다 — 주장하지 않는다.
