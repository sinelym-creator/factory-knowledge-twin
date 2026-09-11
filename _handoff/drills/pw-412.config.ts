/** M-1 러너 축 — 뷰포트만 바꾼 대조 설정. tests 트리 무접촉(이 파일은 _handoff 에 산다). */
import { defineConfig } from "@playwright/test";
const ENV = process["env"];
export default defineConfig({
  testDir: "../../tests/web/e2e",
  globalSetup: "../../tests/web/e2e/preflight.ts",
  fullyParallel: false, forbidOnly: true, retries: 0,
  reporter: [["list"]], timeout: 30_000, expect: { timeout: 7_000 },
  use: { baseURL: ENV["FKT_WEB_BASE"], browserName: "chromium", viewport: { width: 412, height: 600 } },
});
