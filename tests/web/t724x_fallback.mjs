/**
 * T7-23 축② — X-05 / X-20 / X-21 (상류 다운 → 폴백이 «동작»하고 «표시»되는가). 리바이2 39대.
 *
 * 🔴 **폴백은 침묵하면 실패다**(정본 §6 X-21 · 판정선 2 ②). 그래서 이 그물이 내는 값은
 *    「안 죽었다」가 아니라 **① 대체 경로가 실제로 그렸는가 ② 그 사실이 화면에 남았는가**다.
 *
 * 🔴 상류를 «내 것만» 끊는다 — 실 ai-api `:8102` 는 다른 좌석이 읽는다. 그래서 거울 스텁
 *    `_t723_mirror_stub.mjs` 의 `/__stub/down` 스위치를 쓰고, 스텁이 센 `refused` 수를
 *    **자극 실재 증인**으로 함께 낸다. 0 이면 그 열은 빨강도 초록도 아닌 «안 잼»이다.
 *
 * 두 경로를 따로 낸다 —
 *   ⓐ **쓰던 중 죽는다** (같은 컨텍스트 · 세션 있음 → down → 재적재)  ← 사용자가 겪는 길
 *   ⓑ **죽은 뒤 들어온다** (새 컨텍스트 · 세션 없음)                  ← 관문까지 포함한 길
 *
 * 사용: node t723x_fallback.mjs --web=http://127.0.0.1:8797 --stub=http://127.0.0.1:8101
 */
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const WEB = arg("web", "http://127.0.0.1:8797");
const STUB = arg("stub", "http://127.0.0.1:8101");

const stubStats = async () => (await fetch(STUB + "/__stub/stats").then((r) => r.json()).catch(() => null)) ?? { refused: null };
const flip = async (dir) => fetch(STUB + "/__stub/" + dir).then((r) => r.json()).catch((e) => ({ err: String(e.message).slice(0, 40) }));

/* 화면이 «무엇을 말하는지»를 손잡이로 읽는다 — 문면 리터럴이 아니라 testid 존재와 그 텍스트.
   문면을 판정선에 박으면 카피가 바뀔 때 내 그물이 대상보다 먼저 늙는다. */
const SNAP = () => {
  const pick = (id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : null;
  };
  const main = document.querySelector("main");
  return {
    url: location.pathname + location.search,
    modeBadge: pick("mode-badge"),
    fallbackBanner: pick("fallback-banner"),
    replayOffer: pick("static-replay-offer"),
    replayWhy: pick("static-replay-offer-why"),
    staticVisitor: pick("static-visitor"),
    /* 「그렸는가」 = 본문에 실제 글자가 있는가. 빈 화면·에러 페이지와 가르는 자리다. */
    mainTextLen: main ? (main.textContent ?? "").replace(/\s+/g, " ").trim().length : 0,
    headings: Array.from(document.querySelectorAll("h1,h2")).map((h) => (h.textContent ?? "").trim().slice(0, 40)).slice(0, 6),
    /* 🔴 「오류 화면인가」는 «무엇이 걸렸는지»까지 남긴다 — 안 그러면 배너 문면의 한 조각을
       오류로 읽고도 모른다(내 정규식이 먼저 거짓말한다). */
    errorHit: (document.body.textContent ?? "").match(/오류가 발생|Application error|Internal Server Error|500/i)?.[0] ?? null,
  };
};

const b = await chromium.launch();
const out = {};

/* ── ⓐ 쓰던 중 죽는다 ────────────────────────────────────────────────────── */
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await flip("up");
  await p.goto(WEB + "/overview", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2500);
  const live = await p.evaluate(SNAP);
  const before = await stubStats();
  await flip("down");
  const t0 = Date.now();
  await p.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(4000);
  const down = await p.evaluate(SNAP);
  /* 🔴 «제안»과 «동작»은 다르다 — 화면이 정적 재생본을 «권하기만» 하면 그건 아직 대체 «동작»이
     아니다. 그래서 그 손잡이를 실제로 누르고 그 뒤에 무엇이 그려지는지 한 번 더 잰다. */
  const offered = await p.locator('[data-testid="static-replay-offer"]').count();
  let taken = null;
  if (offered > 0) {
    await p.locator('[data-testid="static-replay-offer"]').first().click({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(4000);
    taken = await p.evaluate(SNAP);
  }
  const after = await stubStats();
  await flip("up");
  await c.close();
  out.inUse = { live, down, offered, taken, refusedDelta: (after.refused ?? 0) - (before.refused ?? 0), ms: Date.now() - t0 };
}

/* ── ⓑ 죽은 뒤 들어온다 ──────────────────────────────────────────────────── */
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  const before = await stubStats();
  await flip("down");
  await p.goto(WEB + "/overview", { waitUntil: "domcontentloaded" }).catch(() => {});
  await p.waitForTimeout(4000);
  const cold = await p.evaluate(SNAP).catch((e) => ({ err: String(e.message).slice(0, 60) }));
  const after = await stubStats();
  await flip("up");
  await c.close();
  out.cold = { cold, refusedDelta: (after.refused ?? 0) - (before.refused ?? 0) };
}

