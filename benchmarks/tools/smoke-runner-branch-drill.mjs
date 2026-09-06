// =============================================================================
// smoke-runner-branch-drill.mjs — O-54 갈래 드릴 (검증 좌석 · T5-3)
//
//   node benchmarks/tools/smoke-runner-branch-drill.mjs
//
// 🔴 무엇을 묻는가: `run-benchmark-smoke.mjs` 의 **구조 가드 갈래가 실제로 갈리는가**.
//    ai-api 무대로는 「200 위의 hit 0」과 「비200 위의 hit 0」을 손잡이 하나로 갈라 세울 수
//    없다(색인을 비우면 두 축이 함께 움직인다). 그래서 **응답만 흉내내는 반쪽 스텁**을 세우고
//    한 번에 한 칸씩 바꾼다 — 스텁은 러너의 «판정 입력»만 만들 뿐 검색을 흉내내지 않는다.
//
// 🔴 대조군 없이 초록을 세지 않는다: 각 열은 «기대 rc» 를 미리 적고, 다르면 그 자리에서 빨강.
//    특히 5열(부재 code 가 아닌 5xx)·6열(상태코드가 섞임)은 **exit 7 이 나오면 안 되는** 열이다
//    — 그 둘이 없으면 「전부 7 로 보내는 문」도 초록으로 보인다.
// =============================================================================

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, unlinkSync, mkdtempSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "run-benchmark-smoke.mjs");
const DS = join(HERE, "..", "datasets");

// 러너와 «같은 정본·같은 필터»로 표본을 읽는다 — 다른 목록을 쓰면 열이 러너를 안 시험한다.
const rl = (f) => readFileSync(join(DS, f), "utf-8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const questions = rl("questions.v0.3.jsonl");
const gt = Object.fromEntries(rl("ground-truth.v0.3.jsonl").map((g) => [g.id, g]));
const evOf = (q) => [...(gt[q.id]?.required_evidence || []), ...(q.expected_evidence || [])];
const docsOf = (q) => [...new Set(evOf(q).join(" ").match(new RegExp("DOC-[A-Z]{3,4}-\\d{4}", "g")) || [])];
const sample = questions.filter((q) => docsOf(q).length > 0);
const answerOf = (question) => {
  const q = sample.find((s) => s.question === question);
  return q ? docsOf(q)[0] : null;
};

// ── 스텁: /api/sessions 와 /api/retrieval/compare 만 답한다 ───────────────────
function stub(mode) {
  let n = 0;
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code, obj) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.url === "/api/sessions") return send(200, { sessionId: "drill-session" });
      if (req.url !== "/api/retrieval/compare") return send(404, { error: { code: "not_found", message: "-" } });
      const j = JSON.parse(body || "{}");
      n += 1;
      const hit = (id) => ({ hits: [{ evidenceId: id }] });
      switch (mode) {
        case "absent":        // 전 호출 503 index_unavailable  → 색인 없음
          return send(503, { error: { code: "index_unavailable", message: "document_chunk 에 임베딩이 0건이다" } });
        case "otherCode":     // 전 호출 503 이지만 «부재가 아닌» code → 색인 없음이라 부르면 안 된다
          return send(503, { error: { code: "dependency_unavailable", message: "의존 단절" } });
        case "mixed":         // 상태코드가 섞임 → 원인을 한 가지로 말할 수 없다
          return n % 2 ? send(503, { error: { code: "index_unavailable", message: "-" } })
                       : send(200, [hit("DOC-XXX-0000@r1#000")]);
        case "okMiss":        // 200 인데 정답을 못 맞힘 → 「검색이 죽었다」의 원래 자리
          return send(200, [hit("DOC-XXX-0000@r1#000")]);
        case "okHit": {       // 200 + 정답 → 완주
          const a = answerOf(j.question);
          return send(200, [hit(a ? a + "@r1#000" : "DOC-XXX-0000@r1#000")]);
        }
        case "fake": {        // 정답 + 허구 needle → 교정 대조군(exit 6)이 물어야 한다
          // 🔴 정답을 «함께» 주는 이유: anyHit 가드(exit 5)가 앞줄이라, 허구 needle 만 주면
          //    exit 5 에서 먼저 죽어 exit 6 갈래를 시험하지 못한다(첫 실행에서 실제로 그랬다).
          const a = answerOf(j.question);
          return send(200, [{ hits: [{ evidenceId: (a ? a + "@r1#000" : "DOC-XXX-0000@r1#000") },
                                     { evidenceId: "DOC-ZZZ-9999#000" }] }]);
        }
        default:
          return send(500, { error: { code: "drill_bug", message: mode } });
      }
    });
  });
}

