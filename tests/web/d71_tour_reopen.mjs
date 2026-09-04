/**
 * d71_tour_reopen — D-71 「튜토리얼」 버튼이 자기 URL 을 미는가 (검증 좌석 · 45대).
 *
 * 판정선 = 오케 발주 ⑭~⑱ + ⑫(D-69 이관).
 *   ⑭ 클릭 3폭×6회 · **매 회차 최종 URL search == `?intro=1&tour=1`**
 *      🔴 판정은 «replaceState 개수»가 아니다 — 라우터 동기화 replace 는 정상이다.
 *         재는 것은 «끝난 자리»(final search)와, 실패 시 그 replace 가 어디를 가리켰는가.
 *   ⑮ 대조군(`e904c47`) 같은 그물에서 **실패 회차 ≥1**(빨강). 🔴 수는 흔들린다 —
 *      고정 수를 인용하지 않는다(발주 명시).
 *   ⑯ 새로고침 뒤 URL 유지 + `tour-invite` 또는 `tour-callout` 1
 *   ⑰ 요소 = `<button>` · `<a>` 0 · 라벨 「튜토리얼」 · hit 44
 *   ⑱ 콘솔 0 (대조군과 «같은 경로»를 돈 뒤 차집합 — 모집단을 맞춘다)
 *   ⑫ 투어 9/9 카드 본문 = 「튜토리얼」 1 · 「?」 0 (대조군은 같은 자리에서 「?」 = 빨강)
 *
 * 🔴 무대가 안 울면(버튼 0) 색을 내지 않는다 — `exit 2`.
 */

import { chromium, webkit } from "@playwright/test";

const TGT = { shell: "http://127.0.0.1:8194", label: "대상" };
const CTL = { shell: "http://127.0.0.1:8195", label: "대조군" };
const WANT = "?intro=1&tour=1";
const RUNS = 6;
const rows = [];
const add = (ax, col, verdict, note) => rows.push({ ax, col, verdict, note });

/** history 를 후킹해 «누가 어디로» 밀었는지 값으로 남긴다(개수가 아니라 URL 을 본다). */
const HOOK = `(() => {
  window.__fkt = { push: [], repl: [] };
  const p = history.pushState, r = history.replaceState;
  history.pushState = function (s, t, u) { window.__fkt.push.push(String(u)); return p.apply(this, arguments); };
  history.replaceState = function (s, t, u) { window.__fkt.repl.push(String(u)); return r.apply(this, arguments); };
})();`;

