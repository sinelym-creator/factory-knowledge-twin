/**
 * T7-24 2차 · **X-10** — 「강제 색 모드(고대비)에서 사라지는 요소 0 · 읽을 수 있음」.
 * 정본 `docs/plan/test-plan-v1.md:130`(원문은 «미측 · T7-16 재발주»). 리바이2 41대.
 *
 * 🔴 **자극 증인 먼저** — CDP `Emulation.setEmulatedMedia` 로 `forced-colors: active` 를 켠 뒤
 *    페이지 안에서 `matchMedia("(forced-colors: active)").matches` 가 **true** 인지부터 본다.
 *    false 면 이 열은 초록도 빨강도 아니라 **미검증**이다(자극이 축에 안 닿았다).
 *
 * 🔴 판정선 둘 — ① **사라진 요소 0**(기준선에서 보이던 것이 강제 색에서 안 보이면 사라진 것)
 *              ② **읽을 수 있음** = 글자색이 투명하지 않고 배경과 «같은 색»이 아닌 것.
 *    🔴 대비 «비율»은 이 그물이 안 잰다 — 강제 색 모드에서는 색을 OS 가 정하므로,
 *       여기서 재는 것은 「글자가 배경에 먹히지 않는가」다. 이름을 정확히 붙인다.
 *
 *   node t724x_forced_colors.mjs --shell=http://127.0.0.1:8104
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const SHELL = arg("shell", "http://127.0.0.1:8104");
const ROUTES = (arg("routes", "/overview,/incidents,/compare") ?? "").split(",");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SNAP = () => {
  const vis = [];
  const unreadable = [];
  const norm = (c) => (c ?? "").replace(/\s+/g, "");
  for (const el of Array.from(document.body.querySelectorAll("*"))) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const shown =
      cs.display !== "none" &&
      cs.visibility !== "hidden" &&
      Number(cs.opacity) > 0.01 &&
      r.width > 0 &&
      r.height > 0;
    /* 🔴 **좌표를 키에 넣지 않는다.** 첫 판은 `testid|TAG|x,y` 를 키로 썼는데, 강제 색에서
       테두리·글꼴 폭이 바뀌며 요소가 «몇 px 밀리자» 244건이 「사라졌다」로 잡혔다 —
       보이는 요소 «수»는 288 → 288 로 그대로였는데도. 정체는 좌표가 아니라 **트리 안의 자리**가
       정한다. 그래서 body 로부터의 자식 색인 경로를 키로 쓴다. */
    let path = "";
    for (let n = el, guard = 0; n && n !== document.body && guard < 40; n = n.parentElement, guard++) {
      path = Array.prototype.indexOf.call(n.parentElement?.children ?? [], n) + ">" + path;
    }
    const key = (el.getAttribute("data-testid") ?? "") + "|" + el.tagName + "|" + path;
    if (shown) vis.push(key);
    /* 글자를 «직접» 가진 요소만 읽기 판정 대상이다(껍데기는 글자가 없다). */
    const ownText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
    if (shown && ownText) {
      const fg = norm(cs.color);
      const bg = norm(cs.backgroundColor);
      const transparent = /rgba\(.*,0\)$/.test(fg) || fg === "transparent";
      const sameAsBg = bg !== "rgba(0,0,0,0)" && bg !== "transparent" && fg === bg;
      if (transparent || sameAsBg)
        unreadable.push({
          id: el.getAttribute("data-testid") ?? el.tagName.toLowerCase(),
          text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24),
          color: cs.color,
          background: cs.backgroundColor,
        });
    }
  }
  return {
    forced: matchMedia("(forced-colors: active)").matches,
    visible: vis,
    visibleCount: vis.length,
    unreadable,
  };
};

const enter = async (page) => {
  const b = page.locator('[data-testid="enter-button"]');
  if (await b.count().then((n) => n > 0).catch(() => false)) {
    await b.first().click().catch(() => {});
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    await sleep(1800);
  }
};

const browser = await chromium.launch();
const rows = [];
for (const route of ROUTES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(SHELL + "/", { waitUntil: "domcontentloaded" });
  await enter(page);
  await page.goto(SHELL + route, { waitUntil: "domcontentloaded" }).catch(() => {});
  await sleep(2200);
  const base = await page.evaluate(SNAP);

  let err = null;
  try {
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "forced-colors", value: "active" }],
    });
  } catch (e) {
    err = String(e.message).slice(0, 70);
  }
  await sleep(1500);
  const forced = await page.evaluate(SNAP);
  const baseSet = new Set(base.visible);
  const forcedSet = new Set(forced.visible);
  const vanished = [...baseSet].filter((k) => !forcedSet.has(k));
  rows.push({ route, err, base, forced, vanished: vanished.length, vanishedSample: vanished.slice(0, 5) });
  await ctx.close();
}
await browser.close();

const j = JSON.stringify;
console.log(`\n=============== X-10 · 강제 색 모드 · base=${SHELL} ===============`);
console.log("| 무대 | 자극 | 대체 동작 | 남은 흔적 | 시점 |");
console.log("|---|---|---|---|---|");
for (const r of rows)
  console.log(
    `| 셸 1440 ${r.route} | \`forced-colors: active\` 에뮬레이션 | 페이지가 그 매체를 **${r.forced.forced}** 로 본다 | 보이는 요소 ${r.base.visibleCount} → ${r.forced.visibleCount} · **사라짐 ${r.vanished}건**${r.vanished ? " " + j(r.vanishedSample) : ""} · **읽기 불가 ${r.forced.unreadable.length}건**${r.forced.unreadable.length ? " " + j(r.forced.unreadable.slice(0, 3)) : ""} | +1.5s |`,
  );

console.log("\n=============== 판정 ===============");
const reached = rows.length > 0 && rows.every((r) => r.forced.forced === true);
const baselineClean = rows.every((r) => r.base.forced === false);
const noVanish = rows.every((r) => r.vanished === 0);
const readable = rows.every((r) => r.forced.unreadable.length === 0);
console.log(`기준선이 강제 색이 «아니었나» = ${baselineClean ? "✓" : "✗ — 기준선부터 켜져 있었다(자극이 아무것도 안 바꾼다)"}`);
console.log(`자극이 축에 «닿았나»(페이지가 forced-colors: active 를 본다) = ${reached ? "✓ 전 라우트" : "✗"}`);
if (!reached || !baselineClean) {
  console.log(`[X-10] **미검증** — 자극이 축에 안 닿았다. 「사라짐 0」은 초록이 아니다.`);
} else {
  console.log(`사라진 요소 0 = ${noVanish ? "✓" : "✗"} · 배경에 먹힌 글자 0 = ${readable ? "✓" : "✗"}`);
  console.log(`[X-10] ${noVanish && readable ? "PASS(사라짐 0 · 먹힌 글자 0 · 3 라우트)" : "FAIL"}`);
}
console.log(
  "\n🔴 안 잼: **대비 «비율»**(강제 색에서는 OS 가 색을 정하므로 이 그물은 「글자가 배경에 먹히는가」만 잰다) · 실제 OS 고대비 테마 · 아이콘·테두리의 시인성 · 3 라우트 밖 화면.",
);
