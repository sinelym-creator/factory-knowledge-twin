/* D-53b 「낡음 전이」 3차 시도 — 자극의 모양을 바꾼다.
   1차 abort → 양 열 30s 에 미연결(폴링 «실패» 경로) · 2차 hang → 같음(클라 타임아웃이 실패로 접는다).
   3차 = «탭이 얼었다 깨어난» 모양: setSystemTime 으로 시계만 60s 앞으로 밀고(타이머 안 돌림),
   그 다음 runFor 를 «아주 짧게» 줘서 밀린 신선도 타이머만 깨우고 폴링 오류는 아직 안 오게 한다. */
import { createRequire } from "node:module"; import fs from "node:fs";
const require_=createRequire(import.meta.url); const {chromium}=require_("@playwright/test");
const arg=(k,d)=>{const i=process.argv.indexOf(`--${k}`);return i>=0?process.argv[i+1]:d};
const BASE=arg("base",""), LABEL=arg("label",""), OUT=arg("out","");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const badge=(p)=>p.evaluate(()=>{const e=document.querySelector('[data-testid="mode-badge"]');return e?{mode:e.getAttribute("data-mode"),text:(e.textContent||"").replace(/\s+/g," ").trim().slice(0,40)}:null});
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1280,height:800}}); const p=await c.newPage();
const out={label:LABEL,base:BASE,steps:[]};
await p.clock.install();
await p.goto(BASE+"/",{waitUntil:"domcontentloaded",timeout:60000});
await p.waitForURL(/overview/,{timeout:40000}).catch(()=>{});
for(let k=0;k<12;k++){out.before=await badge(p); if(out.before?.mode&&!["unavailable","checking"].includes(out.before.mode))break; await p.clock.runFor(2000); await sleep(400);}
if(!out.before?.mode||["unavailable","checking"].includes(out.before.mode)){out.abort="성공 상태 미성립";console.log(JSON.stringify(out,null,1));await b.close();process.exit(2)}
/* 폴링을 매달아 두되, 시계는 «점프»시킨다(타이머 미실행 = 얼어 있던 동안). */
await p.route(/\/api\/live\/status/,()=>{});
const t0=await p.evaluate(()=>Date.now());
await p.clock.setSystemTime(new Date(t0+60000));
for(const ms of [50,150,300,600,1200]){ await p.clock.runFor(ms); await sleep(150); out.steps.push({runFor:ms, badge:await badge(p)}); }
out.after=await badge(p);
out.changed=JSON.stringify(out.before)!==JSON.stringify(out.after);
await b.close(); console.log(JSON.stringify(out,null,1)); if(OUT)fs.writeFileSync(OUT,JSON.stringify(out,null,1));
