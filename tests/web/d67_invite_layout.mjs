/**
 * D-67 그물 — 좁은 폭에서 투어 초대 카드의 본문이 눌리지 않는가(엔진 3종).
 *
 * 🔴 **엔진마다 따로 잰다** — 이 결함의 가설이 「엔진의 flex 계산」이었으므로 chromium 하나로는
 *    아무 말도 못 한다. webkit·firefox 를 같은 코드로 돌리고, 값이 갈리면 그 자리를 적는다.
 * 🔴 **판정선은 리터럴이 아니라 «대조군과의 차»** 다 — 640 에서 대조군 본문이 좁고 대상이 넓다는
 *    것이 판정력이고, 절대 픽셀은 폰트·엔진에 따라 흔들린다.
 * 🔴 **경계값을 함께 찍는다**(639/640/641) — `sm` 은 640 이 경계라, 그 앞뒤가 설계대로
 *    갈리는지가 처방이 「어디서부터」 도는지를 말한다.
 * 🔴 무대 울림 = 초대 카드가 실제로 선 회차 수. 0 이면 어느 색도 내지 않는다(exit 2).
 *
 * usage: node d67_invite_layout.mjs --base http://127.0.0.1:8182 --out C:/…/o.json
 *        [--engines chromium,webkit,firefox] [--widths 390,639,640,641,1280]
 */
