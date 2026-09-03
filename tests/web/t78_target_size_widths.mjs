/**
 * T7-8a — WCAG **2.5.8 / 2.5.5** 를 «폭 축»으로 전개한다.
 *
 * 🔴 **찾는 것 = 「교차가 처음 생기는 폭」**. Spacing 예외는 «간격»이 조건이라 폭이 줄면 요소가
 *    붙어 깨진다 — 1440 의 초록은 1440 의 초록일 뿐이다(T7-4 자수 §5).
 *
 * 🔴 **D-41** — 폭이 줄면 레일이 접히고 바가 뜨는데 **`data-testid` 가 양쪽에 같다.**
 *    그래서 `checkVisibility()`(+ `offsetParent` 폴백)로 **숨은 쪽을 버린다.** 안 버리면
 *    「같은 이름의 두 대상」이 서로의 원을 교차시켜 **없는 위반을 만든다.**
 *
 * 🔴 **대조군도 늙는다**(36대가 T7-6 에서 겪은 것). 심어 두는 대조 요소의 «전제»가 폭에 따라
 *    죽는다 — 1200px 에 둔 통과-보장 버튼은 390 뷰포트에서 **화면 밖**이다. 그래서 좌표를
 *    **뷰포트 상대**로 잡고, **폭마다 대조군을 다시 세운다.**
 *
 * 🔴 **합격선이 둘이다. 오늘까지 우리가 쓴 44 단일 자는 «AAA 자»였다.**
 *
 * 판정선 = SC 원문(w3.org/WAI/WCAG22/Understanding/target-size-minimum.html · 2026-09-03 실독):
 *   > "The size of the target for pointer inputs is at least **24 by 24 CSS pixels**, except when:"
 *   > **Spacing:** "Undersized targets (those less than 24 by 24 CSS pixels) are positioned so that
 *   >   if a **24 CSS pixel diameter circle is centered on the bounding box of each**, the circles
 *   >   **do not intersect another target or the circle for another undersized target**"
 *   > **Equivalent** / **Inline** / **User agent control** / **Essential** (나머지 4예외)
 *   2.5.5 Target Size (Enhanced · **AAA**) = **44×44 · 예외 없음**.
 *
 * 🔴 **이 그물이 기계로 판정하는 예외는 «Spacing» 하나뿐이다.**
 *    Equivalent·Inline·Essential 은 **의미 판단**이라 기계가 못 정한다. 그래서 이 그물의 빨강은
 *    **「AA 위반」이 아니라 「AA 위반 후보(Spacing 예외 미충족)」**다 — 나머지 4예외로 면제될 수
 *    있다. **Inline 후보**(문장 안에 든 링크)는 따로 표시해 사람이 판단하게 남긴다.
 *
 * 🔴 **블랙박스 규칙** — `data-testid` 셀렉터를 **안 쓴다**. 대상은 **HTML 의미**(a[href]·button·
 *    input·select·textarea·[role=button|link|checkbox|…]·[tabindex])로 모으고, **접근 가능한
 *    이름**(aria-label · 텍스트 · title · alt)과 **화면 좌표**로만 식별한다.
 *
 * 🔴 **이 측정이 사람보다 유리한 점**(폐하 가이드 §6 제3규칙 · 고정 기재):
 *    나는 `getBoundingClientRect` 로 **소수점까지의 경계 상자**를 직접 읽는다 — 사람은 그 상자를
 *    볼 수 없고, 「눌러 봐서 빗나가는지」로만 안다. 반대로 나는 **무엇이 «하나의 대상»인지**를
 *    사람처럼 못 가른다(시각적으로 한 덩어리인 두 요소를 둘로 셀 수 있다).
 *
 * 사용: node t74_target_size.mjs --base http://127.0.0.1:3112 --pointer fine|coarse --out x.json
 */
import fs from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { chromium, devices } = require_("@playwright/test");

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3112");
const POINTER = arg("pointer", "both");
const OUT = arg("out", "");

const ROUTES = [
  ["overview", "/overview"],
  ["incident", "/incidents/INC-2026-014?run=STATIC-GS-01"],
  ["evidence", "/evidence/MR-2025-0087?run=STATIC-GS-01"],
];
const WIDTHS = [390, 768, 1024, 1280, 1440, 1920];

