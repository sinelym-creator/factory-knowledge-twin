/**
 * D-22 귀속 좁히기 — «손잡이 하나»만 다른 셸 면을 만든다.
 *
 * 회부(27대 §7): `reset-modal` 「취소 → 아무 일도 없다」 칸이
 *   ⓐ T6-1 코드 셸 + 게이트웨이 붙은 ai-api(online:true) → 빨강
 *   ⓑ 옛 코드 셸(3011) + 배포 ai-api(online:false)        → 초록
 * 두 열이 **코드**와 **인스턴스** 두 축에서 동시에 달라 귀속이 안 선다.
 *
 * 🔴 여기서 코드축은 정적으로 이미 닫혔다(E1): `c5743dd`↔develop 사이 `apps/web-console`
 *    diff 는 `run-panels.tsx`·`run-events.ts` 2건뿐이고, 이 축이 타는
 *    `reset-button.tsx`·`live-status.tsx`·`app/overview`·`lib/contract.ts` 는 **동일**하다.
 *    남은 축은 `online` 하나다.
 *
 * 그래서 컨테이너를 새로 세우는 대신, **살아 있는 옛 코드 셸(3011) 앞에 얇은 리버스 프록시**를
 * 두고 `/api/live/status` **응답 한 개만** 바꾼다. 열 간 차이가 1이 된다:
 *   ⓐ 직결 3011              (online:false · 27대 대조군 재현)
 *   ⓑ 프록시 passthrough      (프록시 자체가 무해함을 증명 — 이 열이 없으면 ⓒ 의 빨강이
 *                              「online 때문」인지 「프록시 때문」인지 못 가른다)
 *   ⓒ 프록시 override        (online:true — 27대 자극 열의 «인스턴스 조건»만 재현)
 *
 * 🔴 **자극 실재 계수**를 반드시 남긴다. `/api/live/status` 를 브라우저가 한 번도 안 물었으면
 *    ⓒ 는 「online:true 를 준 열」이 아니라 「아무것도 안 준 열」이다 — 그 초록/빨강은 이 축의
 *    것이 아니다(계보: 자극이 실재했는가).
 *
 *   사용: node d22_live_axis_proxy.mjs --port 3022 --mode override --trail <파일>
 */
import http from "node:http";
import fs from "node:fs";

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const PORT = Number(arg("port", "3022"));
const MODE = arg("mode", "override"); // "override" | "passthrough"
const TRAIL = arg("trail", "");
const UPSTREAM = arg("upstream", "http://127.0.0.1:3011");
const LIVE_PATH = "/api/live/status";

const up = new URL(UPSTREAM);
const counters = { liveAsked: 0, liveOverridden: 0, proxied: 0, upgrades: 0 };

const server = http.createServer((req, res) => {
  const path = req.url ?? "/";

  if (path.split("?")[0] === LIVE_PATH) {
    counters.liveAsked += 1;
    if (MODE === "override") {
      counters.liveOverridden += 1;
      const body = JSON.stringify({ online: true, checkedAt: new Date().toISOString() });
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(body);
      return;
    }
  }

  counters.proxied += 1;
  const fwd = { ...req.headers, host: up.host };
  const proxyReq = http.request(
    { hostname: up.hostname, port: up.port, path, method: req.method, headers: fwd },
    (upRes) => {
      const headers = { ...upRes.headers };
      // 🔴 절대 Location 이 상류를 가리키면 브라우저가 프록시를 벗어난다 — 그러면 «프록시를
      //    지난 열»이 아니게 된다(측정 면이 조용히 바뀐다).
      if (typeof headers.location === "string") {
        headers.location = headers.location.replace(UPSTREAM, `http://127.0.0.1:${PORT}`);
      }
      res.writeHead(upRes.statusCode ?? 502, headers);
      upRes.pipe(res);
    },
  );
  proxyReq.on("error", (e) => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: "proxy_upstream", message: String(e) } }));
  });
  req.pipe(proxyReq);
});

// 웹소켓/업그레이드는 이 축에서 안 쓰지만, 조용히 삼키면 「안 쓴 것」과 「죽인 것」이 섞인다.
server.on("upgrade", (_req, socket) => {
  counters.upgrades += 1;
  socket.destroy();
});

const dump = () => {
  if (!TRAIL) return;
  fs.writeFileSync(TRAIL, JSON.stringify({ port: PORT, mode: MODE, upstream: UPSTREAM, ...counters }, null, 2));
};
process.on("SIGTERM", () => { dump(); process.exit(0); });
process.on("SIGINT", () => { dump(); process.exit(0); });
setInterval(dump, 1000).unref();

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[d22-proxy] :${PORT} mode=${MODE} → ${UPSTREAM} (live=${LIVE_PATH})`);
});
