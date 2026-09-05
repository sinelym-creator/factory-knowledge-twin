/** 축 ③ⓑ 의 null 을 «대상 결함»으로 회부하기 전에 갈라라 — run 이 실제로 이벤트를 냈는가. */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto(BASE + "/overview", { waitUntil:"domcontentloaded", timeout:60000 });
const out = await p.evaluate(async () => {
  const j = async r => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0,200); } };
  const s = await (await fetch("/api/sessions",{method:"POST",credentials:"include"})).json();
  const mk = await fetch("/api/scenarios/GS-01/runs",{method:"POST",credentials:"include",
    headers:{"content-type":"application/json"},body:JSON.stringify({sessionId:s.sessionId,mode:"replay"})});
  const run = await j(mk);
  const rid = run.runId;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const trail = [];
  for (let i = 0; i < 20; i++) {
    await sleep(1500);
    const st = await fetch(`/api/runs/${encodeURIComponent(rid)}`,{credentials:"include"});
    const sj = await j(st);
    const ev = await fetch(`/api/runs/${encodeURIComponent(rid)}/events`,{credentials:"include"});
    const ej = await j(ev);
    const n = Array.isArray(ej) ? ej.length : (Array.isArray(ej?.events) ? ej.events.length : null);
    trail.push({ i, runStatus: st.status, status: sj?.status ?? null, evStatus: ev.status, events: n });
    if (sj?.status && ["completed","failed","stopped"].includes(sj.status)) break;
  }
  return { runId: rid, createStatus: mk.status, mode: run.mode, trail };
});
writeFileSync(OUT, JSON.stringify(out,null,1));
console.log(JSON.stringify({ runId: out.runId, mode: out.mode, last: out.trail[out.trail.length-1],
  maxEvents: Math.max(...out.trail.map(t=>t.events ?? 0)) }, null, 1));
await b.close();
