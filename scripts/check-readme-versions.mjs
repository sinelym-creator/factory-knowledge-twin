#!/usr/bin/env node
/**
 * README 전제조건 표 + 실행 발췌 ↔ 리포 실물 대조 (D-18·D-20 후속 · 「하드코딩 금지」)
 *
 * 🔴 **기대값을 이 파일에 적지 않는다.** `10.32.1`·`22`·`pg16` 같은 값은 한 개도 없다 —
 *    한쪽은 README 표에서 읽고, 다른 쪽은 README 가 «출처로 지목한 파일»에서 읽어 맞댄다.
 *    기대값을 코드에 적으면 값이 세 곳(README·소스·검사기)에 살게 되고, 그때부터 검사기가
 *    낡는 세 번째 자리가 된다.
 *
 * 🔴 **출처 경로조차 박지 않는다.** README 표의 「어디서 온 값인가」 열이 이미 파일을 지목하고
 *    있으므로, 검사기는 그 «선언»을 따라간다. README 가 출처를 바꾸면 검사기도 따라 움직인다.
 *
 * 🔴 이 파일에 남는 것은 «구조 앵커»뿐이다 — 행 라벨(Docker·pnpm·Node)과, 각 출처 파일에서
 *    값을 집는 키(`packageManager`·`node-version`·`image`). 값이 아니라 «어디를 보는가»다.
 *    문면이 바뀌면 이 앵커가 먼저 깨지는데, 그 깨짐은 조용하지 않다 — 아래 「추출 0건 = 실패」
 *    가드가 받아 낸다. 안 그러면 행을 못 찾은 검사기가 «비교 0건»을 초록으로 낸다.
 *
 * 사용:
 *   node scripts/check-readme-versions.mjs                 # 리포 README 대조
 *   node scripts/check-readme-versions.mjs --readme <path> # 다른 사본 대조(자기 검증용)
 *
 * 종료 코드: 0 = 전건 일치 · 1 = 불일치 또는 계측 실패(추출 0건 포함)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const argv = process.argv.slice(2);
const readmeArgIdx = argv.indexOf('--readme');
const readmePath =
  readmeArgIdx >= 0 && argv[readmeArgIdx + 1]
    ? resolve(argv[readmeArgIdx + 1])
    : resolve(repoRoot, 'README.md');

/**
 * 구조 앵커 — 값이 아니라 「어느 행을 보고, 그 출처 파일에서 무엇을 집는가」.
 * `pick` 은 출처 파일 본문에서 값 집합을 뽑는다. 뽑지 못하면 빈 배열을 돌려주고,
 * 그 0건 자체가 아래에서 실패로 잡힌다.
 */
