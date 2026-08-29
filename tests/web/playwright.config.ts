import { defineConfig } from "@playwright/test";

/**
 * T1-9 셸 브라우저 실측 — 검증 좌석 자산.
 *
 * 🔴 서버를 이 설정이 «띄우지 않는다». 무엇을 상대로 쟀는지가 판정의 절반이라, 기동은 밖에
 *    두고 preflight 가 «실제로 응답한 것»을 기록한다(webServer 로 감추면 어느 빌드·어느
 *    백엔드 상태에서 난 초록인지 보고서에 남지 않는다).
 *
 *      cd apps/web-console && pnpm build && pnpm exec next start -p 3101
 *      cd services/ai-api  && uvicorn app.main:app --port 8000
 *      cd tests/web        && npx playwright test
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/preflight.ts",
  fullyParallel: false, // 서버 1대를 공유한다 — 쿠키·모드 상태가 서로를 오염시키지 않게
  forbidOnly: true,
  retries: 0, // 🔴 재시도 0. 초록을 «다시 돌려서» 만들지 않는다 — flaky 는 결함이지 잡음이 아니다
  reporter: [["list"]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101",
    browserName: "chromium",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
});
