/**
 * T7-B · 레이아웃 «상단 기준선» 관측 — 처방 «전» 기준선.
 *
 * 폐하 하명(2026-09-03 19:44): 「레이아웃 틀 라인을 맞춰라 · 우측이 더 올라가 보인다」.
 * 처방이 오면 「맞춰졌다」를 말해야 하는데, **처방 전 값이 없으면 「원래 그랬는지」를 못 가른다.**
 *
 * 🔴 이 자는 **셀렉터를 먼저 적지 않는다.** 「좌측 탭 행」·「우측 알람 묶음」 같은 이름을 내가
 *    고르면, 처방이 다른 요소를 건드렸을 때 내 판정선이 헛다리를 짚는다. 대신 **주 레이아웃
 *    컨테이너의 직계 자식 전부**의 상단 좌표를 있는 그대로 적는다 — 어긋남은 «형제들의 top 이
 *    갈리는 것»으로 드러나고, 그 판단은 값을 보고 나중에 한다.
 *
 * 🔴 판정하지 않는다. 관측이다. 「몇 px 어긋나면 결함인가」는 정본이 정하지 이 자가 정하지 않는다.
 *
 * 사용: node t7b_layout_alignment.mjs --base http://127.0.0.1:3102 --out <디렉토리>
 */
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, enterShell } from "./t64_baseline_shots.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://127.0.0.1:3102");
const OUT = arg("out", "");
if (!OUT) throw new Error("--out 이 필요하다");
fs.mkdirSync(OUT, { recursive: true });

const BROWSERS = arg("browsers", "chromium").split(",");
const WIDTHS = arg("widths", "768,1024,1280").split(",").map(Number);
const SCREENS = [
  { id: "overview", route: "/overview" },
  { id: "incident", route: "/incidents/INC-2025-019" },
  { id: "compare", route: "/compare" },
];

const READ = () => {
  const label = (el) => ({
    tag: el.tagName.toLowerCase(),
    testid: el.getAttribute("data-testid") ?? el.querySelector("[data-testid]")?.getAttribute("data-testid") ?? null,
    cls: String(el.className || "").slice(0, 60),
  });
  /**
   * 🔴 「상자가 맞았다」와 「눈에 맞아 보인다」는 다르다. 열 상자의 top 이 같아도, 그 안에서
   *    **처음 잉크가 찍히는 자리**가 다르면 사람 눈에는 한쪽이 올라가 보인다 — 폐하 하명의
   *    「우측이 더 올라가 보인다」가 그 형태다. 그래서 열마다 «첫 잉크»의 top 을 따로 잰다.
   *    잉크 = 배경이 칠해졌거나 · 테두리가 있거나 · 자기 텍스트를 직접 가진 상자.
   */
  const firstInkTop = (root) => {
    const stack = [...root.children];
    let best = null;
    let guard = 0;
    while (stack.length && guard++ < 400) {
      const el = stack.shift();
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.height < 6 || r.width < 6) continue;
      const painted =
        (cs.backgroundColor && !/rgba?\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) ||
        Number.parseFloat(cs.borderTopWidth) > 0 ||
        [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
      if (painted) {
        if (best === null || r.top < best) best = r.top;
        continue; // 더 깊이 안 판다 — 가장 바깥의 잉크가 «보이는 윗선»이다
      }
      stack.push(...el.children);
    }
    return best === null ? null : Math.round(best * 10) / 10;
  };

  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top * 10) / 10, left: Math.round(r.left * 10) / 10, w: Math.round(r.width), h: Math.round(r.height) };
  };

  // 주 레이아웃 컨테이너를 «구조»로 찾는다 — 이름이 아니라 「main 안에서 자식이 2개 이상 가로로
  // 나란한 상자」. 이름으로 찾으면 이름이 바뀔 때 이 자가 조용히 빈손이 된다.
  const main = document.querySelector("main") ?? document.body;
  const groups = [];
  const walk = (el, depth) => {
    if (depth > 4) return;
    const kids = [...el.children].filter((c) => {
      const cs = getComputedStyle(c);
      if (cs.display === "none" || cs.visibility === "hidden") return false;
      const r = c.getBoundingClientRect();
      return r.width > 40 && r.height > 20;
    });
    if (kids.length >= 2) {
      const tops = kids.map((k) => k.getBoundingClientRect().top);
      const lefts = kids.map((k) => k.getBoundingClientRect().left);
      // 🔴 「가로로 나란하다」와 「격자가 줄바꿈했다」는 다르다. 첫 판에서 6장짜리 카드 격자가
      //    spread=800px 로 잡혔다 — 줄이 바뀐 것이지 어긋난 게 아니다. 그건 내 그물이 만든 빨강이다.
      //    참 열의 조건: 자식마다 left 가 «모두 다르다»(반복 = 줄바꿈) + 열이 2~4개다.
      const distinctLefts = new Set(lefts.map((l) => Math.round(l))).size;
      const sideBySide = distinctLefts === kids.length && kids.length >= 2 && kids.length <= 4;
      if (sideBySide) {
        groups.push({
          container: label(el),
          containerBox: boxOf(el),
          // 🔴 판정이 아니라 관측 — 형제들의 top 을 있는 그대로, 그리고 그 «퍼짐»을 함께.
          spreadPx: Math.round((Math.max(...tops) - Math.min(...tops)) * 10) / 10,
          inkSpreadPx: (() => {
            const inks = kids.map((k) => firstInkTop(k)).filter((v) => v !== null);
            return inks.length >= 2 ? Math.round((Math.max(...inks) - Math.min(...inks)) * 10) / 10 : null;
          })(),
          children: kids.map((k) => ({ ...label(k), ...boxOf(k), inkTop: firstInkTop(k) })),
        });
      }
    }
    for (const c of kids) walk(c, depth + 1);
  };
  walk(main, 0);
  // 랜드마크 측정이 «같은 손»으로 잉크를 재도록 내보낸다 — 두 벌이면 규격도 두 벌이다.
  window.__fktInkTop = firstInkTop;
  return { groups, mainBox: boxOf(main) };
};

