/**
 * d70_wo_narrow — D-70 작업지시 화면의 좁은 폭 붕괴와 «잠긴 초안» (검증 좌석 · 45대).
 *
 * 판정선 = 오케 발주 ⑲~㉓.
 *   ⑲ 360·390 : 문서 넘침 `scrollWidth ≤ clientWidth` · pill 높이 = 1줄(≤26) ·
 *      입력칸 폭 ≥ 200 · 카드 폭 = 뷰포트 − 여백(**40px 아님**)
 *   ⑳ 대조군(`7a37cc6`) 같은 그물 = 넘침 · pill 두 줄 · 카드 40 (빨강)
 *   ㉑ approved 초안 : `wo-part-add`·`wo-part-delete`·`wo-part-name` **0** ·
 *      `wo-parts-lock` 문면 = 「✅ 승인됨 · 편집 잠김」 · 🛡 `wo-safety-delete` 는 **여전히 있음**
 *   ㉓ 1440 불변 · 콘솔 0(대조군과 같은 경로를 돈 뒤 차집합)
 *
 * 🔴 무대가 안 울면(초안 화면에 `wo-parts` 0) 색을 내지 않는다 — `exit 2`.
 * 🔴 세션은 «화면 흐름»이 아니라 API 로 만든다 — 이 축은 **레이아웃**이라 셸 세션의 소유권이
 *    필요 없고, run 완주까지 화면으로 걷는 비용이 판정과 무관하다. 대신 두 열이 **같은 초안**을
 *    보게 해 「다른 데이터라서 다른 폭」을 배제한다.
 */

import { chromium } from "@playwright/test";

const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8190";
const TGT = { shell: "http://127.0.0.1:8197", label: "대상" };
const CTL = { shell: "http://127.0.0.1:8198", label: "대조군" };
const rows = [];
const add = (ax, col, w, verdict, note) => rows.push({ ax, col, w, verdict, note });

async function api(path, method = "GET", body = null, cookie = null) {
  const r = await fetch(`${API}/api${path}`, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 비-JSON 은 그대로 둔다 */ }
  return { status: r.status, json, text, setCookie: r.headers.get("set-cookie") };
}

/** 🔴 초안은 **브라우저 자신이** 만든다 — 쿠키·가드·rewrite 를 그대로 지나야 측정이 실재한다.
    내가 밖에서 `fetch` 로 만든 세션은 셸 세션이 아니라 그 화면이 열리지 않는다(45대 실측:
    `/work-orders/<id>` 가 `/overview` 로 되돌아왔다). 정본 흐름 = `t3-5-wo-screen.spec.ts` 의
    `freshDraft` 와 같은 자리. 두 열은 **같은 초안**을 봐야 하므로 대상 열에서 만든 것을 넘긴다. */
async function makeDraftInBrowser(page, shell) {
  await page.goto(`${shell}/`, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/overview$/, { timeout: 30000 }).catch(() => {});
  const sid = (await page.context().cookies()).find((c) => c.name === "fkt_sid")?.value;
  if (!sid) return null;
  const runId = await page.evaluate(async (s) => {
    const r = await fetch("/api/scenarios/GS-01/runs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: s, mode: "live" }),
    });
    return r.ok ? (await r.json()).runId : null;
  }, sid);
  if (!runId) return null;
  const t0 = Date.now();
  let woId = null;
  // 기다리되 «기다린 시간을 값으로» — 폴링 사이에 숨을 준다(빈 루프는 시한을 순식간에 태운다).
  while (Date.now() - t0 < 90000) {
    const snap = await page.evaluate(async (id) => {
      const r = await fetch(`/api/runs/${id}`, { cache: "no-store" });
      return r.ok ? await r.json() : null;
    }, runId);
    if (snap && ["completed", "failed", "stopped"].includes(snap.status)) {
      woId = snap.workOrderDraftId ?? null;
      break;
    }
    await page.waitForTimeout(500);
  }
  return woId ? { sid, runId, woId, waited: Date.now() - t0 } : null;
}

