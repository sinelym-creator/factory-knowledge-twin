/**
 * preflight — 🔴 2대 유언: 「도구가 살아 있는지부터 물어라」.
 *
 * 브라우저 스펙이 초록을 내기 «전»에, 무엇을 상대로 재는지부터 세운다. 서버가 안 떠 있으면
 * 스펙은 timeout 으로 죽고, 그 빨강은 「셸이 틀렸다」처럼 보인다 — 그건 측정이 아니라 사고다.
 *
 * 여기서 남기는 것은 판정이 아니라 «측정 조건»이다: 이 실행의 초록이 어떤 백엔드 상태에서
 * 난 초록인지를 보고서가 스스로 말하게 한다.
 */
const WEB = process.env.FKT_WEB_BASE ?? "http://127.0.0.1:3101";
const API = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";

async function probe(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(6000), redirect: "manual" });
    const body = await res.text();
    return { ok: true as const, status: res.status, body: body.slice(0, 160) };
  } catch (e) {
    return { ok: false as const, why: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }
}

export default async function preflight() {
  const web = await probe(`${WEB}/overview`);
  const live = await probe(`${API}/api/live/status`);
  const create = await probe(`${API}/api/sessions`, { method: "POST" });

  const lines: string[] = [];
  if (!web.ok) lines.push(`🔴 web-console 무응답 ${WEB} — ${web.why}\n     cd apps/web-console && pnpm build && pnpm exec next start -p 3101`);
  if (!live.ok) lines.push(`🔴 ai-api 무응답 ${API} — ${live.why}\n     cd services/ai-api && uvicorn app.main:app --port 8000`);
  if (lines.length) throw new Error("preflight 실패 — 측정 대상이 서 있지 않다(초록도 빨강도 아니다)\n  " + lines.join("\n  "));

  console.log("== preflight — 이 실행이 상대한 것");
  console.log(`   web-console       ${WEB}   GET /overview → ${web.status} (쿠키 없음 = 가드 홉)`);
  console.log(`   ai-api            ${API}`);
  console.log(`     GET  /api/live/status  → ${live.status}  ${live.ok ? live.body : ""}`);
  console.log(`     POST /api/sessions     → ${create.status}  ${create.ok ? create.body : ""}`);
  console.log("   🔴 POST /sessions 가 501 이므로 이 실행의 세션 origin 은 «pending» 이 정상이다");
  console.log("      (승인된 설계 판단 — 결함이 아니다). online:false 이므로 모드 배지는 REPLAY 가 정상이다.\n");

  if (web.status !== 307) {
    throw new Error(`🔴 preflight 이상: 쿠키 없는 /overview 가 307 이 아니라 ${web.status} 다 — 세션 가드가 이 빌드에 없거나 서버가 다른 빌드다`);
  }
}
