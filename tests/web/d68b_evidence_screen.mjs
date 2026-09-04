/**
 * d68b_evidence_screen — D-68 b 셸 축(근거 화면 · 404 문면) 독립 검증 (검증 좌석 · 45대).
 *
 * 판정선 = 오케 발주 ⑧~⑬(계약 밖 = 규격). 좌표는 **코드에서 확인한 실물**만 쓴다:
 *   testid `graph-path-body`·`graph-path-steps`·`graph-path-walk`·`screen-unavailable`
 *   문면    「그런 항목이 없습니다.」 「이 정적 재생본에는 담기지 않은 자리입니다.」
 *           「서버에 닿지 못했습니다.」  (components/unavailable.tsx:30·31·38 — 마침표까지)
 *
 * 🔴 **열은 «짝»이다.** 손잡이를 하나로 줄이려고 옛 셸을 새 서버에 붙이면 GP 가 200 으로 와서
 *    판정선 문장이 아예 안 나온다 — 자극이 사라진 열이 된다(오케 21:41 이견 · 내가 그럴 뻔했다).
 *    그래서 대조군 = 옛 셸 + 옛 서버 **통째**. 「옛 셸 + 새 서버」는 부가 관측으로만 둔다.
 *
 * 🔴 **세션은 화면 흐름으로** — 내가 fetch 로 만든 run 은 셸 세션의 것이 아니다.
 * 🔴 무대가 안 울면(GP 링크 0) 색을 내지 않는다 — `exit 2`.
 */

// 이 lane 의 의존은 `@playwright/test` 다(`playwright` 아님 · package.json 실측).
import { chromium, webkit } from "@playwright/test";

const TGT = { shell: "http://127.0.0.1:8192", api: "http://127.0.0.1:8190/api", label: "대상" };
const CTL = { shell: "http://127.0.0.1:8193", api: "http://127.0.0.1:8191/api", label: "대조군" };
const OBS = { shell: "http://127.0.0.1:8193", api: "http://127.0.0.1:8190/api", label: "관측(옛셸+새서버)" };

const MSG_NOT_FOUND = "그런 항목이 없습니다.";
const MSG_STATIC_MISS = "이 정적 재생본에는 담기지 않은 자리입니다.";
const MSG_UNREACHABLE = "서버에 닿지 못했습니다.";

const rows = [];
const add = (ax, col, verdict, note) => rows.push({ ax, col, verdict, note });