async function openOverview(ctx, shell, width) {
  const page = await ctx.newPage();
  await page.addInitScript(HOOK);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${shell}/overview`, { waitUntil: "domcontentloaded" });
  const btn = page.getByTestId("intro-reopen");
  await btn.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  return { page, btn };
}

/** 한 회차 = 새 컨텍스트(캐시·prefetch 상태를 회차마다 새로 만든다 — 갈림의 축이 그것이었다). */
async function oneClick(browser, stage, width, bucket) {
  const ctx = await browser.newContext();
  const { page, btn } = await openOverview(ctx, stage.shell, width);
  page.on("console", (m) => { if (m.type() === "error") bucket.push(m.text().slice(0, 120)); });
  page.on("pageerror", (e) => bucket.push(`pageerror: ${String(e).slice(0, 120)}`));
  if ((await btn.count()) === 0) { await ctx.close(); return { stageless: true }; }
  await btn.click();
  // 🔴 고정 대기는 「안 일어남」을 만든다 — 목적지를 기다리되, 안 오면 그 사실을 값으로.
  await page.waitForFunction(
    (want) => location.search === want, WANT, { timeout: 6000 },
  ).catch(() => {});
  const search = await page.evaluate(() => location.search);
  const hist = await page.evaluate(() => window.__fkt || { push: [], repl: [] });
  const out = { ok: search === WANT, search, push: hist.push, repl: hist.repl, ctx, page };
  return out;
}

async function axis17(page, btn, stage) {
  const tag = await btn.evaluate((n) => n.tagName.toLowerCase());
  const label = ((await btn.innerText()) || "").trim();
  const box = await btn.boundingBox();
  const anchors = await page.getByTestId("intro-reopen").locator("a").count();
  add("⑰", stage.label, tag === "button" && anchors === 0 ? "PASS" : "FAIL",
      `태그=${tag}(기대 button) · 내부 <a>=${anchors}(기대 0)`);
  add("⑰", stage.label, label.includes("튜토리얼") ? "PASS" : "FAIL", `라벨=「${label}」`);
  /* 🔴 boundingBox 는 «그려진 상자»지 «눌리는 넓이»가 아니다 — ::before 로 넓힌 hit 영역은
     상자에 안 잡힌다. 중심에서 아래로 (44-h)/2+1 px 떨어진 좌표를 실제로 눌러 보고,
     그 점이 여전히 이 버튼이면 확장 hit 이 있는 것이다. */
  let reach = "미측";
  if (box) {
    const dy = Math.max(4, (44 - box.height) / 2 + 1);
    reach = await page.evaluate(([x, y]) => {
      const el = document.elementFromPoint(x, y);
      return el && el.closest('[data-testid="intro-reopen"]') ? "self" : (el ? el.tagName : "none");
    }, [box.x + box.width / 2, box.y + box.height / 2 + dy]);
  }
  const effective = box ? (reach === "self" ? 44 : box.height) : 0;
  add("⑰", stage.label, effective >= 44 ? "PASS" : "FAIL",
      `hit ${box ? `${Math.round(box.width)}×${Math.round(box.height)}` : "없음"} · 아래로 벗어난 점=${reach}` +
      ` ⇒ 유효 높이 ${effective}(기대 ≥44)`);
}

/** ⑯ + ⑫ — 새로고침 뒤 URL·투어 유지, 이어서 9/9 카드 본문을 실제로 밟아 읽는다. */
async function axis16and12(page, stage) {
  await page.reload({ waitUntil: "domcontentloaded" });
  const search = await page.evaluate(() => location.search);
  const invite = await page.getByTestId("tour-invite").count();
  const callout = await page.getByTestId("tour-callout").count();
  add("⑯", stage.label, search === WANT && invite + callout >= 1 ? "PASS" : "FAIL",
      `새로고침 뒤 search=「${search}」 · tour-invite=${invite} · tour-callout=${callout}`);

  const start = page.getByTestId("tour-start");
  if ((await start.count()) > 0) await start.click().catch(() => {});
  let last = "";
  let stuckAt = null;
  let why = "";
  for (let i = 0; i < 16; i += 1) {
    last = (await page.getByTestId("tour-callout").innerText().catch(() => "")) || "";
    if (/9\s*\/\s*9/.test(last)) break;
    const next = page.getByTestId("tour-next");
    if ((await next.count()) > 0 && (await next.isEnabled().catch(() => false))) {
      await next.click().catch(() => {});
    } else {
      // 🔴 `tour-await-click` 은 «대상을 직접» 눌러야 넘어간다(규격 §⑧-7).
      const await_ = page.getByTestId("tour-await-click");
      if ((await await_.count()) === 0) {
        stuckAt = last.match(/\d\s*\/\s*9/)?.[0] || "?";
        why = "다음 버튼도 await-click 도 없다";
        break;
      }
      const spot = page.getByTestId("tour-spotlight");
      const clicked = await spot.locator("a, button").first().click({ timeout: 2500 })
        .then(() => true).catch(() => false);
      if (!clicked) {
        const inner = await await_.locator("a, button, [role=button]").first().click({ timeout: 2500 })
          .then(() => true).catch(() => false);
        if (!inner) {
          stuckAt = last.match(/\d\s*\/\s*9/)?.[0] || "?";
          const ids = await page.locator("[data-testid]").evaluateAll(
            (ns) => [...new Set(ns.map((n) => n.getAttribute("data-testid")))].join(" "));
          add("⑫", stage.label, "관측", `${stuckAt} 에서 막힘 — 그 화면의 testid 실물: ${ids.slice(0, 300)}`);
          break;
        }
      }
    }
    await page.waitForTimeout(400);
  }
  if (/9\s*\/\s*9/.test(last)) {
    const tut = (last.match(/튜토리얼/g) || []).length;
    const q = (last.match(/「\?」/g) || []).length;
    add("⑫", stage.label, tut === 1 && q === 0 ? "PASS" : "FAIL",
        `9/9 카드 본문: 「튜토리얼」=${tut}(기대 1) · 「?」=${q}(기대 0)`);
    return;
  }
  /* 🔴 여기 오면 «못 읽은 것»이다 — 조용히 지나가지 않는다. 45대 초판은 이 갈래에서
     `stuckAt` 만 세우고 아무 행도 남기지 않아 ⑫ 가 표에서 통째로 사라졌다(자수). */
  const ids = await page.locator("[data-testid]").evaluateAll(
    (ns) => [...new Set(ns.map((n) => n.getAttribute("data-testid")))].join(" ")).catch(() => "");
  add("⑫", stage.label, "관측",
      `9/9 미도달 — 마지막 진행 「${last.match(/\d\s*\/\s*9/)?.[0] || "표시 없음"}」` +
      `${why ? ` · ${why}` : ""} · 그 화면 testid 실물: ${ids.slice(0, 220)}`);
}

async function column(browser, engine, width, stage, bucket) {
  let ok = 0;
  const fails = [];
  let keep = null;
  /* 🔴 **워밍은 기본 off 다 — 워밍이 자극을 먹는다.**
     45대 실측: 워밍 1회를 계수 밖에 두자 대조군의 실패 회차가 chromium 3폭에서 **0/6** 으로
     사라졌다(워밍 없이는 3/6·1/6·2/6). D-71 의 실패 조건은 «쿼리 없는 자기 자신의 prefetch 가
     이미 앉아 있는 첫 순간» 이고, 워밍이 바로 그 조건을 치워 버린다 — 빨강을 지운 초록은
     아무것도 증명하지 않는다. 사람이 처음 여는 조건이 진짜 무대다.
     첫 회차의 콜드 스타트가 걱정되면 `--warm` 으로 켜되, **그 회차의 대조군 수를 함께 보라.** */
  let warmOk = null;
  if (process.argv.includes("--warm")) {
    const warm = await oneClick(browser, stage, width, []);
    if (warm.stageless) return { stageless: true };
    warmOk = warm.ok;
    await warm.ctx.close();
  }
  for (let i = 0; i < RUNS; i += 1) {
    const r = await oneClick(browser, stage, width, bucket);
    if (r.stageless) return { stageless: true };
    if (r.ok) ok += 1;
    else fails.push({ search: r.search, repl: r.repl.slice(-2), push: r.push.slice(-2) });
    if (i === RUNS - 1) keep = r; else await r.ctx.close();
  }
  return { ok, fails, keep, warmOk };
}

async function run(browserType, engine, width) {
  const browser = await browserType.launch();
  const bucket = { tgt: [], ctl: [] };

  // ── ⑮ 대조군 먼저 — 실패 회차가 서야 대상의 6/6 이 뜻을 갖는다 ─────────────
  const c = await column(browser, engine, width, CTL, bucket.ctl);
  if (c.stageless) { console.log(`🔴 [${engine}/${width}] 대조군 무대 미성립 — 버튼 0`); await browser.close(); return 2; }
  add("⑮", CTL.label, c.fails.length >= 1 ? "PASS" : "FAIL",
      `실패 회차 ${c.fails.length}/${RUNS}(≥1 이면 빨강 확인 · 🔴 수는 흔들린다 · 워밍 ${c.warmOk === null ? "off" : "on"})` +
      (c.fails.length ? ` · 예: search=「${c.fails[0].search}」 repl=${JSON.stringify(c.fails[0].repl)}` : ""));
  // 대조군의 ⑫ 빨강 — 같은 자리에서 「?」 가 나오는가
  if (c.keep) {
    await axis16and12(c.keep.page, CTL).catch((e) => add("⑫", CTL.label, "관측", `그물 예외: ${String(e).slice(0, 90)}`));
    await c.keep.ctx.close();
  }

  // ── ⑭⑯⑰⑫ 대상 ───────────────────────────────────────────────────────────
  const t = await column(browser, engine, width, TGT, bucket.tgt);
  if (t.stageless) { console.log(`🔴 [${engine}/${width}] 대상 무대 미성립 — 버튼 0`); await browser.close(); return 2; }
  add("⑭", TGT.label, t.ok === RUNS ? "PASS" : "FAIL",
      `최종 search == 「${WANT}」 : ${t.ok}/${RUNS} (워밍 ${t.warmOk === null ? "off — 기본" : (t.warmOk ? "성공" : "실패")})` +
      (t.fails.length ? ` · 실패 예 search=「${t.fails[0].search}」 repl=${JSON.stringify(t.fails[0].repl)}` : ""));
  if (t.keep) {
    const btn = t.keep.page.getByTestId("intro-reopen");
    await axis17(t.keep.page, btn, TGT).catch(() => {});
    await axis16and12(t.keep.page, TGT).catch((e) => add("⑫", TGT.label, "관측", `그물 예외: ${String(e).slice(0, 90)}`));
    await t.keep.ctx.close();
  }

  // ⑱ — 모집단을 맞춘 차집합
  const noise = new Set(bucket.ctl.map((e) => e.replace(/\d+/g, "#")));
  const own = bucket.tgt.filter((e) => !noise.has(e.replace(/\d+/g, "#")));
  add("⑱", TGT.label, own.length === 0 ? "PASS" : "FAIL",
      `대상 ${bucket.tgt.length} · 대조군 ${bucket.ctl.length} · 대조군에 없는 것 ${own.length}` +
      (own.length ? ` → ${own.slice(0, 2).join(" | ")}` : ""));

  await browser.close();
  return 0;
}

const main = async () => {
  let worst = 0;
  const plan = [[chromium, "chromium", 1440], [chromium, "chromium", 1280], [chromium, "chromium", 390], [webkit, "webkit", 390]];
  for (const [bt, name, width] of plan) {
    console.log(`\n===== ${name} / ${width}px =====`);
    const before = rows.length;
    const rc = await run(bt, name, width);
    for (const r of rows.slice(before)) console.log(`  ${r.ax} ${r.verdict.padEnd(4)} [${r.col}] ${r.note}`);
    worst = Math.max(worst, rc);
    if (rc === 2) break;
  }
  console.log("\n" + "-".repeat(70));
  const f = rows.filter((r) => r.verdict === "FAIL");
  console.log(`PASS ${rows.filter((r) => r.verdict === "PASS").length} · FAIL ${f.length} · 관측 ${rows.filter((r) => r.verdict === "관측").length}`);
  process.exit(worst || (f.length ? 1 : 0));
};

main();
