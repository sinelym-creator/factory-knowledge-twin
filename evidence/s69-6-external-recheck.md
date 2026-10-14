# S69-6 — 운영 외부 재검 (검증 좌석 리바이2 · 2026-10-14)

> **발주** S69-6(스자쿠 · 폐하 12:41 「운영 검증은 했어요?」의 빈칸 — 웹 = 오케 자기 측정뿐 · 토큰 교체 뒤 실합성 왕복 미측).
> **측정 모델** — production 에는 **정상 사용자 행위만**(조회 · live 합성 1회). 재기동 · 재생성 · 설정 변경 0 · 토큰 값 출력 0.
> 🔴 **판정력은 대조 열에서 온다** — ① 은 구판 배포에 같은 계수를 돌려 «갈리는지»로, ③ 은 화면 · events · 게이트웨이 로그의
> **세 독립 면이 같은 수를 말하는지**로, ④ 는 바깥 요청의 타임스탬프가 게이트웨이 로그의 한 줄과 **같은 초**에 맞는지로 선다.

| | |
|---|---|
| 대상 | Vercel production `dpl_HC48zMGjj2osw6r5scqiHvz8jeBa`(meta `githubCommitSha` = `2ac4b06` · alias `factory-knowledge-twin.vercel.app`) · ai-api `:8010` · 게이트웨이 `:8787`(127.0.0.1 · 새 토큰) |
| 구판 대조 | 직전 production `dpl_CS5qA6iYP2sm8aBq3WB9YJ8fzU5f`(main `405ba19` · next 16.3.3 시대) |
| 측정 창 | 12:44 ~ 12:53 (KST) |
| 계기 | `tests/web/_s69_6_build_marker.mjs` · `_s69_6_screens.mjs` · `_s69_6_live_once.mjs`(이 PR) |

## 판정 = **PASS**(4축)

| 축 | 결과 | 근거 |
|---|---|---|
| ① 새 판 반영 | 🟢 | 아래 §1 — 서빙 바이트의 next 지문이 `16.3.8`, 구판 열은 `16.3.3`으로 **갈린다** · 별칭 → `2ac4b06` |
| ② 화면(브라우저) | 🟢 | §2 — hydration 2근거 성립 · 4화면 콘솔 오류 **0** · pageerror 0 · 4xx/5xx 0 |
| ③ 실합성 1회 왕복 | 🟢 | §3 — run 완료 30s · 배지 `data-axis=live` · 게이트웨이 `POST /synthesize 200` · 근거 23 = events 23 |
| ④ 두 vantage | 🟢(부분 미측 1칸) | §4 — 이 호스트(연결 IP = Vercel 엣지) + 제3자 fetch(r.jina.ai) · 청크 JS 칸만 리더 거부(422) |

## 1. 새 판 반영 — 서빙 바이트의 지문 (구판 대조 열)

**교정 먼저**: 버전을 아는 로컬 빌드 2개(S69-4 의 base `73979df` · PR `2347061`)의 `.next/static` 에서
`["']16.x.y["']` 리터럴이 각각 `"16.3.3"` 1건 · `"16.3.8"` 1건 — 지문이 버전으로 갈린다.

| 열 | HTML 이 가리키는 청크(같은 자리 = 두 번째 async 스크립트) | 그 청크의 next 리터럴 | buildId |
|---|---|---|---|
| 공개 별칭(이 호스트 · 12:44) | `3iwc6f5ls7c4b.js` (229,598B) | **`"16.3.8"` ×1** | `MjFFLOHUEKzYh5m14HN1o` |
| 구판 `dpl_CS5q…`(Vercel 보호 → MCP `web_fetch_vercel_url` 로 HTML) | `3395bk_qz157b.js` (229,602B) | **`"16.3.3"` ×1** | `_7G5pLs9_EIyj3bb-VDI6` |

- 공개 HTML 의 정적 청크 10개 전부 200 · 버전 리터럴은 위 1개뿐. 공개 HTML 에 구판 청크명 **0회**.
- Vercel API `get_deployment(factory-knowledge-twin.vercel.app)` = `dpl_HC48…` · `githubCommitSha 2ac4b06` · READY · aliasError null.
- ⚪ 구판 청크 본문은 공개 도메인에서 받았다(immutable 자산이 남아 있어 200). 그 청크가 «구판의 것»이라는 귀속은 MCP 로 받은 구판 HTML 의 참조에서 온다.

## 2. 화면 — 브라우저(Playwright 1.62.1 · chromium) · live 미사용

| 화면 | 결과 | 콘솔 오류 | pageerror |
|---|---|---|---|
| `/` 입구 | SSR `mode-badge[data-mode]` = `checking` → **누르지 않았는데** `/overview` 로 넘어감(EnterForm 자동 제출) · 세션 쿠키 발급 | 0 | 0 |
| `/overview` | `start-from-alarm` 가시(ai-api 데이터가 섰다) · testid 32 · `/api/live/status` 200 `online:true` · 배지 `live` | 0 | 0 |
| `/incidents/INC-2026-014?run=STATIC-GS-01` | `run-status` = 완료 · testid 51 | 0 | 0 |
| `/compare` | testid 17 | 0 | 0 |

- hydration 근거 = ⓐ 자동 제출(클라이언트만 할 수 있다) ⓑ `data-mode` 가 SSR 값 `checking` → `live` 로 바뀜.
- ⚪ `/compare` 의 배지는 4s 창 끝에도 `checking` 이었다(판정 축 아님 · 창 길이 탓인지 미판별).

