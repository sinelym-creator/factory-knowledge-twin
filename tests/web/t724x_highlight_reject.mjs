/**
 * T7-24 · X-14 — 「인용이 깨진 응답 → 거절 · 화면에 안 올림」. 리바이2 39대.
 * 정본 §6 X-14 · 화면 = `/documents/{docId}?highlight=…` · 표지 `highlight-rejected` ·
 * 본문 상태 `[data-testid=cited-body][data-highlight=ok|none|out-of-range]`.
 *
 * 🔴 판정선은 두 갈래다 — ① **거절이 화면에 뜬다** ② **강조가 «지어지지» 않는다**.
 *    ②가 없으면 「거절 문구도 띄우고 강조도 그린」 최악을 못 잡는다.
 * 🔴 빨강 확인 = **유효 앵커**가 같은 실행에서 `data-highlight="ok"` + 강조 노드 ≥1 을 낸다.
 *    안 그러면 「전부 거절하는 화면」이 5/5 초록으로 보인다.
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");
const arg = (k, d) => { const h = process.argv.find((x) => x.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : d; };
const WEB = arg("web", "http://127.0.0.1:8798");
const DOC = arg("doc", "DOC-MAN-0021");
const OK = arg("ok", "DOC-MAN-0021@r1#006");

const SHAPES = [
  ["빈 값", ""],
  ["형식 아님", "not-an-anchor"],
  ["다른 문서", "DOC-OTHER-0001@r1#006"],
  ["없는 좌표", `${DOC}@r1#99999`],
  ["주입 형태", `${DOC}@r1#<script>alert(1)</script>`],
];
const READ = () => {
  const body = document.querySelector('[data-testid="cited-body"]');
  const rejected = document.querySelector('[data-testid="highlight-rejected"]');
  const marks = document.querySelectorAll('mark, [data-testid="cited-body"] .bg-hl, [data-testid="cited-body"] [data-hl]').length;
  return {
    state: body?.getAttribute("data-highlight") ?? null,
    rejected: rejected ? (rejected.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80) : null,
    marks,
    bodyLen: (body?.textContent ?? "").trim().length,
  };
};
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();
await p.goto(WEB + "/overview", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(2500); // 세션 확보
const visit = async (hl) => {
  await p.goto(`${WEB}/documents/${DOC}?highlight=${encodeURIComponent(hl)}`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2200);
  return p.evaluate(READ);
};
const ctl = await visit(OK);
const red = ctl.state === "ok" && ctl.marks > 0;
console.log(`\n=== X-14 · web=${WEB} · doc=${DOC} ===`);
console.log(`빨강 확인(유효 앵커 ${OK}): state=${ctl.state} · 강조노드=${ctl.marks} · 거절표지=${JSON.stringify(ctl.rejected)} → ${red ? "✓ 강조가 실제로 그려진다" : "✗ 유효 앵커도 강조를 못 낸다 — 이 회차 판정 불가"}`);
let pass = 0;
for (const [name, hl] of SHAPES) {
  const o = await visit(hl);
  const ok = o.state !== "ok" && o.marks === 0;
  if (ok) pass++;
  console.log(`  [${name}] state=${o.state} · 강조노드=${o.marks} · 거절표지=${JSON.stringify(o.rejected)} · 본문길이=${o.bodyLen} → ${ok ? "PASS" : "FAIL"}`);
}
console.log(`\n[X-14] ${red ? (pass === SHAPES.length ? "PASS" : "FAIL") : "미검증(빨강 확인 없음)"} — ${pass}/${SHAPES.length} 형태에서 「강조 안 지어짐」`);
await b.close();
if (!red) process.exit(2);
