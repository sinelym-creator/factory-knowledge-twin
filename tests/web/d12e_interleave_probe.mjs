#!/usr/bin/env node
// D-12e 관측 러너 — 교대 관측(A단) + /enter 연속(B단) · 무설치(node 내장 fetch)
//
// 이 러너가 «지키는» 것 (읽는 사람이 오해하지 않도록 먼저 적는다)
//   - 이 도구는 클라이언트 vantage 만 잰다. 서버 로그 문자열(`[dns] dispatcher installed` ·
//     `install failed` · `fallback=doh-*` · `createSession failed`)은 여기서 **못 잰다**.
//     「이 창엔 없었다」는 로그를 계수한 쪽만 말할 수 있다. 이 러너의 침묵은 「못 쟀다」다.
//   - 그래서 요청마다 `x-vercel-id`(Vercel 요청 ID)를 전건 기록한다. 로그를 계수하는 쪽이
//     «그 요청»과 «이 응답»을 시각이 아니라 **ID 로** 이을 수 있게 하는 것이 이 러너의 목적이다.
//     (ⓒ축 「fallback= 이 뜬 그 요청이 fkt_sid 를 받았는가」는 ID 대조로만 참·거짓이 갈린다.)
//
// 사용:
//   node tests/web/d12e_interleave_probe.mjs --base=https://… --rounds=12 --enter=30 --out=<path>
// 종료 코드: 0 = 관측 완료(판정 아님) · 2 = 무대 없음(대상에 닿지 못함)

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a, ''];
  }),
);

const BASE = args.base || 'https://factory-knowledge-twin.vercel.app';
const ROUNDS = Number(args.rounds ?? 12);
const ENTER_N = Number(args.enter ?? 30);
const OUT = args.out || '';
const ROUND_GAP_MS = Number(args.roundGap ?? 1000);
const ENTER_GAP_MS = Number(args.enterGap ?? 1500);
const BURST = Number(args.burst ?? 0);
const BURSTS = Number(args.bursts ?? 1);
const BURST_GAP_MS = Number(args.burstGap ?? 8000);
const TIMEOUT_MS = Number(args.timeout ?? 20000);

const records = [];

/** 응답 본문은 «첫 청크만» 읽고 끊는다 — live/status 가 스트림이어도 러너가 매달리지 않게. */
async function peekBody(res, limit = 400) {
  if (!res.body) return '';
  try {
    const reader = res.body.getReader();
    const { value } = await reader.read();
    reader.cancel().catch(() => {});
    if (!value) return '';
    return new TextDecoder().decode(value).slice(0, limit);
  } catch {
    return '';
  }
}

async function probe(phase, round, label, path, init = {}) {
  const url = BASE + path;
  const startedAt = new Date();
  const t0 = performance.now();
  let rec = {
    phase,
    round,
    label,
    path,
    started: startedAt.toISOString(),
    startedLocal: startedAt.toTimeString().slice(0, 8),
  };
  try {
    const res = await fetch(url, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...init,
    });
    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const body = await peekBody(res);
    rec = {
      ...rec,
      ok: true,
      status: res.status,
      durMs: Math.round(performance.now() - t0),
      vercelId: res.headers.get('x-vercel-id') || null,
      matchedPath: res.headers.get('x-matched-path') || null,
      cache: res.headers.get('x-vercel-cache') || null,
      age: res.headers.get('age') || null,
      date: res.headers.get('date') || null,
      location: res.headers.get('location') || null,
      cookieNames: setCookies.map((c) => c.split('=')[0]),
      // 판정 축: fkt_sid 가 오면 ISSUED · 없고 fkt_session=…pending 이면 PENDING
      hasSid: setCookies.some((c) => c.startsWith('fkt_sid=')),
      sessionPending: setCookies.some((c) => /^fkt_session=[^;]*pending/.test(c)),
      body,
    };
  } catch (e) {
    rec = {
      ...rec,
      ok: false,
      durMs: Math.round(performance.now() - t0),
      error: `${e.name}: ${e.message}`,
    };
  }
  records.push(rec);
  return rec;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function verdictOf(rec) {
  if (!rec.ok) return 'ERR';
  if (rec.label !== 'enter') return String(rec.status);
  if (rec.hasSid) return 'ISSUED';
  if (rec.sessionPending) return 'PENDING';
  return `NEITHER(${rec.status})`;
}

