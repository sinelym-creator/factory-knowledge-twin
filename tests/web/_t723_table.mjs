/**
 * T7-23 축① 판정표 생성기 — 회차 JSON 을 읽어 마크다운 표로 낸다. 리바이2 39대.
 *
 * 🔴 손으로 옮겨 적지 않기 위한 물건이다. 값이 판정문으로 가는 길에 사람의 손이 끼면
 *    「측정값은 맞는데 라벨 하나가 틀린」 표가 나온다(38대 실측).
 *
 * 사용: node _t723_table.mjs a.json b.json ...
 */
import { readFileSync } from "node:fs";

const rows = process.argv.slice(2).map((f) => ({ f, j: JSON.parse(readFileSync(f, "utf8")) }));
const cell = (d) => {
  if (!d) return "— 안 잼";
  const own = d.ownAtLast === null ? "카드없음" : `${d.ownAtLast}/25`;
  const verdict = d.close === "성공" ? "**PASS**" : "**FAIL**";
  return `${verdict} · 카드 ${d.firstCardMs}ms · own ${own} · main inert ${d.mainInertEverTrue ? `true(${d.mainInertFirstMs}ms)` : "false"} · 닫기 ${d.close.startsWith("성공") ? `성공 ${d.closeMs}ms` : `타임아웃 ${d.closeMs}ms`} · 남은카드 ${d.cardsLeft} · 투어 ${d.tourEverOpen ? `뜸(${d.tourFirstMs}ms)` : "🔴안뜸=자극없음"}`;
};

console.log(`| 행 | 상류/지연 | 지연 route 걸린수 | 재열람 | 주소 직접 | 대조군(양성/음성) |`);
console.log(`|---|---|---|---|---|---|`);
for (const { j } of rows) {
  const c = j.control;
  const ctl = `${c.positiveRings ? "✓" : "✗"} own ${c.freeOwn}/25·클릭 ${c.clickWhenFree} / ${c.negativeRings ? "✓" : "✗"} own ${c.freeOwn}→${c.coveredOwn}·클릭 ${c.clickUnderInert}`;
  const stim = j.delayMs > 0 ? `${j.routeHits}회` : "—(지연 없음)";
  console.log(`| \`${j.row}\` | ${j.delayMs > 0 ? `지연 +${j.delayMs}ms` : "지연 0"} | ${stim} | ${cell(j.paths.reopen)} | ${cell(j.paths.directUrl)} | ${ctl} |`);
}

/* 🔴 반복 계수 — 비결정 열은 「한 회차의 색」이 아니라 «PASS/FAIL 횟수»가 값이다. */
const cond = (j) => j.row.replace(/-r\d+$/, "").replace(/^b-warmup$/, "b-stub");
const tally = {};
for (const { j } of rows) {
  const k = cond(j);
  tally[k] ??= { n: 0, reopenPass: 0, directPass: 0 };
  tally[k].n++;
  if (j.paths.reopen?.close === "성공") tally[k].reopenPass++;
  if (j.paths.directUrl?.close === "성공") tally[k].directPass++;
}
console.log(`\n| 조건 | n | 재열람 PASS | 주소 직접 PASS |`);
console.log(`|---|---|---|---|`);
for (const [k, v] of Object.entries(tally)) console.log(`| \`${k}\` | ${v.n} | **${v.reopenPass}/${v.n}** | **${v.directPass}/${v.n}** |`);
