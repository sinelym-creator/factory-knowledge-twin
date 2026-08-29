/**
 * 계약 표면 검사기 «대조군» — scripts/contract-surface.mjs 가 살아 있는가.
 *
 *   node tests/web/contract_surface_drill.mjs
 *
 * 🔴 5대 → 6대 유언: 「네가 만든 도구부터 대조군에 넣어라」. 여기서 «내가 만든 도구»는
 *    검증 좌석이 판정 근거로 삼으려는 남의 검사기다 — 그 초록을 내 판정에 인용하려면
 *    먼저 그 검사기가 «무엇을 통과시킬 수 있는지»를 내가 재야 한다.
 *
 * 방법: 원본을 건드리지 않는다. 스캔 대상(app·components·lib·proxy.ts·next.config.ts)과
 * 검사기를 임시 사본에 복사하고, 사본에 위반을 주입한 뒤 검사기를 돌려 exit code를 잰다.
 *
 * 판정 축 2개 — 「울었는가(exit)」와 「무엇을 보았다고 말하는가(스캔 N·경로 종수)」.
 * 검사기가 우는 것과, 검사기가 «옳은 이유로» 우는 것은 다르다.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

const APP = process.argv[2] ?? join(process.cwd(), "apps", "web-console");
const COPY = ["app", "components", "lib", "proxy.ts", "next.config.ts", "scripts"];

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), "fkt-surface-"));
  for (const c of COPY) {
    const src = join(APP, c);
    if (existsSync(src)) cpSync(src, join(dir, c), { recursive: true });
  }
  return dir;
}

function run(dir) {
  const r = spawnSync(process.execPath, [join("scripts", "contract-surface.mjs")], {
    cwd: dir, encoding: "utf8",
  });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  const scanned = /스캔 (\d+)파일 · \/api 경로 (\d+)종/.exec(out);
  return {
    exit: r.status,
    verdict: r.status === 0 ? "PASS" : "FAIL",
    files: scanned ? Number(scanned[1]) : null,
    kinds: scanned ? Number(scanned[2]) : null,
    out,
  };
}

const append = (rel, text) => (dir) => {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, (existsSync(p) ? readFileSync(p, "utf8") : "") + "\n" + text + "\n");
};
const prepend = (rel, text) => (dir) => {
  const p = join(dir, rel);
  writeFileSync(p, text + "\n" + readFileSync(p, "utf8"));
};

// expect = 「검사기가 마땅히 내야 할 판정」. 내 기대이지 구현의 약속이 아니다 —
// 갈리면 그 자리에서 «어느 쪽이 옳은가»를 따로 논한다.
const CASES = [
  { id: "D-00", expect: "PASS", why: "무주입 기준선 — 초록이 나와야 이후 FAIL이 «주입 때문»이라 말할 수 있다",
    apply: () => {} },

  { id: "D-01", expect: "FAIL", why: "계약 밖 경로를 화면 코드에 직접 주입(발주문 지정)",
    apply: append("components/placeholder.tsx", 'const DRILL_PATH = "/api/agents/run";') },

  { id: "D-02", expect: "FAIL", why: "fetch를 lib/contract.ts «밖»에 둠 — 표면이 한 곳에서 관리되지 않는다",
    apply: append("components/placeholder.tsx", 'export const drill = () => fetch("/api/live/status");') },

  { id: "D-03", expect: "FAIL", why: "0파일 겨냥 — 「스캔 0 = FAIL」이 실제로 사는가(발주문 지정)",
    apply: (dir) => { for (const c of ["app", "components", "lib", "proxy.ts", "next.config.ts"]) rmSync(join(dir, c), { recursive: true, force: true }); } },

  { id: "D-04", expect: "PASS", why: "줄머리 주석 속 계약 밖 경로 — 설명문은 «부르는 경로»가 아니다(구현 의도 확인)",
    apply: append("components/placeholder.tsx", '// 참고: /api/agents/run 은 계약 밖이다') },

  { id: "D-05", expect: "PASS", why: "JSDoc(* 줄머리) 속 계약 밖 경로 — 위와 같은 축",
    apply: append("components/placeholder.tsx", '/**\n * /api/agents/run\n */') },

  { id: "D-06", expect: "FAIL", why: "🔴 절대 URL 우회 — rewrite를 건너뛰고 백엔드를 직접 부른다(계약 밖 호출 실물)",
    apply: append("lib/contract.ts", 'export const drillAbs = () => fetch("http://127.0.0.1:8000/api/agents/run");') },

  { id: "D-07", expect: "FAIL", why: "🔴 템플릿 접두 우회 — 따옴표 «직후»가 /api/ 가 아니다",
    apply: append("lib/contract.ts", 'export const drillTpl = (b: string) => fetch(`${b}/api/agents/run`);') },

  { id: "D-08", expect: "FAIL", why: "🔴 ROOTS 밖 새 디렉터리(hooks/) — 검사기의 «모집단» 정의가 코드보다 늦게 자란다",
    apply: append("hooks/use-agents.ts", 'export const drill = () => fetch("/api/agents/run");') },

  { id: "D-09", expect: "FAIL", why: "🔴 EXT 밖 확장자(.jsx) — 스캔 대상 확장자 목록이 모집단을 가른다",
    apply: append("components/drill.jsx", 'export const drill = () => fetch("/api/agents/run");') },

  { id: "D-10", expect: "FAIL", why: "🔴 lib «뒤»에 스캔되는 파일(proxy.ts)의 이른 위치에 두 번째 fetch — 정규식 lastIndex 잔류 탐침",
    apply: prepend("proxy.ts", 'export const drill = () => fetch("/api/live/status");') },

  { id: "D-11", expect: "FAIL", why: "lib «앞»에 스캔되는 파일(app/)에 두 번째 fetch — D-10의 반대 방향 대조",
    apply: append("app/overview/page.tsx", 'export const drill = () => fetch("/api/live/status");') },

  { id: "D-12", expect: "FAIL", why: "허용 목록 자체를 넓힘 — 검사기를 «고쳐서» 초록을 만드는 경로가 열려 있는가",
    apply: (dir) => {
      const p = join(dir, "scripts", "contract-surface.mjs");
      writeFileSync(p, readFileSync(p, "utf8").replace("const ALLOWED = [", "const ALLOWED = [\n  /^\/api\/.*$/,"));
      append("components/placeholder.tsx", 'const DRILL_PATH = "/api/agents/run";')(dir);
    } },

  { id: "D-13", expect: "FAIL", why: "🔴 D-10 재조준 — lib 안 파일 순서를 바꿔 contract.ts가 «lib의 마지막»이 되게 한 뒤 proxy.ts 이른 위치에 두 번째 fetch(전역 정규식 lastIndex 잔류)",
    apply: (dir) => {
      cpSync(join(dir, "lib", "session.ts"), join(dir, "lib", "a-session.ts"));
      rmSync(join(dir, "lib", "session.ts"));
      for (const rel of ["proxy.ts", "components/app-shell.tsx"]) {
        const p2 = join(dir, rel);
        writeFileSync(p2, readFileSync(p2, "utf8").replace(/@\/lib\/session/g, "@/lib/a-session"));
      }
      prepend("proxy.ts", 'export const drill = () => fetch("/api/live/status");')(dir);
    } },
];