const SCAN = () => {
  const SEL = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
    '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    "[tabindex]",
  ].join(",");

  const name = (el) => {
    const al = el.getAttribute("aria-label");
    if (al) return al.trim().slice(0, 48);
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 48);
    return (el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("name") || "(이름 없음)").slice(0, 48);
  };
  const roleOf = (el) => {
    const r = el.getAttribute("role");
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "input") return `input:${el.getAttribute("type") ?? "text"}`;
    return tag;
  };

  const targets = [];
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
    if (el.getAttribute("tabindex") === "-1" && !el.matches("a[href],button,input,select,textarea,summary")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (cs.pointerEvents === "none") continue;
    if (cs.clip && cs.clip !== "auto") continue; // sr-only
    if (cs.clipPath && cs.clipPath !== "none") continue;
    /* 🔴 **D-41** — 접힌 레일과 뜬 바가 «같은 testid» 를 쓴다. 숨은 쪽을 집으면 두 대상이
       서로의 24px 원을 교차시켜 **없는 위반**을 만든다. 보이는 것만 남긴다. */
    const visible = typeof el.checkVisibility === "function"
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : !!el.offsetParent;
    if (!visible) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom <= 0 || r.top >= document.documentElement.scrollHeight) continue;

    /* 🔴 «Inline» 예외 후보 — 문장 안에 든 링크인가. 형제로 실제 텍스트가 있으면 후보다.
       기계는 여기까지만 하고 «판단»은 사람에게 남긴다. */
    const p = el.parentElement;
    const inlineCandidate =
      !!p &&
      cs.display.startsWith("inline") &&
      Array.from(p.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);

    /* 🔴 **경계 상자 ≠ 실제 눌리는 자리.** 이 코드베이스는 `.fkt-hit::before` 로 히트 영역을
       `max(100%, 2.75rem)` 까지 «세로로만» 넓힌다 — `getBoundingClientRect()` 는 그 확장을
       **못 본다**(첫 실행이 AAA 0/65 를 낸 이유). 2.5.8 의 주어는 「pointer 가 실제로 잡는
       target」이므로 **`elementFromPoint` 로 눌리는 상자를 직접 훑는다.**
       🔴 1px 격자 스캔이라 참값은 [span, span+2] 사이다 — **관대한 상한(span+2)으로 판정**해
       내가 위반을 «과다» 신고하지 않게 한다(35대 「+0.6px 편향」 자리). */
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const owns = (x, y) => {
      const e = document.elementFromPoint(x, y);
      // 🔴 부모를 «소유»로 세면 안 된다 — 밖으로 걸어 나가 부모 컨테이너에 닿는 순간
      //    그 컨테이너 크기가 이 대상의 히트 상자로 둔갑한다(11px ✕ 가 39px 로 부풀었다).
      //    의사요소(::before)는 elementFromPoint 가 «요소 자신»을 돌려주므로 부모는 불필요하다.
      return !!e && (e === el || el.contains(e));
    };
    let hit = null;
    if (owns(cx, cy)) {
      const walk = (dx, dy) => { let k = 0; for (let s = 1; s <= 60; s++) { if (!owns(cx + dx * s, cy + dy * s)) break; k = s; } return k; };
      const L = walk(-1, 0), R2 = walk(1, 0), U = walk(0, -1), D = walk(0, 1);
      hit = { left: cx - L, right: cx + R2, top: cy - U, bottom: cy + D, w: L + R2 + 2, h: U + D + 2 };
    }

    targets.push({
      role: roleOf(el),
      name: name(el),
      // 🔴 판정에 쓰는 값 = 히트 상자(관대한 상한). 스캔 실패(중심이 가려짐)면 경계 상자로 대체하고 표시한다.
      w: Number((hit ? hit.w : r.width).toFixed(2)),
      h: Number((hit ? hit.h : r.height).toFixed(2)),
      boxW: Number(r.width.toFixed(2)),
      boxH: Number(r.height.toFixed(2)),
      hitScanned: !!hit,
      // 🔴 Spacing 예외 산식도 «실제 눌리는 상자» 위에서 돈다 — 원의 중심과 교차 상대가 그 상자다.
      cx: Number(cx.toFixed(2)),
      cy: Number(cy.toFixed(2)),
      left: Number((hit ? hit.left : r.left).toFixed(2)),
      top: Number((hit ? hit.top : r.top).toFixed(2)),
      right: Number((hit ? hit.right : r.right).toFixed(2)),
      bottom: Number((hit ? hit.bottom : r.bottom).toFixed(2)),
      inlineCandidate,
    });
  }
  return {
    targets,
    pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    pointerFine: window.matchMedia("(pointer: fine)").matches,
    anyHover: window.matchMedia("(any-hover: hover)").matches,
  };
};

/* ── 판정 산식(SC 문면 그대로) ───────────────────────────────────────────── */
const R = 12; // 지름 24 → 반지름 12
const circleHitsRect = (c, t) => {
  const nx = Math.max(t.left, Math.min(c.cx, t.right));
  const ny = Math.max(t.top, Math.min(c.cy, t.bottom));
  return Math.hypot(c.cx - nx, c.cy - ny) < R;
};
const circlesHit = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < R * 2;

