#!/usr/bin/env node
// 원장 마커 검사 — `docs/plan/ticket-ledger.md` 가 «자기 파일로부터 재계산되는가».
//
// 규칙 정본 = `evidence/ledger-denominator-audit.md` §7(리바이2 51대 감사 · 스자쿠 46대 판정).
// 그 §7 이 마지막 줄에 남긴 이름이 이 파일이다 — 「이 검산은 «지금 값이 규칙과 맞는가»를
// 말할 뿐 «규칙이 앞으로 지켜지는가»는 말하지 않는다. 마커 없는 행이 다시 생기면 그때는
// 아무도 안 본다.」 여기가 그 자리다(O-34).
//
// 재계산 한 줄(§7.2 · 이 검사기의 유일한 근거):
//   상태 칸 = 「✅/🔶/⬜ 로 시작하는 첫 셀」 · 대상 = 첫 칸이 T*-*·B-* 인 표 행
//
// 🔴 **기대값을 박지 않는다.** 「65」도 「67」도 이 파일에 없다 — 한쪽은 원장 머리글에서
//    읽고 다른 쪽은 원장 행에서 세어 맞댄다. 숫자를 여기 적는 순간 정본이 둘이 된다.
//
// 🔴 **행 0건은 통과가 아니라 실패다.** 표 문면이 바뀌어 추출이 0이 되면 「마커 없는 행 0건」이
//    언제나 참이 된다 — 죽은 계수기는 늘 초록을 낸다. 그래서 대상 행 수를 먼저 센다.
//
// 사용:
//   node scripts/check-ledger-markers.mjs                    검사(기본 원장)
//   node scripts/check-ledger-markers.mjs --ledger <path>     다른 파일을 검사(자기 검증용 사본)
//   node scripts/check-ledger-markers.mjs --tamper-header <out>  머리글 ✅ 수를 +1 한 사본을 만든다
//   node scripts/check-ledger-markers.mjs --tamper-marker <out>  티켓 행 1건의 마커를 지운 사본을 만든다
//
// 종료 코드: 0 = 일치 · 1 = 위반(또는 사본 생성 실패).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_LEDGER = resolve(repoRoot, 'docs/plan/ticket-ledger.md');

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};

const ledgerArg = argOf('--ledger');
const ledgerPath = ledgerArg ? resolve(ledgerArg) : DEFAULT_LEDGER;

// 상태 마커 3종. 🔴 코드포인트로 비교한다 — 🔶 는 서로게이트 페어라
//    `cell[0]` 으로 자르면 반쪽만 잡힌다.
const MARKERS = ['✅', '\u{1F536}', '⬜']; // ✅ 🔶 ⬜

// 대상 행의 첫 칸. 🔴 접미사 한 글자를 허용한다 — `T4-2a` 가 실재하고(원장 96행),
//    허용하지 않으면 계수가 1 모자라 머리글과 영원히 어긋난다(실측: 66 vs 선언 67).
const TICKET_ID = /^(T\d+-\d+[a-z]?|B-\d+)$/;

// 머리글의 분자·분모 선언. 「✅ N / 총 M」 형태 하나만 정본으로 친다.
const HEADER_DECL = /✅\s*(\d+)\s*\/\s*총\s*(\d+)/g;

const MASK_ESCAPED_PIPE = '\u0000';
const MASK_SPAN_PIPE = '\u0001';

