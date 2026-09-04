/**
 * T7-C · 앱바 모드가 «무엇으로 정착하는가» — 조회만(코드 0줄 · 배포 무접촉).
 *
 * 발주(스자쿠 30대 20:04): 콘솔이 배포 API 를 볼 때 앱바가 `◌ 확인 중` 에 머문다는 실측(E3)이
 * 있는데, **공개 배포면에서도 그런지는 미측**이다.
 *
 * 🔴 두 점으로 찍는다(5초·15초). 한 점이면 **「아직 확인 중」과 「끝내 확인 중」을 못 가른다**.
 *    그리고 두 점은 **«묻기 시작한 시각»부터** 재고, **실제 경과**를 함께 적는다 — 자극은
 *    벽시계인데 관측은 부하에 끌려간다.
 *
 * 🔴 네트워크를 함께 남긴다 — 화면이 「확인 중」인 것과 **왜** 그런지는 다른 사실이다.
 *    `liveStatus()` 가 «어느 호스트»를 때리는지가 이 축의 핵심이다.
 *
 * 사용: node t7c_mode_settle_probe.mjs --out <디렉토리>
 */
import fs from "node:fs";
import path from "node:path";
import { launchBrowser, enterShell } from "./t64_baseline_shots.mjs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const OUT = arg("out", "");
if (!OUT) throw new Error("--out 이 필요하다");
fs.mkdirSync(OUT, { recursive: true });

const TARGETS = [
  { id: "public", base: "https://factory-knowledge-twin.vercel.app", note: "공개 배포면" },
  { id: "local-3102", base: "http://127.0.0.1:3102", note: "내 무대(같은 코드 · FKT_API_BASE=8010)" },
  { id: "local-8011", base: "http://127.0.0.1:8011", note: "대조군(다른 좌석 무대)" },
];
const SAMPLES = [5000, 15000]; // 묻기 시작한 시각 기준

const report = { at: new Date().toISOString(), note: "조회만 · 코드 0줄 · 배포 무접촉", rows: [], errors: [] };

const browser = await launchBrowser("chromium");

for (const t of TARGETS) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  const page = await ctx.newPage();
  const net = [];
  page.on("response", async (res) => {
    const u = res.url();
    if (!/live|status|health|sessions/i.test(u)) return;
    let body = null;
    try {
      body = (await res.text()).slice(0, 160);
    } catch {
      body = "(본문 못 읽음)";
    }
    net.push({ url: u, status: res.status(), body, at: Date.now() });
  });
  const failed = [];
  page.on("requestfailed", (r) => {
    if (/live|status|health|sessions/i.test(r.url())) failed.push({ url: r.url(), why: r.failure()?.errorText ?? "?" });
  });
  const consoleErrs = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrs.push(m.text().slice(0, 140));
  });

  const row = { ...t, samples: [], net: null, failed: null, consoleErrs: null };
  try {
    await enterShell(page, t.base);
    await page.goto(`${t.base}/overview`, { waitUntil: "domcontentloaded" });
    // 🔴 «묻기 시작한 시각» = 여기. 이 뒤의 경과를 실제로 재서 함께 적는다.
    const t0 = Date.now();
    for (const want of SAMPLES) {
      const wait = want - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      const elapsed = Date.now() - t0;
      const badge = await page
        .locator('[data-testid="mode-badge"]')
        .first()
        .textContent({ timeout: 3000 })
        .catch(() => null);
      row.samples.push({ wantMs: want, elapsedMs: elapsed, badge: badge ? badge.trim() : "🔴 배지 없음(못 잰 것)" });
    }
    // 🔴 「밖에서 봤다」의 근거 — URL 을 쳤다는 사실이 아니라 실제로 어디에 붙었는가.
    row.landed = await page.evaluate(() => ({ href: location.href, origin: location.origin }));
    row.net = net.map((n) => ({ ...n, tMs: n.at - t0 }));
    row.failed = failed;
    row.consoleErrs = consoleErrs.slice(0, 6);
  } catch (e) {
    row.error = String(e).split("\n")[0].slice(0, 220);
    row.net = net;
    row.failed = failed;
    row.consoleErrs = consoleErrs.slice(0, 6);
  }
  report.rows.push(row);
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, "t7c-mode-settle.json"), JSON.stringify(report, null, 2), "utf8");

for (const r of report.rows) {
  console.log(`\n== ${r.id} (${r.note}) ${r.base}`);
  if (r.error) console.log(`   🔴 ${r.error}`);
  if (r.landed) console.log(`   착지 = ${r.landed.href}`);
  for (const s of r.samples) console.log(`   ${s.wantMs / 1000}초 지점(실경과 ${s.elapsedMs}ms) → 배지 "${s.badge}"`);
  for (const n of (r.net ?? []).slice(0, 8)) console.log(`   net +${n.tMs}ms ${n.status} ${n.url.slice(0, 90)} :: ${String(n.body).replace(/\s+/g, " ").slice(0, 90)}`);
  for (const f of r.failed ?? []) console.log(`   🔴 실패 ${f.url.slice(0, 90)} :: ${f.why}`);
  for (const c of r.consoleErrs ?? []) console.log(`   콘솔오류 ${c}`);
}
