import { redirect } from "next/navigation";

/**
 * `/` = 세션 생성 후 `/overview` 리다이렉트 (wireframes §6).
 *
 * 세션 발급·쿠키 설정은 proxy.ts가 한다(쿠키를 «응답»에 실어야 하므로 서버 컴포넌트로는
 * 못 한다). 이 페이지는 그 뒤를 받는 이중 안전장치다 — proxy.ts의 matcher가 바뀌어
 * 이 경로가 빠져도 방문자가 빈 화면에 서지 않는다.
 */
export default function EntryPage() {
  redirect("/overview");
}
