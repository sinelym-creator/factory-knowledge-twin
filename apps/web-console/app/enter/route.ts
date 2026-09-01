import { NextResponse, type NextRequest } from "next/server";

import { apiBase, createSession } from "@/lib/contract";
import { ENTRY_DESTINATION, SESSION_COOKIE, formatSession, parseSession } from "@/lib/session";

/**
 * 입장 핸들러 — 「입장은 «실행»하는 일이지, 지나가다 생기는 일이 아니다」(Q-39 ⓒ).
 *
 * 🔴 **왜 이 파일이 생겼나.** 입장 발급은 `proxy.ts` 의 «무세션 `/` 서버 홉»에 있었다.
 *    그 홉은 사람만 밟는 자리가 아니다 — 셸 `<Link>` 프리페치가 `/overview` 를 긁으면
 *    가드가 307 로 `/` 를 주고, 프리페치가 그것을 따라가며 세션이 «조용히» 발급됐다.
 *    딥링크로 「열람만」 들어온 방문자에게 진짜로 서는 `fkt_sid` 가 생겼다(계약 v0.1.6 위반).
 *    실측(BEFORE · 기점 9949a68): 프리페치 표지 11건 → +3초 쿠키 2개 · Set-Cookie 4건 ·
 *    ai-api 발급 4건. 자세한 경위는 `proxy.ts` 머리말에 성문돼 있다.
 *
 * 🔴 **POST 전용이 처방의 몸통이다.** 프리페치·크롤러·주소창은 전부 GET 이고, GET 은 이
 *    파일에 핸들러가 없어 **405** 로 끝난다 — 부작용 0. 즉 「입장했다」는 사실은 `/` 페이지의
 *    클라이언트 마운트가 이 핸들러를 «명시 호출»했을 때만 생긴다(components/enter-form.tsx).
 *    표지(prefetch 헤더)로 가르지 않는다 — 표지는 이 층에 안 오거나 오다 떨어진다(14대 실측).
 *
 * 🔴 **303 이지 307 이 아니다.** 307 은 메서드를 보존해서 `/overview` 로 POST 가 다시 가고,
 *    그러면 페이지 라우트가 405 를 낸다. POST → GET 전환은 303 See Other 의 일이다.
 *
 * 🔴 **멱등** — 세션을 이미 쥔 요청에는 발급 0 으로 답한다. React StrictMode 의 이중 effect,
 *    새로고침, 「입장」 버튼 더블클릭이 세션을 두 개 만들면 그것은 격리가 아니라 «망각»이다.
 */
/**
 * `/overview` 로 보내는 303 — 🔴 **Location 을 «상대 경로»로 둔다.**
 *
 * 🔴 이 층은 방문자가 «어느 host 로 왔는지» 모른다. 실측(next 16.3.3 `next start`
 *    route handler · 요청 Host 를 4가지로 바꿔 전수):
 *      Host: 127.0.0.1:3121 | localhost:3121 | fkt.example:3121  →  req.url 은 **셋 다**
 *      `http://localhost:3121/enter` · `req.nextUrl.host` 도 항상 `localhost:3121`.
 *    그래서 `new URL("/overview", req.url)` 로 절대 URL 을 만들면 127.0.0.1 로 들어온
 *    방문자를 `localhost` 로 «다른 origin»에 떨궈 보낸다. 쿠키는 origin 을 따라가므로
 *    방금 심은 세션이 사라지고, 가드가 다시 `/` 로 보내 **입장이 두 번 실행된다**.
 *    🔴 이것은 추론이 아니라 이 lane 의 AFTER 1차 실측에서 실제로 났다:
 *       홉 사슬 `200 / → 303 /enter → 307 /overview → 200 / → 303 /enter → 200 /overview` ·
 *       쿠키 4개(호스트별 2벌) · ai-api 발급 **2건**. 대조군이 없었으면 딥링크 축의
 *       초록만 보고 지나쳤을 자리다.
 *    상대 Location 은 «방문자가 서 있는 origin»을 그대로 쓴다 — 서버가 host 를 추측할
 *    일이 없어져 이 실패가 재발할 자리 자체가 사라진다(RFC 7231 §7.1.2).
 *
 * 🔴 `protocol` 은 반대다 — 같은 실측에서 `req.nextUrl.protocol` 은 `x-forwarded-proto`
 *    를 따라갔다(https 를 주면 `https:`). 그래서 아래 Secure 판정은 V-1 규율 «원문»을
 *    그대로 쓴다. 한 객체라고 두 필드를 같이 믿거나 같이 버리지 않는다 — 축마다 쟀다.
 */
function seeOther(setCookie?: string | null) {
  return new NextResponse(null, {
    status: 303,
    headers: setCookie
      ? { location: ENTRY_DESTINATION, "set-cookie": setCookie }
      : { location: ENTRY_DESTINATION },
  });
}

