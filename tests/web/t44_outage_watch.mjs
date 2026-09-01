#!/usr/bin/env node
/**
 * t44_outage_watch — Gate 6 외부 항(§32.7)의 «장애 주입 창»을 30초 간격으로 지켜본다.
 *
 * 🔴 이 도구는 판정하지 않는다. 한 사이클마다 두 층을 나란히 찍을 뿐이다:
 *      서버 층  `/api/health` · `POST /enter` · `/api/live/status` 의 상태코드·응답시간
 *      화면 층  정본 그물 `gate6_offline_probe.mjs` 를 그대로 spawn (배지 낱말·제안·배너)
 *    두 벌의 검출기를 만들지 않는다 — 화면 층 판정은 정본 그물 하나에만 있다.
 *
 * 🔴 «기준선에서 이미 참»인 축은 이 창에서 아무것도 못 가른다(공개 셸은 평시에 REPLAY 배너를
 *    띄운다 — 2026-09-01 17:25 실측). 그래서 가르는 축은 «미연결» 낱말과 서버 층 3경로다.
 *
 *    FKT_WEB_BASE  재는 셸
 * 사용: node tests/web/t44_outage_watch.mjs --label=tunnel-off --cycles=6 --gap=30000 --out=<json>
 * exit: 0 = 관측 완료(판정 아님) · 2 = 첫 사이클에서 셸에 닿지 못함(무대 없음)
 */
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)=?(.*)$/.exec(a);
    return m ? [m[1], m[2]] : [a, ""];
  }),
);
const BASE = process.env.FKT_WEB_BASE ?? "https://factory-knowledge-twin.vercel.app";
const LABEL = args.label ?? "watch";
const CYCLES = Number(args.cycles ?? 6);
const GAP = Number(args.gap ?? 30000);
const OUT = args.out ?? "";
const HERE = dirname(fileURLToPath(import.meta.url));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toTimeString().slice(0, 8);

async function hit(path, init = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(BASE + path, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
      ...init,
    });
    const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    let body = "";
    if (res.body) {
      try {
        const r = res.body.getReader();
        const { value } = await r.read();
        r.cancel().catch(() => {});
        body = value ? new TextDecoder().decode(value).slice(0, 300) : "";
      } catch {
        /* 본문을 못 읽어도 상태코드는 값이다 */
      }
    }
    return {
      ok: true,
      status: res.status,
      ms: Math.round(performance.now() - t0),
      vercelId: res.headers.get("x-vercel-id"),
      sid: cookies.some((c) => c.startsWith("fkt_sid=")),
      body,
    };
  } catch (e) {
    return { ok: false, ms: Math.round(performance.now() - t0), error: `${e.name}: ${e.message}` };
  }
}

/** 화면 층은 정본 그물에 위임한다 — 출력은 그대로 보관하고 요약만 뽑는다. */
function screen() {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [join(HERE, "gate6_offline_probe.mjs")], {
      env: { ...process.env, FKT_WEB_BASE: BASE, FKT_WATCH_MS: "12000" },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => {
      const badge = [...out.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      resolve({
        rc: code,
        offline: /Offline 표시[^\n]*:\s*(\d+)/.exec(out)?.[1] ?? null,
        offlineSeen: !/관측 안 됨/.test(out),
        replayMs: /Replay 전환[^\n]*:\s*(\d+)/.exec(out)?.[1] ?? null,
        badges: badge.slice(-3),
        raw: out.slice(-800),
      });
    });
  });
}

const cycles = [];
for (let i = 1; i <= CYCLES; i++) {
  const startedAt = now();
  const t0 = Date.now();
  const [h, e, l] = await Promise.all([
    hit("/api/health"),
    hit("/enter", { method: "POST" }),
    hit("/api/live/status"),
  ]);
  const s = await screen();
  const rec = { cycle: i, at: startedAt, health: h, enter: e, live: l, screen: s };
  cycles.push(rec);
  console.log(
    `${LABEL} #${i} ${startedAt}  health=${h.ok ? h.status : h.error} ${h.ms}ms` +
      ` | enter=${e.ok ? (e.sid ? "ISSUED" : e.status) : e.error} ${e.ms}ms` +
      ` | live=${l.ok ? l.status : l.error} ${l.ms}ms` +
      ` | 미연결=${s.offlineSeen ? "있음" : "없음"} 배지=${s.badges.join(",") || "-"}`,
  );
  if (i === 1 && !h.ok && !e.ok && !l.ok && s.rc === 2) {
    console.error("무대 없음 — 셸에 닿지 못했다(자극 이전 문제).");
    process.exit(2);
  }
  const wait = GAP - (Date.now() - t0);
  if (i < CYCLES && wait > 0) await sleep(wait);
}

if (OUT) {
  await writeFile(OUT, JSON.stringify({ base: BASE, label: LABEL, cycles }, null, 1), "utf8");
  console.log(`# raw → ${OUT}`);
}
