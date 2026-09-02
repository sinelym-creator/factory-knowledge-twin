#!/usr/bin/env node
/**
 * README 전제조건 표 ↔ 리포 실물 대조 (D-18 후속 · 상시 원칙 「하드코딩 금지」 2026-09-02)
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

// 🔴 「비교 0건」은 초록이 아니다. 행을 못 찾아 아무것도 안 본 실행과, 전부 맞은 실행은
//    같은 침묵을 낸다 — 그래서 «몇 축을 실제로 맞댔는가»를 세고 0이면 실패시킨다.
console.log(`\n대조한 축 ${comparisons} / ${AXES.length}`);
if (comparisons === 0) {
  problems.push('대조한 축이 0개다 — 「전건 일치」가 아니라 「아무것도 안 봤다」다');
}

if (problems.length) {
  console.error('\n🔴 README 전제조건 표가 리포 실물과 어긋난다:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error('\n고치는 자리는 README 이거나 소스 둘 중 «사실인 쪽»이다 — 검사기를 고치지 마라.');
  process.exit(1);
}

console.log('PASS — README 전제조건 표가 리포 실물과 일치한다');
