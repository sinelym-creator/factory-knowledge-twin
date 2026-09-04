/**
 * T7-17 — 남은 빨강 2본의 «주어»를 가른다(대상인가 · 내 그물인가).
 *
 *  ① `reset-modal:44` — `--color-scrim` 이 브라우저에 없다.
 *     🔴 물어야 하는 것은 「그 «이름»이 있는가」가 아니라 **「스크림이 토큰 계층을 지나는가」**다.
 *     Tailwind v4 `@theme inline` 은 이름을 **일부러 CSS 변수로 안 내보낸다**(값을 유틸에 인라인한다).
 *     그러니 실토큰(`--fkt-scrim`)과 **실제로 칠해진 색**을 재서, 둘이 같으면 «화면은 멀쩡»이다.
 *
 *  ② `t3-2:484` — 「안내 닫기」 클릭이 다른 div 에 가로채인다.
 *     🔴 **누가 덮었는지**를 이름·상자로 찍는다. `elementFromPoint` 는 `pointer-events:none` 을
 *     건너뛰므로, 잡히는 것은 **실제로 클릭을 먹는** 요소다.
 *
 * 사용: node t717_two_reds_subject.mjs --base http://127.0.0.1:8799
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf("--" + k);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:8799");

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(BASE + "/enter", { waitUntil: "domcontentloaded" }).catch(() => {});
await page.goto(BASE + "/overview?intro=1", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(800);
console.log("landed:", page.url());

/* ───────── ① 스크림 토큰 계층 ───────── */
const tokens = await page.evaluate(() => {
  const cs = getComputedStyle(document.documentElement);
  const read = (n) => cs.getPropertyValue(n).trim();
  return {
    "--fkt-scrim": read("--fkt-scrim"),
    "--color-scrim": read("--color-scrim"),
    "--fkt-bg-1": read("--fkt-bg-1"),
    "--color-bg": read("--color-bg"),
  };
});
console.log("① :root 토큰 —", JSON.stringify(tokens, null, 1));

/* 스크림이 실제로 칠해지는지 = 리셋 모달을 열어 본다. */
const opened = await page
  .getByTestId("session-reset")
  .click({ timeout: 5000 })
  .then(() => true)
  .catch(() => false);
await page.waitForTimeout(500);
const scrim = await page.evaluate(() => {
  const cand = [
    '[data-testid="modal-scrim"]',
    '[data-testid="reset-modal-scrim"]',
    '[data-testid$="-scrim"]',
    "[data-scrim]",
  ];
  for (const sel of cand) {
    const el = document.querySelector(sel);
    if (el) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        sel,
        testid: el.getAttribute("data-testid"),
        background: cs.backgroundColor,
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        classes: el.className,
      };
    }
  }
  const ids = Array.from(document.querySelectorAll("[data-testid]"))
    .map((e) => e.getAttribute("data-testid"))
    .filter((t) => /scrim|modal|dialog|overlay/i.test(t ?? ""));
  return { sel: null, seenTestids: ids };
});
console.log("① 리셋 모달 열림 =", opened, "· 스크림 —", JSON.stringify(scrim, null, 1));

await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(300);

/* ───────── ② 「안내 닫기」를 누가 덮는가 ───────── */
await page.goto(BASE + "/overview?intro=1", { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(800);

const cover = await page.evaluate(() => {
  const card = document.querySelector('[data-testid="intro-card"]');
  if (!card) return { error: "intro-card 없음" };
  const btn = Array.from(card.querySelectorAll("button")).find(
    (b) => (b.getAttribute("aria-label") ?? "") === "안내 닫기",
  );
  if (!btn) return { error: "안내 닫기 버튼 없음", buttons: Array.from(card.querySelectorAll("button")).map((b) => b.getAttribute("aria-label")) };
  const r = btn.getBoundingClientRect();
  const describe = (el) => {
    if (!el) return null;
    const er = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      testid: el.getAttribute("data-testid"),
      aria: el.getAttribute("aria-label"),
      cls: (el.className ?? "").toString().slice(0, 110),
      rect: { x: Math.round(er.x), y: Math.round(er.y), w: Math.round(er.width), h: Math.round(er.height) },
      z: getComputedStyle(el).zIndex,
      pos: getComputedStyle(el).position,
      pe: getComputedStyle(el).pointerEvents,
    };
  };
  /* 버튼 상자의 5×5 격자를 짚어, 각 점에서 «실제로 클릭을 먹는» 요소를 센다. */
  const grid = [];
  for (let iy = 0; iy < 5; iy++) {
    for (let ix = 0; ix < 5; ix++) {
      const x = r.left + (r.width * (ix + 0.5)) / 5;
      const y = r.top + (r.height * (iy + 0.5)) / 5;
      const hit = document.elementFromPoint(x, y);
      grid.push({
        x: Math.round(x),
        y: Math.round(y),
        mine: !!(hit && (hit === btn || btn.contains(hit) || hit.contains(btn))),
        hit: describe(hit),
      });
    }
  }
  const mineCount = grid.filter((g) => g.mine).length;
  const others = {};
  for (const g of grid) {
    if (g.mine) continue;
    const k = `${g.hit?.tag}|${g.hit?.testid ?? "-"}|${g.hit?.cls}`;
    others[k] = (others[k] ?? 0) + 1;
  }
  return {
    button: describe(btn),
    card: describe(card),
    mineOf25: mineCount,
    coveredBy: others,
    sample: grid.find((g) => !g.mine) ?? null,
  };
});
console.log("② 안내 닫기 덮임 —", JSON.stringify(cover, null, 1));

/* 부정 판정은 «해 보고» 낸다 — 실제로 눌러 본다. */
const clicked = await page
  .locator('[data-testid="intro-card"] button[aria-label="안내 닫기"]')
  .click({ timeout: 4000 })
  .then(() => "클릭 성공")
  .catch((e) => "클릭 실패: " + String(e.message).split("\n")[0]);
console.log("② 실제 클릭 —", clicked);
const stillThere = await page.getByTestId("intro-card").count();
console.log("② 클릭 뒤 intro-card 수 —", stillThere);

await browser.close();
