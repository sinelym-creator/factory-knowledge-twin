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
  /**
   * 🔴 **이 줄은 «직렬»을 뜻하지 않는다**(Q-45 실측). `fullyParallel: false` 는 **파일 «안»만**
   *    직렬로 만든다 — 파일끼리는 기본 워커 수만큼 병렬로 돌고, 실측에서 그 수는 **8** 이었다.
   *    즉 여덟이 **서버 한 대**를 함께 두드린다. 앞판 주석은 「서버 1대를 공유한다 — 쿠키·모드
   *    상태가 서로를 오염시키지 않게」라고 적혀 있었고, 그 문장은 이 설정이 주지 않는 보장을
   *    약속했다. 그 전제로 그물을 짜면 «격리되어 있겠지»가 판정에 섞인다.
   *
   * 🔴 그렇다고 `workers: 1` 로 박지 않는다 — 실측(80행 · 같은 앱·같은 API):
   *      workers 1  145.7s / 172.9s · 빨강 0
   *      기본 (8)    70.0s /  53.3s · 빨강 0
   *    **2~2.7배 느린 대가로 사는 것이 0** 이다(병렬이 flake 를 만든 증거가 이 조건에서 없다).
   *    진짜 보호는 워커 수가 아니라 **시간을 판정에서 뺀 것**이다(Q-41·Q-45 로 A·B류 해소).
   *    값 고정은 flake 가 **관측될 때** — 그때 저 표가 대조군이다(evidence/q45-…-inventory.md).
   */
  fullyParallel: false, // 파일 «안»의 순서만 지킨다(격리 보장 아님 — 위 주석)
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
