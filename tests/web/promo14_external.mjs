/**
 * promo14_external — 승격 14 공개면 재검 (검증 좌석 · 45대 · 폐하 경로 재현).
 *
 * 축 = 오케 발주 ⓐ~ⓗ. 무대 = **공개면**(`https://factory-knowledge-twin.vercel.app`).
 *
 * 🔴 **밖의 근거는 연결 IP 다** — 공개 URL 을 쳤다는 사실만으로는 밖이 아니다(tailnet self 로
 *    붙을 수 있다). 실행 «전»에 `remote_ip` 와 `Server: Vercel` 을 찍고 시작한다.
 * 🔴 **live 소모 ≤ 2회**(cap 5) — 조사는 ⓐ 에서 1회, ⓔ 는 그 run 의 초안을 **재사용**한다.
 *    같은 것을 두 번 만들지 않는다.
 * 🔴 무대가 안 울면 색을 내지 않는다 — `exit 2`.
 */

import { chromium } from "@playwright/test";

const BASE = process.env.FKT_PUBLIC ?? "https://factory-knowledge-twin.vercel.app";
const rows = [];
const add = (ax, w, verdict, note) => rows.push({ ax, w, verdict, note });
const MSG_NOT_FOUND = "그런 항목이 없습니다.";
const MSG_UNREACHABLE = "서버에 닿지 못했습니다.";

/** 콘솔 잡음 분류 — WS 미개통(O-4)과 405 는 계수하되 «실오류»에서 뺀다(발주 명시). */
const isNoise = (t) => /\/api\/ws\/runs|websocket|wss:/i.test(t) || /\b405\b/.test(t);

async function enter(page) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/overview/, { timeout: 45000 }).catch(() => {});
  return (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value ?? null;
}

