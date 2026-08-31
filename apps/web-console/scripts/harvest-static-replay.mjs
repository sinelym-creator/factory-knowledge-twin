/**
 * 정적 replay 조회 사본 «굳히기» — 살아 있는 ai-api 에서 1회 뽑아 자산으로 굳힌다 (T4-2a ②).
 *
 * 🔴 **이 스크립트는 빌드가 부르지 않는다.** 사람이 «1회» 실행해 산출물을 커밋하고, 빌드는
 *    그 커밋된 자산을 복사만 한다(`copy-static-replay.mjs`). 두 단을 가르는 이유는 AC 두 줄이
 *    동시에 서야 하기 때문이다 — 「빌드 시 ai-api 무접촉」과 「손 복제 0」. 한 단으로 합치면
 *    둘 중 하나가 반드시 깨진다.
 *
 * 🔴 **응답 원문을 가공하지 않는다.** 받은 JSON 을 그대로 적는다(키 재정렬·필드 추림 0).
 *    가공하면 그 순간 이것은 「서버가 답한 것」이 아니라 「내가 만든 것」이 되고, 정적 경로가
 *    Live 와 다른 화면을 그려도 대조로 잡히지 않는다.
 *
 * 🔴 **화면이 부르는 순서 그대로 훑는다** — 사본 목록을 손으로 나열하지 않고 동선을 따라간다.
 *    손 목록은 화면이 바뀌면 조용히 낡는데, 이 형태는 동선이 바뀌면 여기서 «못 찾는다»고 운다.
 *
 * 사용:
 *   node scripts/harvest-static-replay.mjs --base http://127.0.0.1:8004
 *   node scripts/harvest-static-replay.mjs --base ... --dry-run   # 쓰지 않고 계획만
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");
const FIXTURE = join(REPO_ROOT, "data/replay/gs-01.events.jsonl");
const OUT_DIR = join(REPO_ROOT, "data/replay/static");

const SCENARIO_ID = "GS-01";
const SERIES_WINDOW = "24h";

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const BASE = arg("base", "http://127.0.0.1:8004").replace(/\/$/, "");
const DRY = argv.includes("--dry-run");

/** 🔴 파일명이 되는 값이라 좁힌다 — 응답 id 가 경로 문자를 담아도 디렉터리를 벗어나지 않게. */
const slug = (s) => s.replace(/[^A-Za-z0-9._@#-]/g, "_");
const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

/** 세션 쿠키를 들고 다니는 최소 클라이언트. 🔴 응답 «본문 문자열»을 그대로 돌려준다. */
class Api {
  constructor(base) {
    this.base = base;
    this.cookie = "";
  }

  async call(path, init = {}) {
    const res = await fetch(this.base + path, {
      ...init,
      headers: { ...(init.headers ?? {}), ...(this.cookie ? { cookie: this.cookie } : {}) },
    });
    const setCookie = res.headers.getSetCookie?.() ?? [];
    for (const c of setCookie) {
      const pair = c.split(";")[0];
      if (pair) this.cookie = this.cookie ? `${this.cookie}; ${pair}` : pair;
    }
    const text = await res.text();
    return { status: res.status, text };
  }

  /** 🔴 200 이 아니면 «그 사실»을 그대로 돌려준다 — 여기서 던지면 「서버가 막았다」와
   *     「도구가 깨졌다」가 한 모습이 된다. 굳힐지 말지는 부르는 쪽이 정한다. */
  async get(path) {
    return this.call(path, { headers: { accept: "application/json" } });
  }
}

/** fixture 를 읽어 «화면이 열게 될 id» 를 뽑는다 — 목록을 손으로 적지 않는다. */
async function readFixture() {
  const raw = await readFile(FIXTURE, "utf8");
  const events = raw
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

  const evidence = events
    .filter((e) => e.type === "step.evidence")
    .map((e) => e.payload.evidence);

  const completed = events.find((e) => e.type === "run.completed");

  return {
    events,
    evidence,
    workOrderDraftId: completed?.payload?.workOrderDraftId ?? null,
    /** 🔴 계약 v0.1.1: `/evidence/{id}` 가 다루는 kind 는 이 둘뿐이다. graph-path 는 서버가
     *     404 로 답하므로 «굳히지 않는다» — 정적이 그것을 열면 서버보다 느슨해진다. */
    openable: evidence.filter((e) => e.kind === "doc-chunk" || e.kind === "record"),
    graphPaths: evidence.filter((e) => e.kind === "graph-path"),
  };
}

/** doc-chunk evidenceId → documentId. 🔴 `lib/contract.ts` 의 CHUNK_ID 와 같은 조성이다. */
const CHUNK_ID = /^(DOC-[A-Z]{3,4}-\d{4})@r\d+#\d{3}$/;
const documentIdOf = (evidenceId) => CHUNK_ID.exec(evidenceId)?.[1] ?? null;

async function main() {
  const api = new Api(BASE);
  const fx = await readFixture();

  // ── 0. 대조군이 «어느 빌드»인지 먼저 적는다 (「어느 커밋이 답했나」) ──────────────
  const health = await api.get("/api/health");
  if (health.status !== 200) throw new Error(`ai-api 가 답하지 않는다: /api/health ${health.status}`);
  const buildSha = JSON.parse(health.text).build;

  // ── 1. 세션 두 개 — 🔴 «앵커를 묻는 세션»과 «조회하는 세션»을 가른다 ──────────────
  //
  // 🔴 이유(실측 T4-2a): `GET /incidents/{id}` 는 **그 세션이 돌린 run 의 id** 를 함께 준다
  //    (계약 v0.1.6 소유권 · `Incident.runId`). 한 세션으로 startRun 뒤에 조회하면 사본에
  //    그 실행의 runId 가 박히고, 굳히기를 다시 돌릴 때마다 그 값만 달라진다(재실행 diff 1).
  //    값을 «지워서» 맞추면 원문 가공이 되므로, 대신 **묻는 조건을 바꾼다** —
  //    정적 replay 방문자는 서버 run 을 가진 적이 없으니, run 없는 세션이 보는 응답이
  //    바로 정적 화면이 그려야 할 응답이다. 조건을 실물에 맞추면 가공할 것이 남지 않는다.
  const anchorApi = new Api(BASE);
  const anchorSession = await anchorApi.call("/api/sessions", { method: "POST" });
  if (anchorSession.status !== 200) throw new Error(`세션 발급 실패: ${anchorSession.status}`);

  const session = await api.call("/api/sessions", { method: "POST" });
  if (session.status !== 200) throw new Error(`세션 발급 실패: ${session.status}`);

  /** 굳힌 것들. { route, path, status, text } */
  const harvested = [];
  const skipped = [];

  /** 이미 훑은 경로 — 🔴 같은 문서를 여러 chunk 가 가리키므로 중복이 «반드시» 난다.
   *     걸러 내지 않으면 매니페스트 행 수와 실제 파일 수가 갈리고(덮어쓰기), 그 갈림은
   *     「30건 굳혔다」는 보고를 조용히 거짓으로 만든다 — 수치는 모집단과 함께여야 한다. */
  const seen = new Map();

  const take = async (route, path) => {
    if (seen.has(path)) return seen.get(path);
    const r = await api.get(path);
    if (r.status === 200) {
      harvested.push({ route, path, status: r.status, text: r.text });
      const parsed = JSON.parse(r.text);
      seen.set(path, parsed);
      return parsed;
    }
    seen.set(path, null);
    // 🔴 200 이 아닌 것은 «굳히지 않되 기록한다». 서버가 막은 자리를 정적이 열지 않으려면
    //    무엇이 막혔는지가 매니페스트에 남아야 한다(빈 결과 = 통과가 아니다).
    skipped.push({ route, path, status: r.status, body: r.text.slice(0, 400) });
    return null;
  };

  // ── 2. 화면 동선 순서대로 ───────────────────────────────────────────────────
  // ① Overview
  const plants = await take("GET /api/plants", "/api/plants");
  const plantId = plants?.[0]?.plantId;
  if (!plantId) throw new Error("plants 가 비었다 — seed 된 DB 가 아니다(빈 결과는 통과가 아니다)");

  const overview = await take(
    "GET /api/plants/{plantId}/overview",
    `/api/plants/${encodeURIComponent(plantId)}/overview`,
  );
  await take("GET /api/scenarios", "/api/scenarios");

  // ② Incident — 🔴 앵커는 서버가 안다. fixture 에는 incidentId 가 없다(T4-2a 게이트① P8).
  const started = await anchorApi.call(`/api/scenarios/${SCENARIO_ID}/runs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sessionId: JSON.parse(anchorSession.text).sessionId,
      mode: "replay",
    }),
  });
  if (started.status !== 200) throw new Error(`replay run 시작 실패: ${started.status} ${started.text}`);
  const { incidentId, runId } = JSON.parse(started.text);

  const incident = await take(
    "GET /api/incidents/{incidentId}",
    `/api/incidents/${encodeURIComponent(incidentId)}`,
  );
  const equipmentId = incident?.equipmentId;
  if (!equipmentId) throw new Error("incident 에 equipmentId 가 없다");

  const equipment = await take(
    "GET /api/equipment/{equipmentId}",
    `/api/equipment/${encodeURIComponent(equipmentId)}`,
  );

  // 센서 추세 — 🔴 화면과 «같은 규칙»으로 센서를 고른다(id 문자열로 추측하지 않는다):
  //    incident.alarmIds → overview.activeAlarms 의 그 행 → 그 행의 sensorId.
  const alarmRow = overview?.activeAlarms?.find((a) => incident.alarmIds?.includes(a.alarmId)) ?? null;
  const sensorFromAlarm = alarmRow
    ? (equipment?.sensors?.find((s) => s.sensorId === alarmRow.sensorId)?.sensorId ?? null)
    : null;
  const sensorId = sensorFromAlarm ?? equipment?.sensors?.[0]?.sensorId ?? null;
  /** 🔴 화면은 이 곡선이 «알람의 것인가»를 DOM 에 남긴다(`sensorSource`). 정적 화면도 같은
   *     말을 해야 하므로 매니페스트가 그 갈림을 들고 간다 — 「알람 것」과 「첫 센서로 떨어짐」은
   *     다른 사실이고, 사본만 보면 둘이 같아 보인다. */
  const sensorSource = sensorFromAlarm ? "alarm" : "fallback";
  if (sensorId) {
    await take(
      "GET /api/equipment/{equipmentId}/sensors/{sensorId}/series",
      `/api/equipment/${encodeURIComponent(equipmentId)}/sensors/${encodeURIComponent(sensorId)}/series?window=${SERIES_WINDOW}`,
    );
  }

  // ③ Evidence — fixture 가 낸 근거 중 «계약이 여는 kind» 만
  for (const ev of fx.openable) {
    await take("GET /api/evidence/{evidenceId}", `/api/evidence/${encodeURIComponent(ev.evidenceId)}`);
  }
  // 🔴 graph-path 는 «일부러» 훑는다 — 서버가 404 라는 사실을 매니페스트에 남기기 위해서다.
  //    남기지 않으면 정적 경로가 그것을 열어도 되는지 나중에 아무도 모른다.
  for (const ev of fx.graphPaths) {
    await take("GET /api/evidence/{evidenceId}", `/api/evidence/${encodeURIComponent(ev.evidenceId)}`);
  }

  // ④ 문서 — evidence 화면이 부르는 형태(highlight = 그 chunk) 그대로
  for (const ev of fx.openable) {
    const docId = documentIdOf(ev.evidenceId);
    if (!docId) continue;
    await take(
      "GET /api/documents/{docId}",
      `/api/documents/${encodeURIComponent(docId)}?highlight=${encodeURIComponent(ev.evidenceId)}`,
    );
    // highlight 없는 열람(딥링크 진입)도 같은 화면이 쓴다
    await take("GET /api/documents/{docId}", `/api/documents/${encodeURIComponent(docId)}`);
  }

  // ⑤ 작업지시 초안 — 🔴 실측(T4-2a · :8004 · 47133a0): 서버 replay 는 이것을
  //    **501 `replay_draft_source_absent`** 로 막는다(fixture 는 이벤트만 담는다).
  //    그러므로 굳히지 않는다 — 정적이 열면 서버보다 «느슨»해진다. skipped 에 사유가 남는다.
  if (fx.workOrderDraftId) {
    await take(
      "GET /api/work-orders/{woId}",
      `/api/work-orders/${encodeURIComponent(fx.workOrderDraftId)}`,
    );
  }

  // ── 3. 매니페스트 — ②(빌드 복사)의 «정본» ─────────────────────────────────────
  const files = harvested.map((h) => {
    const name = `${slug(h.path.replace(/^\/api\//, "").replace(/\?/, "__"))}.json`;
    return { ...h, file: name, sha256: sha256(h.text), bytes: Buffer.byteLength(h.text, "utf8") };
  });

  const fixtureText = await readFile(FIXTURE, "utf8");
  const manifest = {
    /** 🔴 이 자산이 «무엇에서 나왔는가». 잊을 수 있는 축을 잊을 수 없는 축이 지킨다. */
    harvestedAt: new Date().toISOString(),
    apiBuildSha: buildSha,
    scenarioId: SCENARIO_ID,
    /** 🔴 재생 run 의 id 는 굳히지 않는다 — 매 실행 달라지는 값이라 diff 0 을 깨뜨린다.
     *     정적 경로는 자기 고정 runId 를 쓴다(오케 판정 #13). 여기엔 «있었다»만 적는다. */
    harvestRunIdVolatile: true,
    /** 🔴 **어느 세션이 물었는가** — 사본의 성질을 정하는 조건이라 값과 함께 남긴다.
     *     조회는 «run 을 가진 적 없는» 세션이 했다(= 정적 replay 방문자의 실제 조건).
     *     앵커(incidentId)만 별도 세션이 replay run 을 1회 돌려 얻었다. 이 분리가 없으면
     *     `Incident.runId` 가 사본에 박혀 굳힐 때마다 값이 달라진다(계약 v0.1.6 소유권). */
    queriedBy: {
      lookups: "session without any run (static visitor condition)",
      anchorOnly: "separate session · POST /scenarios/{id}/runs mode=replay",
    },
    fixture: {
      file: "gs-01.events.jsonl",
      events: fixtureText.split(/\r?\n/).filter((l) => l.trim()).length,
      sha256: sha256(fixtureText),
    },
    anchors: { incidentId, equipmentId, plantId, sensorId, sensorSource, alarmIds: incident.alarmIds ?? [] },
    counts: { harvested: files.length, skipped: skipped.length },
    files: files.map((f) => ({
      file: f.file,
      route: f.route,
      path: f.path,
      status: f.status,
      bytes: f.bytes,
      sha256: f.sha256,
    })),
    /** 🔴 「서버가 막은 자리」의 목록. 정적 경로는 이 자리들을 **열지 않는다**. */
    skipped,
  };

  if (DRY) {
    console.log(JSON.stringify({ ...manifest, files: manifest.files.length }, null, 2));
    console.log(`\n[dry-run] 쓰지 않았다. 굳힐 것 ${files.length}건 · 막힌 것 ${skipped.length}건.`);
    return;
  }

  // 🔴 디렉터리를 «비우고» 다시 쓴다 — 지난 실행의 남은 파일이 매니페스트에 없는 채로
  //    빌드에 실려 가면, 그것은 아무도 만든 적 없는 자산이 된다.
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });
  for (const f of files) await writeFile(join(OUT_DIR, f.file), f.text, "utf8");
  await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const written = await readdir(OUT_DIR);
  console.log(`굳힘 ${files.length}건 + manifest → data/replay/static/ (파일 ${written.length}개)`);
  console.log(`  ai-api build = ${buildSha} · run = ${runId}`);
  for (const s of skipped) console.log(`  [막힘 ${s.status}] ${s.path}`);
}

main().catch((e) => {
  console.error(`실패: ${e.message}`);
  process.exit(1);
});