import { chromium, webkit, firefox } from "@playwright/test";
import { writeFileSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base");
const OUT = arg("out");
const ENGINES = arg("engines", "chromium,webkit,firefox").split(",");
const WIDTHS = arg("widths", "390,639,640,641,1280").split(",").map(Number);
if (!BASE || !OUT) {
  console.error("--base 와 --out 은 필수다");
  process.exit(9);
}

const WANT_RESUME = process.argv.includes("--resume");
const LAUNCHERS = { chromium, webkit, firefox };
const INVITE = '[data-testid="tour-invite"]';
const BUTTONS = ["tour-start", "tour-later", "tour-never"];

async function measure(page, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  // 초대 카드는 안내 카드를 닫아야 선다.
  const close = page.locator('[aria-label="안내 닫기"]');
  if (await close.count()) {
    await close.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  // 🔴 폐하 증상은 «재개(resume)» 변형에서 났다 — 그 카드를 실제로 만들어 둔다.
  //    `status: dismissed` 일 때 초대가 「이어서 보기」로 바뀐다(tour-provider.tsx:211).
  if (WANT_RESUME) {
    // 🔴 `dismissed` 로 가는 길은 **「나중에」**다 — 「둘러보기 시작」을 누르면 `running` 이 되고
    //    초대 카드 자체가 사라진다(44대 1차: 그래서 무대 0 · exit 2 가 났다).
    const later = page.locator('[data-testid="tour-later"]');
    if (await later.count()) {
      await later.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
    const reopen = page.locator('[data-testid="intro-reopen"]');
    if (await reopen.count()) {
      await reopen.first().click().catch(() => {});
      await page.waitForTimeout(800);
    }
    const c2 = page.locator('[aria-label="안내 닫기"]');
    if (await c2.count()) {
      await c2.first().click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  const invite = page.locator(INVITE);
  const present = (await invite.count()) > 0;
  const m = { width, invitePresent: present, wantResume: WANT_RESUME };
  if (!present) return m;

  Object.assign(
    m,
    await invite.first().evaluate((el) => {
      const body = el.querySelector("div");
      const r = el.getBoundingClientRect();
      const br = body ? body.getBoundingClientRect() : null;
      // 줄 수는 «렌더된 조각 수»로 센다 — 글자 수가 아니라 실제 줄바꿈이 축이다.
      const lines = [];
      if (body) {
        for (const p of body.querySelectorAll("p")) {
          const range = document.createRange();
          range.selectNodeContents(p);
          lines.push(range.getClientRects().length);
        }
      }
      const doc = document.documentElement;
      return {
        cardWidth: +r.width.toFixed(1),
        bodyWidth: br ? +br.width.toFixed(1) : null,
        bodyRatio: br ? +(br.width / r.width).toFixed(3) : null,
        lineCounts: lines,
        // 🔴 **`flex-direction` 을 직접 읽는다** — 44대 1차는 「본문과 버튼의 y 가 다르면 세로」로
        //    쟀는데, 가로(`flex-row`) 라도 `flex-wrap` 이면 버튼이 다음 «줄»로 내려간다.
        //    그 둘을 한 이름으로 부르면 「640 위에서도 세로」라는 오독이 난다.
        flexDirection: getComputedStyle(el).flexDirection,
        flexWrap: getComputedStyle(el).flexWrap,
        // 아래는 «두 줄로 놓였는가» — 방향이 아니라 배치 결과다(이름을 그대로 둔다).
        twoRows: (() => {
          const kids = [...el.children];
          if (kids.length < 2) return null;
          const a = kids[0].getBoundingClientRect();
          const b = kids[1].getBoundingClientRect();
          return b.top >= a.bottom - 1;
        })(),
        docOverflowPx: doc.scrollWidth - doc.clientWidth,
        // 🔴 뷰포트 폭과 **CSS 가 보는 폭**은 다르다 — 스크롤바가 있으면 미디어 쿼리는
        //    이 값을 본다. `sm`(640) 경계를 뷰포트 숫자로만 읽으면 「경계가 밀렸다」고 오독한다.
        cssViewportWidth: doc.clientWidth,
      };
    })
  );

  const btn = {};
  for (const id of BUTTONS) {
    const l = page.locator(`[data-testid="${id}"]`);
    btn[id] = (await l.count()) ? await l.first().isVisible() : false;
  }
  // 변형 확인 — 「이어서 보기」면 resume 카드다(문면이 정본).
  const startText = (await page.locator('[data-testid="tour-start"]').count())
    ? (await page.locator('[data-testid="tour-start"]').first().innerText()).trim()
    : null;
  m.startButtonText = startText;
  m.isResumeVariant = startText === "이어서 보기";
  m.buttonsVisible = btn;
  m.allThreeVisible = Object.values(btn).every(Boolean);
  return m;
}

const run = async () => {
  const out = { base: BASE, wall: new Date().toISOString(), engines: {} };
  for (const name of ENGINES) {
    const launcher = LAUNCHERS[name];
    if (!launcher) {
      out.engines[name] = { error: "unknown engine" };
      continue;
    }
    let browser;
    try {
      browser = await launcher.launch();
    } catch (e) {
      // 🔴 엔진이 안 뜬 것은 «대상의 사실»이 아니다 — 그 사실 그대로 남긴다.
      out.engines[name] = { launchFailed: String(e).slice(0, 200) };
      continue;
    }
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errs = [];
    page.on("console", (m2) => m2.type() === "error" && errs.push(`${name}: ` + m2.text().slice(0, 120)));
    const rows = [];
    for (const w of WIDTHS) rows.push(await measure(page, w));
    out.engines[name] = { rows, consoleErrors: errs, version: browser.version() };
    await browser.close();
  }

  writeFileSync(OUT, JSON.stringify(out, null, 2), "utf-8");
  const brief = {};
  for (const [name, v] of Object.entries(out.engines)) {
    brief[name] = v.rows
      ? v.rows.map((r) =>
          `${r.width}: body=${r.bodyWidth} ratio=${r.bodyRatio} lines=${JSON.stringify(r.lineCounts)} dir=${r.flexDirection} twoRows=${r.twoRows} btn3=${r.allThreeVisible} ovf=${r.docOverflowPx}`
        )
      : v;
  }
  console.log(JSON.stringify(brief, null, 1));
  const witnessed = Object.values(out.engines).flatMap((v) => v.rows || []).filter((r) => r.invitePresent).length;
  if (witnessed === 0) {
    console.error("STAGE 0: 초대 카드가 한 번도 서지 않았다 — 안 잼(exit 2)");
    process.exit(2);
  }
  process.exit(0);
};

run().catch((e) => {
  console.error("net crashed (내 도구의 죽음일 수 있다):", e);
  process.exit(3);
});
