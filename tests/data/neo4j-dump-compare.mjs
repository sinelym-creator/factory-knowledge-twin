/**
 * neo4j-dump-compare — 재적재된 그래프가 «같은 것»인지 논리 덤프 두 벌로 가른다. (검증 좌석 · D-13)
 *
 * 🔴 **왜 필요한가.** 재적재 스크립트의 자기 검증은 «자기가 넣은 것»을 세어 «자기가 읽은 것»과
 *    맞춘다 — 같은 파일끼리의 일치라 로더가 속성을 흘리거나 관계 양끝을 뒤바꿔도 카운트는
 *    그대로 초록이다. `tests/data/seed-integrity.sql` 은 **postgres 전용**이고(실측: neo4j·cypher
 *    언급 0건) 그래프에는 독립 수용 게이트가 없었다. 이 파일이 그 자리다.
 *
 * 🔴 **비교 키는 elementId 가 아니라 «업무 id» 다.** 재적재하면 DB uuid 가 바뀌어 elementId 가
 *    전건 달라진다 — elementId 로 맞추면 100% 빨강이 나고, 그 빨강을 피하려다 «카운트만»
 *    비교하는 데로 물러서게 된다. 노드는 `라벨:props.id`, 관계는 `출발업무id-[TYPE]->도착업무id`
 *    로 맞춘다. 그래서 **이 게이트는 카운트가 아니라 내용을 본다.**
 *
 * 🔴 **속성까지 본다.** 개수가 같아도 값이 비면 그것은 같은 그래프가 아니다. 키 순서는 무시하고
 *    값은 엄격 비교한다(형까지).
 *
 * 🔴 **0 은 통과가 아니다.** 어느 한쪽이 노드 0건이면 rc 2(측정 실패)다 — 「빈 것끼리의 일치」를
 *    초록으로 내보내지 않는다.
 *
 * 🔴 **스키마 덤프는 단일 JSON 이 아니다** — `--- CONSTRAINTS ---` 같은 텍스트 구분자로 절이
 *    이어 붙어 있다(2026-09-01 구조본 실측). 그래서 절 단위로 뜯어 읽는다. 제약을 비교할 때는
 *    **UNIQUENESS 만** 본다: RANGE 는 제약이 만드는 뒷받침 인덱스이고 LOOKUP 은 neo4j 가 자동
 *    생성하는 토큰 인덱스라, 그 둘을 «만들어야 할 것»으로 세면 재적재가 이름 충돌로 죽는다.
 *
 * 사용:
 *   node tests/data/neo4j-dump-compare.mjs \
 *        --base-nodes <a-nodes.json> --base-rels <a-rels.json> \
 *        --actual-nodes <b-nodes.json> --actual-rels <b-rels.json> \
 *        [--base-schema <a-schema.json> --actual-schema <b-schema.json>]
 *
 * rc: 0 = 두 덤프가 같다 · 1 = 다르다(차이 인쇄) · 2 = 측정 실패(파싱 불가 · 한쪽이 0건 · 인자 부족)
 */

import fs from "node:fs";

// ── 인자 ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};
const need = ["base-nodes", "base-rels", "actual-nodes", "actual-rels"];
const missing = need.filter((k) => !arg(k));
if (missing.length) {
  console.log(`측정 실패 — 인자 부족: ${missing.map((m) => "--" + m).join(" ")}`);
  process.exit(2);
}

// ── 덤프 읽기 ───────────────────────────────────────────────────────────────
/** 덤프 1본 = `{data:{fields, values}}`. 못 읽으면 대상 결함이 아니라 «측정 실패»다. */
function readDump(path, label) {
  let raw;
  try {
    raw = fs.readFileSync(path, "utf8");
  } catch (e) {
    console.log(`측정 실패 — ${label} 파일을 못 읽었다: ${path} (${e.code ?? e.message})`);
    process.exit(2);
  }
  try {
    const d = JSON.parse(raw);
    if (!d?.data?.values || !Array.isArray(d.data.values)) throw new Error("data.values 없음");
    return d.data.values;
  } catch (e) {
    console.log(`측정 실패 — ${label} 파싱 불가: ${path} (${e.message})`);
    process.exit(2);
  }
}

