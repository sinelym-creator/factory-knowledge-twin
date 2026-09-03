/**
 * 「닿기는 하는데 답하지 않는」 합성 게이트웨이 — 합성 대기 표시(T6-2 ③)의 **무대 장치**.
 *
 * 🔴 왜 필요한가: 게이트웨이가 없는 조건에서 조사는 대본 축으로 돌고 **214ms 만에 완주**한다
 *    (실측 · 서버 events 축). 그러면 브라우저가 화면을 그리기도 전에 끝나 있어서 「synthesize 가
 *    running 인 창」이 존재하지 않고, 그 창에서만 뜨는 표시는 **어느 색도 낼 수 없다** —
 *    표본 0개에서 나온 「안 보인다」는 결함이 아니라 정보 0이다(실측: 표집 1개, running 0개).
 *
 * 🔴 왜 순수 blackhole(`_blackhole_server.mjs`)로는 안 되는가: 그건 TCP 를 accept 하고 한 바이트도
 *    쓰지 않는다. 그러면 `GET /health` 가 200 을 못 받아 `probe_reachable()` 이 false 를 내고,
 *    ai-api 는 live 합성을 **부르지도 않는다**. 즉 자극이 게이트웨이에 «닿지 않는다» — 31대 드릴이
 *    무효가 난 바로 그 형태다. 그래서 이 서버는 두 얼굴을 갖는다:
 *      · `GET  /health`     → 200 (도달 가능 = online:true)
 *      · `POST /synthesize` → **응답하지 않고 소켓을 붙잡는다** (synthesize 가 running 으로 머문다)
 *
 * 🔴 구독 0: 이 서버는 Claude 를 부르지 않는다. 실제 합성은 일어나지 않고, 일어난 척도 하지 않는다 —
 *    붙잡기만 한다. 판정문에는 「게이트웨이는 hold 스텁, 구독 호출 0건」으로 적는다.
 *
 * 🔴 `0.0.0.0` 에 선다: 배포 ai-api 는 **컨테이너 안**에서 `host.docker.internal` 로 이 포트를 본다.
 *    루프백에만 서면 컨테이너는 못 닿고, 그 「못 닿음」은 처방의 결함처럼 보인다. 로컬 드릴 전용이며
 *    측정이 끝나면 즉시 내린다(이 포트가 켜져 있는 동안 같은 ai-api 를 쓰는 다른 측정의 전제가 바뀐다).
 *
 *   node _synthesis_hold_server.mjs 8787
 */
import http from "node:http";

const PORT = Number(process.argv[2] ?? 8787);
const held = [];
let health = 0;

const server = http.createServer((req, res) => {
  const at = new Date().toISOString();
  if (req.method === "GET" && req.url === "/health") {
    health += 1;
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  if (req.method === "POST" && req.url === "/synthesize") {
    req.resume(); // 본문은 읽되
    held.push(res); // 🔴 답하지 않는다 — 이 붙잡음이 곧 「무대」다
    console.log(`hold #${held.length} ${at} (health ${health}회)`);
    return;
  }
  /**
   * 🔴 무대를 «거두는» 손잡이. 자극을 주기만 하고 거두지 않으면 「사라지는가」를 잴 수 없고,
   *    붙잡힌 요청은 다음 측정의 전제로 남는다. 몇 건을 풀었는지 답해 — 자극이 실재했는지를
   *    부른 쪽이 계수로 확인할 수 있게 한다(0건을 풀고 「사라졌다」를 쓰면 그건 다른 사건이다).
   */
  if (req.method === "POST" && req.url === "/release") {
    const n = held.length;
    for (const r of held.splice(0)) r.destroy();
    console.log(`release ${at} — ${n}건 풀었다`);
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ released: n }));
    return;
  }
  res.writeHead(404).end();
});

// 🔴 붙잡은 요청은 프로세스가 끝날 때 함께 끊는다 — 남겨 두면 다음 측정의 전제가 된다.
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    console.log(`내림 — health ${health}회 · 붙잡은 합성 ${held.length}건`);
    for (const r of held) r.destroy();
    server.close(() => process.exit(0));
  });
}

server.listen(PORT, "0.0.0.0", () => console.log(`synthesis-hold listening 0.0.0.0:${PORT}`));
