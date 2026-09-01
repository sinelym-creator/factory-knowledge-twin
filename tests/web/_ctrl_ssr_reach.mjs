/**
 * §3-2 대조군 «사정거리» — 두 자극이 **SSR 로 그려진 데이터**까지 같게 만드는가.
 *
 * 🔴 앞 대조군은 클라이언트 폴링이 보는 축(배지·제안)에서 A·B 가 같다고 말했다. 그것을
 *    「두 자극이 같다」로 넓히면 거짓이다 — B 는 브라우저만 막고 셸 «서버»는 멀쩡하다.
 *    그 차이를 주장으로 두지 않고 «서버가 그린 것의 수»로 센다.
 * 예측: 기준선·B = 데이터 있음 / A = 없거나 줄어듦.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

const WEB = process.env.FKT_CTRL_WEB, CONTAINER = process.env.FKT_CTRL_CONTAINER;
const PREFIX = (process.env.FKT_OWNER_PREFIX || "").trim();
if (!WEB || !CONTAINER || !PREFIX || !CONTAINER.startsWith(PREFIX)) {
  console.error("🔴 측정 불가 — 대상 미지정 또는 소유 미확인(Q-62)"); process.exit(2);
}
const docker = (...a) => execFileSync("docker", a, { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).trim();
const state = () => docker("inspect", "-f", "{{.State.Status}}", CONTAINER);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEYS = ["kpi-strip", "equipment-card", "alarm-card", "hierarchy-tree", "headline"];

async function look(browser, label, block) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  let hit = 0;
  if (block) await page.route("**/api/**", (r) => { hit += 1; return r.abort(); });
  await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(2500);
  const counts = {};
  for (const k of KEYS) counts[k] = await page.locator(`[data-testid="${k}"]`).count();
  await ctx.close();
  return { label, counts, hit, container: state() };
}

const rows = []; const browser = await chromium.launch();
try {
  rows.push(await look(browser, "기준선(무자극)", false));
  rows.push(await look(browser, "B 브라우저 /api 차단", true));
  docker("stop", CONTAINER); await sleep(1500);
  rows.push(await look(browser, "A 컨테이너 stop", false));
  docker("start", CONTAINER);
  for (let i = 0; i < 20 && state() !== "running"; i += 1) await sleep(500);
  await sleep(4000);
  rows.push(await look(browser, "되감기 확인", false));
} finally { await browser.close(); }

console.log("관측                    " + KEYS.map((k) => k.padStart(16)).join("") + "   가로챔  컨테이너");
console.log("─".repeat(120));
for (const r of rows) {
  console.log(r.label.padEnd(24) + KEYS.map((k) => String(r.counts[k]).padStart(16)).join("") + String(r.hit).padStart(9) + "  " + r.container);
}
