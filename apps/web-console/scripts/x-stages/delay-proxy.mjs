/**
 * X-03·X-07 무대 — 「늦게 오지만 **정상으로** 온다」.
 *
 * 🔴 ①(blackhole-proxy)과 다른 점은 **끊지 않는다**는 것 하나다. 상류 응답을 `--delay-ms`
 *    만큼 «개시하지 않고» 붙들었다가, 상태·헤더·본문을 그대로 흘려보낸다. 그래야 화면에서
 *    「잠정 상태가 그려졌다 → 걷힌다」가 성립한다. 끊으면 그건 ①의 질문(X-16)이지 이쪽이 아니다.
 *
 * 🔴 **증인은 «설정값»이 아니라 «실측 ms»다.** `--delay-ms 1200` 을 줬다는 사실은 아무것도
 *    증명하지 않는다 — 요청 수신 시각 ↔ 응답 «개시» 시각의 실측차를 값으로 낸다.
 *    지연이 0 이면 자극 자체가 없었던 것이므로 selftest 는 실패한다.
 *
 * 🔴 **selftest 는 자기 상류를 데리고 온다.** 외부 스텁(:8101)에 기대면 그쪽이 죽었을 때
 *    「무대가 고장」과 「상류가 부재」가 같은 빨강으로 나온다. 내부 상류를 세우고,
 *    **같은 상류에 무대를 안 거친 대조군 요청**을 먼저 넣어 기준선을 잡는다 —
 *    그래야 측정된 지연이 «내 무대의 것»임이 갈린다. (`--upstream` 을 명시하면 그쪽을 쓴다.)
 *
 * 🔴 **이 무대가 «못 하는 말»**: 「잠정 상태가 그려졌다 걷혔다」는 **화면이 답한다.** 이쪽은
 *    지연이 실제로 걸렸고 응답이 온전했다는 두 사실만 낸다.
 *
 *   node delay-proxy.mjs --port 8812 --upstream 127.0.0.1:8101 --delay-ms 1200
 *   node delay-proxy.mjs --selftest --delay-ms 800            # 내부 상류 + 대조군까지 자족
 *   node delay-proxy.mjs --selftest --upstream 127.0.0.1:8010 --probe api/plants
 */
import http from "node:http";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const witness = {
  delayMsConfigured: 0,
  forwarded: 0,
  upstreamAnswered: 0,
  delivered: 0,
  upstreamFailed: 0,
  clientAborted: 0,
  maxResponseStartMs: 0,
  minResponseStartMs: null,
  last: null,
};

export function createDelayProxy({ upstream, delayMs }) {
  const [uHost, uPort] = upstream.split(":");
  witness.delayMsConfigured = delayMs;
  return http.createServer((req, res) => {
    if (req.url === "/__stage") {
      /* 🔴 증인 경로는 «지연 없이» 답한다 — 이 경로까지 붙들면 무대 상태를 못 읽는다. */
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(witness));
      return;
    }
    const reqAt = Date.now();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      witness.forwarded += 1;
      const up = http.request(
        {
          host: uHost,
          port: Number(uPort),
          path: req.url,
          method: req.method,
          headers: { ...req.headers, host: `${uHost}:${uPort}` },
        },
        (uRes) => {
          witness.upstreamAnswered += 1;
          const headersAt = Date.now();
          /* 🔴 상류 스트림을 «세운다». 버퍼로 받아 두면 SSE·chunked 의 스트림 성질이 사라져,
             실 ai-api 앞에 세웠을 때 지연이 아닌 «형태»까지 바꿔 버린다. pause 로 붙들면
             응답 개시 시각만 밀리고 나머지는 상류 그대로다. */
          uRes.pause();
          const timer = setTimeout(() => {
            if (res.writableEnded || res.destroyed) return;
            const headers = { ...uRes.headers };
            /* 🔴 chunked 는 클라이언트 쪽에서 이미 «디코드»되어 uRes 로 나온다 — 그 헤더를
               그대로 되쓰면 이중 인코딩이 된다. 지우고 Node 가 다시 정하게 둔다. */
            delete headers["transfer-encoding"];
            delete headers["connection"];
            const responseStartMs = Date.now() - reqAt;
            res.writeHead(uRes.statusCode, headers);
            let bytes = 0;
            uRes.on("data", (c) => { bytes += c.length; });
            uRes.on("end", () => {
              witness.delivered += 1;
              witness.maxResponseStartMs = Math.max(witness.maxResponseStartMs, responseStartMs);
              witness.minResponseStartMs =
                witness.minResponseStartMs === null
                  ? responseStartMs
                  : Math.min(witness.minResponseStartMs, responseStartMs);
              witness.last = {
                status: uRes.statusCode,
                bytes,
                upstreamHeadersMs: headersAt - reqAt,
                responseStartMs,          /* 🔴 실측 지연 — 요청 수신 ↔ 응답 개시 */
                heldMs: responseStartMs - (headersAt - reqAt),
                totalMs: Date.now() - reqAt,
                at: new Date().toISOString(),
              };
            });
            uRes.pipe(res);
            uRes.resume();
          }, delayMs);
          /* 클라이언트가 먼저 포기하면 붙들 이유가 없다 — 타이머를 거둔다. */
          res.on("close", () => {
            if (!res.writableEnded) { witness.clientAborted += 1; clearTimeout(timer); uRes.destroy(); }
          });
        },
      );
      up.on("error", (e) => {
        witness.upstreamFailed += 1;
        witness.last = { error: String(e.code || e.message), ms: Date.now() - reqAt };
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ stage: "delay-proxy", upstreamError: String(e.code || e.message) }));
      });
      if (chunks.length) up.write(Buffer.concat(chunks));
      up.end();
    });
  });
}

