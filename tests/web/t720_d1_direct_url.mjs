import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const BASE = process.argv[2] || "http://127.0.0.1:8799";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
/* 세션을 먼저 만든 뒤, «주소로 직접» 같은 상태에 들어간다(재열람 버튼을 안 쓰는 열). */
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-testid=intro-card]", { timeout: 15000 });
await p.goto(BASE + "/overview?intro=1&tour=1", { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-testid=intro-card]", { timeout: 10000 });
await p.waitForTimeout(900);
const o = await p.evaluate(() => {
  const card = document.querySelector('[data-testid="intro-card"]');
  const btn = Array.from(card.querySelectorAll("button")).find((x) => x.getAttribute("aria-label") === "안내 닫기");
  const r = btn.getBoundingClientRect();
  let mine = 0;
  for (let iy = 0; iy < 5; iy++)
    for (let ix = 0; ix < 5; ix++) {
      const h = document.elementFromPoint(r.left + (r.width * (ix + 0.5)) / 5, r.top + (r.height * (iy + 0.5)) / 5);
      if (h && (h === btn || btn.contains(h))) mine++;
    }
  let e = card, inertAnc = [];
  while (e && e !== document.documentElement) { if (e.hasAttribute("inert")) inertAnc.push(e.tagName.toLowerCase()); e = e.parentElement; }
  return { mineOf25: mine, inertAnc, tour: !!document.querySelector('[data-testid="tour-callout"]') };
});
const click = await p.locator('[data-testid=intro-card] button[aria-label="안내 닫기"]').click({ timeout: 6000 }).then(() => "성공").catch((e) => "실패: " + String(e.message).split("\n")[0]);
await p.waitForTimeout(800);
console.log(`[주소로 직접 ?intro=1&tour=1] mine=${o.mineOf25}/25 · 조상inert=${JSON.stringify(o.inertAnc)} · 투어=${o.tour} · 닫기클릭=${click} · 남은카드=${await p.getByTestId("intro-card").count()}`);
await b.close();