async function main() {
  console.log(`# D-12e 교대 관측 · base=${BASE}`);
  console.log(`# 시작 ${new Date().toISOString()} (local ${new Date().toTimeString().slice(0, 8)})`);

  // --- 무대 확인: 대상에 닿지 못하면 색을 내지 않는다(exit 2) ---
  const stage = await probe('stage', 0, 'health', '/api/health');
  if (!stage.ok) {
    console.error(`무대 없음 — 대상에 닿지 못했다: ${stage.error}`);
    if (OUT) await writeOut();
    process.exit(2);
  }
  console.log(`# 무대: /api/health ${stage.status} ${stage.durMs}ms ${stage.vercelId}`);
  console.log(`# body: ${stage.body}`);

  // --- A단: 교대 관측 (한 라운드 안에서 세 경로를 번갈아 친다) ---
  console.log(`\n## A단 교대 ${ROUNDS}라운드 (/enter ↔ /api/health ↔ /api/live/status)`);
  for (let r = 1; r <= ROUNDS; r++) {
    const e = await probe('A', r, 'enter', '/enter', { method: 'POST' });
    const h = await probe('A', r, 'health', '/api/health');
    const s = await probe('A', r, 'live', '/api/live/status');
    console.log(
      `A${String(r).padStart(2, '0')}  enter=${verdictOf(e)} ${String(e.durMs).padStart(5)}ms ${e.vercelId ?? e.error}` +
        ` | health=${verdictOf(h)} ${String(h.durMs).padStart(5)}ms` +
        ` | live=${verdictOf(s)} ${String(s.durMs).padStart(5)}ms`,
    );
    if (r < ROUNDS) await sleep(ROUND_GAP_MS);
  }

  // --- B단: /enter 연속 (쿠키 없는 새 방문자 · 리다이렉트 미추종) ---
  console.log(`\n## B단 /enter ${ENTER_N}회`);
  for (let i = 1; i <= ENTER_N; i++) {
    const e = await probe('B', i, 'enter', '/enter', { method: 'POST' });
    console.log(
      `B${String(i).padStart(2, '0')}  ${verdictOf(e).padEnd(12)} ${String(e.durMs).padStart(5)}ms  ${e.startedLocal}  ${e.vercelId ?? e.error}`,
    );
    if (i < ENTER_N) await sleep(ENTER_GAP_MS);
  }

  // --- C단: 동시 발사 (인스턴스 부팅을 «만드는» 자극) ---
  //
  // 왜 이 단이 있나 — 순차 자극은 warm 인스턴스 하나에 계속 얹힌다. 오염은 «인스턴스 단위»로
  // 걸리므로(D-12 §5.1-b (2)), 순차 표본은 인스턴스를 거의 못 만난다. Vercel 함수는 동시성
  // 1/인스턴스라 N 을 동시에 쏘면 최대 N 개가 «부팅»한다 — 부팅마다 instrumentation.ts 가
  // 돌아 `[dns] dispatcher installed mod=…` 를 남긴다. 그 줄의 건수가 이 단의 관측값이고,
  // 그것은 여기서 못 잰다(서버 로그 소관). 이 단이 지키는 것은 「내가 인스턴스를 만들 수 있는가」
  // 하나다 — 판정 창이 열렸을 때 쓸 손잡이가 실제로 손잡이인지 미리 재 두는 것이다.
  if (BURST > 0) {
    console.log(`\n## C단 동시 발사 ${BURST}병렬 × ${BURSTS}배치`);
    for (let b = 1; b <= BURSTS; b++) {
      const t0 = new Date();
      const shots = await Promise.all(
        Array.from({ length: BURST }, (_, i) => probe('C', b * 100 + i + 1, 'enter', '/enter', { method: 'POST' })),
      );
      const iss = shots.filter((r) => r.ok && r.hasSid).length;
      const codes = new Set(shots.filter((r) => r.vercelId).map((r) => r.vercelId.split('::')[2].split('-')[0]));
      const durs = shots.filter((r) => r.ok).map((r) => r.durMs);
      console.log(
        `C배치${b}  발사 ${t0.toTimeString().slice(0, 8)}  ISSUED ${iss}/${BURST}` +
          `  ${durs.length ? Math.min(...durs) + '~' + Math.max(...durs) + 'ms' : '-'}` +
          `  고유 요청코드 ${codes.size}`,
      );
      if (b < BURSTS) await sleep(BURST_GAP_MS);
    }
  }

  summarize();
  if (OUT) await writeOut();
}

function pct(list, p) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
}

function summarize() {
  const enters = records.filter((r) => r.label === 'enter');
  const issued = enters.filter((r) => r.ok && r.hasSid);
  const pending = enters.filter((r) => r.ok && !r.hasSid && r.sessionPending);
  const other = enters.filter((r) => !r.ok || (!r.hasSid && !r.sessionPending));
  const health = records.filter((r) => r.label === 'health' && r.phase === 'A');
  const live = records.filter((r) => r.label === 'live');

  console.log(`\n## 요약 (관측값 — 판정은 이 도구가 하지 않는다)`);
  console.log(`/enter   총 ${enters.length}  ISSUED ${issued.length}  PENDING ${pending.length}  기타/오류 ${other.length}`);
  const dIss = issued.map((r) => r.durMs);
  const dPen = pending.map((r) => r.durMs);
  if (dIss.length) console.log(`  ISSUED  ${Math.min(...dIss)}~${Math.max(...dIss)}ms  p50 ${pct(dIss, 0.5)}`);
  if (dPen.length) console.log(`  PENDING ${Math.min(...dPen)}~${Math.max(...dPen)}ms  p50 ${pct(dPen, 0.5)}`);
  const okc = (l) => l.filter((r) => r.ok && r.status === 200).length;
  console.log(`/api/health(A단)   ${okc(health)}/${health.length} 200`);
  console.log(`/api/live/status   ${okc(live)}/${live.length} 200`);

  const edges = new Set(records.filter((r) => r.vercelId).map((r) => r.vercelId.split('::').slice(0, 2).join('::')));
  console.log(`엣지·리전 세트: ${[...edges].join(' , ') || '(없음)'}`);
  const builds = new Set(
    records.filter((r) => r.label === 'health' && r.body).map((r) => (/"build":"([^"]+)"/.exec(r.body) || [])[1] || '?'),
  );
  console.log(`health build 태그(자기 신고): ${[...builds].join(' , ')}`);
  console.log(`\n# 로그 대조용 요청 ID 는 --out JSON 의 vercelId 열에 전건 있다.`);
}

async function writeOut() {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(OUT, JSON.stringify({ base: BASE, generatedAt: new Date().toISOString(), records }, null, 1), 'utf8');
  console.log(`\n# raw → ${OUT} (${records.length} records)`);
}

main().catch((e) => {
  console.error(`러너 자체가 죽었다: ${e.stack}`);
  process.exit(2);
});
