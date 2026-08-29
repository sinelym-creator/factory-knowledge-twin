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
export async function proxy(req: NextRequest) {
  const session = parseSession(req.cookies.get(SESSION_COOKIE)?.value);
  const isEntry = req.nextUrl.pathname === "/";

  if (session) {
    // 이미 세션이 있으면 `/`는 머무는 곳이 아니라 지나가는 곳이다.
    return isEntry ? NextResponse.redirect(new URL("/overview", req.url)) : NextResponse.next();
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

  const res = NextResponse.redirect(new URL("/overview", req.url));
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