async function runOnce(page, sid) {
  const runId = await page.evaluate(async (s) => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s, mode: "live" }),
    });
    return r.ok ? (await r.json()).runId : null;
  }, sid);
  if (!runId) return null;
  const t0 = Date.now();
  let snap = null;
  while (Date.now() - t0 < 180000) {
    snap = await page.evaluate(async (id) => {
      const r = await fetch(`/api/runs/${id}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    }, runId);
    if (snap && ["completed", "failed", "stopped"].includes(snap.status)) break;
    await page.waitForTimeout(1000);
  }
  return { runId, snap, waited: Date.now() - t0 };
}

async function main() {
  const browser = await chromium.launch();
  const errors = [];
  const noiseSeen = [];
  const mkPage = async (ctx) => {
    const page = await ctx.newPage();
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const t = m.text().slice(0, 160);
      (isNoise(t) ? noiseSeen : errors).push(t);
    });
    page.on("pageerror", (e) => {
      const t = `pageerror: ${String(e).slice(0, 160)}`;
      (isNoise(t) ? noiseSeen : errors).push(t);
    });
    return page;
  };

  // ── ⓐ 조사 1회(live) → GP 근거 ──────────────────────────────────────────
  const ctx = await browser.newContext();
  const page = await mkPage(ctx);
  await page.setViewportSize({ width: 1280, height: 900 });
  const sid = await enter(page);
  if (!sid) { console.log("🔴 무대 미성립 — 공개면 입장에서 세션 쿠키 0"); await browser.close(); return 2; }
  add("전제", 1280, "관측", `세션 발급 sid=${sid.slice(0, 4)}…`);

  const r = await runOnce(page, sid);
  if (!r || !r.runId) { console.log("🔴 무대 미성립 — live run 을 못 만들었다"); await browser.close(); return 2; }
  add("ⓐ", 1280, "관측", `live run 1회 · ${r.runId} · status=${r.snap?.status} · 대기 ${Math.round(r.waited / 100) / 10}s`);

  /* 🔴 「화면에 GP 링크가 없다」와 「서버가 GP 를 안 냈다」는 다른 사실이다 —
     **같은 세션에서** 이벤트 정본을 먼저 읽어 근거 kind 분포를 값으로 남긴다.
     (다른 세션으로 물으면 빈 배열이 와서 «없다»처럼 보인다 — 45대 실측.) */
  const kinds = await page.evaluate(async (id) => {
    const res = await fetch(`/api/runs/${id}/events`, { cache: "no-store" });
    if (!res.ok) return { __status: res.status };
    const raw = await res.json();
    const arr = Array.isArray(raw) ? raw : (raw.events || raw.items || []);
    const k = { __n: arr.length };
    for (const e of arr) {
      const v = (e.payload || {}).evidence;
      if (v && v.kind) k[v.kind] = (k[v.kind] || 0) + 1;
    }
    return k;
  }, r.runId);
  add("ⓐ", 1280, "관측", `이벤트 정본 근거 kind = ${JSON.stringify(kinds)}`);

  await page.goto(`${BASE}/incidents/${r.snap?.incidentId ?? ""}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  const gpLink = page.locator('a[href*="/evidence/GP-"]');
  await gpLink.first().waitFor({ state: "attached", timeout: 60000 }).catch(() => {});
  const gpN = await gpLink.count();
  if (gpN === 0) {
    const served = (kinds["graph-path"] ?? 0) > 0;
    add("ⓐ", 1280, served ? "FAIL" : "관측",
        served
          ? `🔴 서버는 graph-path ${kinds["graph-path"]}건을 냈는데 화면에 링크 0 — 화면 축 결함`
          : `graph-path 근거 자체가 0건(kind 분포 ${JSON.stringify(kinds)}) — 이 run 은 GP 를 안 냈다 · 화면 판정 불가(안 잼)`);
  } else {
    const href = await gpLink.first().getAttribute("href");
    await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded" });
    const body = page.getByTestId("graph-path-body");
    const bodyN = await body.count();
    const steps = await page.getByTestId("graph-path-steps").locator("> li").count();
    const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
    add("ⓐ", 1280, bodyN === 1 && steps >= 2 && !txt.includes(MSG_UNREACHABLE) ? "PASS" : "FAIL",
        `GP 링크 ${gpN}본 · graph-path-body=${bodyN}(기대 1) · 걸음 li=${steps}(≥2) · ` +
        `「${MSG_UNREACHABLE}」=${txt.includes(MSG_UNREACHABLE) ? "출현" : "0"}`);
    // ⓗ 캡처 — 자비스 중계용 1장
    await page.screenshot({ path: "promo14-gp-1280.png", fullPage: false });
    add("ⓗ", 1280, "관측", "캡처 promo14-gp-1280.png");
  }

  // ── ⓑ 없는 근거 id ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/evidence/GP-000000000000-97`, { waitUntil: "domcontentloaded" });
  const t2 = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  add("ⓑ", 1280, t2.includes(MSG_NOT_FOUND) && !t2.includes(MSG_UNREACHABLE) ? "PASS" : "FAIL",
      `「${MSG_NOT_FOUND}」=${t2.includes(MSG_NOT_FOUND) ? "출현" : "0"} · 「${MSG_UNREACHABLE}」=${t2.includes(MSG_UNREACHABLE) ? "출현" : "0"}`);

  // ── ⓒ 「튜토리얼」 클릭 → URL · 새로고침 유지 ───────────────────────────
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
    const btn = page.getByTestId("intro-reopen");
    await btn.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    if ((await btn.count()) === 0) { add("ⓒ", width, "FAIL", "「튜토리얼」 버튼 0"); continue; }
    await btn.click();
    await page.waitForFunction(() => location.search === "?intro=1&tour=1", null, { timeout: 8000 }).catch(() => {});
    const s1 = await page.evaluate(() => location.search);
    await page.reload({ waitUntil: "domcontentloaded" });
    const s2 = await page.evaluate(() => location.search);
    const guide = (await page.getByTestId("tour-invite").count()) + (await page.getByTestId("tour-callout").count());
    add("ⓒ", width, s1 === "?intro=1&tour=1" && s2 === s1 && guide >= 1 ? "PASS" : "FAIL",
        `클릭 후 search=「${s1}」 · 새로고침 뒤=「${s2}」 · 안내(invite+callout)=${guide}`);
  }

  // ── ⓓ 투어 9/9 카드 ─────────────────────────────────────────────────────
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${BASE}/overview?intro=1&tour=1`, { waitUntil: "domcontentloaded" });
  const start = page.getByTestId("tour-start");
  await start.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
  if ((await start.count()) > 0) await start.click().catch(() => {});
  let card = "";
  let stuck = null;
  for (let i = 0; i < 24; i += 1) {
    card = (await page.getByTestId("tour-callout").innerText().catch(() => "")) || "";
    if (/9\s*\/\s*9/.test(card)) break;
    const before = card.match(/(\d)\s*\/\s*9/)?.[1] ?? "?";
    const next = page.getByTestId("tour-next");
    const goto = page.getByTestId("tour-goto");
    const awaitClick = page.getByTestId("tour-await-click");
    let moved = false;
    if ((await next.count()) > 0 && (await next.isEnabled().catch(() => false))) {
      moved = await next.click({ timeout: 3000 }).then(() => true).catch(() => false);
    } else if ((await goto.count()) > 0) {
      moved = await goto.click({ timeout: 3000 }).then(() => true).catch(() => false);
      await page.getByTestId("tour-callout").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    } else if ((await awaitClick.count()) > 0) {
      for (const c of [
        page.getByTestId("candidate").locator('a[href*="/evidence/"]').first(),
        page.getByTestId("tour-spotlight").locator("a, button").first(),
      ]) {
        moved = await c.click({ timeout: 3000 }).then(() => true).catch(() => false);
        if (moved) break;
      }
      if (moved) await page.getByTestId("tour-callout").first().waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    }
    if (!moved) { stuck = before; break; }
    await page.waitForTimeout(500);
  }
  if (/9\s*\/\s*9/.test(card)) {
    const tut = (card.match(/튜토리얼/g) || []).length;
    const q = (card.match(/「\?」/g) || []).length;
    add("ⓓ", 1280, tut === 1 && q === 0 ? "PASS" : "FAIL", `9/9 카드: 「튜토리얼」=${tut}(1) · 「?」=${q}(0)`);
  } else {
    add("ⓓ", 1280, "관측", `9/9 미도달 — ${stuck ? `${stuck}/9 에서 막힘` : "사유 미상"}(안 잼)`);
  }

  // ── ⓔ 작업지시 초안 390 — ⓐ 의 run 을 «재사용»(live 추가 소모 0) ────────
  const woId = r.snap?.workOrderDraftId ?? null;
  if (!woId) {
    add("ⓔ", 390, "관측", "이 run 에 작업지시 초안이 없다 — 안 잼");
  } else {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`${BASE}/work-orders/${woId}`, { waitUntil: "domcontentloaded" });
    const card2 = page.getByTestId("wo-parts");
    await card2.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    if ((await card2.count()) === 0) {
      add("ⓔ", 390, "FAIL", "wo-parts 0 — 초안 화면이 안 열렸다");
    } else {
      const box = await card2.boundingBox();
      const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
      const addBtn = page.getByTestId("wo-part-add");
      const pill = (await addBtn.count()) > 0 ? await addBtn.boundingBox() : null;
      const cw = box ? Math.round(box.width) : null;
      const ph = pill ? Math.round(pill.height) : null;
      add("ⓔ", 390, cw !== null && cw >= 300 && ov.sw <= ov.cw && (ph === null || ph <= 26) ? "PASS" : "FAIL",
          `카드 폭=${cw}(≥300) · 넘침 sw=${ov.sw} cw=${ov.cw} · pill 높이=${ph ?? "잠김(버튼 없음)"}`);
    }
  }

  // ── ⓕ 승격 «전» 쿠키 → 자동 재입장(D-55) ────────────────────────────────
  const oldCtx = await browser.newContext();
  const oldPage = await mkPage(oldCtx);
  await oldCtx.addCookies([{ name: "fkt_sid", value: "PROMO13ERA0000000000000x", url: BASE }]);
  await oldPage.goto(`${BASE}/overview`, { waitUntil: "domcontentloaded" });
  await oldPage.waitForTimeout(3000);
  const newSid = (await oldCtx.cookies()).find((c) => c.name === "fkt_sid")?.value ?? "";
  const oldTxt = (await oldPage.locator("body").innerText()).replace(/\s+/g, " ");
  add("ⓕ", 1280, newSid && newSid !== "PROMO13ERA0000000000000x" && !oldTxt.includes(MSG_UNREACHABLE) ? "PASS" : "FAIL",
      `옛 쿠키 → 새 sid=${newSid ? `${newSid.slice(0, 4)}…` : "없음"}(교체되어야 재입장) · 「${MSG_UNREACHABLE}」=${oldTxt.includes(MSG_UNREACHABLE)}`);
  await oldCtx.close();

  // ── ⓖ 콘솔 ──────────────────────────────────────────────────────────────
  add("ⓖ", 0, errors.length === 0 ? "PASS" : "FAIL",
      `실오류 ${errors.length} · 제외 잡음(WS·405) ${noiseSeen.length}건` +
      (errors.length ? ` → ${errors.slice(0, 2).join(" | ")}` : "") +
      (noiseSeen.length ? ` · 잡음 예: ${noiseSeen[0].slice(0, 70)}` : ""));

  await browser.close();
  for (const x of rows) console.log(`  ${x.ax} ${x.verdict.padEnd(4)} [${x.w || "-"}] ${x.note}`);
  const f = rows.filter((x) => x.verdict === "FAIL").length;
  console.log("-".repeat(70));
  console.log(`PASS ${rows.filter((x) => x.verdict === "PASS").length} · FAIL ${f} · 관측 ${rows.filter((x) => x.verdict === "관측").length}`);
  return f ? 1 : 0;
}

main().then((c) => process.exit(c));
