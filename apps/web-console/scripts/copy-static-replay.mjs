/**
 * 정적 replay 자산 «빌드 복사» — 커밋된 자산을 셸 번들로 동봉한다 (T4-2a ⓐ · 2단 중 ②).
 *
 * 🔴 **ai-api 를 부르지 않는다.** 이 단계가 네트워크를 타면 「노트북 OFF 에서도 도는 셸」이라는
 *    티켓의 목적 자체가 빌드 시점에 깨진다. 뽑는 일은 `harvest-static-replay.mjs` 가 «사람이
 *    1회» 돌려 이미 끝내 두었고, 여기서는 그 결과만 옮긴다.
 *
 * 🔴 **손 복제 0.** 원본은 `data/replay/` 하나다. 이 스크립트는 읽고 쓰기만 하며 내용을
 *    바꾸지 않는다 — 옮기면서 한 글자라도 손대면 두 벌이 서로 다른 사실을 말하게 된다.
 *
 * 🔴 **sha 로 잠근다.** 매니페스트가 적어 둔 sha256 과 원본이 갈리면 **여기서 멈춘다**.
 *    갈린 채로 빌드가 지나가면 화면은 「굳혀 둔 것」이 아니라 「그 사이 누가 고친 것」을
 *    보여 주는데, 그 갈림은 화면에서 보이지 않는다.
 *
 * 🔴 **`rc 0` 이 「한 일」의 증거가 아니다.** 마지막에 쓴 파일을 «다시 읽어» 건수와 sha 를
 *    확인하고 그 값을 찍는다 — 0건을 조용히 성공으로 넘기지 않는다.
 *
 * 빌드가 부른다(package.json `prebuild`/`predev`). 손으로도 돌릴 수 있다:
 *   node scripts/copy-static-replay.mjs
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(HERE, "..");
const REPO_ROOT = resolve(HERE, "../../..");

const SRC_DIR = join(REPO_ROOT, "data/replay");
const SRC_STATIC = join(SRC_DIR, "static");
const SRC_FIXTURE = join(SRC_DIR, "gs-01.events.jsonl");
const OUT_DIR = join(APP_ROOT, "lib/static-replay/generated");

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const die = (msg) => {
  console.error(`[static-replay] 중단 — ${msg}`);
  process.exit(1);
};

/** JS 문자열 리터럴로 안전하게 싣는다(원문 무변경 · 백틱/역슬래시/`${` 만 이스케이프). */
const asTemplate = (text) => text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");

