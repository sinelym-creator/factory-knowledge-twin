/**
 * 지연 프록시 — 한 엔드포인트만 «느리게» 만드는 무대 도구(D-64).
 *
 * 🔴 손잡이는 하나여야 한다: `/api/live/status` 만 지연시키고 나머지는 그대로 흘린다.
 *    전체를 느리게 하면 「상태 확인이 늦다」와 「서버가 통째로 늦다」가 섞여, 어느 쪽이
 *    화면을 「미연결」로 만들었는지 못 가른다.
 * 🔴 지연은 «응답을 붙잡는» 방식이다 — 요청은 상류에 그대로 가고, 답만 늦게 준다.
 *    막아 버리면(끊으면) 그것은 다른 자극(연결 실패)이고 다른 화면을 낸다.
 *
 * usage: node _delay_proxy.mjs --port 8175 --upstream http://127.0.0.1:8152 --delay-ms 3000
 *        [--path /api/live/status]
 */
import http from "node:http";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PORT = Number(arg("port", "8175"));
const UPSTREAM = new URL(arg("upstream", "http://127.0.0.1:8152"));
const DELAY = Number(arg("delay-ms", "3000"));
const MATCH = arg("path", "/api/live/status");

let served = 0;
let delayed = 0;

const server = http.createServer((req, res) => {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const opts = {
      hostname: UPSTREAM.hostname,
      port: UPSTREAM.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: UPSTREAM.host },
    };
    const up = http.request(opts, (ur) => {
      const send = () => {
        res.writeHead(ur.statusCode || 502, ur.headers);
        ur.pipe(res);
      };
      served += 1;
      if (req.url.startsWith(MATCH) && DELAY > 0) {
        delayed += 1;
        setTimeout(send, DELAY);
      } else {
        send();
      }
    });
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { code: "proxy_upstream", message: String(e) } }));
    });
    if (body.length) up.write(body);
    up.end();
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`delay-proxy :${PORT} -> ${UPSTREAM.origin} · ${MATCH} +${DELAY}ms`);
});

// 무대가 실제로 울렸는지 세는 계수기 — 「지연을 줬다」는 주장을 수로 뒷받침한다.
process.on("SIGTERM", () => {
  console.log(`served=${served} delayed=${delayed}`);
  process.exit(0);
});
setInterval(() => console.log(`[proxy] served=${served} delayed=${delayed}`), 10000).unref();
