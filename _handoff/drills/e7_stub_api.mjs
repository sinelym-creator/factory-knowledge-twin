/** E-7 무대 보조 — 승인 «완료» WO 한 건만 답하는 스텁 API(🔴 구독 0 · live 호출 0).
 *  왜 필요한가: 이 무대의 replay 는 501 이고 live 는 구독을 태운다 — 그래서 실제 승인 WO 를
 *  만들 수 없다. 화면이 종단에서 무엇을 그리는지는 **응답 형상**만 있으면 재현된다.
 *  형상 출처 = services/ai-api/app/routers/work_orders.py `_draft_response`(실물 대조). */
import { createServer } from "node:http";
const PORT = Number(process.argv[2] ?? 8803);
const STATE = process.argv[3] ?? "approved";
const draft = (id) => ({
  workOrderDraftId: id, incidentId: "INC-2026-014", equipmentId: "EQ-PUMP-07",
  title: "펌프 베어링 점검 및 교체", failureModeId: "FM-BRG-WEAR",
  procedures: ["설비 정지 및 잠금", "베어링 진동 재측정", "베어링 교체"],
  safetyMeasures: ["LOTO 적용", "보호구 착용"],
  parts: [{ partId: "P-BRG-6204", name: "베어링 6204", qty: 1 }],
  evidenceIds: ["EV-2026-0141"], gaps: [], note: "스텁 무대 — 종단 화면 확인용",
  approvalState: STATE,
});
const json = (res, code, body) => { const b = JSON.stringify(body); res.writeHead(code, { "content-type": "application/json", "content-length": Buffer.byteLength(b) }); res.end(b); };
createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = u.pathname.replace(/^\/api/, "");
  if (p === "/sessions" && req.method === "POST") return json(res, 200, { sessionId: "stub-session-0001" });
  if (p === "/live/status") return json(res, 200, { mode: "replay", live: false, why: "스텁 무대" });
  if (p === "/plants") return json(res, 200, [{ plantId: "PLANT-1", name: "스텁 공장" }]);
  const wo = p.match(/^\/work-orders\/([^/]+)$/);
  if (wo && req.method === "GET") return json(res, 200, draft(decodeURIComponent(wo[1])));
  if (p.startsWith("/runs")) return json(res, 200, []);
  return json(res, 404, { detail: { code: "not_found", message: `스텁이 모르는 경로: ${p}` } });
}).listen(PORT, "127.0.0.1", () => console.log(`스텁 API :${PORT} · approvalState=${STATE}`));