/** 화면 흐름으로 조사를 시작하고, 근거 스트립의 GP 링크에 닿는다. */
async function reachGraphPath(page, shell, width) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${shell}/overview`, { waitUntil: "domcontentloaded" });
  // 🔴 투어 초대가 화면을 덮으면 「닿는다」와 「눌린다」가 갈린다 — 먼저 걷는다.
  //    `dismissed` 로 가는 손잡이는 Esc·`tour-skip` 뿐(「나중에」로는 안 된다).
  if ((await page.getByTestId("tour-invite").count()) > 0) {
    await page.keyboard.press("Escape").catch(() => {});
  }
  // 🔴 데이터가 오기 «전»에 찾으면 「없음」이 된다 — 고정 대기 말고 그 문구를 기다린다.
  const start = page.getByText("조사 시작", { exact: false }).first();
  await start.waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
  if ((await start.count()) === 0) return { ok: false, why: "「조사 시작」 없음" };
  const t0 = Date.now();
  await start.click();
  // 🔴 고정 대기는 「안 일어남」을 만든다 — 기다리되 기다린 시간을 값으로 낸다.
  await page.waitForURL(/\/incidents\//, { timeout: 20000 }).catch(() => {});
  const link = page.locator('a[href*="/evidence/GP-"]');
  await link.first().waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  const n = await link.count();
  if (n === 0) return { ok: false, why: "GP 링크 0", waited: Date.now() - t0 };
  const href = await link.first().getAttribute("href");
  return { ok: true, href, count: n, waited: Date.now() - t0 };
}

async function axis8(page, stage, width) {
  const reach = await reachGraphPath(page, stage.shell, width);
  if (!reach.ok) return { stageless: true, why: reach.why };
  await page.goto(`${stage.shell}${reach.href}`, { waitUntil: "domcontentloaded" });
  const body = page.getByTestId("graph-path-body");
  const bodyN = await body.count();
  const steps = page.getByTestId("graph-path-steps").locator("> li");
  const stepN = await steps.count();
  const walk = (await page.getByTestId("graph-path-walk").textContent().catch(() => "")) || "";
  const anchors = bodyN ? await body.locator("a").count() : -1;

  // 서버가 말한 값을 «따로» 가져와 화면과 대조한다(같은 파일끼리의 일치는 귀속이 아니다).
  // 🔴 href 는 `/evidence/GP-…-00?run=RUN-…` 꼴이다 — 쿼리를 떼지 않으면 id 가 아니다
  //    (45대 자수: 안 뗀 채로 `-97` 치환을 걸어 ⑨ 자극이 «없는 id» 가 아니게 됐다).
  const gpId = reach.href.split("/").pop().split("?")[0];
  const cookies = await page.context().cookies();
  const jar = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(`${stage.api}/evidence/${gpId}`, { headers: { Cookie: jar } });
  const server = res.ok ? await res.json() : null;
  const hops = server?.meta?.path?.hops;
  const expected = typeof hops === "number" ? hops + 1 : null;

  add("⑧", stage.label, bodyN === 1 ? "PASS" : "FAIL", `graph-path-body=${bodyN} (기대 1)`);
  add("⑧", stage.label, expected !== null && stepN === expected ? "PASS" : "FAIL",
      `걸음 li=${stepN} · meta.path.hops+1=${expected}`);
  add("⑧", stage.label, anchors === 0 ? "PASS" : "FAIL", `본문 <a>=${anchors} (기대 0)`);
  add("⑧", stage.label, walk.trim() === (server?.excerpt ?? "").trim() ? "PASS" : "FAIL",
      `walk == 서버 excerpt (화면 ${walk.length}자 · 서버 ${(server?.excerpt ?? "").length}자)`);
  add("⑧", stage.label, "관측", `GP 링크 ${reach.count}본 · 도달 ${reach.waited}ms · ${gpId}`);
  return { gpId, jar, ok: true };
}

/** 없는 GP id 를 직접 방문 — 서버가 404 로 «답한» 자리다(닿지 못한 게 아니다). */
async function axisMissing(page, stage, gpId, ax, expectMsg, label) {
  const dead = gpId ? gpId.replace(/-\d\d$/, "-97") : "GP-000000000000-97";
  await page.goto(`${stage.shell}/evidence/${dead}`, { waitUntil: "domcontentloaded" });
  const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const hitWanted = txt.includes(expectMsg);
  const hitUnreachable = txt.includes(MSG_UNREACHABLE);
  add(ax, stage.label, hitWanted && !hitUnreachable ? "PASS" : "FAIL",
      `${label}: 「${expectMsg}」=${hitWanted ? "출현" : "0"} · 「${MSG_UNREACHABLE}」=${hitUnreachable ? "출현" : "0"}`);
  return { hitWanted, hitUnreachable, dead };
}

async function axis12(page, stage) {
  /* ⑫ D-69 — 투어 **9/9 카드**의 문면을 실제로 밟아 읽는다.
     🔴 번들 grep 으로 대신하지 않는다 — 「문자열이 코드에 있다」와 「그 카드가 그걸 그린다」는
        다른 사실이다. 진행 손잡이는 `tour-next`(있을 때) · `tour-await-click` 단계는 대상을
        직접 눌러야 넘어간다(규격 §⑧-3). 못 밟으면 «안 잼»으로 남긴다. */
  const ctx = page.context();
  await ctx.clearCookies().catch(() => {});
  await page.goto(`${stage.shell}/overview?intro=1&tour=1`, { waitUntil: "domcontentloaded" });
  const start = page.getByTestId("tour-start");
  await start.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  if ((await start.count()) === 0) {
    add("⑫", stage.label, "관측", "tour-start 0 — 투어를 열지 못했다(안 잼)");
    return;
  }
  await start.click();
  let progress = "";
  for (let i = 0; i < 14; i += 1) {
    // 🔴 `tour-progress` 의 textContent 는 «빈 문자열»이었다(실측) — 진행 표시는
    //    callout 본문의 「n/9」 다. 없는 자리에서 읽고 「미도달」이라 적을 뻔했다.
    progress = (await page.getByTestId("tour-callout").innerText().catch(() => "")) || "";
    if (/9\s*\/\s*9/.test(progress)) break;
    const next = page.getByTestId("tour-next");
    if ((await next.count()) > 0 && (await next.isEnabled().catch(() => false))) {
      await next.click().catch(() => {});
    } else {
      const await_ = page.getByTestId("tour-await-click");
      if ((await await_.count()) > 0) {
        await await_.locator("a, button").first().click().catch(() => {});
      } else break;
    }
    await page.waitForTimeout(350);
  }
  const card = (await page.getByTestId("tour-callout").innerText().catch(() => "")) || "";
  const reached = /9\s*\/\s*9/.test(card) || /9\s*\/\s*9/.test(progress);
  if (!reached) {
    const seen = (progress.match(/\d\s*\/\s*9/g) || []).slice(-1)[0] || "없음";
    add("⑫", stage.label, "관측", `9/9 미도달 — 마지막 진행 표시 「${seen}」 (안 잼)`);
    return;
  }
  const tut = (card.match(/튜토리얼/g) || []).length;
  const qmark = (card.match(/「\?」/g) || []).length;
  add("⑫", stage.label, tut === 1 && qmark === 0 ? "PASS" : "FAIL",
      `9/9 카드: 「튜토리얼」=${tut}(기대 1) · 「?」=${qmark}(기대 0)`);
}

async function run(browserType, engineName, width) {
  const browser = await browserType.launch();
  const errors = { tgt: [], ctl: [] };
  const mk = async (bucket) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") bucket.push(m.text().slice(0, 160)); });
    page.on("pageerror", (e) => bucket.push(`pageerror: ${String(e).slice(0, 160)}`));
    return page;
  };

  // ── ⑪ 대조군(옛 셸 + 옛 서버) 먼저 — 빨강이 서야 아래 초록이 뜻을 갖는다 ──────
  const cpage = await mk(errors.ctl);
  const creach = await reachGraphPath(cpage, CTL.shell, width);
  if (!creach.ok) {
    console.log(`🔴 [${engineName}/${width}] 대조군 무대 미성립 — ${creach.why}`);
    await browser.close();
    return 2;
  }
  await cpage.goto(`${CTL.shell}${creach.href}`, { waitUntil: "domcontentloaded" });
  const ctlTxt = (await cpage.locator("body").innerText()).replace(/\s+/g, " ");
  const ctlRed = ctlTxt.includes(MSG_UNREACHABLE);
  add("⑪", CTL.label, ctlRed ? "PASS" : "FAIL",
      `옛 짝 GP 경로: 「${MSG_UNREACHABLE}」=${ctlRed ? "출현(빨강 확인)" : "0"} · 「${MSG_NOT_FOUND}」=${ctlTxt.includes(MSG_NOT_FOUND)}`);

  // ── ⑧⑨⑩⑫ 대상 ────────────────────────────────────────────────────────────
  const tpage = await mk(errors.tgt);
  const a8 = await axis8(tpage, TGT, width);
  if (a8.stageless) {
    console.log(`🔴 [${engineName}/${width}] 대상 무대 미성립 — ${a8.why}`);
    await browser.close();
    return 2;
  }
  await axisMissing(tpage, TGT, a8.gpId, "⑨", MSG_NOT_FOUND, "없는 GP(서버 404)");
  // ⑩ 정적 재생본 — 재생 run 의 GP id 는 녹화 run 을 가리켜 이 셸 경로에서 STATIC_MISS 가 된다.
  await tpage.goto(`${TGT.shell}/evidence/GP-6c01759e7f43-00`, { waitUntil: "domcontentloaded" });
  const staticTxt = (await tpage.locator("body").innerText()).replace(/\s+/g, " ");
  add("⑩", TGT.label,
      staticTxt.includes(MSG_STATIC_MISS) || staticTxt.includes(MSG_NOT_FOUND) ? "PASS" : "FAIL",
      `정적 미스: 「${MSG_STATIC_MISS}」=${staticTxt.includes(MSG_STATIC_MISS)} · 「${MSG_NOT_FOUND}」=${staticTxt.includes(MSG_NOT_FOUND)} · 「${MSG_UNREACHABLE}」=${staticTxt.includes(MSG_UNREACHABLE)}`);
  // ── ⑬ 콘솔 — 🔴 «같은 경로»를 돈 뒤에 뺀다. 대조군이 GP 페이지만 보고 대상이 더
  //    많은 화면을 돌면 두 모집단이 달라 「대조군에 없는 것」이 부풀려진다(45대 자수).
  await cpage.goto(`${CTL.shell}/evidence/${(a8.gpId || "GP-x-00").replace(/-\d\d$/, "-97")}`,
                   { waitUntil: "domcontentloaded" }).catch(() => {});
  await cpage.goto(`${CTL.shell}/overview`, { waitUntil: "domcontentloaded" }).catch(() => {});
  // ── ⑬ 콘솔 — 대조군과 같은 잡음은 빼고 센다 ──────────────────────────────
  const noise = new Set(errors.ctl.map((e) => e.replace(/\d+/g, "#")));
  const own = errors.tgt.filter((e) => !noise.has(e.replace(/\d+/g, "#")));
  add("⑬", TGT.label, own.length === 0 ? "PASS" : "FAIL",
      `대상 콘솔오류 ${errors.tgt.length} · 대조군 ${errors.ctl.length} · 대조군에 없는 것 ${own.length}` +
      (own.length ? ` → ${own.slice(0, 2).join(" | ")}` : ""));

  // ⑫ 는 ⑬ «뒤»에 돈다 — 이 경로는 대상 열에만 있어, 먼저 돌면 콘솔 모집단이 갈린다.
  await axis12(tpage, TGT);

  await browser.close();
  return rows.some((r) => r.verdict === "FAIL") ? 1 : 0;
}

const main = async () => {
  let worst = 0;
  for (const [bt, name, width] of [[chromium, "chromium", 1280], [chromium, "chromium", 390], [webkit, "webkit", 390]]) {
    console.log(`\n===== ${name} / ${width}px =====`);
    const before = rows.length;
    const rc = await run(bt, name, width);
    for (const r of rows.slice(before)) console.log(`  ${r.ax} ${r.verdict.padEnd(4)} [${r.col}] ${r.note}`);
    worst = Math.max(worst, rc);
    if (rc === 2) break;
  }
  console.log("\n" + "-".repeat(70));
  const f = rows.filter((r) => r.verdict === "FAIL").length;
  const p = rows.filter((r) => r.verdict === "PASS").length;
  console.log(`PASS ${p} · FAIL ${f} · 관측 ${rows.filter((r) => r.verdict === "관측").length}`);
  console.log("안 잰 것 — 투어 9/9 카드 도달(문면은 번들 grep) · replay 501 문면(도달 불가) · 실기기");
  process.exit(worst);
};

main();
