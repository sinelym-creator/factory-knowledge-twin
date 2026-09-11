# D-96 FIX — 처방 1안은 **판정선을 못 넘는다**(원인 한 층이 더 있다) · 센쿠2 55대

base = `origin/develop` **e755baff4eb2e462fbccf812626d9d8d086eb294**(실측) · lane `lane/senku2-d96fix`
무대 = `:8810` · 구독 **0** · 느린 조건 = CDP 400kbps · RTT 400ms · CPU×4

## 1. 한 것

`components/tour/tour-reopen.tsx` 를 평범한 **`<a href="/overview?intro=1&tour=1">`** 로 바꾸고
(🔴 `<Link>` 아님 — D-71 보존), 수화 뒤 `onClick` 은 `preventDefault()` 후 기존 로직(래치·이벤트·
`pushState`/`router.push`)을 그대로 쓴다. `role="button"` 은 덧대지 않았다 — 이 요소는 이제 수화 전
경로에서 **정말로 이동**하므로, 보조기술에 링크를 버튼이라 말하면 그 경로가 거짓이 된다.

| rc | 값 |
|---|---|
| `pnpm lint` | **0** |
| `pnpm build` | **0** |
| `npx tsc --noEmit`(build 뒤) | **0** |

## 2. 🔴 판정선 미달 — 고치지 못했다

| 축 | 前(D-96 판독) | 後(이 lane) |
|---|---|---|
| 느린 × fresh × **early** 클릭 | 0/3 · 이벤트 0 · URL 쿼리 없음 | **0/3 · 이벤트 0 · URL 쿼리 없음** |
| 느린 × late 클릭 | 3/3 (16·18·21ms) | **3/3 (14·18·18ms)** |

**발주 판정선(early 3/3)은 미달이다.** 회귀는 없다(late 유지).

## 3. 왜 안 고쳐졌나 — **입장 게이트가 쿼리를 버린다**(실측 홉)

세션 «없는» 방문자가 그 주소를 들고 오면:

```
요청 /overview?intro=1&tour=1
  홉: /overview?intro=1&tour=1 → 307 → /   |   /enter → 303 → /overview
  끝: url=/overview · tour-title=0
대조군 요청 /overview
  홉: /overview → 307 → /   |   /enter → 303 → /overview
  끝: url=/overview · tour-title=0
```

🔴 **두 요청의 끝이 같다** — 307 이 쿼리를 떼고, `/enter` 의 303 목적지도 쿼리 없는 `/overview`
고정이다(`lib/session.ts` `ENTRY_DESTINATION = "/overview"`). 수화 전 클릭의 기본 이동은 정확히
이 경로를 타므로, **앵커로 바꿔도 신호가 입장 바운스에서 지워진다.**

⇒ 처방은 **두 층**이 필요하다: ① 앵커(이 lane 이 함) ② **입장 바운스가 목적지 쿼리를 보존**.
②는 세션·입장 흐름(`proxy.ts` 의 307 · `/enter` 핸들러의 303 `Location`)이라 이 티켓의 문면
(`tour-reopen.tsx` 1파일)을 넘는다 — **발주 확대 여부를 회부**한다.

## 4. 안 섰다 (거짓 초록을 피한 자리)

「세션이 이미 있는 채로 수화 전 클릭」 축(`warmearly`)은 **3/3 개방**(5·13·40ms)이 나왔지만
**이벤트가 1건**이었다 ⇒ 그 회차들은 React 핸들러가 이미 붙은 뒤였다. 즉 **앵커의 수화 전
경로를 탔다는 증거가 아니다**. 이 축은 「안 섰다」로 적는다 — 3/3 을 근거로 처방 효과를
주장하지 않는다.

## 5. 🔴 회부 — 기존 검증 드릴 1본이 이 변경으로 빨개진다

`tests/web/d71_tour_reopen.mjs:70~77` 축 ⑰ = `tag === "button" && anchors === 0` 를 **PASS 조건으로**
박고 있다. 이 lane 은 그 요소를 `<a>` 로 바꾸므로 ⑰ 는 FAIL 이 된다.
그 축의 «뜻»(= 같은 pathname 쿼리 이동이 라우터 prefetch 캐시에 흡수되지 않는다)은 이 변경이
깨지 않는다(`preventDefault` + `pushState` 그대로). **문면이 「무엇」이 아니라 「어떻게」를 박고
있는 자리**다 — 재문안은 검증 좌석 몫이라 회부만 한다.

🔴 **대안 1안-B(미측 · E4)**: `<a>` 대신 `<form method="get" action="/overview">` + hidden
`intro=1`·`tour=1` + `<button type="submit">` 로 두면 수화 전 기본 동작(GET 제출)이 생기면서
요소는 여전히 `button` 이라 ⑰ 도 산다. 다만 §3 의 쿼리 유실은 **똑같이 겪는다** — ②가 없으면
어느 쪽도 early 축을 못 고친다.
