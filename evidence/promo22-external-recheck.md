# 승격 22 외부 재검 — production `5177e74`

- 좌석: 검증(리바이2 53대) · 구독 **0** · production **읽기만**(GET · `docker inspect` · `sha256sum` · replay 1회)
- 🔴 **pre 열은 발주 «전»(`01:28:50`)에 내가 미리 찍어 둔 것**이다 — 승격 21 때 전환 창을 1초 차로 놓쳐
  pre 를 대상 로그로 «복원»해야 했다. 같은 자리를 두 번 밟지 않으려고 발주를 기다리지 않고 잡아 뒀다.
- 등급 **E1** 내 손 · **E2** 대상 기록 · **E3** 소견

## 0. 판정 — **PASS** (6축 전건)

| 축 | 결과 |
|---|---|
| ① 공개면 `/api/health.build == 5177e74` · 밖 근거 | **PASS** |
| ② production `:8010` 전후 2열 | **PASS** |
| ③ 컨테이너 재생성(`.Id` 변경)·`StartedAt` | **PASS** |
| ④ GS-01 replay 1회 정상 종료 + 이벤트 스키마 검증 | **PASS** |
| ⑤ 게이트웨이 401 생존 · promptSha 불변 · `BUILD_SHA` | **PASS** |
| ⑥ Vercel production READY sha == `5177e74` | **PASS** |

🔴 **`5177e74` 는 발주문의 전언이었다.** 내 손으로 **여섯 자리**에서 따로 찍었고 전건 일치한다:
`:8010` · 컨테이너 이미지 태그 · `~/.fkt/prod/BUILD_SHA` · 공개면 · `origin/main` tip · Vercel 배포 메타.

## 1. 전후 2열 (①②③⑤)

