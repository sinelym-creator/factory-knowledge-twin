/**
 * S69-6 축 ① — 공개 URL 이 «어느 빌드»를 서빙하는가(리바이2 · 2026-10-14).
 *
 * 🔴 판정력 = 구판 대조 열. 같은 계기를 «직전 production 배포 URL»(next 16.3.3 시대)에도 돌려,
 *    지문이 두 열에서 «갈려야» 계기가 무는 것이다. 한 열만 재면 캐시된 옛 판과 새 판이 같은 초록을 낸다.
 * 🔴 지문 = 정적 청크 안의 next 버전 문자열(`16.3.8` vs `16.3.3`) + Next buildId + 청크 파일명 집합.
 *    배포 메타(커밋 sha)는 Vercel API 의 값이라 따로 적는다 — 이 스크립트는 «서빙되는 바이트»만 본다.
 *
 *   node _s69_6_build_marker.mjs <base1> <base2> ...   → JSON 1개(stdout)
 */
const bases = process.argv.slice(2);
const out = [];
for (const base of bases) {
  const row = { base };
  try {
    const r = await fetch(base + "/", { redirect: "manual" });
    row.status = r.status;
    row.server = r.headers.get("server");
    row.vercelId = (r.headers.get("x-vercel-id") ?? "").split("::")[0];
    row.cache = r.headers.get("x-vercel-cache");
    const html = await r.text();
    row.htmlBytes = html.length;
    row.buildId = (html.match(/"b":"([^"]+)"/) ?? html.match(/"buildId":"([^"]+)"/) ?? [])[1] ?? null;
    const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"' )]+\.js/g)].map((m) => m[0]))];
    row.chunkCount = chunks.length;
    row.chunkNamesSha = await sha(chunks.slice().sort().join("\n"));
    const ver = {};
    let fetched = 0;
    for (const c of chunks) {
      const cr = await fetch(base + c);
      if (cr.status !== 200) continue;
      fetched += 1;
      const js = await cr.text();
      for (const m of js.matchAll(/["'](16\.\d+\.\d+)["']/g)) ver[m[1]] = (ver[m[1]] ?? 0) + 1;
    }
    row.chunksFetched = fetched;
    row.versionStringsInChunks = ver;
  } catch (e) {
    row.error = String(e).slice(0, 160);
  }
  out.push(row);
}
console.log(JSON.stringify(out, null, 1));

async function sha(s) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}
