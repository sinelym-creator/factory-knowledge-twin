/**
 * X-25 상류 무대 — 「상류가 **어떻게** 죽는가」를 한 손잡이로 갈아 끼운다. 리바이2 42대.
 *
 * 🔴 X-25 의 판정 축은 «사유 문면»이고, 사유는 상류가 **어떤 방식으로** 실패했는지에 따라
 *    갈린다(`lib/contract.ts:799·803·817`) —
 *      · 소켓이 끊긴다      → `fetch` 가 던짐 → `why = e.name` = **TypeError**
 *      · 상태 코드가 온다   → `why = "HTTP nnn"`                 = **HTTP 503**
 *      · 501 이 온다        → `why = "미구현(501)"`
 *    셋은 **다른 경로**라 하나의 자극으로는 셋을 못 만든다. 그래서 모드를 바꾸는 자리를 둔다.
 *
 * 🔴 **셸의 목적지는 빌드 시점에 굳는다** — 그래서 서버를 갈아 끼우는 대신 «한 포트에서 모드를
 *    바꾼다». 두 셸(전·후)이 같은 포트를 보므로 손잡이가 하나로 유지된다.
 *
 * 🔴 **모드마다 계수를 센다.** 「자극이 실재했는가」는 화면이 아니라 이 수가 답한다. 0 이면
 *    그 열은 빨강도 초록도 아닌 «안 잼»이다(빈 결과끼리의 일치는 일치가 아니다).
 *
 *   node _x25_upstream_stage.mjs --port=8812 --upstream=http://127.0.0.1:8103
 *   GET /__stage/normal · /__stage/refuse?only=/api/plants · /__stage/status?code=503 · /__stage/stats
 *   (`only` = 자극을 넣을 **경로 접두사**. 정규식이 아니다 — 아래 `startsWith` 참조.)
 */
import http from "node:http";

const arg = (k, d) => {
  const h = process.argv.find((x) => x.startsWith(`--${k}=`));
  return h ? h.slice(k.length + 3) : d;
};
const PORT = Number(arg("port", "8812"));
const UP = arg("upstream", "http://127.0.0.1:8103");

let mode = "normal"; // normal | refuse | status
let statusCode = 503;
const stats = { passed: 0, refused: 0, statused: 0, upstreamErr: 0, lastPath: null, paths: [] };
/* 🔴 «반쪽 스텁» — 상류를 통째로 끊으면 관문 호출까지 죽어 셸이 화면을 그리기 «전에» 되돌린다
   (실측: `/overview` 가 307 로 `/` 로 튄다). 그러면 나는 안내 화면이 아니라 관문을 재게 된다.
   그래서 «어느 경로를» 죽일지 고를 수 있어야 한다 — 자극은 판정하려는 그 호출에만 넣는다. */
let only = null; // 경로 접두사 · null = 전부

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (u.pathname === "/__stage/stats") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode, statusCode, ...stats }));
    return;
  }
  if (u.pathname.startsWith("/__stage/")) {
    const want = u.pathname.slice("/__stage/".length);
    if (want === "normal" || want === "refuse" || want === "status") {
      mode = want;
      if (want === "status") statusCode = Number(u.searchParams.get("code") ?? 503);
      only = u.searchParams.get("only"); // 예: only=/api/plants → 그 경로만 자극
    }
    if (want === "reset") { stats.paths = []; }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ mode, statusCode, only }));
    return;
  }

  stats.lastPath = u.pathname;
  if (stats.paths.length < 60) stats.paths.push(u.pathname);
  /* 🔴 자극 대상이 아니면 «정상»으로 흘린다 — 반쪽 스텁의 요점이다.
     🔴 **정규식을 «만들지 않는다»**(CodeQL `js/regex-injection` · #593). `only` 는 쿼리로 들어오는
        값이라 그대로 `new RegExp` 에 넣으면 호출자가 이 무대의 매칭 규칙을 짜게 된다 — 무대는
        내가 쥐어야 하고, 여기 필요한 것은 «경로 접두사» 하나뿐이라 표현식이 필요 없다. */
  const targeted = !only || u.pathname.startsWith(only);

  /* ① 소켓을 끊는다 — 500 을 «주는» 것과 아예 «안 주는» 것은 셸에서 다른 경로다. */
  if (mode === "refuse" && targeted) {
    stats.refused += 1;
    req.socket.destroy();
    return;
  }

  /* ② 상태 코드를 «준다» — 본문까지 준다(계약 오류 형태를 흉내내지 않는다: 셸이 보는 것은
        상태 코드뿐이고, 본문을 지어내면 그 지어낸 것이 판정에 섞인다). */
  if (mode === "status" && targeted) {
    stats.statused += 1;
    res.writeHead(statusCode, { "content-type": "application/json" });
    res.end(JSON.stringify({ stage: "x25", code: statusCode }));
    return;
  }

  /* ③ 정상 — 그대로 통과시킨다(대조군은 «진짜 화면»이어야 한다). */
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  try {
    const r = await fetch(UP + u.pathname + u.search, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length"].includes(k)),
      ),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      redirect: "manual",
    });
    stats.passed += 1;
    const buf = Buffer.from(await r.arrayBuffer());
    const h = Object.fromEntries(r.headers.entries());
    delete h["content-encoding"];
    delete h["content-length"];
    delete h["transfer-encoding"];
    res.writeHead(r.status, h);
    res.end(buf);
  } catch (e) {
    /* 🔴 상류가 스스로 죽은 것과 내가 끊은 것을 «다른 수»로 남긴다 — 안 그러면 무대 고장이
       대상 결함으로 보고된다. */
    stats.upstreamErr += 1;
    /* 🔴 **원문은 응답에 싣지 않는다**(CodeQL `js/stack-trace-exposure` · #593) — 내부 오류 문면은
       무대 로그로만 낸다. 계수(`upstreamErr`)는 그대로라 「상류가 스스로 죽었다」와 「내가 끊었다」는
       여전히 다른 수로 갈린다(이 파일이 존재하는 이유는 그 구분이지 문면이 아니다). */
    console.error("[x25-stage] upstream error:", String(e?.message ?? e).slice(0, 200));
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ stage: "x25", upstreamError: true }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[x25-stage] :${PORT} → ${UP} · mode=${mode}`);
});