const PORT = Number(arg("port", 8812));
const DELAY_MS = Number(arg("delay-ms", 1200));
const UPSTREAM_DEFAULT = "127.0.0.1:8101";
/* 🔴 MSYS 셸은 `/api/plants` 를 `C:/Program Files/Git/api/plants` 로 번역한다(①이 걸린 함정).
   앞 슬래시 없이 받아 여기서 붙인다. */
const PROBE_PATH = "/" + String(arg("probe", "api/plants")).replace(/^\/+/, "");

/** 대조군용 1회 요청 — 경과 ms·상태·바이트를 «같은 계측기»로 뜬다. */
function timedGet({ host, port, path }) {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const r = http.request({ host, port, path, method: "GET" }, (res) => {
      let n = 0;
      res.on("data", (c) => { n += c.length; });
      res.on("end", () => resolve({ ok: true, status: res.statusCode, bytes: n, elapsedMs: Date.now() - t0 }));
    });
    r.on("error", (e) => resolve({ ok: false, error: String(e.code || e.message), elapsedMs: Date.now() - t0 }));
    r.setTimeout(20000, () => r.destroy(new Error("CLIENT_TIMEOUT")));
    r.end();
  });
}

if (has("selftest")) {
  /* ── 상류: 명시가 없으면 «내부»에 세운다(자족) ───────────────────────────── */
  let upstream = arg("upstream", null);
  let internal = null;
  if (!upstream) {
    internal = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ stage: "delay-proxy-selftest-upstream", ts: 0 }));
    });
    await new Promise((r) => internal.listen(0, "127.0.0.1", r));
    upstream = `127.0.0.1:${internal.address().port}`;
  }
  const [uHost, uPort] = upstream.split(":");

  /* ── 대조군: 무대를 «안 거친» 같은 상류 (기준선) ──────────────────────────── */
  const control = await timedGet({ host: uHost, port: Number(uPort), path: PROBE_PATH });

  /* ── 실험군: 무대를 거친 같은 상류 ────────────────────────────────────────── */
  const srv = createDelayProxy({ upstream, delayMs: DELAY_MS });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const stagePort = srv.address().port;               /* 🔴 포트를 «값으로» 낸다 */
  const through = await timedGet({ host: "127.0.0.1", port: stagePort, path: PROBE_PATH });

  srv.close();
  if (internal) internal.close();

  const measured = witness.last && typeof witness.last.responseStartMs === "number" ? witness.last.responseStartMs : 0;
  const addedMs = through.ok && control.ok ? through.elapsedMs - control.elapsedMs : null;
  const report = {
    upstream, upstreamKind: internal ? "internal(selftest)" : "external(--upstream)",
    stagePort, probePath: PROBE_PATH,
    delayMsConfigured: DELAY_MS,
    control, through,
    measuredResponseStartMs: measured, addedMsVsControl: addedMs,
    witness,
  };
  console.log(JSON.stringify(report, null, 1));

  /* 🔴 판정 4축 — 하나라도 빠지면 「늦췄고 정상이었다」가 아니다.
     ① 자극이 설정됐다(0 은 자극 없음 = 실패)  ② 실측 지연이 설정값에 닿았다
     ③ 대조군보다 실제로 늦었다(내 무대의 지연임을 가른다)
     ④ 끊기지 않고 «정상 복구»됐다 — 상태·바이트가 대조군과 같다 */
  const gates = {
    stimulusConfigured: DELAY_MS >= 1,
    measuredReachesConfigured: measured >= DELAY_MS * 0.8,
    slowerThanControl: addedMs !== null && addedMs >= DELAY_MS * 0.5,
    recoveredNormally:
      through.ok === true && control.ok === true &&
      through.status === control.status && through.bytes === control.bytes && witness.delivered === 1,
  };
  const failed = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length === 0) {
    console.log(
      `SELFTEST PASS — 실측 지연 ${measured}ms(설정 ${DELAY_MS}ms) · 대조군 대비 +${addedMs}ms · ` +
      `정상 복구 ${through.status} · ${through.bytes} B(대조군 ${control.status} · ${control.bytes} B) · stagePort ${stagePort}`,
    );
    process.exit(0);
  }
  console.log(`SELFTEST FAIL — 미충족 축: ${failed.join(", ")} (실측 ${measured}ms · 설정 ${DELAY_MS}ms · 대조군 대비 ${addedMs}ms)`);
  process.exit(1);
} else {
  createDelayProxy({ upstream: arg("upstream", UPSTREAM_DEFAULT), delayMs: DELAY_MS }).listen(PORT, "127.0.0.1", () =>
    console.log(
      `x-stage delay 127.0.0.1:${PORT} → ${arg("upstream", UPSTREAM_DEFAULT)} · delay ${DELAY_MS}ms · witness GET /__stage`,
    ),
  );
}
