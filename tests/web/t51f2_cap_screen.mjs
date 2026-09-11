// T5-1F (2/2)-B — 시간당 상한 소진 상태의 «화면 문면»을 두 해상도에서 실렌더로 잰다.
//
// 🔴 이 그물은 구독을 쓰지 않는다. 상한이 이미 소진된 상태(`hourlyCap.used = limit`)를 화면이
//    어떻게 말하는지만 본다 — run 을 새로 만들지 않는다.
//
// 🔴 판정선은 «문면»이지 «요소 존재»가 아니다:
//    ① 배지·본문에 다음 창 시각이 뜨고, 그 시각이 API 의 `until` 과 «같은 시각»인가
//    ② 금칙어(LLM·게이트웨이·429·Claude·API 등 내부 어휘) 0
//    ③ 막다른 길 0 — 재생(replay)으로 이어지는 경로가 화면에 있는가
//
// 사용: node t51f2_cap_screen.mjs --shell http://127.0.0.1:8197 --api http://127.0.0.1:8030 --out <dir>

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};

const SHELL = arg('shell', 'http://127.0.0.1:8197');
const API = arg('api', 'http://127.0.0.1:8030');
const OUT = arg('out', 'evidence/t51f2');

// 🔴 «내부 어휘»만 금칙어다. 방문자가 읽어도 되는 말(재생·실시간 분석)은 여기 없다.
const FORBIDDEN = ['LLM', 'Claude', 'claude', '게이트웨이', 'gateway', '429', 'API', 'cap_exceeded', 'hourly_cap'];

const VIEWPORTS = [
  { name: 'mobile-412x600', width: 412, height: 600 },
  { name: 'desktop-1280x800', width: 1280, height: 800 },
];

function localHHMM(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const main = async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // 무대 전제를 «먼저» 찍는다 — 상한이 소진돼 있지 않으면 이 창은 성립하지 않는다(exit 2).
  const sess = await fetch(`${API}/api/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const cookie = (sess.headers.get('set-cookie') || '').split(';')[0];
  const { sessionId } = await sess.json();
  const statusRes = await fetch(`${API}/api/live/status?sessionId=${sessionId}`, { headers: { cookie } });
  const status = await statusRes.json();
  if (!(status.hourlyCap && status.hourlyCap.remaining === 0)) {
    console.error(`NO-STAGE: 시간당 상한이 소진돼 있지 않다 — ${JSON.stringify(status.hourlyCap)}`);
    process.exit(2);
  }
  const expectedHHMM = status.until ? localHHMM(status.until) : null;

  const browser = await chromium.launch();
  const rows = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    await page.goto(`${SHELL}/`, { waitUntil: 'domcontentloaded' });
    // 세션 쿠키를 셸 오리진에 심어 «로그인된 방문자»로 만든다(가드 문이 화면만 여는 자리와 구분)
    await ctx.addCookies([{ name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: SHELL }]);
    await page.goto(`${SHELL}/overview`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const body = (await page.innerText('body')) || '';
    const badge = await page.locator('[data-testid="mode-badge-why"]').allInnerTexts().catch(() => []);
    const shot = path.join(OUT, `cap-exhausted-${vp.name}.png`);
    await page.screenshot({ path: shot, fullPage: false });

    rows.push({
      viewport: vp.name,
      screenshot: shot.replace(/\\/g, '/'),
      badgeWhy: badge,
      bodyHasExpectedTime: expectedHHMM ? body.includes(expectedHHMM) : null,
      expectedHHMM,
      forbiddenHits: FORBIDDEN.filter((w) => body.includes(w)),
      // 막다른 길 0 — 🔴 «재생» 한 낱말로 판정하면 문면이 조금만 바뀌어도 없는 결함을 짓는다.
      //    실제로 첫 판은 화면이 「REPLAY · 녹화된 조사로 진행」이라고 말하는데도 0 을 냈다.
      //    그래서 «이어갈 길이 있는가»를 여러 표지의 합집합으로 보고, 어느 표지가 맞았는지를 값으로 남긴다.
      recoveryMarkers: ['재생', 'REPLAY', '녹화', '조사 시작', '집계로 종합'].filter((w) => body.includes(w)),
      bodyChars: body.length,
      bodySample: body.replace(/\s+/g, ' ').slice(0, 600),
    });
    await ctx.close();
  }
  await browser.close();

  const verdict = {
    at: new Date().toTimeString().slice(0, 8),
    apiStatus: { online: status.online, reason: status.reason, until: status.until, hourlyCap: status.hourlyCap },
    expectedHHMM,
    rows,
    pass: rows.every((r) => r.forbiddenHits.length === 0 && r.bodyHasExpectedTime && r.recoveryMarkers.length > 0),
  };
  fs.writeFileSync(path.join(OUT, 'cap-screen.json'), JSON.stringify(verdict, null, 2), 'utf8');
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.pass ? 0 : 1);
};

main().catch((err) => {
  console.error(`ERROR: ${err && err.message}`);
  process.exit(2);
});
