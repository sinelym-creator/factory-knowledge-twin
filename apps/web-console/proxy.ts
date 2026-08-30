import { NextResponse, type NextRequest } from "next/server";

import { apiBase, createSession } from "@/lib/contract";
import { SESSION_COOKIE, formatSession, parseSession } from "@/lib/session";

/**
 * 🔴 파일 이름이 `proxy.ts`인 이유: Next 16이 `middleware` 파일 규약을 deprecate 했다
 *    (빌드가 경고로 알려 준다). 새로 세우는 파일을 이미 낡은 규약으로 두지 않는다.
 *
 * 세션 가드 + `/` 입장 처리 — wireframes §6.
 *
 *   「모든 라우트는 세션 쿠키 없이 진입 시 `/`로 보내 세션을 먼저 만든다(격리 보장).」
 *   「`/` = 세션 생성 후 `/overview` 리다이렉트」
 *
 * 🔴 규칙을 «한 곳»에 둔다. 페이지마다 가드를 넣으면 새 라우트가 생길 때 빠뜨리고,
 *    빠뜨린 라우트는 세션 없이 열리는 «구멍»이 된다 — 화면 목록이 늘어날수록 확실해진다.
 */
/**
 * 🔴 **읽기 전용 딥링크 예외 — 계약 v0.1.6 의 «화면» 절반**(T3-3).
 *
 * 계약은 `GET /evidence/{id}` · `GET /documents/{id}` 를 「세션 없이 열람만」으로 열었고
 * (§3:244 집행 · Q-16 긴장 해소), ai-api 쪽 절반은 T3-1 이 `READ_ONLY_EXCEPTIONS` 로 세웠다.
 * 그런데 **셸이 그 앞에서 세션 없는 방문자를 `/` 로 되돌려 보내고 있었다** — API 는 열려
 * 있는데 화면이 닫혀서, 딥링크로 들어온 사람은 근거가 아니라 `/overview` 에 도착했다.
 * 그것이 Q-16 이 「§3:244는 지금도 미구현」이라 적어 둔 상태의 실체다(levi2 6대 R-1 계보).
 *
 * 🔴 **긍정형·앵커·문자집합으로 잠근다.** 이 파일의 matcher 가 부정 전방탐색 하나로
 *    `/incidents/x.svg` 를 세션 없이 열었던 자리다(V-1) — 같은 형태를 반복하지 않는다.
 *    `\b` 도 쓰지 않는다: 경계 문자가 바뀌면 조용히 다른 자리에서 끊긴다.
 * 🔴 **세그먼트 «하나»만** 문다. `/evidence/x/y` 는 예외가 아니다 — 계약이 연 것은 단건
 *    열람 2라우트이고, 그 아래로 무엇이 자라든 그것은 새 표면이다.
 * 🔴 실패 방향: 이 정규식이 «못 물면» 방문자는 예전처럼 `/` 로 가서 목적지를 잃는다 —
 *    눈에 보이는 실패다. 반대로 넓게 물면 세션 화면이 세션 없이 열려 «조용한» 구멍이 된다.
 *    좁게 틀리는 쪽을 고른다.
 * 🔴 그리고 이 목록이 스스로를 증명하지는 못한다 — 「예외에 없으니 막힌다」는 추론이다.
 *    실증은 밖에서 온다: 자기 실측 표의 «브라우저 네트워크 축»이 세션 화면(쿠키 없으면
 *    `/` 로 튄다)과 딥링크(그대로 200)를 «같은 브라우저»에서 나란히 잰다.
 */
const READ_ONLY_DEEP_LINK = /^\/(evidence|documents)\/[^/]+$/;

export async function proxy(req: NextRequest) {
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const isEntry = req.nextUrl.pathname === "/";

  if (session) {
    // 이미 세션이 있으면 `/`는 머무는 곳이 아니라 지나가는 곳이다.
    return isEntry ? NextResponse.redirect(new URL("/overview", req.url)) : NextResponse.next();
  }

  // 🔴 세션이 없어도 딥링크 2라우트는 «그대로» 연다. 여기서 세션을 만들어 주지도 않는다 —
  //    만들어 주면 「열람만」이 아니라 조용한 입장이 되고, 화면은 세션 화면과 구별되지 않는다.
  if (READ_ONLY_DEEP_LINK.test(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  if (!isEntry) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 입장 1회: 계약대로 세션을 «발급받아» 본다. 닿지 않으면 pending으로 들어간다.
  const reply = await createSession(apiBase());
  const created =
    reply.state === "ok"
      ? { id: reply.data.sessionId, origin: "api" as const }
      : { id: crypto.randomUUID().replace(/-/g, ""), origin: "pending" as const };

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
  const res = NextResponse.redirect(
    new URL("/overview", req.url),
    apiCookie ? { headers: { "set-cookie": apiCookie } } : undefined,
  );

  res.cookies.set(SESSION_COOKIE, formatSession(created), {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // 세션 칩·리셋이 읽는다. 인증 토큰이 아니라 «격리 키»다(계약 = 인증 없음)
    maxAge: 60 * 60 * 8,
  });
  return res;
}

export const config = {
  // 🔴 `/api/*`는 가드 대상이 아니다 — 계약 호출은 rewrite로 ai-api에 그대로 나간다.
  //
  // 🔴 마지막 절이 `.*\.svg`였다(V-1 · levi2 실측). 「.svg로 끝나면 정적 자산」이라는 뜻으로
  //    적었는데, 이 부정 전방탐색은 «경로 어디서든» 걸린다 — 동적 세그먼트가 `.svg`로 끝나는
  //    id를 그대로 받으므로 `/incidents/x.svg`가 세션 없이 200으로 열렸다(3라우트 실측).
  //    확장자 한 글자로 갈렸다: `.png`·`.ico`·`xsvg`는 전부 가드가 돌았다.
  //
  //    `[^/]+\.svg$`로 «최상위 세그먼트 하나»에 한정한다. public/의 파일은 URL 경로가 곧
  //    파일 경로라 최상위 파일은 세그먼트가 하나다(현 public/ = svg 5개 · 전부 평면).
  // 🔴 이 절이 기대는 전제 = public/이 평면이라는 것. 나중에 `public/img/logo.svg`처럼
  //    중첩 자산을 두면 그 자산은 가드에 걸려 `/`로 튄다 — 이미지가 «눈에 보이게» 깨진다.
  //    잊었을 때 자산이 깨지는 쪽이지, 가드에 구멍이 나는 쪽이 아니다. 실패 방향을 그렇게 둔다.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|[^/]+\\.svg$).*)"],
};
