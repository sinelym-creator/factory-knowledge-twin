/** D-89v 전용 hold 스텁 — /health 만 200, /synthesize 는 «답하지 않고 붙잡는다».
 *  구독 0 의 구조적 근거: Claude 호출이 발생할 자리가 없다. hold #n 계수 = 자극 실재 칸. */
import http from "node:http";
let held = 0;
const sockets = new Set();
const srv = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/api/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ status: "ok", stub: "levi2-d89v-hold" }));
    return;
  }
  held += 1;
  console.log(`hold #${held} ${req.method} ${req.url}`);
  // 응답하지 않는다 — 소켓만 잡아 둔다.
});
srv.on("connection", (s) => { sockets.add(s); s.on("close", () => sockets.delete(s)); });
srv.listen(8858, "127.0.0.1", () => console.log("[hold-stub] listening 8858"));
