/**
 * X-11 무대 — 「동시 요청 상한을 넘으면 **503 + `Retry-After`**」 (`t42b:208` 이 기다리는 자리).
 *
 * 🔴 **초과분만** 거절한다. 전부 503 이면 그건 «상한»이 아니라 «고장»이다 — 화면에서도 다른
 *    질문이 된다. 그래서 판정선은 「503 이 났다」가 아니라 **「같은 버스트에서 503 «그리고»
 *    통과가 둘 다 났다」**이다. 한쪽만 나오면 selftest 실패.
 *
 * 🔴 **무대가 울리려면 상류가 «겹칠 만큼» 느려야 한다.** 상류가 즉답하면 요청이 사실상 직렬로
 *    끝나 동시 진행 수가 상한에 닿지 않는다 — 그러면 전부 200 이 나오고, 이건 「상한이 없다」가
 *    아니라 **「자극이 안 섰다」**이다. selftest 의 내부 상류는 그래서 일부러 느리다
 *    (`--upstream-delay-ms`). 실 상류 앞에 세울 때는 버스트를 그만큼 키워야 한다.
 *
 * 🔴 **이 무대가 «못 하는 말»**: 「화면이 `Retry-After` 를 읽고 되묻는가」는 **화면이 답한다.**
 *    이쪽은 상한이 실제로 걸렸고 통과분은 상류에 닿았다는 두 사실만 낸다.
 *
 *   node capacity-proxy.mjs --port 8813 --upstream 127.0.0.1:8101 --max-inflight 2 --retry-after 1
 *   node capacity-proxy.mjs --selftest --max-inflight 2 --burst 6      # 내부(느린) 상류로 자족
 *   node capacity-proxy.mjs --selftest --upstream 127.0.0.1:<levi2-ai-api-port> --burst 40 --probe api/plants
 */
import http from "node:http";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const witness = {
  maxInflight: 0,
  retryAfter: 0,
  arrived: 0,
  rejected: 0,          /* 상한 초과로 무대가 503 을 낸 건수 */
  passedThrough: 0,     /* 상류로 넘긴 건수 */
  upstreamAnswered: 0,  /* 상류가 답한 건수 */
  upstreamFailed: 0,
  inflightNow: 0,
  peakInflight: 0,      /* 🔴 상한이 «닿았는지»를 말하는 값 — 이게 상한 미만이면 자극이 안 섰다 */
  last: null,
};

export function createCapacityProxy({ upstream, maxInflight, retryAfter }) {
  const [uHost, uPort] = upstream.split(":");
  witness.maxInflight = maxInflight;
  witness.retryAfter = retryAfter;
  return http.createServer((req, res) => {
    if (req.url === "/__stage") {
      /* 🔴 증인 경로는 상한에 «세지 않는다». 여기까지 거절하면 무대 상태를 못 읽는다. */
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(witness));
      return;
    }
    witness.arrived += 1;
    if (witness.inflightNow >= maxInflight) {
      /* 🔴 «초과분만» — 진행 중인 것들은 건드리지 않는다. */
      witness.rejected += 1;
      witness.last = { decision: "rejected", inflight: witness.inflightNow, at: new Date().toISOString() };
      res.writeHead(503, {
        "content-type": "application/json",
        "retry-after": String(retryAfter),
      });
      res.end(JSON.stringify({ stage: "capacity-proxy", reason: "max-inflight", maxInflight, retryAfter }));
      return;
    }

    witness.inflightNow += 1;
    witness.peakInflight = Math.max(witness.peakInflight, witness.inflightNow);
    witness.passedThrough += 1;
    let released = false;
    const release = () => { if (!released) { released = true; witness.inflightNow -= 1; } };

    const reqAt = Date.now();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const up = http.request(
        {
          host: uHost, port: Number(uPort), path: req.url, method: req.method,
          headers: { ...req.headers, host: `${uHost}:${uPort}` },
        },
        (uRes) => {
          witness.upstreamAnswered += 1;
          const headers = { ...uRes.headers };
          delete headers["transfer-encoding"];   /* 이미 디코드되어 나온다 — 되쓰면 이중 인코딩 */
          delete headers["connection"];
          res.writeHead(uRes.statusCode, headers);
          let bytes = 0;
          uRes.on("data", (c) => { bytes += c.length; });
          uRes.on("end", () => {
            witness.last = { decision: "passed", status: uRes.statusCode, bytes, ms: Date.now() - reqAt, at: new Date().toISOString() };
            release();
          });
          uRes.pipe(res);
        },
      );
      up.on("error", (e) => {
        witness.upstreamFailed += 1;
        witness.last = { decision: "upstreamError", error: String(e.code || e.message), ms: Date.now() - reqAt };
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ stage: "capacity-proxy", upstreamError: String(e.code || e.message) }));
        release();
      });
      if (chunks.length) up.write(Buffer.concat(chunks));
      up.end();
    });
    /* 🔴 클라이언트가 끊어도 자리는 «반드시» 돌려준다 — 안 돌려주면 무대가 스스로 막혀
       그 뒤 전량이 503 이 되고, 그건 상한이 아니라 고장이다. */
    res.on("close", release);
  });
}

const PORT = Number(arg("port", 8813));
const MAX_INFLIGHT = Number(arg("max-inflight", 2));
const RETRY_AFTER = Number(arg("retry-after", 1));
const UPSTREAM_DEFAULT = "127.0.0.1:8101";
/* MSYS 셸이 앞 슬래시를 윈도우 경로로 번역한다 — 앞 슬래시 없이 받아 여기서 붙인다. */
const PROBE_PATH = "/" + String(arg("probe", "api/plants")).replace(/^\/+/, "");

