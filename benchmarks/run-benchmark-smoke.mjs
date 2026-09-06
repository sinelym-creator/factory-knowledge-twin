// =============================================================================
// run-benchmark-smoke.mjs — §34.3 benchmark-smoke 검색 러너 (검증 좌석 · T5-3)
//
//   node benchmarks/run-benchmark-smoke.mjs --base http://127.0.0.1:8852
//   node benchmarks/run-benchmark-smoke.mjs --base http://127.0.0.1:8020 --k 5 --out out.json
//
// 🔴 무엇을 재는가: 고정 표본(8~10문)을 `/api/retrieval/compare`(vector·hybrid 두 전략)에
//    태워 hit@k·근거 chunk 바인딩 계수·응답 ms 를 «보고»한다. **live 합성 0 · 구독 0**.
//
// 🔴 발주는 `/api/search` 라 적었으나 그 라우트는 ai-api 에 없다(실물 = `/api/retrieval/compare`
//    · knowledge.py:245). 실물이 발주문을 이긴다 — compare 로 간다.
//
// 🔴 판정선은 «보고 전용»이다(T5-3 지시). Target = 기존 기준선 수치의 인용일 뿐,
//    회귀 PASS/FAIL 판정은 다음 대가 낸다. 이 러너는 «구조 가드»만 실패로 만든다:
//      · 표본 < 8      → exit 3 (표본이 성립하지 않으면 측정이 없다)
//      · 서버 미도달    → exit 4
//      · answerable 질문 전체 hit 0 → exit 5 (검색이 죽었다)  ← «200 위의 0» 일 때만
//      · answerable 전체 hit 0 이며 **모든 호출이 비200 으로 일관**하고 그 `error.code` 가
//        «부재»를 가리킬 때 → exit 7 (색인 없음 — 검색이 죽은 게 아니다)
//      · 교정 대조군(허구 needle) 이 hit>0 → exit 6 (지표가 아무거나 센다)
//
// 🔴 **exit 5 를 둘로 가르는 이유(O-54 b · 09-06 실측)**: 색인 0 국면에서 이 러너는
//    `검색이 죽었다`(exit 5)를 찍었지만, 서버는 그 20건에 503 과 함께
//    `{"error":{"code":"index_unavailable","message":"document_chunk 에 임베딩이 0건이다 ..."}}`
//    를 돌려주고 있었다. **「검색이 죽었다」와 「색인이 없다」는 같은 문장이 아니다** —
//    앞엣것은 러너가 hit 수만 보고 붙인 이름이고, 뒤엣것은 대상이 스스로 말한 이름이다.
//    원인을 오지칭하는 빨강은 다음 사람을 틀린 자리로 보낸다.
//
// 🔴 **`--out` 은 구조 가드 «앞»에서 쓴다(O-54 a)**: 앞판은 exit 5 가 쓰기보다 앞줄이라
//    «빨강일 때 산출물이 없었다» — 정작 진단이 필요한 국면에서만 파일이 사라졌다.
//    쓰기 실패는 색을 «덮지 않는다»: 구조 가드가 이미 빨강이면 그 rc 를 유지하고,
//    나머지가 다 통과한 경우에만 exit 2(호출자가 요구한 파일이 없다)로 끝낸다.
//
// 🔴 대조군 둘(같은 실행):
//    A. off-allowlist 무의미 질의 → compare 가 400 으로 «거부»하는가(표면 가드).
//       vector 검색은 어떤 질의에도 top-k 를 돌려주므로 「무의미 → hit 0」은 성립하지 않는다.
//       무의미 질의의 진짜 거동은 «allowlist 거부»다 — 그 사실을 값으로 적는다.
//    B. 허구 needle(`DOC-ZZZ-9999#000`) → 모든 결과에서 hit 0 이어야 한다(교정).
//       실재 needle(정답 근거)은 answerable 질문에서 잡히고, 허구 needle 은 안 잡힌다 —
//       그 대비가 hit@k 가 «실제 겹침»만 센다는 증거다(빈 집합 비교를 피한다).
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]?.startsWith("--") ?? true ? arr[i + 1] : arr[i + 1]]);
    return a;
  }, [])
);
const BASE = (args.base || process.env.FKT_API_BASE || "").replace(/\/$/, "");
const K = Number(args.k || 5);
const OUT = args.out || null;
// 🔴 --gate: 기본 off. on 이면 잠정 회귀 판정선(doc_hit@5 ≥ 기준선)을 rc 로 만든다.
//    구조 가드(exit 3~6 = 「측정 성립」)와 «분리»된 exit 10(회귀)로 둔다 — 둘이 섞이면
//    「검색이 죽었다」와 「기준선 아래로 떨어졌다」가 한 코드가 되어 원인이 흐려진다.
const GATE = process.argv.includes("--gate");
const BASELINE = args.baseline || join(HERE, "baselines", "retrieval-smoke-v0.6.json");
const FAKE_NEEDLE = "DOC-ZZZ-9999#000";
// 🔴 «부재»를 가리키는 오류 code — 여기에 값을 더하는 것은 «의도적 행위»여야 한다.
//    「5xx 면 색인 없음」 같은 넓은 규칙을 쓰지 않는 이유: 의존 단절·용량 소진도 5xx 라
//    그 규칙은 다른 원인을 색인 탓으로 돌린다(정본 = 계약 v0.1 의 error.code).
const ABSENCE_CODES = new Set(["index_unavailable"]);
const NONSENSE = "qx zork frobnicate 87 asdf 무의미한 질의 " + Math.random().toString(36).slice(2);

