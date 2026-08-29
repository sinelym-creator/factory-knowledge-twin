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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
};