/** 키 순서를 무시하고 값을 엄격 비교하기 위한 정규형. */
const canon = (o) =>
  JSON.stringify(
    Object.fromEntries(Object.entries(o ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  );

/**
 * 한 쪽(base 또는 actual)을 «업무 id 기준» 집합 두 개로 편다.
 * 🔴 `props.id` 가 없는 노드는 맞출 열쇠가 없다 — 세어서 따로 보고한다(조용히 버리지 않는다).
 */
function index(nodeRows, relRows, side) {
  const byElement = new Map();
  const nodes = new Map();
  let noBusinessId = 0;
  const dupKeys = [];
  for (const [elementId, labels, props] of nodeRows) {
    const label = Array.isArray(labels) ? [...labels].sort().join("|") : String(labels);
    const bid = props?.id;
    if (bid === undefined) {
      noBusinessId += 1;
      continue;
    }
    const key = `${label}:${bid}`;
    if (nodes.has(key)) dupKeys.push(key);
    nodes.set(key, canon(props));
    byElement.set(elementId, key);
  }
  const rels = new Map();
  let danglingRel = 0;
  for (const [from, to, type, props] of relRows) {
    const f = byElement.get(from);
    const t = byElement.get(to);
    if (!f || !t) {
      danglingRel += 1;
      continue;
    }
    const key = `${f} -[${type}]-> ${t}`;
    // 같은 (from,type,to) 가 두 번 나오면 속성으로 갈라 담는다(중복 자체는 아래에서 보고).
    const k = rels.has(key) ? `${key} #${rels.size}` : key;
    rels.set(k, canon(props));
  }
  return { side, nodes, rels, noBusinessId, danglingRel, dupKeys };
}

const base = index(
  readDump(arg("base-nodes"), "base nodes"),
  readDump(arg("base-rels"), "base rels"),
  "base",
);
const actual = index(
  readDump(arg("actual-nodes"), "actual nodes"),
  readDump(arg("actual-rels"), "actual rels"),
  "actual",
);

// 🔴 0 은 통과가 아니다.
for (const s of [base, actual]) {
  if (s.nodes.size === 0) {
    console.log(`측정 실패 — ${s.side} 쪽 노드가 0건이다. 통과가 아니라 «잴 것이 없다».`);
    process.exit(2);
  }
}

// ── 비교 ────────────────────────────────────────────────────────────────────
function diff(a, b, what) {
  const onlyA = [...a.keys()].filter((k) => !b.has(k));
  const onlyB = [...b.keys()].filter((k) => !a.has(k));
  const changed = [...a.keys()].filter((k) => b.has(k) && a.get(k) !== b.get(k));
  return { what, onlyA, onlyB, changed };
}

const dn = diff(base.nodes, actual.nodes, "노드");
const dr = diff(base.rels, actual.rels, "관계");

const lines = [];
lines.push("neo4j-dump-compare — 재적재본이 «같은 그래프»인가 (업무 id 기준 · elementId 무시)\n");
lines.push(`  base   노드 ${base.nodes.size} · 관계 ${base.rels.size}`);
lines.push(`  actual 노드 ${actual.nodes.size} · 관계 ${actual.rels.size}`);

for (const s of [base, actual]) {
  if (s.noBusinessId) lines.push(`  🔴 ${s.side}: props.id 없는 노드 ${s.noBusinessId}건 — 맞출 열쇠가 없어 비교에서 빠졌다`);
  if (s.danglingRel) lines.push(`  🔴 ${s.side}: 양끝을 못 찾은 관계 ${s.danglingRel}건 — 덤프가 자기완결이 아니다`);
  if (s.dupKeys.length) lines.push(`  🔴 ${s.side}: 업무 id 중복 ${s.dupKeys.length}건 (예: ${s.dupKeys[0]})`);
}

let bad = 0;
for (const d of [dn, dr]) {
  const n = d.onlyA.length + d.onlyB.length + d.changed.length;
  bad += n;
  lines.push(`\n  ${d.what}: 사라짐 ${d.onlyA.length} · 새로 생김 ${d.onlyB.length} · 값 바뀜 ${d.changed.length}`);
  for (const k of d.onlyA.slice(0, 10)) lines.push(`    − ${k}`);
  for (const k of d.onlyB.slice(0, 10)) lines.push(`    + ${k}`);
  for (const k of d.changed.slice(0, 10)) {
    lines.push(`    ~ ${k}`);
    lines.push(`        base   ${base[d.what === "노드" ? "nodes" : "rels"].get(k)}`);
    lines.push(`        actual ${actual[d.what === "노드" ? "nodes" : "rels"].get(k)}`);
  }
  const shown = Math.min(10, d.onlyA.length) + Math.min(10, d.onlyB.length) + Math.min(10, d.changed.length);
  if (n > shown) lines.push(`    … 그 밖 ${n - shown}건`);
}

// ── 스키마(선택) — 🔴 UNIQUENESS 만 본다 ────────────────────────────────────
if (arg("base-schema") && arg("actual-schema")) {
  /** 절 단위로 뜯어 UNIQUENESS 행만 모은다(구분자·다른 절은 버린다). */
  const uniq = (path, label) => {
    let raw;
    try {
      raw = fs.readFileSync(path, "utf8");
    } catch (e) {
      console.log(`측정 실패 — ${label} 스키마 파일을 못 읽었다 (${e.code ?? e.message})`);
      process.exit(2);
    }
    const out = new Set();
    for (const m of raw.matchAll(/\{[\s\S]*?\}(?=\s*\n---|\s*$)/g)) {
      let d;
      try {
        d = JSON.parse(m[0]);
      } catch {
        continue;
      }
      const f = d?.data?.fields ?? [];
      const iType = f.indexOf("type");
      if (iType < 0) continue;
      for (const v of d.data.values ?? []) {
        if (v[iType] !== "UNIQUENESS") continue;
        out.add(`${JSON.stringify(v[f.indexOf("labelsOrTypes")])}.${JSON.stringify(v[f.indexOf("properties")])}`);
      }
    }
    return out;
  };
  const bu = uniq(arg("base-schema"), "base");
  const au = uniq(arg("actual-schema"), "actual");
  const miss = [...bu].filter((x) => !au.has(x));
  const extra = [...au].filter((x) => !bu.has(x));
  bad += miss.length + extra.length;
  lines.push(`\n  UNIQUENESS 제약: base ${bu.size} · actual ${au.size} · 빠짐 ${miss.length} · 여분 ${extra.length}`);
  for (const m of miss.slice(0, 10)) lines.push(`    − ${m}`);
  for (const m of extra.slice(0, 10)) lines.push(`    + ${m}`);
  if (bu.size === 0) {
    console.log(lines.join("\n"));
    console.log("측정 실패 — base 스키마에서 UNIQUENESS 를 한 건도 못 읽었다(절 파싱 실패 가능).");
    process.exit(2);
  }
}

console.log(lines.join("\n"));
console.log(`\n결과: 어긋남 ${bad}건`);
console.log(bad === 0 ? "🟢 두 덤프가 같다 — 재적재본은 «같은 그래프»다." : "🔴 두 덤프가 다르다 — 위 목록이 그 자리다.");
process.exit(bad === 0 ? 0 : 1);