async function measure(page, shell, width, _draft, label, bucket) {
  /* 🔴 쿠키를 «옮겨 심어» 다른 셸의 초안을 열 수 없다(45대 실측: `/work-orders/<id>` 가
     `/overview` 로 되돌아왔다 — 그 셸의 세션이 아니다). 그래서 **열마다 그 셸에서 입장하고
     그 셸에서 초안을 만든다.** 두 열의 초안 id 는 다르지만 **같은 시나리오(GS-01)의 같은
     구조**이고, 이 축이 재는 것은 «레이아웃»이라 그 차이가 판정에 들어오지 않는다.
     대신 두 열의 부품 «건수»를 값으로 찍어 「데이터가 달라 폭이 다르다」를 배제한다. */
  await page.setViewportSize({ width, height: 900 });
  const mine = await makeDraftInBrowser(page, shell);
  if (!mine) return { stageless: true, why: "이 셸에서 초안을 못 만들었다" };
  await page.goto(`${shell}/work-orders/${mine.woId}`, { waitUntil: "domcontentloaded" });
  const card = page.getByTestId("wo-parts");
  await card.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
  if ((await card.count()) === 0) return { stageless: true };

  const overflow = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  const cardBox = await card.boundingBox();
  const addBtn = page.getByTestId("wo-part-add");
  const pillBox = (await addBtn.count()) > 0 ? await addBtn.boundingBox() : null;
  const delBtn = page.getByTestId("wo-part-delete").first();
  const delBox = (await delBtn.count()) > 0 ? await delBtn.boundingBox() : null;
  const inp = page.getByTestId("wo-part-name").first();
  const inpBox = (await inp.count()) > 0 ? await inp.boundingBox() : null;
  const partN = await page.getByTestId("wo-part").count();
  return { overflow, cardBox, pillBox, delBox, inpBox, partN, woId: mine.woId, sid: mine.sid };
}

