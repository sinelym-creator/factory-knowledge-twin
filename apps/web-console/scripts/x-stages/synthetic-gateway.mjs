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
 * 🔴 **T7-32 — 근거는 원래 이 무대를 «지나가지 않았다».** run 이벤트가 WS 로 소켓째 흘러
 *    `upgradesProxied` 만 오르고 근거 배열은 손대지지 않았다(리바이2 X-23·X-13 미검증 사유).
 *    `--block-upgrade` 는 업그레이드를 **426 으로 거절**해 셸을 폴링 폴백(`run-console.tsx` 의
 *    미개통 갈래 → `GET /api/runs/<id>/events` 2초 주기)으로 내리고, **그 HTTP 응답**의 근거를 비운다.
 *    그래서 계수는 «경로로» 갈라 센다 — `pollingRewritten` 이 0 이면 근거는 여전히 안 지난 것이다.
 *
 *   node synthetic-gateway.mjs --port 8814 --upstream 127.0.0.1:8101
 *   node synthetic-gateway.mjs --port 8814 --upstream 127.0.0.1:8101 --block-upgrade
 *   node synthetic-gateway.mjs --selftest                       # 내부 상류 + 대조군까지 자족(WS 통과 축)
 *   node synthetic-gateway.mjs --selftest --block-upgrade       # 426 거절 + 폴링 경로 재작성 축
 *   node synthetic-gateway.mjs --selftest --passthrough         # 역방향 대조군(FAIL 이 나야 정상)
 *   node synthetic-gateway.mjs --selftest --evidence-keys nosuchkey   # 역방향 대조군 2(FAIL 이 정상)
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
  upgradesBlocked: 0,         /* 🔴 T7-32 — 426 으로 «거절»한 건수(셸을 폴링으로 내린다) */
  pollingRewritten: 0,        /* 🔴 T7-32 — 재작성이 «폴링 경로»에서 난 건수(경로로 구별) */
  snapshotRewritten: 0,       /* 🔴 T7-32 — 재작성이 «run 스냅샷»(`/api/runs/<id>`)에서 난 건수 */
  upstreamFailed: 0,
  lastLiveStatus: null,
  lastSynthesis: null,
  lastPollingRewrite: null,
  lastSnapshotRewrite: null,
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

