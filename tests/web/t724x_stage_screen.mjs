/**
 * T7-24 — 무대(프록시)를 셸 앞에 세우고 «화면이 무엇을 하는지»를 시점과 함께 읽는 그물.
 * X-11(용량 거절) · X-07(지연 후 복구) 화면 축 공용. 리바이2 39대.
 *
 * 🔴 이 그물이 내는 것은 «색»이 아니라 **계열**이다 — 「잠정 상태가 그려졌다 걷히는가」와
 *    「거절이 화면에 남는가」는 둘 다 **시점이 있는 사실**이고, 한 시점으로는 못 가른다.
 * 🔴 **조용한 재시도**를 세려면 화면 문면만 봐서는 안 된다 — 브라우저가 같은 주소로 몇 번
 *    나갔는지를 함께 센다. 문면 없이 요청만 반복되면 그게 «조용한 재시도»다.
 * 🔴 무대 증인(`GET /__stage`)을 자극 전후로 찍어 **무대가 울렸다**를 먼저 세운다. 안 울렸으면
 *    그 회차는 빨강도 초록도 아닌 «안 잼»이고 `exit 2` 다.
 *
 * 사용: node t724x_stage_screen.mjs --web=http://127.0.0.1:8795 --stage=http://127.0.0.1:8790 --label=<이름> [--ms=12000]
 */
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require_ = createRequire(import.meta.url);
const { chromium } = require_("@playwright/test");

const arg = (k, d = null) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const WEB = arg("web", "http://127.0.0.1:8795");
const STAGE = arg("stage", "http://127.0.0.1:8790");
const LABEL = arg("label", "?");
const WINDOW = Number(arg("ms", "12000"));
const JSON_OUT = arg("json", null);

const stage = async () => (await fetch(STAGE + "/__stage").then((r) => r.json()).catch(() => null)) ?? {};

/** 화면이 «무슨 상태를 말하는지» + 거절/재시도 표지. 문면 리터럴을 판정선에 박지 않는다. */
const SNAP = () => {
  const pick = (id) => {
    const e = document.querySelector(`[data-testid="${id}"]`);
    return e ? (e.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 90) : null;
  };
  /* 「거절/대기/재시도」를 말하는 손잡이를 «이름으로» 훑는다 — 특정 testid 를 지어내지 않는다. */
  const marks = Array.from(document.querySelectorAll("[data-testid]"))
    .map((e) => e.getAttribute("data-testid"))
    .filter((id) => /error|reject|retry|busy|pending|wait|limit|degrad|fallback|offline|stale/i.test(id));
  const main = document.querySelector("main");
  return {
    modeBadge: pick("mode-badge"),
    fallbackBanner: pick("fallback-banner"),
    marks,
    mainTextLen: main ? (main.textContent ?? "").replace(/\s+/g, " ").trim().length : 0,
    /* 스켈레톤·스피너처럼 «잠정 상태»를 나타내는 것도 수로 남긴다(X-07 이 묻는 자리). */
    provisional: document.querySelectorAll('[aria-busy="true"], [data-loading], .animate-pulse, [role="progressbar"]').length,
  };
};

const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await c.newPage();

const reqs = [];
p.on("request", (r) => reqs.push({ t: Date.now(), url: r.url().replace(WEB, ""), m: r.method() }));

const w0 = await stage();
const t0 = Date.now();
await p.goto(WEB + "/overview", { waitUntil: "commit" }).catch(() => {});
const series = [];
let last = null;
while (Date.now() - t0 < WINDOW) {
  const ms = Date.now() - t0;
  const s = await p.evaluate(SNAP).catch((e) => ({ err: String(e.message).slice(0, 40) }));
  const key = JSON.stringify(s);
  if (key !== last) {
    series.push({ ms, ...s });
    last = key;
  }
  await p.waitForTimeout(150);
}
const w1 = await stage();

/* 🔴 조용한 재시도 = «같은 주소»로 두 번 이상 나갔는데 화면에 거절/대기 표지가 한 번도 안 뜬 경우. */
const byUrl = {};
for (const r of reqs) byUrl[r.m + " " + r.url.split("&_rsc")[0]] = (byUrl[r.m + " " + r.url.split("&_rsc")[0]] ?? 0) + 1;
const repeated = Object.entries(byUrl).filter(([, n]) => n > 1);
const everMarked = series.some((s) => (s.marks ?? []).length > 0 || s.fallbackBanner);
const provisionalSeen = series.some((s) => (s.provisional ?? 0) > 0);
const provisionalCleared = provisionalSeen && (series[series.length - 1]?.provisional ?? 0) === 0;

const out = { label: LABEL, web: WEB, stageBefore: w0, stageAfter: w1, series, repeated, everMarked, provisionalSeen, provisionalCleared, finalTextLen: series[series.length - 1]?.mainTextLen ?? null };
console.log(`\n=== [${LABEL}] web=${WEB} · stage=${STAGE} · 창 ${WINDOW}ms ===`);
console.log(`무대 증인: 전 ${JSON.stringify(w0)}`);
console.log(`           후 ${JSON.stringify(w1)}`);
for (const s of series) console.log(`  t=${String(s.ms).padStart(5)}ms · mode=${JSON.stringify(s.modeBadge)} · banner=${s.fallbackBanner ? JSON.stringify(s.fallbackBanner.slice(0, 55)) : "null"} · 표지=${JSON.stringify(s.marks)} · 잠정=${s.provisional} · 본문=${s.mainTextLen}`);
console.log(`\n잠정 상태 «그려졌다»=${provisionalSeen} · «걷혔다»=${provisionalCleared} · 거절/대기 표지 한 번이라도=${everMarked}`);
console.log(`반복된 요청(조용한 재시도 후보): ${JSON.stringify(repeated)}`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
await b.close();
