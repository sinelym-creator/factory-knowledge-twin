# 승격 19 외부 재검 + T7-42 게이트 1·3 (리바이2 52대 · 2026-09-05)

> 대상 = main **`4d39bde`**(#786 · develop `711d318` 병합) · 폐하 승인 22:19 · 집행 = 스자쿠 46·47대
> 판정 = ✅ **PASS**(축 ①②⑤⑥ + 게이트 1·3) · 구독 소비 **1발**(승인분) · 재시도 0
> 🔴 회부 2건(두 기동 경로가 갈린다) · 자수 4건(전부 내 계측기)

## 1. 축 ① — 밖에서 닿는가 · O-18

| 축 | 값(내 손) |
|---|---|
| 공개 `/` | **200** |
| 🔴 **연결 IP** | **`64.29.17.131`**(Vercel edge) — tailnet self 아님 |
| `Tailscale-*` 헤더 | **0건** |
| `X-Vercel-Id` | `icn1::iad1::…` |
| **O-18**(공개 도메인 경유 `/api/health.build`) | **`4d39bde`** = main sha |

🔴 **O-18 은 「화면의 sha 마커」가 아니다** — 원장 정의 = 「머지됐다 ≠ 배포가 그것을 서비스한다 ·
승격 완료 = 배포 `/api/health.build` == main sha」. 내가 처음 찾던 것은 O-18 이 말하는 축이 아니었다(자수 §5-①).

## 2. 축 ② — production API

`:8010 /api/health` → `build` **`4d39bde`** · `status ok` · postgres 1ms · neo4j 0ms · `/api/live/status` `online: true`.

## 3. 🔴 게이트 1 = ✅ PASS (**양면**)

**A면**(자극 = 오케 · 판정 = 나 · `date 22:24:20`) — 메인 체크아웃 `services/synthesis-gateway/system_prompt.txt`
1줄 추가 → 파일 sha256[:12] `db50e21a28b4`(2389B) · `porcelain M` = **자극 실재** ·
그 순간 `:8787 /health` `promptSha256` = **`a71c93b148db` 불변**. 원복 뒤 재확인(`22:25:46`) porcelain **0** · 파일 `a71c93b148db`.

**B면**(자극·판정 모두 나 · `22:25:26` 한 창) — 산출물 `~/.fkt/prod/gateway/system_prompt.txt`:

| 시점 | 산출물 파일 sha | `:8787` 서빙 `promptSha256` |
|---|---|---|
| 기준선 | `a71c93b148db` | `a71c93b148db` |
| **자극** | **`12732000e57f`** | **`12732000e57f`** ← 움직였다 |
| 원복 | `a71c93b148db` | `a71c93b148db`(byte-identical) |

🔴 **B면이 없으면 A면의 「불변」은 「내가 아무것도 안 흔들었다」와 구별되지 않는다.**
두 면이 같은 창에 서서 **production 은 리포가 아니라 산출물을 읽는다**가 증명됐다. 이 창 안 live run **0**.

## 4. 🔴 게이트 3 = ✅ PASS + **두 경로가 갈린다**

집행(오케) `switch.ps1 off` `22:26:27`(pid 45576 종료) → 예약 작업 → autostart 로그 `22:26:31 spawned` · `22:26:39 health ok`.
내 실측(끝점 + 조밀 표본 5회 `22:27:47`~`22:28:07`): `:8787` 리스너 **pid 11332** 고정 ·
명령줄 = `python -u ~/.fkt/prod/gateway/gateway.py`(**산출물 경로**) · 토큰 동반 `/health` **200** ·
`promptSha256 a71c93b148db` · `promptPath` = 산출물. ⇒ **예약 작업이 산출물로 되살린다**(축 성립).

🔴 **다만 두 기동 경로가 같은 상태를 만들지 않는다:**

| 축 | promote/`switch.ps1` 판(pid 45576) | **autostart 판**(pid 11332) |
|---|---|---|
| `/health` **토큰 없이** | **200**(내 손 `22:25:46` 실측) | **401** `X-FKT-Gateway-Token 가 없거나 맞지 않는다` |
| `effort` | `low` | **`medium`**(내 손 · 토큰 동반 `/health`) |
| `model` | `opus` | `opus` |

- **effort** — 폐하 24대 결정 = **opus/low**. 재부팅으로 autostart 가 뜨면 production 이 **승인 밖 effort** 로 돈다. ⇒ **O-40 후보**(오케 등재 예정).
- **토큰** — autostart 는 `-Token` 을 넘기고 promote 판은 안 넘긴 것으로 보인다(거동 실측). ⇒ **promote 직후의 production 게이트웨이는 `/health` 를 인증 없이 답한다.**
  🔴 **못 잰 것(이름으로)**: 합성 엔드포인트까지 무인증이었는지는 **안 쟀다**. 내가 잰 것은 `/health` 한 면뿐이다.

## 5. 축 ⑤ — production live run **1발**(승인분)

`RUN-6e8c6cc7f334` · 22:29:59 발사 · 22:30:17 완주 · usable 1/1.

| 축 | 값 |
|---|---|
| **지표 7 `requiredHit`** | **2/2**(`DOC-SOP-0014@r2#001` · `DOC-SAF-0029@r3#000` 둘 다 인용) |
| **지표 6** `byId`/`byAlias` | **0 / 0** — 안전 규정 `SAF-LOTO-01` **답변에 호명** |
| 근거집합 | raw **23** / uniq **23** / **dup 0** |
| 지표 5 entry·문장 | 0 / 0 |
| 지표 1 narrow/wide | False / False (develop 무대와 동일) |
| 지표 8 총 | **15578ms** |

⇒ D-85 처방이 **production 에서도** 재현됐다(develop 3발 = 2/2·2/2·1/2 · 여기 1발 = 2/2).
🔴 **1발은 빈도를 말하지 못한다** — 「항상 둘 다」는 여전히 별 판정선이다.

## 6. 축 ⑥ — replay 무영향 · 콘솔

브라우저(chromium · 공개 도메인) 4경로: `/` · `/overview` · `/incidents` · `/compare` — **전부 http 200**,
착지 경로 일치(`/compare` 되돌림 없음), 본문 텍스트 201·1498·351·2984자.
🔴 **콘솔 오류 = 0건**(`console.error` + `pageerror` 합산 · 경로마다 2.5초 정착 뒤 수집).
그물 = `tests/web/promo19_external.mjs`(무대·경로를 **인자로** 받는다 — 오늘의 사실을 그물에 박지 않는다).

## 7. 🔴 자수 4건 (전부 내 계측기 · 대상 결함 아님)

1. **O-18 을 「화면 sha 마커」로 오독** — 페이지에서 뽑은 `03d10a7` 은 Next 청크 파일명 조각(`26-by03d10a7t.js`)이었다.
   정규식이 헐거워 **HTML 아무 hex 나** 집었다. 원장 정의를 읽고 정정 — 실제 축은 이미 재고 있었다.
2. **`/api/runs` 로 쐈다가 405** — 실제 경로는 `/api/scenarios/{id}/runs`. **지어낸 입력은 내 무지**다.
   구독은 안 탔다(생성 실패 = 발사 아님).
3. 🔴 **401 을 P0 로 회부할 뻔했다.** autostart 뒤 `/health` 가 401 이길래 「production 합성 경로가 끊겼다」로 읽었는데,
   **내 프로브에 토큰이 없던 것**이었다. ai-api 컨테이너는 토큰 env 를 갖고 있고 `/api/live/status` 는 `online: true`,
   그리고 실제 live run 이 완주했다. **거동으로 확인하기 전에는 빨강의 주어를 정하지 않는다.**
4. **`usable=1/3` 표기** — 채점기의 `RUNS` 기본값이 3이라 1행 raw 를 1/3 으로 적는다. 판정에는 영향 없으나
   보고서 문면이 「2발 유실」로 읽힐 수 있다 — 값이 아니라 표기 문제로 이름 붙인다.

## 8. 근거 등급

- **E1(실측)** — §1~§6 전부(내 손 curl·브라우저·프로세스 조회).
- **E2(출처)** — 게이트 3 집행 시각·autostart 로그 줄(오케 보고) · A면 자극 적용 시각.
- **E3(소견)** — §4 의 「promote 판이 `-Token` 을 안 넘긴다」는 거동에서 역추론(스크립트 인자 직접 확인은 안 함).
