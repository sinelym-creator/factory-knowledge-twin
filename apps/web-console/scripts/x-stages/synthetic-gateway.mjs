/**
 * X-23 무대 — 「`online:true` 인데 **근거 0건**」 → 화면이 「모른다」로 가는가 (`t6-6:226`).
 *
 * 🔴 **«따로 도는» 형태다.** 기본 회귀 스택에 끼우지 않는다 — 전량 회귀는 `/api/live/status` 가
 *    `online:false` 라야 다른 스펙이 정상이다(검증 신고분). 이 무대는 X-23 을 «칠 때만» 세운다.
 *
 * 상류를 그대로 통과시키되 **두 곳만** 바꾼다:
 *   ① `GET /api/live/status` → `online: true` 로 «합성». 상류가 죽어 있어도 합성한다
 *      (그게 이 무대의 이름이다 — 「살아 있다고 «말하는»」 게이트웨이).
 *   ② JSON 응답 안의 근거 배열(`evidenceIds`·`evidence`·`citations`)을 **길이 0** 으로.
 *
 * 🔴 **근거를 비우면 그 옆의 계수(`evidenceCount`)도 0 으로 맞춘다.** 안 그러면 자극이
 *    「근거 0건」이 아니라 **「계수와 목록이 어긋난다」**가 된다 — X-23 이 묻는 것과 다른 질문이다.
 *
 * 🔴 **증인은 «같은 실행»의 두 사실이다.** 「online:true 를 냈다」와 「근거 배열이 0 이었다」가
 *    따로 있는 두 관측이면 X-23 을 증명하지 못한다. `/__stage` 의 `paired` 가 그 짝을 든다.
 *
 * 🔴 **비어 있던 것을 비운 것은 증거가 아니다.** selftest 는 상류가 «근거를 실제로 갖고 있었다»
 *    (대조군 길이 ≥ 1)와 «상류는 online:false 였다»를 먼저 확인한다 — 안 그러면 초록은
 *    무대가 만든 게 아니라 원래 그랬던 것이다.
 *
 * 🔴 **이 무대가 «못 하는 말»**: 「화면이 «모른다»로 갔는가」는 **화면이 답한다.** 이쪽은
 *    online:true 를 냈고 근거가 0 이었다는 두 사실만 낸다.
 *
 *   node synthetic-gateway.mjs --port 8814 --upstream 127.0.0.1:8101
 *   node synthetic-gateway.mjs --selftest                       # 내부 상류 + 대조군까지 자족
 *   node synthetic-gateway.mjs --selftest --passthrough         # 역방향 대조군(FAIL 이 나야 정상)
 */
import http from "node:http";
import net from "node:net";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const witness = {
  requests: 0,
  liveStatusServed: 0,
  liveStatusForcedTrue: 0,
  liveStatusSynthesized: 0,   /* 상류가 못 답해서 통째로 지어낸 건수 */
  jsonRewritten: 0,
  arraysEmptied: 0,
  countsZeroed: 0,
  upgradesProxied: 0,         /* WS — 손대지 않고 그대로 넘긴 건수 */
  upstreamFailed: 0,
  lastLiveStatus: null,
  lastSynthesis: null,
  /* 🔴 X-23 의 증인 — 「online:true」와 「근거 0」이 «같은 실행»에서 났음을 한 자리에 든다. */
  paired: null,
};

/** JSON 을 훑어 근거 배열을 비우고, 같은 객체의 계수를 0 으로 맞춘다. 바꾼 자리를 경로로 남긴다. */
function emptyEvidence(node, evidenceKeys, path = "$", out = { arrays: [], counts: [] }) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => emptyEvidence(v, evidenceKeys, `${path}[${i}]`, out));
    return out;
  }
  if (node && typeof node === "object") {
    let emptiedHere = false;
    for (const k of Object.keys(node)) {
      if (evidenceKeys.includes(k) && Array.isArray(node[k])) {
        if (node[k].length > 0) out.arrays.push({ path: `${path}.${k}`, before: node[k].length, after: 0 });
        node[k] = [];
        emptiedHere = true;
      } else {
        emptyEvidence(node[k], evidenceKeys, `${path}.${k}`, out);
      }
    }
    /* 🔴 목록을 비웠으면 그 «옆의 계수»도 0 으로 — 어긋난 채 두면 다른 자극이 된다. */
    if (emptiedHere && typeof node.evidenceCount === "number" && node.evidenceCount !== 0) {
      out.counts.push({ path: `${path}.evidenceCount`, before: node.evidenceCount, after: 0 });
      node.evidenceCount = 0;
    }
  }
  return out;
}