function get({ host, port, path }) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const r = http.request({ host, port, path, method: "GET" }, (res) => {
      let n = 0;
      res.on("data", (c) => { n += c.length; });
      res.on("end", () => resolve({
        ok: true, status: res.statusCode, bytes: n,
        retryAfter: res.headers["retry-after"] ?? null,
        elapsedMs: Date.now() - t0,
      }));
    });
    r.on("error", (e) => resolve({ ok: false, error: String(e.code || e.message), elapsedMs: Date.now() - t0 }));
    r.setTimeout(20000, () => r.destroy(new Error("CLIENT_TIMEOUT")));
    r.end();
  });
}

if (has("selftest")) {
  const upstreamDelayMs = Number(arg("upstream-delay-ms", 400));
  let upstream = arg("upstream", null);
  let internal = null;
  if (!upstream) {
    /* 🔴 일부러 «느린» 상류 — 안 그러면 요청이 겹치지 않아 상한에 닿지 못한다. */
    internal = http.createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ stage: "capacity-proxy-selftest-upstream" }));
      }, upstreamDelayMs);
    });
    await new Promise((r) => internal.listen(0, "127.0.0.1", r));
    upstream = `127.0.0.1:${internal.address().port}`;
  }
  const BURST = Number(arg("burst", MAX_INFLIGHT * 3));

  const srv = createCapacityProxy({ upstream, maxInflight: MAX_INFLIGHT, retryAfter: RETRY_AFTER });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const stagePort = srv.address().port;                 /* 🔴 포트를 «값으로» 낸다 */

  const results = await Promise.all(
    Array.from({ length: BURST }, () => get({ host: "127.0.0.1", port: stagePort, path: PROBE_PATH })),
  );
  srv.close();
  if (internal) internal.close();

  const byStatus = {};
  for (const r of results) {
    const k = r.ok ? String(r.status) : `err:${r.error}`;
    byStatus[k] = (byStatus[k] || 0) + 1;
  }
  const rejected = results.filter((r) => r.ok && r.status === 503);
  const passed = results.filter((r) => r.ok && r.status !== 503);
  const status200 = results.filter((r) => r.ok && r.status === 200).length;
  const rejectedWithHeader = rejected.filter((r) => r.retryAfter !== null && r.retryAfter !== undefined).length;

  const report = {
    upstream, upstreamKind: internal ? `internal(selftest · ${upstreamDelayMs}ms)` : "external(--upstream)",
    stagePort, probePath: PROBE_PATH,
    maxInflight: MAX_INFLIGHT, retryAfterConfigured: RETRY_AFTER, burst: BURST,
    responsesReceived: results.length,
    byStatus, status200, rejectedCount: rejected.length, passedCount: passed.length, rejectedWithHeader,
    witness,
  };
  console.log(JSON.stringify(report, null, 1));

  /* 🔴 판정 6축 — 「503 이 났다」만으로는 상한을 증명하지 못한다.
     ① 버스트가 전량 응답했다(못 받은 건이 있으면 모집단이 다르다)
     ② 상한 초과가 «났다»(503 ≥ 1)      ③ 통과분도 «있다»(전량 503 이면 상한이 아니라 고장)
     ④ 통과분이 상류에 실제로 닿았다     ⑤ 503 전부가 Retry-After 를 달았다(`t42b:208` 이 읽는 값)
     ⑥ 동시 진행이 상한에 «닿았다»(peak == maxInflight — 안 닿았으면 자극이 안 선 것) */
  const gates = {
    burstFullyAnswered: results.length === BURST && results.every((r) => r.ok),
    rejectedAtLeastOne: rejected.length >= 1,
    passedAtLeastOne: passed.length >= 1,
    passedReachedUpstream: witness.upstreamAnswered >= 1,
    everyRejectHasRetryAfter: rejected.length >= 1 && rejectedWithHeader === rejected.length,
    peakReachedLimit: witness.peakInflight === MAX_INFLIGHT,
  };
  /* 내부 상류일 때는 통과분이 «200» 이어야 한다 — 설계 문면의 증인 그대로.
     외부 상류의 상태코드는 그쪽 것이라 이 축을 걸 수 없다(못 하는 말). */
  if (internal) gates.passedIs200 = status200 >= 1;

  const failed = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length === 0) {
    console.log(
      `SELFTEST PASS — 버스트 ${BURST} · 503 ${rejected.length}건(Retry-After ${RETRY_AFTER} 전건 부착) · ` +
      `통과 ${passed.length}건(200 ${status200}) · peakInflight ${witness.peakInflight}/${MAX_INFLIGHT} · ` +
      `상류 응답 ${witness.upstreamAnswered} · stagePort ${stagePort}`,
    );
    process.exit(0);
  }
  console.log(
    `SELFTEST FAIL — 미충족 축: ${failed.join(", ")} ` +
    `(503 ${rejected.length} · 통과 ${passed.length} · peak ${witness.peakInflight}/${MAX_INFLIGHT} · 응답 ${results.length}/${BURST})`,
  );
  process.exit(1);
} else {
  const upstream = arg("upstream", UPSTREAM_DEFAULT);
  createCapacityProxy({ upstream, maxInflight: MAX_INFLIGHT, retryAfter: RETRY_AFTER }).listen(PORT, "127.0.0.1", () =>
    console.log(
      `x-stage capacity 127.0.0.1:${PORT} → ${upstream} · max-inflight ${MAX_INFLIGHT} · Retry-After ${RETRY_AFTER} · witness GET /__stage`,
    ),
  );
}