/**
 * 🔴 이름 붙인 자리 — 오케가 코드에서 특정해 준 좌표(overview-body.tsx 208·246·249·318·406).
 *    나도 소스에서 대조했다(같은 줄 번호 실측). 구조 탐색이 못 잡은 split 을 여기서 «직접» 짚는다.
 *    🔴 없는 자리는 **0 이 아니라 「못 잰 것」**으로 돌려준다 — 셀렉터가 죽으면 조용히 초록이 난다.
 */
const LANDMARKS = {
  overview: [
    { id: "equipment-grid", sel: '[data-testid="equipment-grid"]' },
    { id: "equipment-first-card", sel: '[data-testid="equipment-grid"] [data-testid="equipment-card"]' },
    { id: "overview-aside", sel: 'aside[aria-label="알람과 시나리오"]' },
    // 🔴 「aside 는 바로 alarm-dock 으로 시작한다」는 소스 읽기의 결론이었는데, **런타임은 다르다** —
    //    안내 카드(「처음 오셨나요?」 h=326)가 그 위에 있다. 그래서 «첫 자식»을 이름으로 따로 잡는다:
    //    비교해야 할 것은 정해진 컴포넌트가 아니라 **각 열에서 처음 보이는 카드**다.
    { id: "equipment-tab-row", sel: '[data-testid="equipment-grid"] > *:first-child' },
    { id: "aside-first-card", sel: 'aside[aria-label="알람과 시나리오"] > *:first-child' },
    { id: "alarm-dock", sel: '[data-testid="alarm-dock"]' },
    { id: "scenario-dock", sel: '[data-testid="scenario-dock"]' },
  ],
};
/** 비교 축 = 「좌측 열의 첫 카드」 ↔ 「우측 묶음의 첫 카드」. 상자와 잉크를 둘 다 본다. */
const PAIRS = {
  overview: [
    // 🔴 이 축이 하명의 축이다 — 「각 열에서 처음 보이는 카드」의 윗선.
    ["equipment-first-card", "aside-first-card"],
    // 열 상자 자체(이건 맞아 있을 수 있다 — 그래서 둘 다 본다)
    ["equipment-grid", "overview-aside"],
    // 참고: 정해진 컴포넌트끼리(안내 카드가 없는 상태에서의 모습)
    ["equipment-first-card", "alarm-dock"],
  ],
};

const report = { at: new Date().toISOString(), base: BASE, note: "관측 · 판정 아님 · 처방 전 기준선", rows: [], landmarks: [], errors: [] };