const rows = [];
for (const c of CASES) {
  const dir = sandbox();
  try {
    c.apply(dir);
    const r = run(dir);
    rows.push({ ...c, ...r, agree: r.verdict === c.expect });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const w = (s, n) => String(s).padEnd(n);
console.log("== 계약 표면 검사기 대조군 — 주입 " + rows.length + "건\n");
console.log(w("ID", 6) + w("기대", 6) + w("실측", 6) + w("스캔", 6) + w("종수", 6) + "일치");
for (const r of rows) {
  console.log(w(r.id, 6) + w(r.expect, 6) + w(r.verdict, 6) + w(r.files ?? "-", 6) + w(r.kinds ?? "-", 6) + (r.agree ? "○" : "🔴 갈림"));
}
console.log("");
for (const r of rows) if (!r.agree) {
  console.log("🔴 " + r.id + " 기대 " + r.expect + " ↔ 실측 " + r.verdict + " — " + r.why);
  console.log(r.out.split("\n").filter((l) => l.trim()).map((l) => "     " + l).join("\n"));
  console.log("");
}
const miss = rows.filter((r) => !r.agree).length;
console.log("== 갈림 " + miss + "건 / " + rows.length + "건");
process.exit(0); // 🔴 이 드릴은 «보고서»다. 갈림 자체가 산출이라 exit로 판정하지 않는다.
