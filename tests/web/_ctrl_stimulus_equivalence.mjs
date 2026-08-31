/**
 * §3-2 대조군 — 「컨테이너 stop」과 「브라우저에서 셸 /api 차단」이 **같은 표지를 내는가**.
 *
 * 🔴 이것은 판정이 아니라 «치환이 성립하는가»를 묻는 설계 대조군이다. 성립하면 T4-4 외부판
 *    FastAPI OFF 행을 관측자 쪽 자극으로 잰다. 안 성립하면 그 치환은 폐기한다.
 *
 * 🔴 예측을 «먼저» 적는다(값에 판정선을 맞추면 무엇이든 초록이 된다):
 *    ① mode 축      A·B 둘 다 unavailable — 같을 것이다
 *    ② 제안 유무 축  A·B 둘 다 뜰 것이다(트리거 = 응답 실패뿐)
 *    ③ why 문면 축  🔴 다를 것이다(HTTP 5xx ↔ 브라우저 abort 이름)
 *    ④ 기준선       REPLAY · 제안 없음(online:false 는 참이라 제안하지 않는다)
 *
 * 🔴 자극이 «닿았는지»를 따로 세지 않으면 표지가 아니라 내 배선을 잰다 — B 는 가로챈 요청 수를
 *    세고, A 는 stop 뒤 컨테이너 상태를 실측한다.
 */

import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";

const WEB = process.env.FKT_CTRL_WEB;
const API = process.env.FKT_CTRL_API;
const CONTAINER = process.env.FKT_CTRL_CONTAINER;
const PREFIX = (process.env.FKT_OWNER_PREFIX || "").trim();

// 🔴 이 스크립트도 «부순다» — Q-62 규율을 그대로 진다. 셋 중 하나라도 못 세우면 측정 불가(2).
for (const [name, value] of [["FKT_CTRL_WEB", WEB], ["FKT_CTRL_API", API], ["FKT_CTRL_CONTAINER", CONTAINER]]) {
  if (!value) { console.error(`🔴 측정 불가 — ${name} 미지정(기본값을 두지 않는다)`); process.exit(2); }
}
if (!PREFIX) { console.error("🔴 측정 불가 — FKT_OWNER_PREFIX 미선언(부수려면 자기가 누구인지부터)"); process.exit(2); }
if (!CONTAINER.startsWith(PREFIX)) { console.error(`🔴 \`${CONTAINER}\` 은 내 것이 아니다(접두 ${PREFIX})`); process.exit(2); }

const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", env: { ...process.env, MSYS_NO_PATHCONV: "1" } }).trim();

const state = () => docker("inspect", "-f", "{{.State.Status}}", CONTAINER);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 배지가 `checking` 을 벗어날 때까지 기다렸다 3축을 «따로» 읽는다. 못 서면 그 사실을 값으로 남긴다. */
async function read(page) {
  const badge = page.locator('[data-testid="mode-badge"]');
  try {
    await badge.waitFor({ timeout: 20_000 });
    await page.waitForFunction(
      () => document.querySelector('[data-testid="mode-badge"]')?.getAttribute("data-mode") !== "checking",
      null, { timeout: 20_000 },
    );
  } catch {
    return { mode: "🔴 배지 미출현", why: null, offer: null, url: page.url() };
  }
  return {
    mode: await badge.getAttribute("data-mode"),
    why: await badge.getAttribute("title"),
    offer: await page.locator('[data-testid="static-replay-offer"]').count(),
    url: page.url(),
  };
}

async function observe(browser, label, { block = false, preEnter = false, between = null } = {}) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  let intercepted = 0;
  try {
    if (preEnter) {
      await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
      await read(page); // 살아 있을 때 한 번 세워 둔다(세션·쿠키가 붙는다)
    }
    if (between) await between();
    // 🔴 차단은 «셸 자신의 /api» 다 — 브라우저는 ai-api 오리진을 부르지 않는다(contract.ts:486 상대 경로)
    if (block) await page.route("**/api/**", (route) => { intercepted += 1; return route.abort(); });
    if (preEnter) await page.reload({ waitUntil: "domcontentloaded" });
    else await page.goto(`${WEB}/`, { waitUntil: "domcontentloaded" });
    const seen = await read(page);
    return { label, ...seen, intercepted, container: state() };
  } catch (e) {
    return { label, mode: `🔴 관측 실패(${e.constructor.name})`, why: String(e.message).slice(0, 90), offer: null, intercepted, container: state() };
  } finally {
    await ctx.close();
  }
}

const rows = [];
const browser = await chromium.launch();
try {
  console.log(`대상   셸 ${WEB} · ai-api ${API} · 컨테이너 ${CONTAINER}(${state()})`);
  console.log(`소유   선언 접두 ${PREFIX} — 대조 통과\n`);

  rows.push(await observe(browser, "기준선(무자극)"));
  rows.push(await observe(browser, "B 브라우저에서 셸 /api 차단", { block: true }));
  rows.push(await observe(browser, "B′ 살아 있다 → 차단 → 재적재", { block: true, preEnter: true }));

  // 🔴 파괴는 마지막에. 되감기까지가 측정이다.
  rows.push(await observe(browser, "A1 컨테이너 stop · 새 적재", {
    between: async () => { docker("stop", CONTAINER); await sleep(1500); },
  }));
  docker("start", CONTAINER);
  for (let i = 0; i < 20 && state() !== "running"; i += 1) await sleep(500);
  await sleep(4000);
  rows.push(await observe(browser, "A3 되살린 뒤 기준선 복귀"));
  rows.push(await observe(browser, "A4 살아 있다 → stop → 재적재", {
    preEnter: true,
    between: async () => { docker("stop", CONTAINER); await sleep(1500); },
  }));

  docker("start", CONTAINER);
  for (let i = 0; i < 20 && state() !== "running"; i += 1) await sleep(500);
  await sleep(4000);
  rows.push(await observe(browser, "되감기 확인(원복 후 기준선)"));
} finally {
  await browser.close();
}

console.log("관측                              mode          제안  가로챈요청  컨테이너   why");
console.log("─".repeat(110));
for (const r of rows) {
  const offer = r.offer === null ? " —" : String(r.offer).padStart(2);
  console.log(
    `${r.label.padEnd(32)}  ${String(r.mode).padEnd(12)}  ${offer}   ${String(r.intercepted).padStart(8)}  ${String(r.container).padEnd(8)}  ${r.why ?? ""}`,
  );
}
