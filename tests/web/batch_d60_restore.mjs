/* D-60 ② 정정 — 복원 경로는 «Overview 링크»가 아니라 `/incidents` 의 「이 세션의 조사」 행이다.
   1차에서 나는 overview 링크로 갔고 그 길에는 `?run=` 이 없었다(대조군도 같음 = 내가 길을 틀렸다). */
import { createRequire } from "node:module"; import fs from "node:fs";
const require_ = createRequire(import.meta.url); const { chromium } = require_("@playwright/test");
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i>=0?process.argv[i+1]:d};
const BASE=arg("base","http://127.0.0.1:8140"), OUT=arg("out","");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1440,height:900}}); const p=await c.newPage();
const out={base:BASE};
await p.goto(BASE+"/",{waitUntil:"domcontentloaded",timeout:60000}); await p.waitForURL(/overview/,{timeout:40000}).catch(()=>{}); await sleep(2500);
for(const s of ['[data-testid="start-from-alarm"]','[data-testid="start-from-headline"]']){const l=p.locator(s);try{await l.first().waitFor({state:"visible",timeout:20000})}catch{continue}await l.first().click().catch(()=>{});await p.waitForURL(/incidents\//,{timeout:30000}).catch(()=>{});await sleep(3500);break}
out.runAtStart=(p.url().match(/run=([^&]+)/)??[])[1]??null;
await p.goto(BASE+"/incidents",{waitUntil:"domcontentloaded",timeout:40000}).catch(()=>{}); await sleep(2000);
out.listStatus=p.url();
out.links=await p.evaluate(()=>Array.from(document.querySelectorAll('a[href^="/incidents/"]')).map(a=>a.getAttribute("href")));
out.sections=await p.evaluate(()=>Array.from(document.querySelectorAll("h2,h3")).map(e=>(e.textContent||"").trim()).slice(0,8));
const runLink=out.links.find(h=>/[?&]run=/.test(h))??null; out.runLink=runLink;
if(runLink){await p.goto(BASE+runLink,{waitUntil:"domcontentloaded",timeout:40000}).catch(()=>{});await sleep(3000);
  out.urlAfter=p.url(); out.runAfter=(p.url().match(/run=([^&]+)/)??[])[1]??null;
  out.restored=out.runAfter===out.runAtStart;
  out.tids=await p.evaluate(()=>document.querySelectorAll("[data-testid]").length);}
await b.close(); console.log(JSON.stringify(out,null,1)); if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,1));