function judge(targets) {
  const under = (t) => t.w < 24 || t.h < 24;
  const rows = targets.map((t, i) => {
    const aaaPass = t.w >= 44 && t.h >= 44;
    if (!under(t)) return { ...t, i, undersized: false, aaPass: true, why: "24×24 이상", partners: [], aaaPass };
    const partners = [];
    targets.forEach((o, j) => {
      if (i === j) return;
      // ① 내 원이 «다른 대상»과 교차하는가
      if (circleHitsRect(t, o)) partners.push({ kind: "target", role: o.role, name: o.name });
      // ② 내 원이 «다른 미달 대상의 원»과 교차하는가
      else if (under(o) && circlesHit(t, o)) partners.push({ kind: "circle", role: o.role, name: o.name });
    });
    return {
      ...t, i, undersized: true,
      aaPass: partners.length === 0,
      why: partners.length === 0 ? "Spacing 예외로 통과" : "Spacing 예외 미충족",
      partners: partners.slice(0, 4),
      partnerCount: partners.length,
      aaaPass,
    };
  });
  return rows;
}

const die = (why, extra) => {
  console.error(`[exit2] ${why}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(2);
};

/* ── 대조군 — 같은 실행에서 «양방향» ──────────────────────────────────────
   ① 위반 보장: 12×12 버튼 두 개를 6px 간격으로 → 원끼리 반드시 교차 ⇒ aaPass=false 여야 한다.
   ② 통과 보장: 60×60 버튼 하나를 화면 구석 빈 자리에 → aaPass·aaaPass 모두 true 여야 한다.
   한 방향만 검사하면 「전부 위반이라 답하는 자」도, 「전부 통과라 답하는 자」도 초록을 낸다. */
const CONTROL_PLANT = () => {
  const mk = (id, x, y, s) => {
    const b = document.createElement("button");
    b.id = id;
    b.setAttribute("aria-label", id);
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${s}px;height:${s}px;z-index:2147483000;`;
    document.body.appendChild(b);
  };
  mk("__ctl_bad_a__", 300, 400, 12);
  mk("__ctl_bad_b__", 318, 400, 12); // 중심 간 18px < 24 ⇒ 원 교차
  mk("__ctl_good__", 1200, 700, 60);
};
const CONTROL_REMOVE = () =>
  ["__ctl_bad_a__", "__ctl_bad_b__", "__ctl_good__"].forEach((id) => document.getElementById(id)?.remove());

const browser = await chromium.launch();

const out = {
  base: BASE, at: new Date().toISOString(),
  sc: {
    "2.5.8": "at least 24 by 24 CSS pixels, except: Spacing / Equivalent / Inline / User agent control / Essential. (AA)",
    spacing: "if a 24 CSS pixel diameter circle is centered on the bounding box of each undersized target, the circles do not intersect another target or the circle for another undersized target.",
    "2.5.5": "44 by 44 CSS pixels, no exception. (AAA)",
    machineJudged: "Spacing 만 기계 판정 — 빨강은 «AA 위반 후보»다.",
  },
  controls: [], cells: [],
};

/* 🔴 대조군을 «뷰포트 상대»로 심고 **폭마다 다시 세운다** — 고정 좌표는 좁은 폭에서 화면 밖으로
   나가 전제가 죽는다(「대조군도 늙는다」). */
