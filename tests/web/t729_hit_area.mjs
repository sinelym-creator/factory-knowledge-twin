/**
 * T7-29 독립 검증 — 「보이는 것은 1px 도 안 움직이고, 누르는 상자만 44 로 편다」. 리바이2 39대.
 *
 * 처방(#566 `f6556b4` · `components/live-status.tsx`) = 띠 최소 높이를 **36.5 로 되돌리고**,
 * ✕ 의 «실제 박스»를 **아래로만** 늘려(`pb` + 같은 값 음수 `mb`) 44 를 만든다.
 *
 * 🔴 그래서 이 그물은 **다섯 축을 «따로»** 낸다 — 하나로 뭉치면 「눌린다」가 「안 움직였다」를 덮는다.
 *   ① ✕ 히트 박스 ≥ 44(세로·가로)  ② 띠 높이(1440 = 36.5 · 390 = 79)  ③ 본문 첫 y **불변**
 *   ④ 이웃 오클릭 0(늘린 아래쪽이 «✕ 것»이고, 그 «바로 밖»은 ✕ 가 아니다)
 *   ⑤ 🔴 **O-3 = 1440 `nav-incidents` 히트 «세로»** — 36 이면 회부(D-50)
 *
 * 🔴 ③ 은 «전/후 두 셸»을 같은 실행에서 재야 성립한다. 값 하나로는 「안 움직였다」를 못 말한다.
 *
 * 사용: node t729_hit_area.mjs --after=http://127.0.0.1:8798 --before=http://127.0.0.1:8796
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const AFTER = arg("after", "http://127.0.0.1:8798");
const BEFORE = arg("before", "http://127.0.0.1:8796");
const OUT = arg("json", null);
const WIDTHS = [
  { w: 1440, h: 900 },
  { w: 390, h: 844 },
];

const MEASURE = () => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) };
  };
  const banner = document.querySelector('[data-testid="fallback-banner"]');
  /* ✕ 는 배너 «안»의 닫기 버튼 — 이름을 지어내지 않고 배너에서 찾는다. */
  const close = banner
    ? (Array.from(banner.querySelectorAll("button")).find((b) => /닫기|dismiss|close/i.test(b.getAttribute("aria-label") ?? "")) ??
       banner.querySelector("button"))
    : null;
  const nav = document.querySelector('[data-testid="nav-incidents"]');
  const main = document.querySelector("main");
  const firstChild = main?.firstElementChild ?? null;
  const heading = document.querySelector("main h1, main h2");

  /* 히트 판정 — 「닿는다 ≠ 눌린다」라 실제 점을 찍어 본다. */
  const owns = (el, x, y) => {
    const h = document.elementFromPoint(x, y);
    return !!(h && (h === el || el.contains(h)));
  };
  const cb = r(close);
  const probe = cb
    ? {
        insideBottom: owns(close, cb.x + cb.w / 2, cb.bottom - 2), // 늘린 아래쪽이 ✕ 것인가
        justOutside: owns(close, cb.x + cb.w / 2, cb.bottom + 3), // 그 «바로 밖»은 ✕ 가 아니어야
        topEdge: owns(close, cb.x + cb.w / 2, cb.y + 2),
        outsideOwner: (() => {
          const h = document.elementFromPoint(cb.x + cb.w / 2, cb.bottom + 3);
          return h ? `${h.tagName.toLowerCase()}${h.getAttribute("data-testid") ? `[${h.getAttribute("data-testid")}]` : ""}` : null;
        })(),
      }
    : null;
  return {
    banner: r(banner),
    close: cb,
    closeLabel: close?.getAttribute("aria-label") ?? null,
    navIncidents: r(nav),
    mainFirstChildY: r(firstChild)?.y ?? null,
    headingY: r(heading)?.y ?? null,
    probe,
  };
};

const b = await chromium.launch();
const columns = {};
for (const [name, base] of [["after(3038501)", AFTER], ["before(de80464)", BEFORE]]) {
  columns[name] = {};
  for (const v of WIDTHS) {
    const c = await b.newContext({ viewport: { width: v.w, height: v.h } });
    const p = await c.newPage();
    await p.goto(base + "/overview", { waitUntil: "domcontentloaded" });
    await p.waitForSelector('[data-testid="fallback-banner"]', { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(2500);
    columns[name][v.w] = await p.evaluate(MEASURE);
    await c.close();
  }
}
await b.close();

const F = (n) => (n === null || n === undefined ? "—" : n);
console.log(`\n=== T7-29 히트 영역 독립 검증 · after=${AFTER} · before=${BEFORE} ===`);
for (const [name, byW] of Object.entries(columns)) {
  for (const [w, m] of Object.entries(byW)) {
    if (!m.close) {
      console.log(`[${name} · ${w}] 🔴 배너/✕ 를 못 찾았다 — 이 칸은 «안 잼»`);
      continue;
    }
    console.log(
      `[${name} · ${w}px] ✕ 히트 ${F(m.close.w)}×${F(m.close.h)}(라벨 ${JSON.stringify(m.closeLabel)}) · 띠 높이 ${F(m.banner?.h)} · 본문 첫 y ${F(m.mainFirstChildY)} · 제목 y ${F(m.headingY)} · nav-incidents ${F(m.navIncidents?.w)}×${F(m.navIncidents?.h)}`,
    );
    console.log(
      `    히트 점검: 아래끝 안쪽 ✕것=${m.probe.insideBottom} · 위끝 ✕것=${m.probe.topEdge} · 바로 밖이 ✕것=${m.probe.justOutside}(${m.probe.outsideOwner})`,
    );
  }
}
const a1 = columns["after(3038501)"][1440], a3 = columns["after(3038501)"][390];
const b1 = columns["before(de80464)"][1440], b3 = columns["before(de80464)"][390];
console.log(`\n— 축별 판정 —`);
console.log(`① ✕ 히트 ≥44 : 1440 세로 ${F(a1?.close?.h)} · 390 세로 ${F(a3?.close?.h)} → ${a1?.close?.h >= 44 && a3?.close?.h >= 44 ? "PASS" : "FAIL"}`);
console.log(`② 띠 높이     : 1440 ${F(a1?.banner?.h)}(기대 36.5) · 390 ${F(a3?.banner?.h)}(기대 79) → ${Math.abs((a1?.banner?.h ?? 0) - 36.5) < 1 && Math.abs((a3?.banner?.h ?? 0) - 79) < 1 ? "PASS" : "FAIL"}`);
console.log(`③ 본문 첫 y 불변: 1440 ${F(b1?.mainFirstChildY)} → ${F(a1?.mainFirstChildY)} · 390 ${F(b3?.mainFirstChildY)} → ${F(a3?.mainFirstChildY)}`);
console.log(`④ 이웃 오클릭 0 : 1440 바로 밖 ✕것=${a1?.probe?.justOutside}(${a1?.probe?.outsideOwner}) · 390 ${a3?.probe?.justOutside}(${a3?.probe?.outsideOwner}) → ${a1?.probe?.justOutside === false && a3?.probe?.justOutside === false ? "PASS" : "FAIL"}`);
console.log(`⑤ 🔴 O-3 nav-incidents 히트 세로(1440) = ${F(a1?.navIncidents?.h)} → ${a1?.navIncidents?.h >= 44 ? "≥44" : "🔴 44 미만 — D-50 회부 대상"}`);
if (OUT) writeFileSync(OUT, JSON.stringify(columns, null, 2));