await b.close();

/* ── 판정 ───────────────────────────────────────────────────────────────── */
const { live, down } = out.inUse;
const shown = (s) => [s.modeBadge, s.fallbackBanner, s.replayOffer, s.replayWhy].filter(Boolean);
const stimulusReal = out.inUse.refusedDelta > 0;
/* X-20 = 「대체 경로가 실제로 동작했는가」. 제안만 있고 눌러도 안 그려지면 FAIL,
   누른 뒤 내용이 그려지면 PASS(단, 「제안형」임을 값으로 함께 낸다). */
const t = out.inUse.taken;
const drew = !!t && t.mainTextLen > down.mainTextLen && !t.errorHit;
const marked = shown(down).length > 0;
const silent = JSON.stringify(shown(live)) === JSON.stringify(shown(down));

const verdict = (cond) => (!stimulusReal ? "미검증(자극 없음 — 스텁이 한 건도 안 끊었다)" : cond ? "PASS" : "FAIL");

console.log(`\n=== X-05 / X-20 / X-21 · web=${WEB} · stub=${STUB} ===`);
console.log(`자극 실재 증인: 스텁이 끊은 요청 수 = ⓐ ${out.inUse.refusedDelta} · ⓑ ${out.cold.refusedDelta}`);
console.log(`\n[ⓐ 쓰던 중 죽는다]`);
console.log(`  LIVE  : mode=${JSON.stringify(live.modeBadge)} fallback=${JSON.stringify(live.fallbackBanner)} replay=${JSON.stringify(live.replayOffer)} why=${JSON.stringify(live.replayWhy)} · 본문글자=${live.mainTextLen} · 제목=${JSON.stringify(live.headings)}`);
console.log(`  DOWN  : mode=${JSON.stringify(down.modeBadge)} fallback=${JSON.stringify(down.fallbackBanner)} replay=${JSON.stringify(down.replayOffer)} why=${JSON.stringify(down.replayWhy)} · 본문글자=${down.mainTextLen} · 오류화면=${down.errorHit} · 제목=${JSON.stringify(down.headings)}`);
console.log(`\n[ⓑ 죽은 뒤 들어온다]`);
console.log(`  COLD  : ${JSON.stringify(out.cold.cold).slice(0, 400)}`);
console.log(`\n[X-05] 상류 다운 시 화면이 상태를 «표시»하는가 → ${verdict(marked)}   (표시 요소 ${JSON.stringify(shown(down))})`);
console.log(`  제안 손잡이 수=${out.inUse.offered} · 누른 뒤: ${t ? `본문글자=${t.mainTextLen} · url=${t.url} · mode=${JSON.stringify(t.modeBadge)} · 오류표지=${JSON.stringify(t.errorHit)} · 제목=${JSON.stringify(t.headings)}` : "제안 없음 — 안 눌러 봄"}`);
console.log(`[X-20] 대체 경로가 «실제로 동작»하는가(제안을 «눌러» 본 뒤 그려지는가) → ${verdict(drew)}   (본문 글자 LIVE ${live.mainTextLen} → DOWN ${down.mainTextLen} → 재생본 ${t?.mainTextLen ?? "안 잼"})`);
console.log(`[X-21] 폴백이 «조용한가»(같으면 실패) → ${verdict(!silent)}   (LIVE 표시 ${JSON.stringify(shown(live))} ↔ DOWN 표시 ${JSON.stringify(shown(down))})`);
console.log(`\n빨강 확인: ${stimulusReal ? `✓ 같은 실행에서 LIVE 열 ↔ DOWN 열 · 스텁이 실제로 ${out.inUse.refusedDelta} 건을 끊었다` : "✗ 자극이 실재하지 않았다 — 이 열들은 «안 잼»이다"}`);
if (!stimulusReal) process.exit(2);