const PLANT = ({ w, h }) => {
  const mk = (id, x, y, sz) => {
    const b = document.createElement("button");
    b.id = id; b.setAttribute("aria-label", id);
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;z-index:2147483000;`;
    document.body.appendChild(b);
  };
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  mk("__ctl_bad_a__", cx - 21, cy, 12);
  mk("__ctl_bad_b__", cx - 3, cy, 12);   // 중심 간 18px < 24 ⇒ 원 교차
  mk("__ctl_good__", Math.max(4, w - 80), Math.max(4, h - 80), 60);
};
const REMOVE = () => ["__ctl_bad_a__", "__ctl_bad_b__", "__ctl_good__"].forEach((id) => document.getElementById(id)?.remove());

for (const pointer of (POINTER === "both" ? ["fine", "coarse"] : [POINTER])) {
  for (const width of WIDTHS) {
    const ctx = await browser.newContext({
      viewport: { width, height: 900 },
      ...(pointer === "coarse" ? { hasTouch: true } : {}),
    });
    const page = await ctx.newPage();
    await page.route("**/api/live/status", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ online: false, checkedAt: new Date().toISOString() }) }),
    );

    let controlDone = false;
    for (const [label, path] of ROUTES) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(700);
      const media = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);

      if (!controlDone) {
        await page.evaluate(PLANT, { w: width, h: 900 });
        await page.waitForTimeout(150);
        const cs = await page.evaluate(SCAN);
        const crows = judge(cs.targets);
        const bad = crows.find((r) => r.name === "__ctl_bad_a__");
        const good = crows.find((r) => r.name === "__ctl_good__");
        await page.evaluate(REMOVE);
        await page.waitForTimeout(120);
        out.controls.push({ pointer, width, bad: bad ? { size: `${bad.w}x${bad.h}`, aaPass: bad.aaPass, partners: bad.partnerCount } : null, good: good ? { size: `${good.w}x${good.h}`, aaPass: good.aaPass, aaaPass: good.aaaPass } : null });
        if (!bad) die(`대조군① 소실 — ${pointer}/${width}px 에서 심은 12x12 가 모집단에 없다(전제 죽음)`, { pointer, width });
        if (bad.aaPass) die(`대조군① 불발 — ${pointer}/${width}px: 18px 간격 12x12 두 개를 «통과»라 했다`, bad);
        if (!good) die(`대조군② 소실 — ${pointer}/${width}px 에서 심은 60x60 이 모집단에 없다(화면 밖 = 전제 죽음)`, { pointer, width });
        if (!good.aaPass || !good.aaaPass) die(`대조군② 불발 — ${pointer}/${width}px: 60x60 단독을 «위반»이라 했다`, good);
        controlDone = true;
      }

      const scan = await page.evaluate(SCAN);
      const rows = judge(scan.targets);
      const aaFail = rows.filter((r) => !r.aaPass);
      const aaaFail = rows.filter((r) => !r.aaaPass);
      out.cells.push({
        pointer, mediaCoarse: media, width, route: label,
        total: rows.length,
        undersized24: rows.filter((r) => r.undersized).length,
        aaPass: rows.length - aaFail.length, aaFailCount: aaFail.length,
        aaaPass: rows.length - aaaFail.length, aaaFailCount: aaaFail.length,
        aaFailures: aaFail.map((r) => ({ role: r.role, name: r.name, size: `${r.w}×${r.h}`, partnerCount: r.partnerCount, partners: r.partners, inlineCandidate: r.inlineCandidate })),
      });
    }
    await page.close();
    await ctx.close();
  }
}

/* 🔴 찾는 값 = 「교차가 처음 생기는 폭」. */
const firstBreak = {};
for (const pointer of ["fine", "coarse"]) {
  const hits = out.cells.filter((c) => c.pointer === pointer && c.aaFailCount > 0).map((c) => c.width);
  firstBreak[pointer] = hits.length ? Math.max(...hits) : null; // 폭이 «줄면» 깨지므로 깨진 폭 중 가장 넓은 것이 경계
}
out.total = {
  cells: out.cells.length,
  aaFailCells: out.cells.filter((c) => c.aaFailCount > 0).length,
  firstBreakWidth: firstBreak,
  aaFailUnique: [...new Set(out.cells.flatMap((c) => c.aaFailures.map((f) => `${f.role}:${f.name}`)))],
};
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log(`대조군 ${out.controls.length}벌(폭×pointer마다) — 전부 양방향 통과`);
for (const pointer of ["fine", "coarse"]) {
  console.log(`
=== pointer ${pointer} ===`);
  for (const w of WIDTHS) {
    const cs = out.cells.filter((c) => c.pointer === pointer && c.width === w);
    if (!cs.length) continue;
    const t = cs.reduce((a, c) => ({ total: a.total + c.total, u: a.u + c.undersized24, aaF: a.aaF + c.aaFailCount, aaaP: a.aaaP + c.aaaPass }), { total: 0, u: 0, aaF: 0, aaaP: 0 });
    console.log(`  ${String(w).padStart(4)}px  대상 ${String(t.total).padStart(3)} · 24미만 ${String(t.u).padStart(3)} · AA 통과 ${t.total - t.aaF}/${t.total}${t.aaF ? ` 🔴위반후보 ${t.aaF}` : ""} · AAA 통과 ${t.aaaP}/${t.total}`);
    for (const c of cs) for (const f of c.aaFailures) console.log(`        🔴 ${c.route} ${f.role} 「${f.name}」 ${f.size} — 교차 ${f.partnerCount}: ${f.partners.map((x) => `${x.kind}:${x.name}`).join(" | ")}`);
  }
}
console.log(`
🔴 교차가 생기는 폭: fine=${firstBreak.fine ?? "없음"} · coarse=${firstBreak.coarse ?? "없음"}`);
console.log(`AA 위반 요소: ${JSON.stringify(out.total.aaFailUnique)}`);
await browser.close();