/** 표 행을 셀로 가른다. 코드 스팬 안의 `|` 와 이스케이프된 `\|` 는 칸 구분자가 아니다. */
function cellsOf(line) {
  const masked = line
    .replace(/\\\|/g, MASK_ESCAPED_PIPE)
    .replace(/`[^`]*`/g, (span) => span.replace(/\|/g, MASK_SPAN_PIPE));
  const parts = masked.split('|');
  if (parts.length < 3) return null; // 표 행이 아니다
  // 앞뒤 테두리(`|` 로 시작·끝) 제거
  parts.shift();
  if (parts[parts.length - 1].trim() === '') parts.pop();
  return parts.map((c) =>
    c.replaceAll(MASK_ESCAPED_PIPE, '\\|').replaceAll(MASK_SPAN_PIPE, '|').trim(),
  );
}

/** 트림한 셀의 첫 글자가 마커인가 — 아니면 null. 서사 중간의 ✅ 는 상태가 아니다. */
function markerOf(cell) {
  const first = [...cell][0];
  return MARKERS.includes(first) ? first : null;
}

/** 원장에서 티켓 행을 전량 뽑는다. line = 1-based. */
function ticketRows(text) {
  const rows = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.startsWith('|')) return;
    const cells = cellsOf(line);
    if (!cells || cells.length < 2) return;
    if (!TICKET_ID.test(cells[0])) return;
    let marker = null;
    let markerCell = -1;
    for (let c = 1; c < cells.length; c += 1) {
      const m = markerOf(cells[c]);
      if (m) {
        marker = m;
        markerCell = c;
        break;
      }
    }
    rows.push({ line: i + 1, id: cells[0], marker, markerCell });
  });
  return rows;
}

/** 머리글의 「✅ N / 총 M」 — 정확히 1건이어야 한다. */
function headerDecls(text) {
  return [...text.matchAll(HEADER_DECL)].map((m) => ({
    done: Number(m[1]),
    total: Number(m[2]),
    raw: m[0],
  }));
}

// ── 변조 사본 생성 모드 ────────────────────────────────────────────────────────
// 🔴 검사기의 자기 검증은 «참 한 번»으로 성립하지 않는다 — 죽은 검사기는 언제나 통과시킨다.
//    그래서 CI 는 매 실행 «틀린 사본»을 만들어 빨강이 나오는지까지 본다. 사본을 만들지
//    못했다면(문면이 바뀌어 치환이 안 먹었다면) 그것도 실패다: 자극 없는 판정은 판정이 아니다.

const tamperHeaderOut = argOf('--tamper-header');
const tamperMarkerOut = argOf('--tamper-marker');

if (tamperHeaderOut || tamperMarkerOut) {
  const source = readFileSync(ledgerPath, 'utf8');

  if (tamperHeaderOut) {
    const decls = headerDecls(source);
    if (decls.length !== 1) {
      console.error(`🔴 변조 사본을 만들지 못했다 — 머리글 선언이 ${decls.length}건이다(1건이어야 한다)`);
      process.exit(1);
    }
    const { done, raw } = decls[0];
    const wrong = raw.replace(String(done), String(done + 1));
    const copy = source.replace(raw, wrong);
    if (copy === source) {
      console.error('🔴 변조 사본을 만들지 못했다 — 머리글 치환이 먹지 않았다');
      process.exit(1);
    }
    writeFileSync(tamperHeaderOut, copy, 'utf8');
    console.log(`TAMPERED_HEADER=${done}->${done + 1}`);
    process.exit(0);
  }

  // 마커 1건 제거 — §7.1 둘째 칸(「마커 없는 행을 실제로 잡을 수 있는가」)의 CI 판이다.
  const lines = source.split(/\r?\n/);
  const target = ticketRows(source).find((r) => r.marker);
  if (!target) {
    console.error('🔴 변조 사본을 만들지 못했다 — 마커가 붙은 티켓 행이 하나도 없다');
    process.exit(1);
  }
  const idx = target.line - 1;
  const stripped = lines[idx].replace(target.marker, '');
  if (stripped === lines[idx]) {
    console.error(`🔴 변조 사본을 만들지 못했다 — L${target.line} 에서 마커를 지우지 못했다`);
    process.exit(1);
  }
  lines[idx] = stripped;
  writeFileSync(tamperMarkerOut, lines.join('\n'), 'utf8');
  console.log(`TAMPERED_LINE=${target.line}`);
  process.exit(0);
}

// ── 검사 ──────────────────────────────────────────────────────────────────────

const text = readFileSync(ledgerPath, 'utf8');
const rows = ticketRows(text);
const problems = [];

// ① 계수기 생존 — 대상 행 0건이면 아래 모든 판정이 «빈 결과의 초록»이 된다.
if (rows.length === 0) {
  console.error(`🔴 티켓 행을 한 건도 못 뽑았다(${ledgerPath})`);
  console.error('   표 문면이 바뀌었거나 첫 칸 규칙이 낡았다 — 0건은 통과가 아니라 계수기 고장이다.');
  process.exit(1);
}

// ② 마커 미부착 행
const naked = rows.filter((r) => !r.marker);
if (naked.length > 0) {
  problems.push(
    `마커 없는 티켓 행 ${naked.length}건 — 상태 칸은 ✅/🔶/⬜ 중 하나로 «시작»해야 한다(서사는 뒤):`,
  );
  for (const r of naked) problems.push(`    L${r.line}  ${r.id}`);
}

// ③ 머리글 선언 ↔ 행 계수
const decls = headerDecls(text);
const done = rows.filter((r) => r.marker === MARKERS[0]).length;

if (decls.length !== 1) {
  problems.push(
    `머리글의 「✅ N / 총 M」 선언이 ${decls.length}건이다 — 정확히 1건이어야 대조가 성립한다` +
      (decls.length > 1 ? `(${decls.map((d) => d.raw).join(' · ')})` : ''),
  );
} else {
  const decl = decls[0];
  if (decl.total !== rows.length) {
    problems.push(`분모 어긋남 — 머리글 「총 ${decl.total}」 vs 실물 티켓 행 ${rows.length}`);
  }
  if (decl.done !== done) {
    problems.push(`분자 어긋남 — 머리글 「✅ ${decl.done}」 vs 실물 ✅ 행 ${done}`);
  }
}

// ── 보고 ──────────────────────────────────────────────────────────────────────

const byMarker = MARKERS.map((m) => `${m} ${rows.filter((r) => r.marker === m).length}`).join(' · ');
console.log(`원장: ${ledgerPath}`);
console.log(`티켓 행 ${rows.length}(T ${rows.filter((r) => r.id.startsWith('T')).length} + B ${rows.filter((r) => r.id.startsWith('B')).length}) · ${byMarker} · 마커 없음 ${naked.length}`);
if (decls.length === 1) console.log(`머리글 선언: ${decls[0].raw}`);

if (problems.length > 0) {
  console.error('\n🔴 원장이 자기 파일로부터 재계산되지 않는다:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n고치는 자리는 머리글이거나 행 둘 중 «사실인 쪽»이다 — 검사기를 고치지 마라.');
  console.error('규칙 정본: evidence/ledger-denominator-audit.md §7');
  process.exit(1);
}

console.log('\nPASS — 머리글 선언이 행 계수와 일치하고, 마커 없는 티켓 행이 0건이다');
