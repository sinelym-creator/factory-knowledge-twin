import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const BASE = process.argv[2] || "http://127.0.0.1:8799";
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
const snap = async (label) => {
  const o = await p.evaluate(() => {
    const card = document.querySelector('[data-testid="intro-card"]');
    const chain = [];
    let e = card;
    while (e && e !== document.documentElement && chain.length < 12) {
      chain.push({ tag: e.tagName.toLowerCase(), testid: e.getAttribute("data-testid"), inert: e.hasAttribute("inert"), cls: (e.className ?? "").toString().slice(0, 45) });
      e = e.parentElement;
    }
    return {
      url: location.href,
      cardPresent: !!card,
      chain,
      inertEls: Array.from(document.querySelectorAll("[inert]")).map((x) => x.getAttribute("data-testid") ?? x.tagName.toLowerCase() + "." + (x.className ?? "").toString().slice(0, 30)),
      tourOpen: !!document.querySelector('[data-testid="tour-callout"]'),
    };
  });
  const inertAnc = o.chain.filter((c) => c.inert).map((c) => c.testid ?? c.tag + "." + c.cls.slice(0, 20));
  console.log(
    `[${label}] card=${o.cardPresent} tour=${o.tourOpen} | 카드조상중 inert=${JSON.stringify(inertAnc)} | inert총수=${o.inertEls.length} | main이 inert=${o.chain.some((c) => c.tag === "main" && c.inert)} | url=${o.url}`,
  );
};
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForSelector("[data-testid=intro-card]", { timeout: 15000 });
await snap("A 첫 진입");
await p.locator('[data-testid=intro-card] button[aria-label="안내 닫기"]').click();
await p.reload({ waitUntil: "domcontentloaded" });
await p.waitForTimeout(1200);
await p.getByTestId("intro-reopen").click();
await p.waitForSelector("[data-testid=intro-card]", { timeout: 10000 });
await p.waitForTimeout(900);
await snap("C 재열람");
/* 카드가 «투어보다 늦게» 붙었을 가능성 — 투어를 한 걸음 넘겨 재계산시켜 본다. */
const next = await p.locator('[data-testid="tour-next"]').first().click({ timeout: 5000 }).then(() => "다음 눌림").catch((e) => "다음 못 누름: " + String(e.message).split("\n")[0]);
await p.waitForTimeout(900);
console.log("투어 다음 걸음:", next);
await snap("D 투어 한 걸음 뒤(재계산 후)");
await b.close();