for (const name of BROWSERS) {
  const browser = await launchBrowser(name);
  for (const width of WIDTHS) {
    // 🔴 `reducedMotion` 을 강제한다. 두 회차에서 `equipment-first-card` 의 top 이 627.7 / 635.7 로
    //    8px 흔들렸다 — `fkt-stagger` 가 아직 앉는 중이었다. 흔들리는 기준선은 「처방이 고쳤다」와
    //    「애니메이션 위상이 달랐다」를 못 가른다.
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: "dark", reducedMotion: "reduce" });
    const page = await ctx.newPage();
    try {
      await enterShell(page, BASE);
      for (const s of SCREENS) {
        await page.goto(`${BASE}${s.route}`, { waitUntil: "domcontentloaded" });
        await page.waitForLoadState("load").catch(() => {});
        await page.waitForTimeout(450);
        const v = await page.evaluate(READ);
        report.rows.push({ browser: name, width, screen: s.id, ...v });

        const marks = LANDMARKS[s.id];
        if (marks) {
          const got = await page.evaluate(
            ({ marks, pairs }) => {
              const inkOf = window.__fktInkTop;
              const boxes = {};
              for (const m of marks) {
                const el = document.querySelector(m.sel);
                if (!el) {
                  boxes[m.id] = { found: false };
                  continue;
                }
                const r = el.getBoundingClientRect();
                boxes[m.id] = {
                  found: true,
                  top: Math.round(r.top * 10) / 10,
                  left: Math.round(r.left * 10) / 10,
                  w: Math.round(r.width),
                  h: Math.round(r.height),
                  inkTop: inkOf(el),
                };
              }
              const out = [];
              for (const [a, b] of pairs) {
                const A = boxes[a];
                const B = boxes[b];
                if (!A?.found || !B?.found) {
                  out.push({ a, b, measurable: false, why: "자리 없음" });
                  continue;
                }
                // 🔴 나란히 서 있지 않으면(세로 스택) 상단 비교는 «뜻이 없다» — 0 이 아니라 미측이다.
                const sideBySide = Math.abs(A.left - B.left) > 8;
                out.push({
                  a,
                  b,
                  measurable: sideBySide,
                  why: sideBySide ? null : "세로 스택(같은 열) — 상단 비교 무의미",
                  boxDeltaPx: sideBySide ? Math.round((A.top - B.top) * 10) / 10 : null,
                  inkDeltaPx:
                    sideBySide && A.inkTop != null && B.inkTop != null
                      ? Math.round((A.inkTop - B.inkTop) * 10) / 10
                      : null,
                  aTop: A.top,
                  bTop: B.top,
                  aInk: A.inkTop,
                  bInk: B.inkTop,
                });
              }
              return { boxes, pairs: out };
            },
            { marks, pairs: PAIRS[s.id] },
          );
          report.landmarks.push({ browser: name, width, screen: s.id, ...got });
        }
      }
    } catch (e) {
      report.errors.push({ browser: name, width, message: String(e).slice(0, 300) });
    } finally {
      await ctx.close();
    }
  }
  await browser.close();
}

fs.writeFileSync(path.join(OUT, "t7b-layout-alignment.json"), JSON.stringify(report, null, 2), "utf8");

// 요약 — 「가로로 나란한 묶음 중 상단이 갈린 것」만 뽑는다(0 이면 어긋남 없음).
const out = [];
for (const r of report.rows) {
  for (const g of r.groups) {
    if (g.spreadPx > 0.5 || (g.inkSpreadPx ?? 0) > 0.5) {
      out.push(
        `${r.screen}@${r.width} 상자spread=${g.spreadPx}px 잉크spread=${g.inkSpreadPx}px  container=${g.container.tag}.${g.container.cls.split(" ")[0]}` +
          ` :: ` +
          g.children.map((c) => `${c.testid ?? c.tag + "." + c.cls.split(" ")[0]}#top=${c.top}/ink=${c.inkTop}`).join("  |  "),
      );
    }
  }
}
console.log(JSON.stringify({ rows: report.rows.length, misalignedGroups: out.length, errors: report.errors.length }, null, 1));
for (const l of out) console.log(l);

console.log("--- 이름 붙인 자리(overview) ---");
for (const L of report.landmarks) {
  for (const [id, b] of Object.entries(L.boxes)) {
    console.log(`  ${L.screen}@${L.width} ${id.padEnd(22)} ${b.found ? `top=${b.top} ink=${b.inkTop} left=${b.left} ${b.w}x${b.h}` : "🔴 자리 없음(못 잰 것)"}`);
  }
  for (const pr of L.pairs) {
    console.log(
      `  ${L.screen}@${L.width} [${pr.a} ↔ ${pr.b}] ` +
        (pr.measurable ? `상자Δ=${pr.boxDeltaPx}px 잉크Δ=${pr.inkDeltaPx}px (${pr.aTop}/${pr.aInk} vs ${pr.bTop}/${pr.bInk})` : `미측 — ${pr.why}`),
    );
  }
}
