/**
 * D-64 그물 — 「느린 답」을 「미연결」이라 부르지 않는가.
 *
 * 🔴 이 축은 **한 시점의 값이 아니라 전이**다. 배지를 시간축으로 촘촘히 찍어
 *    「지나가는 확인 중」과 「끝내 미연결」을 가른다(끝점 2개로는 못 가른다).
 * 🔴 자극은 **지연 프록시**가 준다 — 손잡이 하나(`/api/live/status` 만 +N ms).
 *    끊지 않는다: 끊으면 그건 연결 실패라는 «다른» 자극이다.
 * 🔴 무대 울림 = 그 창에서 배지를 실제로 읽은 표본 수. 0 이면 어느 색도 내지 않는다.
 *
 * usage: node d64_badge_timeline.mjs --base http://127.0.0.1:8176 --out C:/…/o.json
 *        [--seconds 50] [--every 1000] [--label tgt-3s]
 */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const SECONDS = Number(arg("seconds", "50"));
const EVERY = Number(arg("every", "1000"));
const LABEL = arg("label", "unlabeled");
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  const apiCalls = [];
  page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 140)));
  page.on("pageerror", (e) => errs.push("pageerror: " + String(e).slice(0, 140)));
  // 화면이 «실제로» 부른 상태 호출 — 수를 세어 두면 「폴링이 돌았는가」를 값으로 말할 수 있다.
  page.on("request", (r) => {
    if (r.url().includes("/api/live/status")) apiCalls.push({ t: Date.now(), url: r.url() });
  });

  const ROUTE = arg("route", "/overview");
  const SEED = arg("seed-route", null); // 세션을 먼저 받고 «다른» 화면을 볼 때 쓴다
  const t0 = Date.now();
  if (SEED) {
    await page.goto(BASE + SEED, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);
  }
  await page.goto(BASE + ROUTE, { waitUntil: "domcontentloaded", timeout: 60000 });

  const badge = page.locator('[data-testid="mode-badge"]');
  const samples = [];
  const deadline = t0 + SECONDS * 1000;
  while (Date.now() < deadline) {
    const at = Date.now() - t0;
    let text = null;
    try {
      text = (await badge.count()) ? (await badge.first().innerText()).replace(/\s+/g, " ").trim() : null;
    } catch {
      text = "<읽기 실패>";
    }
    samples.push({ atMs: at, badge: text });
    await page.waitForTimeout(EVERY);
  }

  const seen = [];
  for (const s of samples) if (!seen.length || seen[seen.length - 1].badge !== s.badge) seen.push(s);

  const out = {
    base: BASE,
    label: LABEL,
    wall: new Date().toISOString(),
    windowSec: SECONDS,
    sampleCount: samples.length,
    transitions: seen, // 🔴 「무엇이 언제 무엇으로 바뀌었나」 — 이 줄이 판정이다
    firstBadge: samples[0]?.badge ?? null,
    lastBadge: samples[samples.length - 1]?.badge ?? null,
    everUnavailable: samples.some((s) => (s.badge || "").includes("미연결")),
    firstUnavailableAtMs: samples.find((s) => (s.badge || "").includes("미연결"))?.atMs ?? null,
    everChecking: samples.some((s) => (s.badge || "").includes("확인 중")),
    liveStatusRequests: apiCalls.length,
    consoleErrors: errs,
  };
  await browser.close();
  writeFileSync(OUT, JSON.stringify({ ...out, samples }, null, 2), "utf-8");
  console.log(JSON.stringify(out, null, 1));
  if (!out.sampleCount) {
    console.error("STAGE 0: 배지를 한 번도 못 읽었다 — 안 잼(exit 2)");
    process.exit(2);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
