# 승격 9회차 — 외부 재검 (공개면)

> 리바이2 42대 · 2026-09-04 · 대상 = `https://factory-knowledge-twin.vercel.app`
> (main `7151c2c` · #595 병합 14:04:39 · Vercel completed) · 발주 = 스자쿠 36대 14:08.

## 0. vantage — 「밖에서 붙었다」를 «수»로 (E1)

공개 URL 을 쳤다는 사실은 밖의 근거가 아니다(같은 URL 이 tailnet self 로 붙을 수 있다). 그래서
**연결 IP** 를 먼저 남긴다.

| | 실측 |
|---|---|
| DNS | `factory-knowledge-twin.vercel.app` → `216.198.79.3` · `64.29.17.3` |
| 연결 IP(curl) | **`64.29.17.3`** |
| 연결 IP(브라우저 세션 전 응답) | **`64.29.17.3`** · **`216.198.79.67`** — **사설·tailnet 대역 0건** |
| 헤더 | `Server: Vercel` · `X-Vercel-Id: icn1::iad1::…` |
| 기본 | `GET /api/health` **200** · `GET /` **200** |

## 1. 축별 — 「번들 적재 / 화면 실측 / 안 잼」

| 축 | 번들 적재 | 화면 실측 | 안 잼 |
|---|---|---|---|
| **D-51** 사유 문면(#588) | 클라 번들 **0건** (아래 🔴) | **공개 SSR 원문**: `/documents/NOSUCHDOC` 200 · `data-testid="screen-unavailable"` · `data-kind="not-found"` · **`data-why="document NOSUCHDOC 를 찾을 수 없다"`** · 문면 「사유: **서버에 닿지 못했습니다.**」 | 상류 단절(`TypeError`) 열 · `HTTP 503` 열 — 공개면엔 자극 무대가 없다 |
| **D-52** 포인터 가드(#590) | `pointerdown` = **3청크** ✓ | 투어 OFF 클릭 `/overview` → `/compare` ✓ · 투어 1걸음 열림 ✓ / 닫힘 ✓ · **닫은 뒤 클릭도 통함** ✓(규격 ⑤) | **강제 열**(실제 구형 엔진 · 여기선 안 만든다) · 터치 축 |
| **D-49** 혼잡 배지(#586) | `data-congested` = **1청크** ✓ | `[data-congested]` 노드 **0** — 무대가 없으니 **존재 판정만** | 혼잡 실자극(공개면에 무대 없음) |
| 배지 | — | `mode-badge` = **「◉LIVE」** ✓ | — |
| 콘솔 | — | 오류 **0** · `requestfailed` 3건 = 전부 `ERR_ABORTED`(클라 내비 중 RSC 프리페치 취소) | — |

번들 = 그 세션이 **실제 로드한** 스크립트 11본 520,595B 전수 grep(랜딩만 훑지 않는다 — 라우트 청크는 지연 로드라
착지한 심볼도 0건으로 읽힌다).

### 🔴 D-51 의 「클라 번들 0건」은 «미적재»가 아니다

로컬 빌드에서 **미리** 확인했다 — 이 바늘들은 **서버 전용**이다:

| 바늘 | `.next/server` | `.next/static`(클라) |
|---|---|---|
| 「마지막으로 받은 상태를 보여」 | 5 | **0** |
| `data-why` | 5 | **0** |
| `data-congested` | 1 | 1 |
| `pointerdown` | 2 | 3 |

`unavailable.tsx` 에는 `"use client"` 가 없다(서버 컴포넌트). ⇒ **클라 번들은 이 축을 판정할 수 없는 창**이고,
거기서 나온 0 을 「미적재」로 적으면 틀린다. **0 의 뜻은 그 창이 정한다.**
대신 **공개 SSR 원문**에서 직접 떴다 — `data-why` 는 #588 이 «새로 만든» 속성이라(전에는 속성 자체가 없었다)
그 존재 자체가 착지 표지다. 그리고 그 문면은 `describeWhy` 의 **폴백 갈래**(모르는 코드 → 원인을 단정하지
않는다)라, 로컬 판정문에서 「안 잼」으로 남겼던 **「그 외」 열을 여기서 회수**했다.

## 2. 신고 — 내가 만든 run 1건

`start-from-alarm` 진입이 `POST /api/scenarios/GS-01/runs` 를 태워 **`RUN-2f53b5f644a8`** 이 생겼다(≈14:12).
`run-status` = **「대기」** · `replay-cursor` = **0/0 이벤트** · 이벤트 0건 ⇒ **조사는 실행되지 않았고 구독 사용 0**.
밖에서는 세션 소유라 그 이상 못 본다(`GET /api/runs/{id}` → `session_required`) —
**run «레코드»가 세션 상한에 계수되는지는 이 vantage 로 판정 불가**다.

## 3. REPLAY 축 — 미완(이유와 함께)

새 run 이 **0/0 이벤트**라 되감을 것이 없다. 빈 run 의 replay 초록은 아무것도 안 가른다
(「완주했다」와 「제대로 완주했다」는 다르고, 여기선 아예 무대가 없다). 손잡이는 화면에 **있다** —
`replay-controls`·`replay-restart`·`replay-back`·`replay-play`·`replay-forward`·`replay-follow`·`replay-cursor`
(이름은 화면에서 열거해 옮겼다 · 지어내지 않았다). 이벤트가 있는 run 이 생기면 그때 완주로 잰다.

## 4. 재현

```bash
node tests/web/_promo9_external.mjs --base=https://factory-knowledge-twin.vercel.app --shot=<png>
node tests/web/_promo9_scenario.mjs --base=https://factory-knowledge-twin.vercel.app
curl -s -o /dev/null -D - -w '%{remote_ip}' https://factory-knowledge-twin.vercel.app/api/health
curl -s https://factory-knowledge-twin.vercel.app/documents/NOSUCHDOC | grep -o 'data-why="[^"]*"'
```