async function main() {
  // ── 1. 매니페스트 = 정본 ────────────────────────────────────────────────────
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(SRC_STATIC, "manifest.json"), "utf8"));
  } catch {
    die(
      `자산 매니페스트가 없다: data/replay/static/manifest.json\n` +
        `  → 먼저 굳히기를 1회 돌려야 한다: node scripts/harvest-static-replay.mjs --base <ai-api>`,
    );
  }

  // ── 2. fixture — 이벤트 원본 ────────────────────────────────────────────────
  const fixtureText = await readFile(SRC_FIXTURE, "utf8");
  const fixtureSha = sha256(fixtureText);
  if (fixtureSha !== manifest.fixture.sha256) {
    die(
      `fixture 가 매니페스트와 갈렸다.\n` +
        `  매니페스트 ${manifest.fixture.sha256}\n  실제       ${fixtureSha}\n` +
        `  → 이벤트 원본이 바뀌었다면 굳히기를 다시 돌려 조회 사본과 짝을 맞춰라.`,
    );
  }
  const eventLines = fixtureText.split(/\r?\n/).filter((l) => l.trim());
  if (eventLines.length !== manifest.fixture.events) {
    die(`fixture 이벤트 수가 갈렸다: 매니페스트 ${manifest.fixture.events} · 실제 ${eventLines.length}`);
  }
  // 🔴 「빈 결과는 통과가 아니다」 — 0건이면 재생할 것이 없다는 뜻이고, 그건 고장이다.
  if (eventLines.length === 0) die("fixture 에 이벤트가 하나도 없다 — 빈 녹화본은 재생본이 아니다");

  // ── 3. 조회 사본 — 매니페스트가 적은 것을 «전부» 확인한다 ──────────────────────
  const bodies = [];
  for (const f of manifest.files) {
    let text;
    try {
      text = await readFile(join(SRC_STATIC, f.file), "utf8");
    } catch {
      die(`매니페스트에 있는 자산이 없다: ${f.file}`);
    }
    const got = sha256(text);
    if (got !== f.sha256) {
      die(`자산이 매니페스트와 갈렸다: ${f.file}\n  매니페스트 ${f.sha256}\n  실제       ${got}`);
    }
    bodies.push({ ...f, text });
  }

  // 🔴 **반대 방향도 센다** — 매니페스트에 «없는» 파일이 자산 폴더에 있으면, 그것은 아무도
  //    만든 적 없는 자산이다. 한쪽만 훑으면 그 잉여가 영영 안 보인다.
  const onDisk = (await readdir(SRC_STATIC)).filter((n) => n !== "manifest.json");
  const declared = new Set(manifest.files.map((f) => f.file));
  const orphans = onDisk.filter((n) => !declared.has(n));
  if (orphans.length > 0) {
    die(`매니페스트에 없는 자산이 있다(${orphans.length}건): ${orphans.join(", ")}\n  → 굳히기를 다시 돌려라.`);
  }

  // ── 4. 생성 ────────────────────────────────────────────────────────────────
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  // 이벤트: 🔴 JSONL 원문을 «문자열 그대로» 싣는다. 여기서 파싱해 배열로 굽지 않는 이유는
  //         그 순간 봉투가 이 스크립트의 JSON 직렬화를 한 번 거치기 때문이다(키 순서·수치
  //         표기가 원본과 갈릴 수 있다). 읽는 것은 화면 쪽 로더가 한다 — 서버 replay 도
  //         같은 자리에서 줄 단위로 읽는다.
  await writeFile(
    join(OUT_DIR, "events.ts"),
    `// 생성물 — 손으로 고치지 않는다. 원본 = data/replay/gs-01.events.jsonl\n` +
      `// 만든이 = apps/web-console/scripts/copy-static-replay.mjs\n` +
      `export const GS01_EVENTS_JSONL = \`${asTemplate(fixtureText)}\`;\n` +
      `export const GS01_EVENTS_SHA256 = ${JSON.stringify(fixtureSha)};\n` +
      `export const GS01_EVENT_COUNT = ${eventLines.length};\n`,
    "utf8",
  );

  // 조회 사본: 계약 «경로»를 키로 둔다 — 화면이 Live 와 같은 경로 문자열로 찾게 하려는 것이다
  //           (경로가 키면 화면 코드에 정적 전용 분기가 안 생긴다).
  const entries = bodies
    .map((b) => `  ${JSON.stringify(b.path)}: ${b.text.trim()},`)
    .join("\n");
  const blockedEntries = manifest.skipped
    .map((s) => `  ${JSON.stringify(s.path)}: { status: ${s.status}, body: ${JSON.stringify(s.body)} },`)
    .join("\n");

  await writeFile(
    join(OUT_DIR, "responses.ts"),
    `// 생성물 — 손으로 고치지 않는다. 원본 = data/replay/static/\n` +
      `// 만든이 = apps/web-console/scripts/copy-static-replay.mjs\n\n` +
      `/** 계약 경로 → 그 경로가 «실제로 답했던» 본문(원문 무가공). */\n` +
      `export const STATIC_RESPONSES: Record<string, unknown> = {\n${entries}\n};\n\n` +
      `/**\n * 🔴 서버가 «막은» 자리. 정적 경로는 이 자리들을 열지 않는다 — 서버가 404·501 인 것을\n` +
      ` *    정적이 200 으로 열면 그것은 「엄격」이 아니라 「느슨」이다.\n */\n` +
      `export const STATIC_BLOCKED: Record<string, { status: number; body: string }> = {\n${blockedEntries}\n};\n`,
    "utf8",
  );

  await writeFile(
    join(OUT_DIR, "manifest.ts"),
    `// 생성물 — 손으로 고치지 않는다. 원본 = data/replay/static/manifest.json\n` +
      `export const STATIC_MANIFEST = ${JSON.stringify(manifest, null, 2)} as const;\n`,
    "utf8",
  );

  // ── 5. 「한 일」을 산출물로 확인한다 (rc 0 ≠ 한 일) ──────────────────────────
  const written = await readdir(OUT_DIR);
  const check = await readFile(join(OUT_DIR, "events.ts"), "utf8");
  const roundTrip = check.includes(fixtureSha);
  if (!roundTrip) die("생성물에 fixture sha 가 실리지 않았다 — 쓰기가 온전하지 않다");

  console.log(
    `[static-replay] 동봉 ${bodies.length}건 + 이벤트 ${eventLines.length}건 → lib/static-replay/generated/ (파일 ${written.length}개)\n` +
      `  fixture sha = ${fixtureSha.slice(0, 12)} · 자산 굳힘 = ${manifest.harvestedAt} · ai-api build = ${manifest.apiBuildSha}\n` +
      `  서버가 막은 자리 ${manifest.skipped.length}건은 «막힌 채로» 실었다`,
  );
}

main().catch((e) => {
  console.error(`[static-replay] 실패: ${e.stack ?? e.message}`);
  process.exit(1);
});