export function createSyntheticGateway({ upstream, evidenceKeys, passthrough = false }) {
  const [uHost, uPort] = upstream.split(":");
  const isLiveStatus = (url) => String(url).split("?")[0].endsWith("/api/live/status");

  const server = http.createServer((req, res) => {
    if (req.url === "/__stage") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(witness));
      return;
    }
    witness.requests += 1;
    const reqChunks = [];
    req.on("data", (c) => reqChunks.push(c));
    req.on("end", () => {
      const up = http.request(
        { host: uHost, port: Number(uPort), path: req.url, method: req.method, headers: { ...req.headers, host: `${uHost}:${uPort}` } },
        (uRes) => {
          const ctype = String(uRes.headers["content-type"] || "");
          const headers = { ...uRes.headers };
          delete headers["transfer-encoding"];
          delete headers["connection"];

          /* 🔴 JSON 이 아니면 손대지 않고 «흘린다» — SSE(text/event-stream)·바이너리는
             버퍼링하는 순간 형태가 바뀐다. 이 무대가 바꾸는 것은 JSON 두 곳뿐이다. */
          if (passthrough || !ctype.includes("json")) {
            res.writeHead(uRes.statusCode, headers);
            uRes.pipe(res);
            return;
          }

          const bufs = [];
          uRes.on("data", (c) => bufs.push(c));
          uRes.on("end", () => {
            const raw = Buffer.concat(bufs).toString("utf8");
            let body;
            try { body = JSON.parse(raw); } catch { /* JSON 이라 했는데 아니면 원문 그대로 */
              res.writeHead(uRes.statusCode, headers); res.end(raw); return;
            }
            const at = new Date().toISOString();
            if (isLiveStatus(req.url)) {
              witness.liveStatusServed += 1;
              const upstreamOnline = body && typeof body === "object" ? body.online : undefined;
              body = { ...(body && typeof body === "object" ? body : {}), online: true };
              if (!body.checkedAt) body.checkedAt = at;
              witness.liveStatusForcedTrue += 1;
              witness.lastLiveStatus = { upstreamOnline, servedOnline: true, source: "upstream+forced", at };
            } else {
              const changed = emptyEvidence(body, evidenceKeys);
              if (changed.arrays.length || changed.counts.length) {
                witness.jsonRewritten += 1;
                witness.arraysEmptied += changed.arrays.length;
                witness.countsZeroed += changed.counts.length;
                witness.lastSynthesis = { path: req.url, arrays: changed.arrays, counts: changed.counts, at };
              }
            }
            /* 🔴 짝 — 두 사실이 «같은 실행»에서 났음을 한 객체로 든다. */
            if (witness.lastLiveStatus && witness.lastSynthesis) {
              witness.paired = {
                onlineTrueAt: witness.lastLiveStatus.at,
                evidenceZeroAt: witness.lastSynthesis.at,
                evidencePath: witness.lastSynthesis.path,
                arraysEmptied: witness.arraysEmptied,
              };
            }
            const out = Buffer.from(JSON.stringify(body), "utf8");
            headers["content-length"] = String(out.length);   /* 본문이 바뀌었다 — 길이도 바뀐다 */
            res.writeHead(uRes.statusCode, headers);
            res.end(out);
          });
        },
      );
      up.on("error", (e) => {
        witness.upstreamFailed += 1;
        /* 🔴 상류가 죽어도 live/status 만은 «합성»한다 — 이 무대의 질문이 「살아 있다고
           말하는데 근거가 없다」이기 때문이다. 나머지 경로는 정직하게 502 를 낸다. */
        if (isLiveStatus(req.url) && !passthrough) {
          const at = new Date().toISOString();
          witness.liveStatusServed += 1;
          witness.liveStatusForcedTrue += 1;
          witness.liveStatusSynthesized += 1;
          witness.lastLiveStatus = { upstreamOnline: null, servedOnline: true, source: "synthesized(upstream down)", upstreamError: String(e.code || e.message), at };
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ online: true, checkedAt: at }));
          return;
        }
        if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
        res.end(JSON.stringify({ stage: "synthetic-gateway", upstreamError: String(e.code || e.message) }));
      });
      if (reqChunks.length) up.write(Buffer.concat(reqChunks));
      up.end();
    });
  });

  /* 🔴 WS 업그레이드는 «손대지 않고» 소켓째 넘긴다. 콘솔의 run 스트림이 이 경로로 붙는다 —
     여기서 막으면 X-23 을 칠 화면 자체가 안 선다(무대가 아니라 장애물이 된다). */
  server.on("upgrade", (req, clientSocket, head) => {
    const upSock = net.connect(Number(uPort), uHost, () => {
      witness.upgradesProxied += 1;
      const lines = [`${req.method} ${req.url} HTTP/1.1`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      upSock.write(lines.join("\r\n") + "\r\n\r\n");
      if (head && head.length) upSock.write(head);
      upSock.pipe(clientSocket);
      clientSocket.pipe(upSock);
    });
    upSock.on("error", () => clientSocket.destroy());
    clientSocket.on("error", () => upSock.destroy());
  });

  return server;
}

