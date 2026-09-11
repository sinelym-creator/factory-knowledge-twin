import { chromium } from 'playwright';
const SHELL='http://127.0.0.1:8197', API='http://127.0.0.1:8030';
const sess=await fetch(`${API}/api/sessions`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
const cookie=(sess.headers.get('set-cookie')||'').split(';')[0];
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:412,height:600}});
await ctx.addCookies([{name:cookie.split('=')[0],value:cookie.split('=').slice(1).join('='),url:SHELL}]);
const p=await ctx.newPage(); await p.goto(`${SHELL}/overview`,{waitUntil:'networkidle'});
const seen=[];
for(let i=0;i<7;i++){
  const t=(await p.locator('[data-testid="mode-badge-why"]').allInnerTexts().catch(()=>[])).join('|');
  const mode=(await p.innerText('body')).includes('REPLAY')?'REPLAY':'LIVE';
  seen.push(`${mode}::${t}`); await p.waitForTimeout(9000);
}
const flips=seen.filter((v,i)=>i>0&&v!==seen[i-1]).length;
console.log(JSON.stringify({samples:seen.length,windowSec:54,distinct:[...new Set(seen)],flips},null,1));
await b.close();
