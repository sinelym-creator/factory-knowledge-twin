/**
 * X-16 무대 — 「상류엔 «닿았는데» 응답만 유실된다」.
 *
 * 🔴 `tests/web/_blackhole_server.mjs`(검증 좌석 자산)와 다른 물건이다. 그쪽은 accept 만 하고
 *    상류가 «없다» — 상한이 있는지만 묻는다. 이쪽은 **상류로 실제로 보내고, 상류가 끝까지
 *    답한 뒤에, 그 답을 클라이언트에게 «안 준다»**. 그래야 X-16 의 질문이 성립한다:
 *    「일은 벌어졌는데 사람은 못 봤다 → 다시 누르면 상태가 두 번 바뀌는가」.
 *
 * 🔴 **이 무대는 자극을 만들 뿐, 「상태가 두 번 바뀌었나」는 «상류»가 답한다.** 기본 상류
 *    (:8101 정적 재생본)는 상태가 없어 그 축을 못 낸다 — 상태를 가진 상류를 `--upstream` 으로
 *    지정해야 그 판정이 선다. 무대가 못 하는 말을 무대 이름으로 하지 않는다.
 *
 *   node blackhole-proxy.mjs --port 8811 --upstream 127.0.0.1:8101
 *   node blackhole-proxy.mjs --selftest            # 자기 생존 증인 1회
 */
import http from "node:http";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const witness = { forwarded: 0, upstreamAnswered: 0, dropped: 0, upstreamFailed: 0, last: null };

export function createBlackhole({ upstream }) {
  const [uHost, uPort] = upstream.split(":");
  return http.createServer((req, res) => {
    if (req.url === "/__stage") {
      /* 🔴 증인 경로만 «답한다». 이 경로까지 끊으면 무대가 자기 상태를 못 보여 준다. */
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(witness));
      return;
    }
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      witness.forwarded += 1;
      const started = Date.now();
      const up = http.request(
        { host: uHost, port: Number(uPort), path: req.url, method: req.method, headers: { ...req.headers, host: `${uHost}:${uPort}` } },
        (uRes) => {
          let bytes = 0;
          uRes.on("data", (c) => { bytes += c.length; });
          uRes.on("end", () => {
            /* 🔴 «상류가 끝까지 답한 뒤»에 끊는다 — 여기서 끊어야 「일은 벌어졌다」가 참이다.
               먼저 끊으면 상류가 중간에 죽어 X-16 이 아니라 그냥 «요청 실패»가 된다. */
            witness.upstreamAnswered += 1;
            witness.last = { status: uRes.statusCode, bytes, ms: Date.now() - started, at: new Date().toISOString() };
            witness.dropped += 1;
            req.socket.destroy();
          });
        },
      );
      up.on("error", (e) => {
        witness.upstreamFailed += 1;
        witness.last = { error: String(e.code || e.message), ms: Date.now() - started };
        req.socket.destroy();
      });
      if (chunks.length) up.write(Buffer.concat(chunks));
      up.end();
    });
  });
}

const PORT = Number(arg("port", 8811));
const UPSTREAM = arg("upstream", "127.0.0.1:8101");
/* 🔴 경로를 «명령줄 기본값»으로 두지 않는다 — MSYS 셸이 `/api/...` 를 윈도우 경로로 번역해
   `C:/Program Files/Git/api/...` 를 넘긴다(오늘 이 함정에 한 번 걸렸다). 인자로 줄 때는
   `--probe-path` 대신 `--probe` 에 «앞 슬래시 없이» 준다. */
const PROBE_PATH = "/" + String(arg("probe", "api/plants")).replace(/^\/+/, "");

if (has("selftest")) {
  /* 🔴 자기 생존 증인 — 「띄웠다」가 아니라 «울렸다»를 값으로 낸다. 두 사실이 «같은 실행»에서
     함께 나와야 통과다: ① 상류가 답했다 ② 클라이언트는 못 받았다. 하나라도 없으면 실패. */
  const probePort = Number(arg("port", 8899));
  const srv = createBlackhole({ upstream: UPSTREAM });
  await new Promise((r) => srv.listen(probePort, "127.0.0.1", r));
  const clientResult = await new Promise((resolve) => {
    const r = http.request({ host: "127.0.0.1", port: probePort, path: PROBE_PATH, method: "GET" }, (res) => {
      let n = 0;
      res.on("data", (c) => { n += c.length; });
      res.on("end", () => resolve({ gotResponse: true, status: res.statusCode, bytes: n }));
    });
    r.on("error", (e) => resolve({ gotResponse: false, error: String(e.code || e.message) }));
    r.setTimeout(8000, () => { r.destroy(new Error("CLIENT_TIMEOUT")); });
    r.end();
  });
  srv.close();
  const upstreamAnswered = witness.upstreamAnswered;
  const clientBlind = clientResult.gotResponse === false;
  const report = { upstream: UPSTREAM, probePort, upstreamAnswered, clientResult, witness };
  console.log(JSON.stringify(report, null, 1));
  if (upstreamAnswered >= 1 && clientBlind) {
    console.log("SELFTEST PASS — 상류 도달 " + upstreamAnswered + "건 · 클라이언트 수신 0건");
    process.exit(0);
  }
  console.log("SELFTEST FAIL — 자극이 안 섰다(상류 도달 " + upstreamAnswered + " · 클라이언트 수신 " + (clientBlind ? 0 : 1) + ")");
  process.exit(1);
} else {
  createBlackhole({ upstream: UPSTREAM }).listen(PORT, "127.0.0.1", () =>
    console.log(`x-stage blackhole 127.0.0.1:${PORT} → ${UPSTREAM} · witness GET /__stage`),
  );
}
