// 두 origin 을 세운다 — CSP 없는 «맨» 페이지다. 셸에서 재면 CSP(connect-src)가 CORS 와
// 섞여 무엇이 막았는지 못 가른다. 대조군은 한 변수만 달라야 한다: origin.
import http from "node:http";
const PORT = Number(process.argv[2]);
http.createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(`<!doctype html><meta charset="utf-8"><title>origin ${PORT}</title><p>origin ${PORT}</p>`);
}).listen(PORT, "127.0.0.1", () => console.log(`origin page listening 127.0.0.1:${PORT}`));
