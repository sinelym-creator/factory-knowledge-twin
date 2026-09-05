/** 축 ③ⓑ 재시도 — 🔴 1차 422 는 «대상의 답»이 아니라 내가 계약(`{sessionId, mode}`)을 안 지킨 것이다. */
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const BASE = process.argv[2], OUT = process.argv[3];
const b = await chromium.launch();
const p = await (await b.newContext()).newPage();
await p.goto(BASE + "/overview", { waitUntil: "domcontentloaded", timeout: 60000 });
const out = await p.evaluate(async () => {
  const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return t.slice(0,200); } };
  const s = await fetch("/api/sessions", { method: "POST", credentials: "include" });
  const sj = await j(s);
  const sid = sj?.sessionId ?? sj?.id ?? null;
  const call = async (mode) => {
    const r = await fetch("/api/scenarios/GS-01/runs", { method: "POST", credentials: "include",
      headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: sid, mode }) });
    return { status: r.status, body: await j(r) };
  };
  return { sessionStatus: s.status, sessionKeys: sj && typeof sj === "object" ? Object.keys(sj) : null,
           sessionIdFound: Boolean(sid), replay: await call("replay") };
});
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
