import { defineConfig } from "vitest/config";

/**
 * 단위 층 러너 — 🔴 `include` 를 이 앱 안으로 «좁게» 묶는다.
 *
 * `tests/web/e2e/*.spec.ts` 는 playwright(검증 좌석 · `tests/web/playwright.config.ts`)의 것이다.
 * 두 러너가 같은 파일을 물면 검증 회귀가 흔들린다 — 그래서 이 설정은 리포 루트로 안 올라간다.
 */
export default defineConfig({
  test: {
    include: ["{app,components,lib}/**/*.test.ts", "{app,components,lib}/**/*.test.tsx"],
    /* 기본은 node. DOM 이 필요한 파일은 자기 머리에 `@vitest-environment jsdom` 을 달아
       스스로 밝힌다 — 설정에 글로브를 쌓으면 파일과 환경이 멀어져 나중에 안 맞는다. */
    environment: "node",
    passWithNoTests: false,
  },
});