if (!BASE) { console.error("실행 오류: --base <ai-api URL> 가 필요합니다."); process.exit(2); }

const DS = join(HERE, "datasets");
const rl = (f) => readFileSync(join(DS, f), "utf-8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const questions = rl("questions.v0.3.jsonl");
const gt = Object.fromEntries(rl("ground-truth.v0.3.jsonl").map((g) => [g.id, g]));

// 🔴 고정 표본 선정 기준(1줄): «ground-truth/expected 근거가 문서(DOC-*)를 가리키는 질문» —
//    RAG chunk 검색으로 hit@k 채점이 성립하는 것만. 구조화 속성(알람 threshold 등) 전용 질문은 제외.
const DOC = /DOC-[A-Z]{3,4}-\d{4}(@r\d+#\d+)?/g;
const evOf = (q) => [...(gt[q.id]?.required_evidence || []), ...(q.expected_evidence || [])];
const docsOf = (q) => [...new Set(evOf(q).join(" ").match(new RegExp("DOC-[A-Z]{3,4}-\\d{4}", "g")) || [])];
const chunksOf = (q) => [...new Set(evOf(q).map((e) => (e.match(/DOC-[A-Z]{3,4}-\d{4}@r\d+#\d+/) || [])[0]).filter(Boolean))];
const sample = questions.filter((q) => docsOf(q).length > 0);

console.log(`측정 모델: ${process.env.FKT_MEASURE_MODEL || "(env FKT_MEASURE_MODEL 미지정)"}`);
console.log(`표본 ${sample.length}문 (기준: 근거가 DOC-* 문서를 가리키는 질문):`);
console.log("  " + sample.map((q) => q.id).join(", "));
if (sample.length < 8) { console.error(`구조 가드 FAIL: 표본 ${sample.length} < 8`); process.exit(3); }

// 🔴 오류 봉투 정본 = `{"error":{"code","message"}}` — 계약 `packages/contracts/rest-api-v0.1.md:11`
//    이자 `app/errors.py` 의 `_contract_error` 가 FastAPI 기본 `{"detail":...}` 를 갈아엎어
//    내보내는 형상이다. 앞선 계측기는 top-level `code` 와 `detail.code` 만 읽어 **code 를
//    「없다」로 적었고, 실제로는 「안 봤다」였다**(09-06 · 두 run 을 그 값 없이 태웠다).
//    정본을 먼저 보고 나머지는 폴백.
const errCode = (j) =>
  (j && typeof j === "object" &&
    ((j.error && j.error.code) || j.code || (j.detail && j.detail.code))) || null;

async function jpost(path, body, cookie) {
  const h = { "Content-Type": "application/json" };
  if (cookie) h.Cookie = cookie;
  const r = await fetch(BASE + path, { method: "POST", headers: h, body: JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: r.status, headers: r.headers, json, text };
}

// 🔴 산출물 조립·쓰기를 한 자리로 모은다 — 가드 «앞»과 완주 «뒤»에서 두 번 부르는데,
//    두 곳이 각자 조립하면 「빨강일 때의 파일」과 「초록일 때의 파일」이 서로 다른 형상이 된다.
let buildOut = () => ({});
let writeOut = async () => true;

async function main() {
  // 세션
  let sess;
  try { sess = await jpost("/api/sessions", {}); }
  catch (e) { console.error(`구조 가드 FAIL: 서버 미도달 — ${e}`); process.exit(4); }
  if (sess.status !== 200) { console.error(`구조 가드 FAIL: /api/sessions ${sess.status}`); process.exit(4); }
  const sid = sess.json.sessionId;
  const cookie = (sess.headers.get("set-cookie") || "").split(";")[0];

  const rows = [];
  let anyHit = false;
  let firstNon200Raw = null;
  for (const q of sample) {
    const wantDocs = docsOf(q);
    const wantChunks = chunksOf(q);
    const rec = { id: q.id, type: q.type, wantDocs, wantChunks, strategies: {} };
    for (const strat of ["vector", "hybrid"]) {
      const t0 = Date.now();
      const res = await jpost("/api/retrieval/compare", { sessionId: sid, question: q.question, strategies: [strat] }, cookie);
      const ms = Date.now() - t0;
      if (res.status !== 200) {
        // 🔴 오류 «본문»을 버리지 않는다. 버리면 「거절당했다」만 남고 «무엇으로 거절했는가»가
        //    사라지는데, 색인 0 국면에서는 바로 그 code 가 빨강의 주어를 정한다.
        const code = errCode(res.json);
        if (firstNon200Raw === null) firstNon200Raw = (res.text || "").slice(0, 500);
        rec.strategies[strat] = { status: res.status, code, note: "allowlist miss 또는 오류", ms };
        continue;
      }
      const hits = res.json[0].hits.map((h) => h.evidenceId);
      const topk = hits.slice(0, K);
      const docHit = wantDocs.some((d) => topk.some((e) => e.startsWith(d)));
      const chunkBind = wantChunks.filter((c) => topk.includes(c)).length;
      const fakeHit = topk.includes(FAKE_NEEDLE) || hits.includes(FAKE_NEEDLE);
      if (docHit) anyHit = true;
      rec.strategies[strat] = { status: 200, ms, nHits: hits.length, docHitAtK: docHit,
        chunkBindAtK: chunkBind, chunkWant: wantChunks.length, fakeNeedleHit: fakeHit, topk };
    }
    rows.push(rec);
  }

  // 대조군 A — off-allowlist 무의미 질의 → 거부(400) 기대
  const ctrlA = await jpost("/api/retrieval/compare", { sessionId: sid, question: NONSENSE, strategies: ["vector"] }, cookie);
  // 대조군 B — 허구 needle 이 어디서도 hit 되지 않음(교정)
  const fakeAnywhere = rows.some((r) => Object.values(r.strategies).some((s) => s.fakeNeedleHit));

  // 🔴 비200 집계 — 「hit 0」이 «어느 응답 위의 0» 인지를 값으로 만든다.
  const calls = rows.flatMap((r) => ["vector", "hybrid"].map((s) => r.strategies[s]).filter(Boolean));
  const nonOk = calls.filter((c) => c.status !== 200);
  const statusSet = [...new Set(calls.map((c) => c.status))].sort((a, b) => a - b);
  const codeSet = [...new Set(nonOk.map((c) => c.code).filter(Boolean))].sort();
  // 「부재」로 읽을 조건을 «모두» 만족해야 한다: (1) 전 호출이 비200 (2) 상태코드가 한 가지로
  // 일관 (3) code 도 한 가지이며 그것이 ABSENCE_CODES 에 있다. 하나라도 어긋나면 원인이 섞인
  // 것이라 「색인 없음」이라 부를 수 없다 — 그때는 옛 문면(exit 5)이 맞다.
  const absence = calls.length > 0 && nonOk.length === calls.length &&
    statusSet.length === 1 && codeSet.length === 1 && ABSENCE_CODES.has(codeSet[0]);
  const nonOkSummary = { n: nonOk.length, ofCalls: calls.length, statuses: statusSet,
    codes: codeSet, absenceVerdict: absence, firstRaw: firstNon200Raw };

  const sum = (strat) => {
    const ss = rows.map((r) => r.strategies[strat]).filter((x) => x && x.status === 200);
    const dh = ss.filter((x) => x.docHitAtK).length;
    const cb = ss.reduce((a, x) => a + x.chunkBindAtK, 0);
    const cw = ss.reduce((a, x) => a + x.chunkWant, 0);
    const ms = ss.map((x) => x.ms).sort((a, b) => a - b);
    const med = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
    return { n: ss.length, docHitAtK: `${dh}/${ss.length}`, chunkBind: `${cb}/${cw}`, msMedian: med };
  };
  const summary = { k: K, vector: sum("vector"), hybrid: sum("hybrid"),
    controlA_nonsense: { status: ctrlA.status, rejected: ctrlA.status === 400, note: "off-allowlist → 거부가 정상 거동(무의미→hit0 아님)" },
    controlB_fakeNeedle: { needle: FAKE_NEEDLE, hitAnywhere: fakeAnywhere, expected: false } };
  buildOut = (gv) => ({ model: process.env.FKT_MEASURE_MODEL || null, base: BASE, k: K,
    sampleIds: sample.map((q) => q.id), rows, summary, nonOk: nonOkSummary,
    controlA: { status: ctrlA.status }, gate: gv, generatedAt: new Date().toISOString() });
  writeOut = async (gv) => {
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(OUT, JSON.stringify(buildOut(gv), null, 2));
      console.log("JSON ->", OUT);
      return true;
    } catch (e) { console.error(`--out 쓰기 실패: ${OUT} — ${e}`); return false; }
  };

  // 🔴 **산출물을 구조 가드 «앞»에서 쓴다**(O-54 a). 빨강일수록 이 파일이 필요하다.
  //    gate 는 아직 안 돌았으므로 여기서는 null 로 쓰고, 완주하면 gate 를 실어 덮어쓴다.
  const outWriteFailed = OUT ? !(await writeOut(null)) : false;

  // 구조 가드 — exit 5 를 둘로 가른다(O-54 b).
  if (!anyHit && absence) {
    console.error(`구조 가드 FAIL: 전 호출 ${statusSet[0]} ${codeSet[0]} · hit 0 — 검색이 죽은 게 아니라 «색인이 없다»(서버가 부재를 이름으로 말했다)`);
    process.exit(7);
  }
  if (!anyHit) {
    console.error("구조 가드 FAIL: answerable 질문 전체 hit 0 — 검색이 죽었다"
      + (nonOk.length ? ` (비200 ${nonOk.length}/${calls.length} · status ${JSON.stringify(statusSet)} · code ${JSON.stringify(codeSet)})` : ""));
    process.exit(5);
  }
  if (fakeAnywhere) { console.error(`구조 가드 FAIL: 허구 needle ${FAKE_NEEDLE} 가 hit 됐다 — 지표가 아무거나 센다`); process.exit(6); }
  // 🔴 쓰기 실패는 «색을 덮지 않는다» — 위 빨강들이 먼저다. 여기까지 왔다는 건 나머지가 다
  //    통과했다는 뜻이고, 그때만 「호출자가 요구한 파일이 없다」를 exit 2 로 만든다.
  if (outWriteFailed) { console.error(`실행 오류: --out 쓰기에 실패했다 ${OUT}`); process.exit(2); }

  // 표 출력
  console.log("\n== benchmark-smoke (보고 전용 · Target 은 인용 · 회귀 판정 아님) ==");
  console.log("id                type            | vec doc@k chunk ms | hyb doc@k chunk ms");
  for (const r of rows) {
    const s = (x) => x ? `${x.docHitAtK ? "Y" : "n"}  ${x.chunkBindAtK}/${x.chunkWant}  ${String(x.ms).padStart(4)}ms` : "----";
    console.log(`${r.id.padEnd(17)} ${String(r.type).padEnd(15)} | ${s(r.strategies.vector).padEnd(18)} | ${s(r.strategies.hybrid)}`);
  }
  console.log("\n요약:", JSON.stringify(summary));
  console.log("대조군 A(무의미 질의):", ctrlA.status, ctrlA.status === 400 ? "거부됨(정상)" : "🔴 거부되지 않음");
  console.log("대조군 B(허구 needle):", fakeAnywhere ? "🔴 hit 됨" : "hit 0(정상)");

  // --- 회귀 판정선(--gate · 잠정) ---
  // 🔴 판정 단위 = doc_hit@5(정수). 잠정 목표 = 기준선 자기 자신(하락 = FAIL). chunk 바인딩은
  //    보고 전용(O-51). baseline §0.2 「실측 전 수치 = 잠정 목표」 표기를 유지한다.
  let gateVerdict = null;
  if (GATE) {
    let base;
    try { base = JSON.parse(readFileSync(BASELINE, "utf-8")); }
    catch (e) { console.error(`게이트 오류: 기준선 파일을 못 읽었다 ${BASELINE} — ${e}`); process.exit(2); }
    const dhCount = (strat) => rows.map((r) => r.strategies[strat]).filter((x) => x && x.status === 200 && x.docHitAtK).length;
    const sameSample = JSON.stringify(base.sampleIds) === JSON.stringify(sample.map((q) => q.id));
    const checks = [];
    if (!sameSample) checks.push({ axis: "sampleIds", ok: false, note: "표본이 기준선과 다르다 — 비교 불가" });
    for (const strat of ["vector", "hybrid"]) {
      const got = dhCount(strat);
      const min = base.thresholds?.[strat]?.docHitAtK_min ?? 0;
      checks.push({ axis: `${strat}.docHit@${K}`, got, min, ok: got >= min });
    }
    const pass = sameSample && checks.every((c) => c.ok);
    gateVerdict = { provisional: base.provisional !== false, baselineVersion: base.version, checks, pass };
    console.log(`\n== 회귀 게이트(잠정 · 판정 단위 doc_hit@${K}) ==`);
    for (const c of checks) console.log(`  ${c.ok ? "PASS" : "🔴 FAIL"} ${c.axis}` + (c.min !== undefined ? ` (got ${c.got} ≥ min ${c.min})` : ` (${c.note})`));
    console.log(`  게이트: ${pass ? "PASS" : "FAIL"} · 잠정 목표(baseline §0.2 실측 전 수치)`);
  }

  if (OUT) { if (!(await writeOut(gateVerdict))) process.exit(2); }
  else console.log("\nJSON:\n" + JSON.stringify(buildOut(gateVerdict)));
  if (GATE && gateVerdict && !gateVerdict.pass) { console.error("회귀 게이트 FAIL: doc_hit@k 가 잠정 기준선 아래"); process.exit(10); }
  process.exit(0);
}
main().catch((e) => { console.error("실행 오류:", e); process.exit(4); });