| 축 | **pre** `01:28:50` | **post** `01:36:58` |
|---|---|---|
| 공개면 `/api/health.build`(밖) | `4d39bde` | **`5177e74`** |
| 공개면 연결 IP | `64.29.17.131` | `216.198.79.3` (둘 다 Vercel edge) |
| `Tailscale-*` 응답 헤더 | — | **0건** |
| production `:8010` `build` | `4d39bde` | **`5177e74`** |
| 컨테이너 이미지 | `fkt-deploy-ai-api:4d39bde` | **`fkt-deploy-ai-api:5177e74`** |
| 컨테이너 **`.Id`** | `027eb300e700` | **`2a493f80b6fd`** |
| 컨테이너 `StartedAt` | `2026-09-05T13:21:14Z` | **`2026-09-05T16:34:45Z`** |
| 게이트웨이 `:8787` 무토큰 | `401` | `401`(살아서 거절 = 생존) |
| `origin/main` tip | `d4ebe35` | **`5177e74`**(#811) |

- 🔴 **재생성과 재기동을 가른 것은 `.Id` 다.** 이미지 태그만 보면 「바뀌었다」까지밖에 못 말한다.
  구 세대는 `fkt-deploy-ai-api-4d39bde` 로 **보존**되어 `Exited (137)` · `FinishedAt 16:34:44.10Z`,
  신 세대 `StartedAt 16:34:45.06Z` — **약 1초 간격의 교체**가 시각으로 이어진다(E1).
- 🔴 **`promptSha256` 은 자기 신고라 파일과 대조했다**: 게이트웨이 신고 `a71c93b148db`
  == `~/.fkt/prod/gateway/system_prompt.txt` 의 sha256 앞 12자 `a71c93b148db` → **불변 확인**.
  `~/.fkt/prod/BUILD_SHA` = `5177e7485fd0913534ec507d3a611f1e330ed2e3`(전체 sha).
  게이트웨이 `/health` = `bind 0.0.0.0 · authRequired true · model opus · effort low` — 승격 21 상태 유지.

### ① 「밖」의 근거 — 두 vantage

| vantage | 결과 | 연결 IP |
|---|---|---|
| 내 셸 → 공개 URL | `build=5177e74` · 200 | `216.198.79.3`(Vercel edge) |
| **외부 리더(r.jina.ai)** | `build=5177e74` · 200 | `104.26.11.242`(그 서비스의 edge) |

🔴 리더 서비스는 문면을 접을 수 있으므로 **원문과 대조**했다 — 반환된 본문이 origin 응답과
**문자열까지 동일**했다(접힘 0). 공개 URL 을 쳤다는 사실이 아니라 **연결 IP 와 두 번째 vantage** 가 근거다.

## 2. ④ replay 1회 — 「정상 종료」를 무엇으로 봤는가 (E1)

- `POST /api/sessions` → `POST /api/scenarios/GS-01/runs {mode:"replay"}` → **200 `mode:"replay"`**
  (강등이 아니라 요청한 대로) → 폴링 → **`status=completed`** · wall **6.1s**.
- 이벤트 **38건** · `run.started 1 · plan.updated 1 · step.started 5 · step.evidence 19 · step.completed 5 · step.progress 6 · run.completed 1`
- **`mode` 전건 `replay`**(38/38) · **`seq` 단조증가** 참.
- **스키마 검증 = 38/38 통과 · 실패 0**(리포의 `tests/contract/validator.js` + `agent-events-v0.1.schema.json` · 미지원 키워드 0).

🔴 **부재를 초록의 근거로 쓰지 않았다.** `stepCompleted.strategy` 는 replay 이벤트에 **없고**, 그것은
선택 필드라 «정상»이다. 그러나 **부재는 어떤 색도 못 낸다** — 「없으니 통과」는 0건을 훑은 초록이다.
그래서 **같은 이벤트 스트림에 대조군을 심어** 그물이 무는지 물었다:

| 대조군(같은 실행) | 결과 |
|---|---|
| `step.completed` 에 `strategy="graphrag"`(enum 밖) | 오류 **2건** 검출 |
| `step.completed(step=structured)` 에 `strategy="hybrid"` | 오류 **1건** 검출 |

두 대조군이 물었으므로, **38/38 통과는 「검사가 안 돈 초록」이 아니다**(내가 #806 에 넣은
vector 전용 규칙이 production 이벤트 스트림 위에서 실제로 작동함을 함께 보인다).

## 3. ⑥ Vercel production (E1 · 배포 메타)

| 축 | 값 |
|---|---|
| 최신 production 배포 | `dpl_7qw9WX7XwGdAXR4p5g1vBZoFp3Fx` · `state=READY` · `target=production` |
| `githubCommitSha` | **`5177e7485fd0913534ec507d3a611f1e330ed2e3`** == `origin/main` tip |
| `githubCommitRef` | `main` · 커밋 검증 `verified` |
| 직전 production 배포 | `dpl_6dstwX…` = `d4ebe35`(승격 21) → **배포 계수 +1** |

- 발주문의 「apps 변경 0 = 동일 출력」은 **소견(E3)**으로 둔다 — 내가 잰 것은 **배포가 새로 READY 가 됐고
  그 sha 가 main 이라는 사실**이지, 산출 번들이 바이트로 같다는 사실이 아니다.

## 4. 🔴 승격 21 에서 내가 회부한 O-18 축이 이번에 닫혔다

승격 21 재검(`evidence/promo21-external-recheck.md` §5)에서 **공개 `/api/health.build` = `4d39bde`
= 당시 `main~2`** 로, O-18(공개 build marker == main sha)이 **불만족**임을 회부했다(승격 21 의 회귀는
아니었다). 이번 승격 22 는 ai-api 컨테이너를 실제로 교체했고, **공개 build == main tip == `5177e74`** 로
그 축이 **처음으로 성립**한다. 🔴 다만 이것은 **이 시점의 사실**이지 불변식이 아니다 —
`services/ai-api` 를 건드리지 않는 승격에서는 다시 벌어진다(오케 채택 판정 명령 = 빌드 컨텍스트 추종).

## 5. 못 잰 것 · 자수

### 못 잰 것 (이름으로)

1. **번들 동일성** — ⑥ 의 「apps 변경 0 → 동일 출력」은 재지 않았다(E3).
2. **화면 축** — 이번 재검은 `/api/health`·replay·게이트웨이 축이다. 브라우저 화면 렌더는 범위 밖.
3. **live run** — 구독 0 발주라 production 에서 live 를 쏘지 않았다. hybrid 의 production 거동은
   **develop 무대의 r2 결과**(`evidence/t7-44-hybrid-verification-r2.md`)로만 안다.
4. **replay 픽스처의 시대** — replay 이벤트에 `strategy` 가 없는 것은 픽스처가 개정 이전이기 때문이다.
   「production 이 hybrid 로 돈다」를 이 replay 로는 **말할 수 없다**(그건 live 축).

### 자수 (내 계측기)

1. replay 이벤트를 파일로 떨구다 `UnicodeEncodeError`(cp949)로 스크립트가 죽었다 — **대상은 정상 완주**
   (`status=completed` 까지 찍힌 뒤였다). 인코딩을 명시해 다시 돌렸고, 구독 0 이라 재실행 비용은 없었다.
   이 세션에서 **세 번째** 같은 함정이다(콘솔 출력 → 파일 쓰기). 문면이 아니라 **핸들마다** UTF-8 을 박아야 한다.
2. 첫 replay(`RUN-9cafd2d6040c`)와 재실행(`RUN-623a327f9fc8`)이 둘 다 남아 있다. 판정에 쓴 것은
   **두 번째**이고, 첫 번째는 「38건·completed」까지만 관측됐다 — 두 run 의 수치를 섞지 않았다.
