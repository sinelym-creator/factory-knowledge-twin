/**
 * 토큰 계층 «대조군» — 같은 토큰을 세 가지 표기로 쓰면 Tailwind 가 무엇을 만들어 내는가.
 *
 *   cd tests/web && node token_layer_probe.mjs
 *
 * 🔴 왜 필요한가: 브라우저에서 상단 바가 56px 가 아니라 27px 로 섰다. 원인 후보가 둘이다 —
 *    ⓐ 토큰이 브라우저에 없다 ⓑ 토큰은 있는데 «유틸리티»가 안 만들어졌다. 브라우저 실측으로
 *    ⓐ는 배제됐다(:root 에 --spacing-appbar: 56px 존재 · --color-panel 은 정상 적용).
 *    남은 ⓑ를 이 대조군이 가른다. 원인을 못 가르면 처방도 못 쓴다 —
 *    「안 된다」만으로는 다음 좌석이 같은 자리를 다시 판다.
 *
 * 🔴 대상 앱의 node_modules 를 빌려 쓰지 않는다. 검사 도구가 대상 안에 결합하면 대상이 바뀔 때
 *    도구가 함께 죽는다 — 대신 앱이 «실측으로» 쓰는 것과 같은 버전(4.3.3)을 여기 고정한다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const VERSION = require("tailwindcss/package.json").version;
const CLI = join(require.resolve("@tailwindcss/cli/package.json"), "..", "dist", "index.mjs");

const SPELLINGS = [
  ["h-[--spacing-appbar]", "v3 식 «맨 변수» 축약 — 🔴 이 셸이 쓰는 표기"],
  ["w-[--spacing-rail]", "같은 표기(레일 폭)"],
  ["h-[var(--spacing-appbar)]", "명시 var() 표기"],
  ["h-(--spacing-appbar)", "v4 식 괄호 축약"],
  ["bg-panel", "색 토큰 — 대조 기준(이건 화면에서 «먹고 있다»)"],
];

// 🔴 입력 CSS 는 tailwindcss 가 «resolve 되는» 곳에 있어야 한다(@import "tailwindcss").
//    OS 임시 폴더에 두면 컴파일러가 자기 자신을 못 찾아 죽는다 — 그 빨강은 표기 문제가 아니다.
const HERE = join(fileURLToPath(import.meta.url), "..");
const dir = mkdtempSync(join(HERE, ".probe-"));
try {
  writeFileSync(join(dir, "fixture.html"), SPELLINGS.map(([c]) => `<div class="${c}"></div>`).join("\n"));
  writeFileSync(
    join(dir, "in.css"),
    `@import "tailwindcss" source(none);\n@source "./fixture.html";\n` +
      `@theme { --spacing-appbar: 56px; --spacing-rail: 56px; --color-panel: #111823; }\n`,
  );
  execFileSync(process.execPath, [CLI, "-i", join(dir, "in.css"), "-o", join(dir, "out.css")], { stdio: "pipe" });
  const out = readFileSync(join(dir, "out.css"), "utf8");

  const w = (s, n) => String(s).padEnd(n);
  console.log(`== 토큰 계층 대조군 — tailwindcss ${VERSION} 실물 · 같은 토큰 · 표기만 다름\n`);
  console.log(w("표기", 28) + w("규칙", 8) + "생성된 선언  ← 🔴 여기가 판정 축이다");
  for (const [cls, note] of SPELLINGS) {
    // Tailwind 는 선택자에서 [ ] ( ) 를 백슬래시로 이스케이프한다 — 문자열 그대로 찾는다
    // (정규식으로 짜다 두 번 틀렸다. 찾는 것이 «리터럴»일 때 정규식을 쓰면 도구가 먼저 죽는다).
    const sel = "." + cls.replace(/[[\]()]/g, (c) => "\\" + c);
    const at = out.indexOf(sel + " {");
    // 🔴 「규칙이 생겼는가」로 멈추면 안 된다 — 규칙은 생기는데 «값이 무효»일 수 있고,
    //    그때 브라우저는 선언만 조용히 버린다. 첫 판에서 나는 여기서 멈춰 틀린 원인을 잡을 뻔했다.
    const decl = at < 0 ? "—" : out.slice(at + sel.length + 2, out.indexOf("}", at)).trim().replace(/\s+/g, " ");
    const valid = at >= 0 && !/:\s*--[a-z-]/.test(decl);
    console.log(w(cls, 28) + w(at >= 0 ? (valid ? "○" : "🔴") : "없음", 8) + decl + (valid ? "" : "   ← 값이 var() 가 아니다 = 무효 선언"));
    console.log(w("", 36) + note);
  }
  console.log("\n🔴 `[--토큰]` 은 v3 에서 var() 로 «자동 감싸졌다». v4 는 대괄호 안을 값 그대로 쓴다 —");
  console.log("   규칙은 생기지만 `height: --spacing-appbar` 라는 무효 선언이라 브라우저가 버린다.");
  console.log("   그래서 화면은 «깨져» 보이지 않고 내용 높이로 선다. 소스 리뷰·빌드 경고·클래스 존재 확인이");
  console.log("   전부 통과한다 — computed style 을 재야 갈린다.");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