const AXES = [
  {
    label: 'Docker',
    what: 'compose 이미지 태그',
    // compose 의 `image:` 값 전부. build 로만 서는 서비스는 image 가 없어 자연히 빠진다.
    pick: (text) => [...text.matchAll(/^\s*image:\s*["']?([^"'\s#]+)/gm)].map((m) => m[1]),
  },
  {
    label: 'pnpm',
    what: 'packageManager 선언',
    pick: (text) => {
      const m = text.match(/"packageManager"\s*:\s*"pnpm@([^"]+)"/);
      return m ? [m[1]] : [];
    },
  },
  {
    label: 'Node',
    what: 'CI node-version',
    pick: (text) => [...text.matchAll(/node-version:\s*["']?([^"'\s#]+)/g)].map((m) => m[1]),
  },
];

const readme = readFileSync(readmePath, 'utf8');

/** README 표에서 해당 라벨의 행을 찾아 `| 라벨 | 값칸 | 출처칸 |` 세 조각을 돌려준다. */
function findRow(label) {
  for (const line of readme.split(/\r?\n/)) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length >= 3 && cells[0] === label) return { value: cells[1], source: cells[2] };
  }
  return null;
}

/** 칸 안의 백틱 조각을 전부 뽑는다 — README 가 값·경로를 그렇게 표시한다. */
const backticked = (cell) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
/** 굵게 표시(**...**)된 조각 — 표에서 «그 값»을 가리키는 표기. */
const bolded = (cell) => [...cell.matchAll(/\*\*([^*]+)\*\*/g)].map((m) => m[1].trim());

const problems = [];
let comparisons = 0;
let excerptComparisons = 0;

for (const axis of AXES) {
  const row = findRow(axis.label);
  if (!row) {
    problems.push(`[${axis.label}] README 전제조건 표에서 행을 찾지 못했다 — 표 문면이 바뀌었거나 행이 사라졌다`);
    continue;
  }

  // README 가 적은 값: 백틱(이미지 태그처럼 코드 표기) 또는 굵게(버전 숫자)
  const declared = [...new Set([...backticked(row.value), ...bolded(row.value)])];
  // README 가 지목한 출처 파일: 출처 칸의 백틱 중 «리포 안에 실재하는 경로»
  const sourcePaths = backticked(row.source).filter((p) => {
    try {
      readFileSync(resolve(repoRoot, p), 'utf8');
      return true;
    } catch {
      return false;
    }
  });

  if (declared.length === 0) {
    problems.push(`[${axis.label}] README 행에서 값을 못 읽었다 (값 칸: ${row.value})`);
    continue;
  }
  if (sourcePaths.length === 0) {
    problems.push(
      `[${axis.label}] README 가 지목한 출처 파일을 못 찾았다 — 출처 칸에 리포 안 경로가 없다 (출처 칸: ${row.source})`,
    );
    continue;
  }

  const actual = [...new Set(sourcePaths.flatMap((p) => axis.pick(readFileSync(resolve(repoRoot, p), 'utf8'))))];
  if (actual.length === 0) {
    problems.push(
      `[${axis.label}] 출처 ${sourcePaths.join(', ')} 에서 ${axis.what} 를 한 건도 못 집었다 — 파일 형식이 바뀌었다(계측 실패)`,
    );
    continue;
  }

  comparisons += 1;
  const missing = actual.filter((v) => !declared.includes(v));
  const stale = declared.filter((v) => !actual.includes(v));
  if (missing.length || stale.length) {
    problems.push(
      [
        `[${axis.label}] README ↔ ${sourcePaths.join(', ')} 불일치`,
        `    README : ${declared.join(' · ')}`,
        `    실물   : ${actual.join(' · ')}`,
        missing.length ? `    README 에 없다: ${missing.join(' · ')}` : null,
        stale.length ? `    실물에 없다(낡음): ${stale.join(' · ')}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } else {
    console.log(`  OK  ${axis.label.padEnd(7)} ${declared.join(' · ')}  (출처: ${sourcePaths.join(', ')})`);
  }
}

// ── 실행 발췌 ↔ 정본 행 (§35.6 · D-20 후속) ─────────────────────────────────
//
// README 「▶ 실행」의 여섯 줄은 runbook 에서 «옮겨 적은» 것이다. 옮겨 적은 표는 원본이
// 움직여도 자기가 낡은 줄 모른다 — 그래서 여기서 매 실행 맞댄다.
//
// 🔴 여기에도 기대값은 없다. 명령 문자열도, «여섯»이라는 개수도 박지 않는다.
//    한쪽은 발췌 블록에서 읽고, 다른 쪽은 «그 행이 링크로 지목한 파일의, 링크 텍스트가
//    말하는 절»에서 읽는다. README 가 가리키는 곳을 바꾸면 검사기도 따라 움직인다.
const EXCERPT_OPEN = '<!-- excerpt:runbook-4 -->';
const EXCERPT_CLOSE = '<!-- /excerpt:runbook-4 -->';

/** 발췌 블록의 표에서 「명령 · 정본 경로 · 절 번호」를 뽑는다 — 셋 다 README 의 선언이다. */
function excerptRows(text) {
  const lines = text.split(/\r?\n/);
  const open = lines.findIndex((l) => l.includes(EXCERPT_OPEN));
  const close = lines.findIndex((l) => l.includes(EXCERPT_CLOSE));
  if (open < 0 || close <= open) return null; // 마커가 없다 = «못 봤다», 초록이 아니다
  const rows = [];
  for (const line of lines.slice(open + 1, close)) {
    if (!line.startsWith('|') || /^\|\s*-/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 3) continue;
    const cmd = backticked(cells[1])[0];
    const link = cells[2].match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (!cmd || !link) continue;
    const sec = link[1].match(/§\s*(\d+)/); // 링크 «텍스트»가 절을 말한다
    rows.push({ n: cells[0], cmd, path: link[2], section: sec ? sec[1] : null });
  }
  return rows;
}

/** 정본 파일에서 「## <n>.」 절 구간만 자른다. 절 번호는 README 링크가 말한 값이다. */
function sectionLines(fileText, no) {
  const lines = fileText.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${no}\\.`).test(l));
  if (start < 0) return null;
  const after = lines.slice(start + 1).findIndex((l) => /^##\s+\d+\./.test(l));
  return after < 0 ? lines.slice(start) : lines.slice(start, start + 1 + after);
}

/** 한 번의 대조 = 「이 명령이 저 구간에 실재하는가」. 참 시행과 변조 시행이 «같은» 함수를 쓴다. */
function collate(rows, linesOf) {
  const hits = [];
  const misses = [];
  for (const r of rows) {
    const lines = linesOf(r);
    if (!lines) {
      misses.push(`${r.n}) 정본 구간을 못 찾았다 — ${r.path} 의 §${r.section}`);
      continue;
    }
    // 🔴 «포함»이 아니라 «일치»로 본다. 포함으로 보면 README 가 명령을 짧게 잘라 적어도
    //    통과한다 — 정본 줄의 부분 문자열이기 때문이다. 자른 명령은 발췌가 아니라 다른 명령이다.
    //    정본 줄에서 꼬리 주석만 떼고 맞댄다(주석은 정본에만 두기로 한 자리다).
    const bare = (l) => l.replace(/\s+#.*$/, '').trim();
    const at = lines.findIndex((l) => bare(l) === r.cmd);
    if (at < 0) misses.push(`${r.n}) 정본에 없다 — \`${r.cmd}\``);
    // 🔴 원본 행 참조를 함께 들고 간다 — 사본만 들고 가면 아래 변조 시행이 «자기 행»을
    //    알아보지 못해 자극 0건이 된다(실제로 그렇게 한 번 죽었다).
    else hits.push({ ...r, line: at, ref: r });
  }
  return { hits, misses };
}

const exRows = excerptRows(readme);
if (exRows === null) {
  problems.push(
    `실행 발췌 블록의 마커(${EXCERPT_OPEN})를 찾지 못했다 — 블록이 사라졌거나 문면이 바뀌었다(계측 실패)`,
  );
} else if (exRows.length === 0) {
  problems.push('실행 발췌 블록에서 명령을 한 건도 못 읽었다 — 표 형식이 바뀌었다(비교 0건 = 실패)');
} else {
  const readSource = (r) => {
    try {
      return sectionLines(readFileSync(resolve(repoRoot, r.path), 'utf8'), r.section);
    } catch {
      return null;
    }
  };

  const truth = collate(exRows, readSource);
  for (const h of truth.hits) console.log(`  OK  발췌 ${h.n}    ${h.path} §${h.section} 에 실재  \`${h.cmd}\``);
  if (truth.misses.length) {
    problems.push(['실행 발췌가 정본과 어긋난다:', ...truth.misses.map((m) => `    ${m}`)].join('\n'));
  }

  // 🔴 변조 시행 — 「참 한 번」만 울리면 죽은 검사기도 초록을 낸다. 정본 사본의 «맞은 줄»을
  //    한 글자 훼손해 같은 함수로 다시 돌리고, 빨강이 나오는지 본다. 자극 건수도 센다.
  let tampered = 0;
  if (truth.hits.length) {
    const target = truth.hits[0];
    const tamperedRead = (r) => {
      const lines = readSource(r);
      if (!lines || r !== target.ref) return lines;
      const copy = [...lines];
      copy[target.line] = copy[target.line].replace(target.cmd, target.cmd.slice(1)); // 한 글자 훼손
      tampered += 1;
      return copy;
    };
    const drill = collate(exRows, tamperedRead);
    if (tampered === 0) {
      problems.push('자기 검증 자극 0건 — 변조 사본을 만들지 못했다(판정 무효)');
    } else if (!drill.misses.some((m) => m.includes(target.cmd))) {
      problems.push(
        `자기 검증 실패 — 정본을 훼손했는데도 발췌 ${target.n} 이 통과했다(대조기가 죽어 있다)`,
      );
    } else {
      console.log(`  OK  자기 검증  정본 1줄 훼손 → 발췌 ${target.n} 빨강 (자극 ${tampered}건)`);
    }
  }

  excerptComparisons = truth.hits.length;
}

// 🔴 「비교 0건」은 초록이 아니다. 행을 못 찾아 아무것도 안 본 실행과, 전부 맞은 실행은
//    같은 침묵을 낸다 — 그래서 «몇 축을 실제로 맞댔는가»를 세고 0이면 실패시킨다.
console.log(`\n대조한 축 ${comparisons} / ${AXES.length} · 대조한 발췌 ${excerptComparisons} 줄`);
if (comparisons === 0) {
  problems.push('대조한 축이 0개다 — 「전건 일치」가 아니라 「아무것도 안 봤다」다');
}
if (excerptComparisons === 0) {
  problems.push('대조한 발췌가 0줄이다 — 「전건 일치」가 아니라 「아무것도 안 봤다」다');
}

if (problems.length) {
  console.error('\n🔴 README 가 리포 실물과 어긋난다(전제조건 표 · 실행 발췌):\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n고치는 자리는 README 이거나 소스 둘 중 «사실인 쪽»이다 — 검사기를 고치지 마라.');
  process.exit(1);
}

console.log('PASS — README 전제조건 표·실행 발췌가 리포 실물과 일치한다');