export function createSyntheticGateway({ upstream, evidenceKeys, passthrough = false, blockUpgrade = false }) {
  const [uHost, uPort] = upstream.split(":");
  const isLiveStatus = (url) => String(url).split("?")[0].endsWith("/api/live/status");
  /* 🔴 폴링 폴백이 두드리는 그 경로(`CONTRACT.runEvents` = `/api/runs/<id>/events`).
     WS 로 지나가던 근거가 «여기로» 내려와야 이 무대를 지난다 — 그래서 «경로로» 센다. */
  const isRunEvents = (url) => /\/api\/runs\/[^/]+\/events$/.test(String(url).split("?")[0]);
  /* 🔴 **끝난 run 의 근거는 이 경로로 온다**(`CONTRACT.run` = `/api/runs/<id>` · SSR·브라우저 스냅샷).
     0.3초에 완주하는 live run 은 WS 를 열 이유가 없으므로, X-23 의 자극 경로는 여기다.
     🔴 `/events`·`/stop` 은 **다른 경로**다 — 하위 경로를 같이 세면 스냅샷 축이 그 안에 숨는다. */
  const isRunSnapshot = (url) => /\/api\/runs\/[^/]+$/.test(String(url).split("?")[0]);

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
                /* 🔴 «어느 경로에서» 비웠는지를 따로 센다. 총계만 있으면 「작업지시 초안에서 비웠다」와
                   「run 근거에서 비웠다」가 한 숫자에 섞여, X-23 이 실제로 근거를 지났는지 못 가른다. */
                if (isRunEvents(req.url)) {
                  witness.pollingRewritten += 1;
                  witness.lastPollingRewrite = { path: req.url, arrays: changed.arrays, counts: changed.counts, at };
                } else if (isRunSnapshot(req.url)) {
                  witness.snapshotRewritten += 1;
                  witness.lastSnapshotRewrite = { path: req.url, arrays: changed.arrays, counts: changed.counts, at };
                }
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

  /* 🔴 WS 업그레이드는 «손대지 않고» 소켓째 넘긴다. 콘솔의 run 스트림이 이 경로로 붙는다.
     🔴 **T7-32 — 그런데 그게 X-23 을 못 치게 만들고 있었다.** run 이벤트가 소켓째 지나가면
        근거는 이 무대의 JSON 재작성을 **한 번도 안 지난다**(`upgradesProxied` 만 오르고
        `arraysEmptied` 는 작업지시 초안 쪽에서만 오른다) — 「근거 0건인 화면」이 만들어진 적이 없다.
     🔴 `--block-upgrade` 는 업그레이드를 **426 으로 거절**해 셸을 폴링 폴백으로 내린다
        (`run-console.tsx` 의 미개통 판정 → `runEvents` 주기 조회). 그러면 run 근거가 **HTTP 로**
        와서 이 무대를 지난다. 거절은 「막는 것」이 아니라 **경로를 바꾸는 것**이다 —
        셸이 폴백을 «실제로» 내려야만 성립하므로, 그 발동 여부가 이 스위치의 첫 판정선이다. */
  server.on("upgrade", (req, clientSocket, head) => {
    if (blockUpgrade) {
      witness.upgradesBlocked += 1;
      /* 🔴 426 = 「업그레이드가 필요/불가」 — 브라우저 WebSocket 은 핸드셰이크 실패로 보고
         `opened=false` + code 1006 으로 닫는다. 그게 셸의 «미개통» 갈래(D-21 ⓒ)를 깨운다. */
      clientSocket.end(
        "HTTP/1.1 426 Upgrade Required\r\n" +
        "Content-Length: 0\r\n" +
        "X-Stage: synthetic-gateway/block-upgrade\r\n" +
        "Connection: close\r\n\r\n",
      );
      return;
    }
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
const BLOCK_UPGRADE = has("block-upgrade");
/* MSYS 셸이 앞 슬래시를 윈도우 경로로 번역한다 — 앞 슬래시 없이 받아 여기서 붙인다. */
const SYNTH_PATH = "/" + String(arg("probe", "api/runs/r-selftest")).replace(/^\/+/, "");
/* 🔴 폴링 폴백이 두드리는 경로 — `CONTRACT.runEvents`. WS 축과 «다른 경로»라야 계수가 갈린다. */
const POLL_PATH = "/" + String(arg("poll-probe", "api/runs/r-selftest/events")).replace(/^\/+/, "");

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
      /* 🔴 폴링 경로도 «근거를 실제로 갖고» 답한다 — 빈 것을 비우면 초록은 무대의 것이 아니다. */
      if (/\/api\/runs\/[^/]+\/events$/.test(String(req.url).split("?")[0])) {
        res.end(JSON.stringify([
          { seq: 1, type: "candidate", evidenceIds: ["p1", "p2"], evidenceCount: 2 },
          { seq: 2, type: "summary", citations: ["p9"], evidenceCount: 1 },
        ]));
        return;
      }
      res.end(JSON.stringify({
        runId: "r-selftest",
        candidates: [{ id: "c1", evidenceIds: ["e1", "e2", "e3"], evidenceCount: 3 }],
        summary: { evidenceIds: ["e9"], evidenceCount: 1 },
      }));
    });
    /* 🔴 WS 축을 «실제로» 울리기 위한 상류 — 콘솔의 run 스트림이 업그레이드로 붙는다.
       🔴 프레임에 **근거를 담아** 보낸다: 소켓째 지나가는 축에서는 이 근거가 «그대로» 도착한다는
          사실이 곧 X-23 이 왜 미검증이었는지의 실증이다(무대가 그 축을 못 만진다). */
    internal.on("upgrade", (_req, sock) => {
      sock.write(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n" +
        JSON.stringify({ seq: 1, type: "candidate", evidenceIds: ["w1", "w2", "w3"], evidenceCount: 3 }),
      );
    });
    await new Promise((r) => internal.listen(0, "127.0.0.1", r));
    upstream = `127.0.0.1:${internal.address().port}`;
  }
  const [uHost, uPort] = upstream.split(":");

  /* ── 대조군: 무대를 «안 거친» 같은 상류 ──────────────────────────────────── */
  const ctlStatus = await getJson({ host: uHost, port: Number(uPort), path: "/api/live/status" });
  const ctlSynth = await getJson({ host: uHost, port: Number(uPort), path: SYNTH_PATH });
  const ctlPoll = await getJson({ host: uHost, port: Number(uPort), path: POLL_PATH });

  /* ── 실험군: 무대를 거친 «같은 실행» ─────────────────────────────────────── */
  const srv = createSyntheticGateway({ upstream, evidenceKeys: EVIDENCE_KEYS, passthrough: PASSTHROUGH, blockUpgrade: BLOCK_UPGRADE });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const stagePort = srv.address().port;                 /* 🔴 포트를 «값으로» 낸다 */
  const gwStatus = await getJson({ host: "127.0.0.1", port: stagePort, path: "/api/live/status" });
  const gwSynth = await getJson({ host: "127.0.0.1", port: stagePort, path: SYNTH_PATH });
  /* 🔴 폴링 경로 자극 — 「셸이 폴백으로 내려오면 지나갈 그 경로」를 무대가 실제로 재작성하는가. */
  const gwPoll = await getJson({ host: "127.0.0.1", port: stagePort, path: POLL_PATH });

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
    /* 🔴 프레임 원문을 «버리지 않는다» — 「지나갔다」뿐 아니라 「무엇이 지나갔는지」를 봐야
       WS 축에서 근거가 손대지지 않은 채 온다는 사실을 값으로 낼 수 있다. */
    const done = () => {
      sock.destroy();
      const wsEvidence = (buf.match(/"evidenceIds":\[[^\]]*\]/) || [null])[0];
      resolve({
        ok: buf.length > 0,
        status101: buf.includes(" 101 "),
        status426: buf.includes(" 426 "),
        echoed: /evidenceIds/.test(buf),
        wsEvidence,
        head: buf.split("\r\n")[0] || null,
      });
    };
    sock.on("data", (c) => { buf += c.toString("utf8"); if (/evidenceIds/.test(buf) || buf.includes(" 426 ")) done(); });
    sock.on("error", (e) => resolve({ ok: false, error: String(e.code || e.message) }));
    setTimeout(done, 3000);
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
  const ctlPollLens = lens(ctlPoll.json), gwPollLens = lens(gwPoll.json);
  const report = {
    upstream, upstreamKind: internal ? "internal(selftest)" : "external(--upstream)",
    stagePort, synthPath: SYNTH_PATH, pollPath: POLL_PATH, evidenceKeys: EVIDENCE_KEYS,
    passthrough: PASSTHROUGH, blockUpgrade: BLOCK_UPGRADE,
    control: { online: ctlStatus.json?.online, evidenceArrayLengths: ctlLens, evidenceCounts: ctlCounts, pollingArrayLengths: ctlPollLens },
    throughGateway: { online: gwStatus.json?.online, evidenceArrayLengths: gwLens, evidenceCounts: gwCounts, pollingArrayLengths: gwPollLens },
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
    /* 🔴 스냅샷 축(`/api/runs/<id>`) — 끝난 run 의 화면 근거가 오는 경로. `--probe` 기본값이
       그 경로라 이 축은 «자극이 실제로 그 자리를 지났는가»를 계수로 확인한다. */
    snapshotPathRewritten: witness.snapshotRewritten >= 1,
  };
  /* ⑦ WS 축은 내부 상류일 때만 건다 — 외부 상류가 업그레이드를 말하는지는 그쪽 사정이다(못 하는 말).
     🔴 T7-32 — 스위치를 «양쪽으로» 놓고 갈리는지 본다. 한쪽만 재면 그 분기가 도는지 알 수 없다. */
  if (internal && !BLOCK_UPGRADE) {
    /* ⑦-a 끔: 소켓째 지나간다 — 그리고 그 프레임의 근거는 «손대지지 않은 채» 온다.
       이게 X-23 이 왜 미검증이었는지의 실증이다(무대가 WS 축을 못 만진다). */
    gates.upgradePassedThrough = upgradeProbe.status101 === true && upgradeProbe.echoed === true && witness.upgradesProxied >= 1;
    gates.wsEvidenceUntouched = upgradeProbe.wsEvidence === '"evidenceIds":["w1","w2","w3"]';
    gates.noPollingRewriteWhenWsOpen = witness.pollingRewritten >= 1; /* 폴링 경로는 «직접 자극»으로만 울렸다 */
  }
  if (internal && BLOCK_UPGRADE) {
    /* ⑦-b 켬: 426 으로 거절되고, 그 뒤 근거는 «폴링 경로»에서 비워진다. */
    gates.upgradeBlocked = upgradeProbe.status426 === true && witness.upgradesBlocked >= 1;
    gates.wsCarriedNoEvidence = upgradeProbe.echoed === false;
    gates.pollingPathRewritten = witness.pollingRewritten >= 1;
    gates.pollingControlHadEvidence = ctlPollLens.length >= 1 && ctlPollLens.some((n) => n > 0);
    gates.pollingEvidenceEmptied = gwPollLens.length >= 1 && gwPollLens.every((n) => n === 0);
  }
  const failed = Object.entries(gates).filter(([, v]) => !v).map(([k]) => k);
  if (failed.length === 0) {
    console.log(
      `SELFTEST PASS — 상류 online:${ctlStatus.json?.online} · 근거 [${ctlLens.join(",")}] → ` +
      `게이트웨이 online:${gwStatus.json?.online} · 근거 [${gwLens.join(",")}] · 계수 [${gwCounts.join(",")}] · ` +
      `배열 ${witness.arraysEmptied}본·계수 ${witness.countsZeroed}본 비움 · ` +
      `WS ${BLOCK_UPGRADE ? `거절 ${witness.upgradesBlocked}` : `통과 ${witness.upgradesProxied}`} · ` +
      `스냅샷경로 재작성 ${witness.snapshotRewritten} · 폴링경로 재작성 ${witness.pollingRewritten}` +
      `(근거 [${ctlPollLens.join(",")}] → [${gwPollLens.join(",")}]) · ` +
      `paired ${witness.paired?.onlineTrueAt} / ${witness.paired?.evidenceZeroAt} · stagePort ${stagePort}`,
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
  createSyntheticGateway({ upstream, evidenceKeys: EVIDENCE_KEYS, passthrough: PASSTHROUGH, blockUpgrade: BLOCK_UPGRADE }).listen(PORT, "127.0.0.1", () =>
    console.log(
      `x-stage synthetic-gateway 127.0.0.1:${PORT} → ${upstream} · online:true 합성 · 근거키 [${EVIDENCE_KEYS.join(",")}] → 0 · ` +
      `WS ${BLOCK_UPGRADE ? "426 거절(폴링 폴백 유도)" : "소켓째 통과"} · witness GET /__stage`,
    ),
  );
}
