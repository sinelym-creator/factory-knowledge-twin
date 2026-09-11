/**
 * CAP3-FIX ⓑ(O-2) — 배지 사유는 **본문 텍스트**다.
 *
 * 🔴 무엇을 무는가: ⓐ 사유가 `title` 속성 «밖»의 문자열로 서는가 ⓑ 사유가 없는 회차에는 그
 *    조각이 아예 없는가 ⓒ `data-mode` 계약이 한 글자도 안 움직이는가.
 *    ⓐ 가 판정선이다 — `title` 은 hover 가 있어야 보이고 폐하 기기는 터치라, 툴팁에만 있는
 *    사유는 「숨긴 것과 같다」(`run-panels.tsx` SynthesisBadge 규약).
 * 🔴 못 세우는 것: 색·대비·글자 크기·좁은 폭에서 줄이 겹치는가는 여기서 안 보인다
 *    (`renderToStaticMarkup` 은 CSS 를 모른다) — 브라우저 층 몫이다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LiveContext, ModeBadge } from "./live-status";

type Ctx = React.ContextType<typeof LiveContext>;

const base: Ctx = {
  mode: "unavailable",
  checkedAt: "2026-09-11T08:00:00.000Z",
  why: null,
  congested: {},
  runCap: null,
  hourlyCap: null,
  sessionExpired: false,
};

const markup = (patch: Partial<Ctx>) =>
  renderToStaticMarkup(
    <LiveContext.Provider value={{ ...base, ...patch }}>
      <ModeBadge />
    </LiveContext.Provider>,
  );

/** `title="…"` 안의 글자를 지운 나머지 = 사람이 tap 없이 읽는 표면. */
function bodyOnly(html: string): string {
  return html.replace(/title="[^"]*"/g, "");
}

describe("ModeBadge — 사유 표면", () => {
  it("사유가 본문에 선다(툴팁을 지워도 남는다)", () => {
    const html = markup({ why: "게이트웨이 미기동" });
    expect(html).toContain('data-testid="mode-badge-why"');
    expect(bodyOnly(html)).toContain("게이트웨이 미기동");
  });

  it("🔴 대조군 — 사유가 없으면 그 조각이 없다", () => {
    const html = markup({ why: null });
    expect(html).not.toContain('data-testid="mode-badge-why"');
  });

  it("🔴 대조군 — 혼잡 회차는 사유를 두 번 말하지 않는다", () => {
    const html = markup({
      why: "게이트웨이 미기동",
      congested: { live: { since: 1, retryAfterSec: 5 } as never },
    });
    expect(html).not.toContain('data-testid="mode-badge-why"');
  });

  it("`data-mode` 는 사유 유무와 무관하게 Live 축의 값 그대로다", () => {
    expect(markup({ why: "게이트웨이 미기동" })).toContain('data-mode="unavailable"');
    expect(markup({ why: null })).toContain('data-mode="unavailable"');
  });
});
