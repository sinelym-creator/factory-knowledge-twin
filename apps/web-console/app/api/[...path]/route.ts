import type { NextRequest } from "next/server";

import { proxyApiRequest } from "@/lib/contract";

/**
 * `/api/*` 함수 프록시 — 🔴 **D-11 (B) · 엣지 rewrite 를 지나지 않게 한다.**
 *
 * 증상(E1 · 2026-09-01 12:19~): Production 의 `/api/*` 가 Vercel **엣지 rewrite** 층에서
 * 간헐 502 `DNS_HOSTNAME_EMPTY` 를 냈다(7회 중 4회 · 12:33 재측 4/5). 같은 시각 **함수**
 * 경로(`POST /enter`)는 5/5 정상이었다 — 우리 코드가 아니라 «어느 층이 목적지를 해석하는가»
 * 의 차이다. 그래서 조회도 함수가 받는다.
 *
 * 🔴 **fetch 는 여기 없다** — 실제 호출은 `lib/contract.ts` 의 `proxyApiRequest` 가 한다.
 *    「셸에서 나가는 fetch 는 한 파일에 모인다」는 불변식(`scripts/contract-surface.mjs`)을
 *    이 파일 때문에 깨지 않는다. 예외를 한 번 내면 검사기는 그만큼 조용해진다.
 *
 * 🔴 **`force-dynamic`** — 프록시는 캐시될 물건이 아니다(세션 쿠키가 실린다). 정적화되면
 *    한 방문자의 응답이 다른 방문자에게 간다.
 * 🔴 **`maxDuration = 300`** — `compare` 는 콜드 임베딩 적재 때문에 120s 예산을 쓴다
 *    (`COMPARE_TIMEOUT_MS`). 함수 상한이 그보다 짧으면 이 층이 조용히 먼저 자른다.
 *
 * 🔴 **WebSocket 은 이 핸들러가 받지 않는다.** Route Handler 는 Request→Response 모델이라
 *    101 Switching Protocols 를 낼 수 없다. `/api/ws/*` 는 `next.config.ts` 의 rewrite 에
 *    «남겨 두었고»(beforeFiles), 그래서 이 파일보다 먼저 매칭된다. 실측 근거는 그 파일 주석에.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 🔴 `nextUrl.protocol` 로 https 를 판정해 헬퍼에 «boolean 으로» 넘긴다.
 *    `lib/contract.ts` 가 `next/server` 를 import 하면 그 파일을 쓰는 브라우저 코드까지
 *    서버 전용 모듈을 끌고 간다 — 판정만 이 층에서 하고 값만 건넨다.
 *    (`app/enter/route.ts` 가 쓰는 것과 «같은» 소스다: 그 파일의 실측에 따르면 이 필드는
 *     `x-forwarded-proto` 를 따라간다. host 축과 달리 이 축은 믿을 수 있다 — 축마다 쟀다.)
 */
function handle(req: NextRequest): Promise<Response> {
  return proxyApiRequest(req, { https: req.nextUrl.protocol === "https:" });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