const run = (base, out) =>
  new Promise((resolve) => {
    const a = ["--base", base, "--k", "5"];
    if (out) a.push("--out", out);
    const c = spawn(process.execPath, [RUNNER, ...a], { stdio: ["ignore", "pipe", "pipe"] });
    let so = "", se = "";
    c.stdout.on("data", (d) => (so += d));
    c.stderr.on("data", (d) => (se += d));
    c.on("close", (code) => resolve({ code, so, se }));
  });

const tmp = mkdtempSync(join(tmpdir(), "o54-"));
const COLUMNS = [
  { name: "1 색인 없음(503 index_unavailable 일관)", mode: "absent",    want: 7, out: join(tmp, "c1.json") },
  { name: "2 200 위의 hit 0(정답 못 맞힘)",           mode: "okMiss",    want: 5, out: join(tmp, "c2.json") },
  { name: "3 정상(200 + 정답)",                        mode: "okHit",     want: 0, out: join(tmp, "c3.json") },
  { name: "4 허구 needle 이 잡힘(교정)",               mode: "fake",      want: 6, out: join(tmp, "c4.json") },
  { name: "5 비200 이지만 부재 code 가 아님",          mode: "otherCode", want: 5, out: join(tmp, "c5.json") },
  { name: "6 상태코드가 섞임",                         mode: "mixed",     want: 5, out: join(tmp, "c6.json") },
];

let fails = 0;
console.log(`표본 ${sample.length}문 (러너와 같은 정본·같은 필터)`);
console.log("열 | 기대 rc | 실측 rc | --out 실재 | nonOk.absenceVerdict | 판정");
for (const col of COLUMNS) {
  const srv = stub(col.mode);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  if (existsSync(col.out)) unlinkSync(col.out);
  const r = await run(`http://127.0.0.1:${port}`, col.out);
  srv.close();
  const wrote = existsSync(col.out);
  let verdictField = "-";
  if (wrote) { try { verdictField = String(JSON.parse(readFileSync(col.out, "utf-8")).nonOk?.absenceVerdict); } catch {} }
  const ok = r.code === col.want && wrote;   // 🔴 --out 은 «빨강일 때도» 있어야 한다(O-54 a)
  if (!ok) fails += 1;
  console.log(`${col.name.padEnd(38)} | ${col.want} | ${r.code} | ${wrote ? "있음" : "🔴 없음"} | ${verdictField} | ${ok ? "PASS" : "🔴 FAIL"}`);
  if (!ok) console.log("    stderr: " + r.se.trim().split(/\r?\n/).slice(-3).join(" / "));
}

// ── 쓰기 실패 열: 색을 «덮지 않는가» ─────────────────────────────────────────
const BADOUT = join(tmp, "no-such-dir", "x.json");
for (const [mode, want, why] of [["absent", 7, "빨강이 먼저 — 쓰기 실패가 exit 7 을 exit 2 로 덮으면 안 된다"],
                                  ["okHit", 2, "나머지가 통과했을 때만 쓰기 실패가 rc 가 된다"]]) {
  const srv = stub(mode);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  const r = await run(`http://127.0.0.1:${port}`, BADOUT);
  srv.close();
  const ok = r.code === want;
  if (!ok) fails += 1;
  console.log(`쓰기 실패 · ${mode.padEnd(29)} | ${want} | ${r.code} | - | - | ${ok ? "PASS" : "🔴 FAIL"}   (${why})`);
}

console.log(fails === 0 ? "\n드릴 PASS — 갈래 8칸 전건 기대와 일치" : `\n🔴 드릴 FAIL — ${fails}칸 불일치`);
process.exit(fails === 0 ? 0 : 1);
