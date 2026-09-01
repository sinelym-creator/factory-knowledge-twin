/**
 * 「받기만 하고 답하지 않는」 서버 — `t41_live_status_timeout.mjs` 의 자극원.
 *
 * 🔴 왜 «연결 거부»로는 안 되는가: 거부는 즉시 실패라 클라이언트 상한이 발동하기 전에 끝난다.
 *    상한이 «있는지»는 끝나지 않는 응답으로만 드러난다. 그래서 TCP 를 accept 하고 한 바이트도
 *    쓰지 않는다. accept 로그가 곧 「자극이 실재했다」의 증거다.
 *
 *   node _blackhole_server.mjs 8064
 */
import net from "node:net";
const PORT = Number(process.argv[2] ?? 8064);
let n = 0;
net.createServer((sock) => {
  n += 1;
  console.log(`accept #${n} ${new Date().toISOString()}`);
  sock.on("data", () => {});   // 읽되 쓰지 않는다
  sock.on("error", () => {});
}).listen(PORT, "127.0.0.1", () => console.log(`blackhole listening 127.0.0.1:${PORT}`));