## 3. 실합성 1회 왕복 — 공개 화면 → ai-api → 게이트웨이(새 토큰) → 결과 표시

손잡이 = overview `start-from-alarm`(main `start-investigation.tsx` → `startRunBrowser(…, "live")` — 소스로 확인 · **1회 클릭 · 재시도 0**).

| 면 | 값 |
|---|---|
| 화면 | t0 12:51:01 클릭 → `RUN-1f4114dd7035` · 대기 → 조사중 → **완료(30s · 12:51:32)** · `synthesis-badge[data-axis]` = **`live`** · 「live 합성 claude-opus-5-5」 · 거부 사유 칸 없음 |
| events(`/api/runs/{id}/events` · 같은 쿠키) | 200 · 41건 = run.started 1 · plan.updated 1 · step.started 5 · step.progress 5 · **step.evidence 23** · step.completed 5 · run.completed 1 |
| 게이트웨이 접근 로그 | **`12:51:24 "POST /synthesize HTTP/1.1" 200`** · `12:51:28 synthesize 채택 · 후보 2 · **근거 23** · 벽시계 20970ms · claude-opus-5-5` |
| 앞뒤 `/health` | 12:50:58 · 12:51:30 · 12:51:39 = **200**(토큰 실음) — `liveStatus.checkedAt` 03:51:00 / 03:51:39Z 와 맞물린다 |

- 측정 창(12:50:55 ~ 12:51:42) 안 `/synthesize` 는 이 1건뿐 — 귀속은 시각 + **근거 23 = events 23** 두 축.
- ⚪ 같은 run 화면에서 콘솔 오류 5건 = 모두 `wss://…/api/ws/runs/RUN-1f4114dd7035` 핸드셰이크 404. Vercel 이 WS 업그레이드를 넘기지
  않아 셸이 **설계된 폴링 폴백**(`/api/runs/{id}/events` 200 — 같은 창 apiCalls)으로 내려간 자국이다. 이 판(#1025 = package·lock 만)의
  코드 변경과 무관한 구조로 귀속하나, **구판 열은 미측**이다(구판에서 live 1회를 더 쓸 수 없었다).

## 4. 두 vantage

| vantage | 무엇을 쟀나 | 연결 근거 | 결과 |
|---|---|---|---|
| 이 호스트 | §1 · §2 · §3 전부 | curl `remote_ip` = `64.29.17.67` · Playwright `serverAddr` = `64.29.17.3`(Vercel 엣지 · 공인) | 위 표 |
| 제3자 fetch(r.jina.ai) | 공개 `/` HTML · `/api/live/status` · 청크 JS | 리더 경유(연결 IP `104.26.10.242` = 리더 ingress) | HTML 이 새 청크 `3iwc6f5ls7c4b` 참조 **1** · 구판 청크 **0** / live status 200 `online:true` · **`checkedAt 03:53:08.628Z` = 게이트웨이 `12:53:08 GET /health 200`**(바깥 요청이 게이트웨이까지 새 토큰으로 닿았다) / 청크 JS = **422**(리더가 JS 거부 · 이 칸 미측) |

- ⚪ ai-api · 게이트웨이 구간은 어느 vantage 에서든 Vercel → funnel 경로를 지난다(셸 rewrite). 외부 vantage 에서 **live 합성 자체**는 돌리지 않았다(발주 상한 1회를 §3 에 썼다).

## 5. 덤 관측 — 게이트웨이 로그의 토큰 불일치 401 (판정 무관 · 귀속 완료)

재기동(11:47) 뒤 로그에 `/health 거부 · 토큰 불일치` 401 이 반복된다. 귀속:

| 시각 | 귀속 |
|---|---|
| 11:48:02 | 오케 무토큰 확인(보고값) |
| 11:49:27 · 11:49:39 | 리바이2 S69-2 2단 ⓑⓓ 의 음성 열(none · wrong) |
| 11:52:15 · 12:07:14 · 12:22:14 · 12:37:15 | 예약 작업 `FKT-Docker-Health-Watch`(`~/.fkt/docker-health-watch.ps1` L43 · 15분) — 같은 초에 `ok … gw=up` 이 남는다. 이 감시는 **설계상 401 도 «살아 있음»**(L44)으로 센다 |
| 11:52:36 · 12:17:13 | **미귀속** 2건 |

🟡 권고(후속 · 판정 무관): 감시가 토큰 없이 치므로 「살아 있다」와 「인증이 통한다」를 가르지 못한다. 401 을 생존으로 세는 것은 의도이나, 토큰 회전 뒤 인증 경로가 깨져도 이 감시는 초록이다.

## 6. 안 잰 것

- 구판 열의 WS 404(§3 ⚪) · 외부 vantage 의 청크 JS 지문(§4 · 422) · 외부 vantage 에서의 live 합성.
- 세션 뒤 화면 중 작업지시서 · evidence 상세(이번 발주의 «주요 화면» 밖).
- 합성 «본문»의 내용 품질 — 옮기지 않았다(종류 · 건수 · 축만).

## 7. 재현

```
cd tests/web && npm ci
node _s69_6_build_marker.mjs https://factory-knowledge-twin.vercel.app       # ① 공개 열
node _s69_6_screens.mjs                                                     # ② live 미사용
node _s69_6_live_once.mjs            # --go 없이 = 손잡이 가시만 확인(exit 2 · 구독 0)
node _s69_6_live_once.mjs --go       # ③ 🔴 live 합성 1회 소모
curl -s -H 'X-Return-Format: html' https://r.jina.ai/https://factory-knowledge-twin.vercel.app/   # ④ 외부 열
```
