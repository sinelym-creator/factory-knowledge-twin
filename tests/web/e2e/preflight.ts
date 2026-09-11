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
// 🔴 기본값을 두지 않는다(D-74) — `:8000` 은 **다른 좌석의 대역**이라, 미지정 실행이 남의
//    서버를 조용히 재고 그 초록·빨강을 이 리포의 판정으로 적게 된다. 기본값이 남을 가리키면
//    그것은 편의가 아니라 오측정 장치다(D-72 동형 · `d21c_polling_probe.mjs` 선례).
const API = process.env.FKT_API_BASE;
if (!API) throw new Error("🔴 측정 불가 — `FKT_API_BASE` 를 지정하라(기본값 없음 · D-74 · 무접촉 대역 `:8000`·`:8010`·`:8787` 금지).");

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
  if (!live.ok) lines.push(`🔴 ai-api 무응답 ${API} — ${live.why}\n     cd services/ai-api && uvicorn app.main:app --port <내 포트> · FKT_API_BASE 로 가리켜라`);
  if (lines.length) throw new Error("preflight 실패 — 측정 대상이 서 있지 않다(초록도 빨강도 아니다)\n  " + lines.join("\n  "));

  /**
   * 🔴 **깊은 검사**(38대 · 2026-09-04 · 성문 §⑧-7 ㉑). 위의 두 홉은 **얕다** —
   * `/api/live/status` 와 `POST /api/sessions` 만 답하는 «스텁»도 그대로 통과한다.
   * 실제로 그런 스텁(`:8101`)을 물고 전량을 돌렸더니 **깊은 API 를 부르는 63본이 무더기로 빨강**이었고,
   * 얕은 화면 스펙은 전건 초록이었다 — **대상 결함처럼 보이는 무대 결함**이다.
   *
   * ⇒ **대조군의 깊이를 측정 대상의 깊이에 맞춘다.**
   *
   * 🔴 **09-11 교체(T-TOUR-V ③ · 오케 승인)**: 앞판은 `/openapi.json` 의 경로 수로 물었다.
   *    **D-87 이 그 표면을 닫은 뒤로 그 질문은 항상 404 → `paths=-1` 이라, 이 preflight 는
   *    무대가 멀쩡해도 «무조건» throw 한다**(실측: `:8020/openapi.json` → 404).
   *    그러면 `tests/web/e2e/**` 전량이 서지 못한다 — **그물이 대상보다 먼저 늙은 자리**다.
   *    문서가 닫혔다고 해서 깊이 검사를 포기하지는 않는다. 같은 깊이를 **거동**으로 묻는다:
   *      · 세션을 실제로 만들고(`POST /api/sessions` → `sessionId`)
   *      · 그 세션으로 깊은 경로를 부른다(`GET /api/scenarios` → 200)
   *      · 🔴 **음성 대조군**: 세션 «없이» 같은 경로를 부르면 401 이어야 한다.
   *    두 칸이 함께 서야 통과다. 「전부 200 을 돌려주는 스텁」은 음성 칸에서 걸리고,
   *    「전부 401 을 돌려주는 문」은 양성 칸에서 걸린다 — 문은 양면으로 시험한다.
   */
  const deepPath = "/api/scenarios";
  let sid = "";
  try { sid = String((JSON.parse(create.ok ? create.body : "{}") as { sessionId?: string }).sessionId ?? ""); } catch { sid = ""; }
  const deepAnon = await probe(`${API}${deepPath}`);
  const deepAuth = sid
    ? await probe(`${API}${deepPath}`, { headers: { cookie: `fkt_sid=${sid}` } })
    : { ok: false as const, why: "세션을 못 받았다 — POST /api/sessions 가 sessionId 를 주지 않았다" };
  const authStatus = deepAuth.ok ? deepAuth.status : -1;
  const anonStatus = deepAnon.ok ? deepAnon.status : -1;
  console.log(`   ai-api 깊은 검사      GET ${deepPath} 세션 있음 → ${authStatus} · 세션 없음 → ${anonStatus}`);
  if (authStatus !== 200 || anonStatus !== 401) {
    throw new Error(
      `🔴 preflight 실패(깊은 검사) — ${API}${deepPath} 가 세션 있음 ${authStatus}(기대 200) · 세션 없음 ${anonStatus}(기대 401) 다.\n` +
        "     양성·음성 두 칸이 함께 서야 «깊은 API 가 실제로 산다»가 참이다. 얕은 스텁이나\n" +
        "     전부 거절하는 문을 물었을 수 있다. 이 상태의 빨강은 «대상 결함»이 아니라 «무대 결함»이다.\n" +
        "     cd services/ai-api && .venv/Scripts/python.exe -m uvicorn app.main:app --port <포트> --no-proxy-headers",
    );
  }

  console.log("== preflight — 이 실행이 상대한 것");
  console.log(`   web-console       ${WEB}   GET /overview → ${web.status} (쿠키 없음 = 가드 홉)`);
  console.log(`   ai-api            ${API}`);
  console.log(`     GET  /api/live/status  → ${live.status}  ${live.ok ? live.body : ""}`);
  console.log(`     POST /api/sessions     → ${create.status}  ${create.ok ? create.body : ""}`);
  // 🔴 여기 «고정 문장»을 적어 두었더니 T3-1 착지 후 측정 조건을 거짓으로 찍었다.
  //    preflight 는 판정이 아니라 «이 실행이 무엇을 상대했는지»를 남기는 자리다 —
  //    남기는 문장도 실측을 따라가야 한다.
  console.log(
    create.ok && create.status === 200
      ? "   POST /sessions 가 200 이다 — 이 실행의 세션 origin 은 «api» 가 정상이다(T3-1 착지분)"
      : "   🔴 POST /sessions 가 501 이다 — 이 실행의 세션 origin 은 «pending» 이 정상이다(승인된 설계 판단)",
  );
  console.log("      online:false 이므로 모드 배지는 REPLAY 가 정상이다.\n");

  if (web.status !== 307) {
    throw new Error(`🔴 preflight 이상: 쿠키 없는 /overview 가 307 이 아니라 ${web.status} 다 — 세션 가드가 이 빌드에 없거나 서버가 다른 빌드다`);
  }
}
