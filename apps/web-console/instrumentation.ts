/**
 * 부팅 훅 — 🔴 빌드 값과 런타임 값이 갈리면 «죽는다»(Q-37 종결 · T4-1 ⓑ). 사유·실측 근거는
 * `lib/boot-check.ts` 머리말에 성문돼 있다.
 *
 * 🔴 여기서는 «부르기만» 한다. 검사 본체를 이 파일에 두면 Next 가 그것을 Edge 번들에도 넣고
 *    `process.exit` 때문에 빌드가 운다 — 동적 import 로 Node 쪽에서만 실체가 로드되게 한다.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { assertApiBaseMatchesBuild } = await import("./lib/boot-check");
  assertApiBaseMatchesBuild();
}