export async function POST(req: NextRequest) {
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);

  // 🔴 **이미 «선» 사람만 다시 입장하지 않는다 — `pending` 은 선 것이 아니다.**
  //
  //    앞판은 `if (session)` 이었다. 그래서 발급이 한 번 실패해 `pending` 이 심기면 그 쿠키가
  //    스스로 회복할 길이 없었다: 다음 `/enter` 도 이 줄에서 곧장 돌아갔고, `pending` 은
  //    maxAge 8시간을 그대로 살았다. 그 사이 방문자의 `/api/*` 는 전건 401 이다 —
  //    ai-api 는 그 id 를 «발급한 적이 없다»(브라우저가 지어낸 uuid 다).
  //    실측(2026-09-01 공개 URL): 콜드 1회가 pending 을 심었고, 그 쿠키로 `/compare` 는
  //    「승인 질문 목록을 가져오지 못했습니다」, `/overview` 는 오류 컴포넌트였다.
  //    같은 브라우저로 `api` 세션을 받으면 두 화면 다 정상이었다 — 갈린 것은 이 한 값이다.
  if (session?.origin === "api") return seeOther();

  // 입장 1회: 계약대로 세션을 «발급받아» 본다. 닿지 않으면 pending으로 들어간다.
  const reply = await createSession(apiBase());
  const created =
    reply.state === "ok"
      ? { id: reply.data.sessionId, origin: "api" as const }
      : // 🔴 재시도도 실패하면 «있던 pending 을 그대로 둔다» — 새 uuid 로 갈아치우지 않는다.
        //    갈아치우면 방문자의 id 가 조용히 바뀌고, 「같은 사람인가」를 묻는 축(세션 격리)이
        //    실패 회차마다 끊긴다. 실패는 실패대로 «같은» pending 으로 남는 편이 사실에 가깝다.
        (session ?? { id: crypto.randomUUID().replace(/-/g, ""), origin: "pending" as const });

  // 🔴 **ai-api가 심은 세션 쿠키를 브라우저까지 그대로 넘긴다**(T3-1 · 계약 v0.1.6).
  //    입장 요청은 «서버사이드»에서 나가므로, 전달하지 않으면 그 HttpOnly 쿠키는 이 서버의
  //    fetch에서 끝나고 브라우저는 못 받는다 — 그러면 브라우저가 rewrite로 부르는 `/api/*`가
  //    전부 401이 된다(가드는 유효 세션을 요구한다). 아래 `fkt_session`은 칩·리셋이 읽는
  //    «표시용»이고, 실제 격리 키는 이 전달된 쿠키다.
  //
  //    🔴 이름을 여기 적지 않는다. 헤더 원문을 그대로 넘겨서 쿠키 «정체성»의 정본이 API
  //       한 곳에 남게 한다(오케 승인 08-30).
  //    🔴 `Secure`는 «셸이» https로 서비스될 때 덧붙인다. API는 자기 요청 스킴을 보고 정하는데
  //       그 요청은 서버간 http라서 Secure가 빠진다 — 브라우저 쪽 조건은 브라우저 쪽에서 안다.
  //    🔴 이 다리는 proxy.ts 에서 **원문 그대로 옮겨 왔다(복제 아님)**. 층은 옮기되 규율은
  //       한 글자도 고치지 않는다 — 옮기다 고치면 T3-1 E-1(브라우저가 `fkt_sid` 를 쥐고
  //       `/api/*` 200)이 «이 티켓과 무관하게» 회귀한다.
  const apiCookie =
    reply.state === "ok" && reply.setCookie
      ? req.nextUrl.protocol === "https:" && !/;\s*secure/i.test(reply.setCookie)
        ? `${reply.setCookie}; Secure`
        : reply.setCookie
      : null;

  // 🔴 **응답을 «만들 때» 심는다 — 만든 뒤에 append 하지 않는다**(V-1 픽스 · 실측 근거).
  //    앞판은 `headers.append("set-cookie", …)` 뒤에 `res.cookies.set(…)` 이 왔고, 그
  //    `cookies.set` 이 자기 쿠키 캐시로 헤더를 **재직렬화하면서 앞의 append 를 지웠다.**
  //    실측(Node 22 · next 16.3.3): append 직후 set-cookie 1개 → cookies.set 이후 1개인데
  //    그 1개가 `fkt_session` 뿐이다. 브라우저는 `fkt_sid` 를 못 받고 `/api/*` 가 전건 401.
  //
  //    🔴 순서를 뒤집는 것(`cookies.set` 먼저 → append 나중)으로도 «지금은» 고쳐진다.
  //       그러나 그 형태는 **다음 사람이 `cookies.set` 한 줄을 더 붙이는 날 조용히 되살아난다**
  //       — 실측으로 확인했다(뒤집기 + set 한 번 더 = fkt_sid 소멸 · 아래 방식 = 생존).
  //       그래서 초기화 헤더로 넘긴다: ResponseCookies 가 이 값을 자기 목록으로 «읽어 들여»
  //       이후의 `cookies.set` 이 몇 번 오든 함께 직렬화된다. 고치는 김에 재발 자리를 없앤다.
  const res = seeOther(apiCookie);

  res.cookies.set(SESSION_COOKIE, formatSession(created), {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // 세션 칩·리셋이 읽는다. 인증 토큰이 아니라 «격리 키»다(계약 = 인증 없음)
    maxAge: 60 * 60 * 8,
  });
  return res;
}
