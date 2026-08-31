import { EnterForm } from "@/components/enter-form";

/**
 * `/` = **입장을 «실행하는» 자리** (wireframes §6 · Q-39 ⓒ).
 *
 * 🔴 앞판은 여기서 `redirect("/overview")` 를 돌렸다 — 발급이 `proxy.ts` 의 서버 홉에
 *    있었기에 「그 뒤를 받는 이중 안전장치」로 성립했다. 그 층이 옮겨진 지금 그 줄을
 *    남겨 두면 **무세션 방문자가 `/` → /overview → (가드) → `/` 로 도는 무한 루프**가 된다.
 *    같은 한 줄이 앞 형태에서는 안전장치였고 새 형태에서는 루프다 — 층을 옮길 때 함께
 *    옮겨야 하는 것은 발급만이 아니라 «그 발급을 전제한 줄»이다.
 *
 * 🔴 그래서 이 페이지의 새 역할은 «비어 있지 않게 서서, 입장을 실행하는 것»이다.
 *    실행 주체는 클라이언트 마운트다(components/enter-form.tsx) — 프리페치가 이 문서를
 *    가져가도 JS 는 돌지 않으므로 세션이 생기지 않는다. 그것이 이 티켓의 전부다.
 *
 * 🔴 실측(BEFORE · 기점 9949a68 · 브라우저 축): 딥링크 진입 + 셸 링크 hover 로 프리페치
 *    표지 11건을 «강제»했을 때 +3초에 쿠키 `fkt_sid`·`fkt_session` 2개 · 응답 Set-Cookie
 *    4건 · ai-api 발급 4건이 생겼다. AFTER 는 같은 자극에서 전부 0 이어야 한다.
 */
export default function EntryPage() {
  return <EnterForm />;
}
