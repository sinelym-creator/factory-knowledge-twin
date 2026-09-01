/**
 * 부팅 훅 — 🔴 빌드 값과 런타임 값이 갈리면 «죽는다»(Q-37 종결 · T4-1 ⓑ). 사유·실측 근거는
 * `lib/boot-check.ts` 머리말에 성문돼 있다.
 *
 * 🔴 여기서는 «부르기만» 한다. 검사 본체를 이 파일에 두면 Next 가 그것을 Edge 번들에도 넣고
 *    `process.exit` 때문에 빌드가 운다 — 동적 import 로 Node 쪽에서만 실체가 로드되게 한다.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertApiBaseMatchesBuild, assertPublicHttpsMatchesBuild } = await import(
    "./lib/boot-check"
  );
  assertApiBaseMatchesBuild();
  // 🔴 같은 원칙의 두 번째 축(D-4) — 빌드에 구워지는 값은 전부 여기서 대조한다.
  assertPublicHttpsMatchesBuild();

  /**
   * 🔴 **D-12d — ai-api 향 서버 요청이 탈 «우리 리졸버»를 여기서 끼운다.**
   *
   *    `lib/contract.ts` 는 클라이언트 번들에도 들어가서 그 파일이 `server-dns` 를 참조하는
   *    순간 `node:dns` 가 브라우저 청크로 끌려온다(실측: Turbopack `does not support external
   *    modules (request: node:dns)`). 그래서 참조 방향을 뒤집어, «서버에서만 도는 이 훅»이
   *    구현을 넣어 준다. 실패해도 앱은 선다 — 그때는 전역 `fetch` 그대로이고, 그것은 이
   *    티켓 이전과 «같은» 동작이다. 다만 그 사실이 조용하면 안 되므로 한 줄 남긴다.
   */
  try {
    const [{ loadServerFetch }, { registerServerFetch }] = await Promise.all([
      import("./lib/server-dns"),
      import("./lib/contract"),
    ]);
    const server = await loadServerFetch();
    registerServerFetch((url, init) =>
      server.fetch(url, { ...init, dispatcher: server.dispatcher } as Record<string, unknown>),
    );
    console.warn("[dns] dispatcher installed");
  } catch (e) {
    // 🔴 「못 끼웠다」를 «성공처럼» 지나가지 않는다 — 이 줄이 없으면 우회가 죽어도 조용하다.
    console.warn(`[dns] dispatcher install failed ${e instanceof Error ? e.name : "unknown"}`);
  }
}