const PORT = Number(arg("port", 8814));
const UPSTREAM_DEFAULT = "127.0.0.1:8101";
const EVIDENCE_KEYS = String(arg("evidence-keys", "evidenceIds,evidence,citations")).split(",").map((s) => s.trim()).filter(Boolean);
const PASSTHROUGH = has("passthrough");
/* MSYS 셸이 앞 슬래시를 윈도우 경로로 번역한다 — 앞 슬래시 없이 받아 여기서 붙인다. */
const SYNTH_PATH = "/" + String(arg("probe", "api/runs/r-selftest")).replace(/^\/+/, "");

function getJson({ host, port, path }) {
  return new Promise((resolve) => {
    const r = http.request({ host, port, path, method: "GET" }, (res) => {
      const bufs = [];
      res.on("data", (c) => bufs.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(bufs).toString("utf8");
        let json = null;
        try { json = JSON.parse(raw); } catch { /* 그대로 둔다 */ }
        resolve({ ok: true, status: res.statusCode, json, bytes: raw.length });
      });
    });
    r.on("error", (e) => resolve({ ok: false, error: String(e.code || e.message) }));
    r.setTimeout(20000, () => r.destroy(new Error("CLIENT_TIMEOUT")));
    r.end();
  });
}

if (has("selftest")) {
  let upstream = arg("upstream", null);
  let internal = null;
  if (!upstream) {
    /* 🔴 대조군이 성립하도록 «반대쪽»을 내는 상류 — online:false 이고 근거는 실제로 3건이다.
       상류가 이미 online:true 이거나 근거가 0 이었다면, 뒤의 초록은 무대의 것이 아니다. */
    internal = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      if (String(req.url).split("?")[0].endsWith("/api/live/status")) {
        res.end(JSON.stringify({ online: false, checkedAt: new Date().toISOString() }));
        return;
      }
      res.end(JSON.stringify({
        runId: "r-selftest",
        candidates: [{ id: "c1", evidenceIds: ["e1", "e2", "e3"], evidenceCount: 3 }],
        summary: { evidenceIds: ["e9"], evidenceCount: 1 },
      }));
    });
    /* 🔴 WS 축을 «실제로» 울리기 위한 상류 — 콘솔의 run 스트림이 업그레이드로 붙는다. */
    internal.on("upgrade", (_req, sock) => {
      sock.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\nPONG");
    });
    await new Promise((r) => internal.listen(0, "127.0.0.1", r));
    upstream = `127.0.0.1:${internal.address().port}`;
  }
  const [uHost, uPort] = upstream.split(":");

  /* ── 대조군: 무대를 «안 거친» 같은 상류 ──────────────────────────────────── */
  const ctlStatus = await getJson({ host: uHost, port: Number(uPort), path: "/api/live/status" });
  const ctlSynth = await getJson({ host: uHost, port: Number(uPort), path: SYNTH_PATH });

  /* ── 실험군: 무대를 거친 «같은 실행» ─────────────────────────────────────── */
  const srv = createSyntheticGateway({ upstream, evidenceKeys: EVIDENCE_KEYS, passthrough: PASSTHROUGH });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const stagePort = srv.address().port;                 /* 🔴 포트를 «값으로» 낸다 */
  const gwStatus = await getJson({ host: "127.0.0.1", port: stagePort, path: "/api/live/status" });
  const gwSynth = await getJson({ host: "127.0.0.1", port: stagePort, path: SYNTH_PATH });

  /* ── WS 업그레이드가 «실제로» 넘어가는지 — 주석이 아니라 자극으로 확인한다.
        여기서 막히면 콘솔의 run 스트림이 안 붙어, 이 무대는 X-23 을 못 치는 장애물이 된다. */
  const upgradeProbe = await new Promise((resolve) => {
    const sock = net.connect(stagePort, "127.0.0.1", () => {
      sock.write(
        "GET /api/ws/runs/r-selftest HTTP/1.1\r\nHost: 127.0.0.1\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n" +
        "Sec-WebSocket-Key: c2Vsa2Z0ZXN0MTIzNDU2Nzg=\r\n\r\n",
      );
    });
    let buf = "";
    sock.on("data", (c) => {
      buf += c.toString("utf8");
      if (buf.includes("PONG")) { sock.destroy(); resolve({ ok: true, status101: buf.includes(" 101 "), echoed: true, head: buf.split("\r\n")[0] }); }
    });
    sock.on("error", (e) => resolve({ ok: false, error: String(e.code || e.message) }));
    setTimeout(() => { sock.destroy(); resolve({ ok: buf.length > 0, status101: buf.includes(" 101 "), echoed: buf.includes("PONG"), head: buf.split("\r\n")[0] || null }); }, 3000);
  });

  srv.close();
  if (internal) internal.close();

  /** 응답 안의 근거 배열 길이를 «전부» 모은다(한 자리만 보면 다른 자리가 남아도 못 본다). */
  const lens = (node, acc = []) => {
    if (Array.isArray(node)) { node.forEach((v) => lens(v, acc)); return acc; }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (EVIDENCE_KEYS.includes(k) && Array.isArray(node[k])) acc.push(node[k].length);
        else lens(node[k], acc);
      }
    }
    return acc;
  };
  const counts = (node, acc = []) => {
    if (Array.isArray(node)) { node.forEach((v) => counts(v, acc)); return acc; }
    if (node && typeof node === "object") {
      for (const k of Object.keys(node)) {
        if (k === "evidenceCount" && typeof node[k] === "number") acc.push(node[k]);
        else counts(node[k], acc);
      }
    }
    return acc;
  };

  const ctlLens = lens(ctlSynth.json), gwLens = lens(gwSynth.json);
  const ctlCounts = counts(ctlSynth.json), gwCounts = counts(gwSynth.json);
  const report = {
    upstream, upstreamKind: internal ? "internal(selftest)" : "external(--upstream)",
    stagePort, synthPath: SYNTH_PATH, evidenceKeys: EVIDENCE_KEYS, passthrough: PASSTHROUGH,
    control: { online: ctlStatus.json?.online, evidenceArrayLengths: ctlLens, evidenceCounts: ctlCounts },
    throughGateway: { online: gwStatus.json?.online, evidenceArrayLengths: gwLens, evidenceCounts: gwCounts },
    upgradeProbe,
    witness,
  };
  console.log(JSON.stringify(report, null, 1));

  /* 🔴 판정 6축 — 「online:true 였다」만으로는 X-23 을 증명하지 못한다.
     ① 상류는 online:false 였다 (true 가 «내 무대»에서 나온 것임을 가른다)
     ② 상류에 근거가 «실제로 있었다» (빈 것을 비운 초록을 배제 — 0 건짜리 무대는 자기가 초록을 짓는다)
     ③ 게이트웨이가 online:true 를 냈다
     ④ 근거 배열이 «전부» 0 이다 (한 자리만 비우면 화면은 다른 자리를 본다)
     ⑤ 계수도 0 이다 (목록만 비우면 자극이 「어긋남」으로 바뀐다)
     ⑥ 두 사실이 «같은 실행»에 짝으로 있다 */
  const gates = {
    controlWasOffline: ctlStatus.ok && ctlStatus.json?.online === false,
    controlHadEvidence: ctlLens.length >= 1 && ctlLens.some((n) => n > 0),
    servedOnlineTrue: gwStatus.ok && gwStatus.json?.online === true,
    everyEvidenceArrayEmpty: gwLens.length >= 1 && gwLens.every((n) => n === 0),
    everyEvidenceCountZero: gwCounts.length === 0 || gwCounts.every((n) => n === 0),
    pairedInSameRun: !!witness.paired,
  };
  /* ⑦ WS 축은 내부 상류일 때만 건다 — 외부 상류가 업그레이드를 말하는지는 그쪽 사정이다(못 하는 말). */
  if (internal) gates.upgradePassedThrough = upgradeProbe.status101 === true && upgradeProbe.echoed === true && witness.upgradesProxied >= 1;
  const failed = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length === 0) {
    console.log(
      `SELFTEST PASS — 상류 online:${ctlStatus.json?.online} · 근거 [${ctlLens.join(",")}] → ` +
      `게이트웨이 online:${gwStatus.json?.online} · 근거 [${gwLens.join(",")}] · 계수 [${gwCounts.join(",")}] · ` +
      `배열 ${witness.arraysEmptied}본·계수 ${witness.countsZeroed}본 비움 · paired ${witness.paired?.onlineTrueAt} / ${witness.paired?.evidenceZeroAt} · stagePort ${stagePort}`,
    );
    process.exit(0);
  }
  console.log(
    `SELFTEST FAIL — 미충족 축: ${failed.join(", ")} ` +
    `(상류 online:${ctlStatus.json?.online} 근거[${ctlLens.join(",")}] → 무대 online:${gwStatus.json?.online} 근거[${gwLens.join(",")}])`,
  );
  process.exit(1);
} else {
  const upstream = arg("upstream", UPSTREAM_DEFAULT);
  createSyntheticGateway({ upstream, evidenceKeys: EVIDENCE_KEYS, passthrough: PASSTHROUGH }).listen(PORT, "127.0.0.1", () =>
    console.log(
      `x-stage synthetic-gateway 127.0.0.1:${PORT} → ${upstream} · online:true 합성 · 근거키 [${EVIDENCE_KEYS.join(",")}] → 0 · witness GET /__stage`,
    ),
  );
}
