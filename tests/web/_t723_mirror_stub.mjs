/**
 * T7-23 축① — 「빠른 상류」 스텁 (:8101). 리바이2 39대.
 *
 * 🔴 손잡이를 «하나»로 만들기 위한 물건이다. 손으로 쓴 얕은 스텁은 내용까지 달라져
 *    「상류가 스텁이라 통과」와 「상류가 내용이 달라 통과」를 못 가른다(38대 실측: 얕은
 *    스텁 하나가 깊은 API 63본을 무더기 빨강으로 만들었다).
 *
 * 그래서 이 스텁은 **실 ai-api(:8102)의 응답을 그대로 베껴 메모리에 재우는 거울**이다 —
 *   · 첫 요청(miss) = 실 ai-api 로 통과(느림) · 그 뒤(hit) = 메모리에서 즉답(≈0ms)
 *   · 키의 경로에서 «불투명 id 세그먼트»는 `:id` 로 정규화한다. 안 그러면 세션이 바뀔 때마다
 *     전부 miss 라 「빠른 상류」가 성립하지 않는다. 스텁 세계 안에서는 앞선 세션의 답이
 *     일관되게 돌아오므로 화면은 정상적으로 그려진다.
 *   · 🔴 hit/miss 수와 아낀 시간을 `/__stub/stats` 로 낸다 — 「빨랐다」를 «수»로 남기기 위해서다.
 *
 * 사용: node _t723_mirror_stub.mjs [--port=8101] [--upstream=http://127.0.0.1:8102]
 */
import http from "node:http";

const arg = (k, d) => {
  const hit = process.argv.find((x) => x.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const PORT = Number(arg("port", "8101"));
const UP = arg("upstream", "http://127.0.0.1:8102");

const cache = new Map();
const stats = { hit: 0, miss: 0, upstreamMs: 0, hitMs: 0, refused: 0, keys: [] };

/* 🔴 X-05/X-20/X-21 용 «끊김» 스위치(T7-23 축②). 배포·타 좌석이 쓰는 실 ai-api 를 죽이지
   않고 「상류 다운」을 만들기 위한 자리다 — 자극은 «내 것»에만 넣는다.
   500/503 이 아니라 **소켓을 끊는다**: X-05 의 자극은 「응답 코드」가 아니라 「연결 자체가
   안 된다」이고, 둘은 셸에서 다른 경로를 탄다. `refused` 수가 «자극이 실재했다»의 증인이다. */
let down = false;

/** 불투명 id(16자 이상 영숫자 / uuid)는 `:id` 로 접는다 — 세션마다 miss 나는 것을 막는다. */
const normalize = (pathname) =>
  pathname
    .split("/")
    .map((seg) =>
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-/.test(seg) || /^[A-Za-z0-9_-]{16,}$/.test(seg) ? ":id" : seg,
    )
    .join("/");

const readBody = (req) =>
  new Promise((res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => res(Buffer.concat(chunks)));
  });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/__stub/stats") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(stats));
    return;
  }
  if (u.pathname === "/__stub/down" || u.pathname === "/__stub/up") {
    down = u.pathname.endsWith("/down");
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ down, refused: stats.refused }));
    return;
  }
  if (down) {
    /* 상류가 «없는» 상태 — 응답을 주지 않고 소켓을 끊는다. */
    stats.refused++;
    req.socket.destroy();
    return;
  }
  if (u.pathname === "/__stub/reset") {
    cache.clear();
    stats.hit = 0;
    stats.miss = 0;
    stats.upstreamMs = 0;
    stats.hitMs = 0;
    stats.keys = [];
    res.writeHead(200).end("ok");
    return;
  }
  const body = await readBody(req);
  const key = `${req.method} ${normalize(u.pathname)}?${u.searchParams.toString()} #${body.length}`;
  const t0 = Date.now();
  const cached = cache.get(key);
  if (cached) {
    stats.hit++;
    stats.hitMs += Date.now() - t0;
    res.writeHead(cached.status, cached.headers);
    res.end(cached.body);
    return;
  }
  stats.miss++;
  if (stats.keys.length < 60) stats.keys.push(key);
  try {
    const upRes = await fetch(UP + req.url, {
      method: req.method,
      headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "connection", "content-length"].includes(k))),
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
      redirect: "manual",
    });
    const buf = Buffer.from(await upRes.arrayBuffer());
    const headers = {};
    upRes.headers.forEach((v, k) => {
      if (!["content-encoding", "transfer-encoding", "content-length", "connection"].includes(k.toLowerCase())) headers[k] = v;
    });
    stats.upstreamMs += Date.now() - t0;
    cache.set(key, { status: upRes.status, headers, body: buf });
    res.writeHead(upRes.status, headers);
    res.end(buf);
  } catch (e) {
    /* 🔴 상류가 못 답한 것을 «스텁이 답한 것»처럼 보이게 하지 않는다 — 502 로 그대로 낸다. */
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "stub_upstream_failed", message: String(e.message).slice(0, 200) } }));
  }
});
server.listen(PORT, "127.0.0.1", () => console.log(`[t723-stub] :${PORT} → ${UP} (거울 캐시)`));