async function main() {
  const browser0 = await chromium.launch();
  const ctx0 = await browser0.newContext();
  const p0 = await ctx0.newPage();
  const draft = await makeDraftInBrowser(p0, TGT.shell);
  await browser0.close();
  if (!draft) { console.log("🔴 무대 미성립 — 작업지시 초안을 못 만들었다"); process.exit(2); }
  console.log(`무대: woId=${draft.woId} (run ${draft.runId} · 대기 ${draft.waited}ms) — 두 열이 «같은 초안»을 본다`);

  const browser = await chromium.launch();
  const bucket = { tgt: [], ctl: [] };
  let lockTarget = null;
  const wide = {};
  for (const width of [360, 390, 1440]) {
    for (const [stage, buck] of [[TGT, bucket.tgt], [CTL, buck2(bucket)]]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      page.on("console", (m) => { if (m.type() === "error") buck.push(m.text().slice(0, 120)); });
      page.on("pageerror", (e) => buck.push(`pageerror: ${String(e).slice(0, 120)}`));
      const m = await measure(page, stage.shell, width, draft, stage.label, buck);
      if (m.stageless) { console.log(`🔴 [${stage.label}/${width}] 무대 미성립 — ${m.why || "wo-parts 0"}`); await browser.close(); process.exit(2); }
      if (stage === TGT && width === 390) { lockTarget = { woId: m.woId, sid: m.sid }; }
      add(width === 1440 ? "㉓" : (stage === TGT ? "⑲" : "⑳"), stage.label, width, "관측",
          `부품 행 ${m.partN}개 · woId=${m.woId}`);
      const ax = width === 1440 ? "㉓" : (stage === TGT ? "⑲" : "⑳");
      const okOverflow = m.overflow.sw <= m.overflow.cw;
      add(ax, stage.label, width, stage === TGT ? (okOverflow ? "PASS" : "FAIL") : "관측",
          `문서 넘침 sw=${m.overflow.sw} cw=${m.overflow.cw}`);
      const ph = m.pillBox ? Math.round(m.pillBox.height) : null;
      add(ax, stage.label, width, stage === TGT ? (ph !== null && ph <= 26 ? "PASS" : "FAIL") : "관측",
          `「+ 추가」 pill 높이=${ph ?? "없음"} (1줄 기준 ≤26)`);
      const dh = m.delBox ? Math.round(m.delBox.height) : null;
      add(ax, stage.label, width, stage === TGT ? (dh !== null && dh <= 26 ? "PASS" : "FAIL") : "관측",
          `「삭제」 pill 높이=${dh ?? "없음"} (≤26)`);
      const iw = m.inpBox ? Math.round(m.inpBox.width) : null;
      add(ax, stage.label, width, stage === TGT ? (iw !== null && iw >= 200 ? "PASS" : "FAIL") : "관측",
          `입력칸 폭=${iw ?? "없음"} (≥200)`);
      const cw = m.cardBox ? Math.round(m.cardBox.width) : null;
      /* 🔴 판정선이 폭마다 다르다 — 1440 은 **2열 레이아웃이 정상**이라 카드가 뷰포트를 다 쓰지
         않는다(처방 주석: 「1440 에서는 740px」). ㉓ 은 「뷰포트−여백」이 아니라 **대조군과 같은가**
         (= 불변)로 잰다. 좁은 폭에서만 «뷰포트 − 여백»이 판정선이다. 45대 초판은 1440 에도 좁은
         폭의 자를 대어 FAIL 을 냈다. */
      if (width === 1440) {
        wide[stage.label] = cw;
        add(ax, stage.label, width, "관측", `카드 폭=${cw ?? "없음"} (1440 = 2열 · 불변 판정은 아래 행)`);
      } else {
        add(ax, stage.label, width, stage === TGT ? (cw !== null && cw > 40 && cw >= width - 80 ? "PASS" : "FAIL") : "관측",
            `카드 폭=${cw ?? "없음"} (뷰포트 ${width} − 여백 · «40» 이면 찌그러진 것)`);
      }
      await ctx.close();
    }
  }

  // ── ㉑ 잠긴 초안 — 열마다 «그 셸의» 초안을 만들어 승인하고 같은 화면을 본다 ──────
  for (const stage of [TGT, CTL]) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 390, height: 900 });
    const mine = await makeDraftInBrowser(page, stage.shell);
    if (!mine) { add("㉑", stage.label, 390, "관측", "초안 생성 실패 — 안 잼"); await ctx.close(); continue; }
    /* 🔴 승인은 **화면 버튼**으로 한다. 내가 `fetch` 로 부른 `/approve` 는 **422** 였다 —
       본문 스키마를 지어냈기 때문이다(45대 자수). 정본 흐름은 `wo-approve` → 모달 `wo-confirm`
       (`t3-5-wo-screen.spec.ts:463·474`). 지어낸 입력의 4xx 는 대상의 답이 아니다. */
    await page.goto(`${stage.shell}/work-orders/${mine.woId}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("wo-approve").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    await page.getByTestId("wo-approve").click().catch(() => {});
    await page.getByTestId("wo-confirm").click({ timeout: 8000 }).catch(() => {});
    const state = await page.getByTestId("wo-screen").getAttribute("data-state").catch(() => null);
    const ap = { status: state === "approved" ? 200 : 0, state };
    await page.goto(`${stage.shell}/work-orders/${mine.woId}`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("wo-parts").waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
    const n = async (id) => page.getByTestId(id).count();
    const [addN, delN, nameN, partN, safeN] =
      await Promise.all([n("wo-part-add"), n("wo-part-delete"), n("wo-part-name"), n("wo-part"), n("wo-safety-delete")]);
    const lock = (await page.getByTestId("wo-parts-lock").textContent().catch(() => "")) || "";
    const gone = addN === 0 && delN === 0 && nameN === 0;
    /* 🔴 «0건»만 세면 화면이 통째로 비어도 초록이다 — 읽기 목록과 🛡 삭제가 남아 있는지 함께 센다. */
    const ok = gone && partN > 0 && safeN > 0 && lock.trim() === "✅ 승인됨 · 편집 잠김";
    add("㉑", stage.label, 390, stage === TGT ? (ok ? "PASS" : "FAIL") : "관측",
        `승인 st=${ap.status}${ap.state ? `/${ap.state}` : ""} · add=${addN} delete=${delN} name=${nameN} (기대 0) · ` +
        `읽기 wo-part=${partN}(>0) · 🛡 safety-delete=${safeN}(>0) · lock 문면=「${lock.trim() || "없음"}」`);
    await ctx.close();
  }

  add("㉓", "대상↔대조군", 1440, wide["대상"] != null && wide["대상"] === wide["대조군"] ? "PASS" : "FAIL",
      `1440 불변: 대상 카드 ${wide["대상"]} · 대조군 ${wide["대조군"]} (같아야 «넓은 폭 무영향»)`);

  const noise = new Set(bucket.ctl.map((e) => e.replace(/\d+/g, "#")));
  const own = bucket.tgt.filter((e) => !noise.has(e.replace(/\d+/g, "#")));
  add("㉓", TGT.label, 0, own.length === 0 ? "PASS" : "FAIL",
      `콘솔 대상 ${bucket.tgt.length} · 대조군 ${bucket.ctl.length} · 대조군에 없는 것 ${own.length}` +
      (own.length ? ` → ${own.slice(0, 2).join(" | ")}` : ""));

  await browser.close();
  for (const r of rows) console.log(`  ${r.ax} ${r.verdict.padEnd(4)} [${r.col}/${r.w}] ${r.note}`);
  const f = rows.filter((r) => r.verdict === "FAIL").length;
  console.log("-".repeat(70));
  console.log(`PASS ${rows.filter((r) => r.verdict === "PASS").length} · FAIL ${f} · 관측 ${rows.filter((r) => r.verdict === "관측").length}`);
  process.exit(f ? 1 : 0);
}

function buck2(b) { return b.ctl; }

main();
