/**
 * 2.5.8 / 2.5.5 판정 산식 — T7-8a(`t78_target_size_widths.mjs`)에서 «떼어낸» 공용부.
 *
 * 🔴 **왜 떼어냈나** — T7-8b 는 축(화면·상태·높이)을 늘린다. 산식을 복사하면 두 그물이
 *    **조용히 갈라진다** — 같은 셀에서 다른 수를 내도 아무도 모른다. 그래서 산식은 한 곳에 두고,
 *    새 그물은 **36대가 이미 낸 칸(fine·1440·overview/incident/evidence = 16/41/8)을 다시 재는
 *    «교정 열»** 로 자기 동일성을 증명한다(`--calibrate`).
 *
 * 🔴 **판정선 = SC 원문 두 열**(w3.org/WAI/WCAG22 · 36대가 인용한 문면 그대로):
 *   2.5.8(AA) = 24×24 CSS px · 예외 5(**Spacing** / Equivalent / Inline / User agent control / Essential)
 *     Spacing = "if a 24 CSS pixel diameter circle is centered on the bounding box of each
 *                undersized target, the circles do not intersect another target or the circle
 *                for another undersized target"
 *   2.5.5(AAA) = 44×44 · **예외 없음**
 *
 * 🔴 **기계가 판정하는 예외는 Spacing 하나뿐**이다. 그래서 이 산식의 빨강은 「AA 위반」이 아니라
 *    **「AA 위반 후보」**다 — 나머지 4예외로 면제될 수 있다.
 *
 * 🔴 **이 그물이 사람보다 «유리»한 점** — `getBoundingClientRect` 와 `elementFromPoint` 로
 *    소수점 경계와 «실제 눌리는 상자»를 직접 읽는다. 사람은 그 상자를 볼 수 없다.
 *    **«불리»한 점** — 무엇이 «하나의 대상»인지 사람처럼 못 가른다. 시각적으로 한 덩어리인 것을
 *    둘로 세면 원이 교차하고 하나로 세면 안 한다. **Spacing 예외 판정의 뿌리에 닿는 한계다.**
 */

/* ── 페이지 안에서 도는 스캐너 ─────────────────────────────────────────────
   🔴 블랙박스 규칙(§⑧-7 ①) — `data-testid` 를 셀렉터로 쓰지 않는다. HTML 의미와
   접근 가능한 이름·좌표로만 모은다. */
export const SCAN = () => {
  const SEL = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    '[role="button"]', '[role="link"]', '[role="checkbox"]', '[role="radio"]',
    '[role="switch"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
    "[tabindex]",
  ].join(",");

  const name = (el) => {
    const al = el.getAttribute("aria-label");
    if (al) return al.trim().slice(0, 48);
    const t = (el.textContent ?? "").replace(/\s+/g, " ").trim();
    if (t) return t.slice(0, 48);
    return (el.getAttribute("title") || el.getAttribute("alt") || el.getAttribute("name") || "(이름 없음)").slice(0, 48);
  };
  const roleOf = (el) => {
    const r = el.getAttribute("role");
    if (r) return r;
    const tag = el.tagName.toLowerCase();
    if (tag === "a") return "link";
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "input") return `input:${el.getAttribute("type") ?? "text"}`;
    return tag;
  };

  const targets = [];
  for (const el of Array.from(document.querySelectorAll(SEL))) {
    if (el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true") continue;
    if (el.getAttribute("tabindex") === "-1" && !el.matches("a[href],button,input,select,textarea,summary")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    if (cs.pointerEvents === "none") continue;
    if (cs.clip && cs.clip !== "auto") continue; // sr-only
    if (cs.clipPath && cs.clipPath !== "none") continue;
    /* 🔴 **D-41** — 접힌 레일과 뜬 바가 «같은 testid» 를 쓴다. 숨은 쪽을 집으면 두 대상이
       서로의 24px 원을 교차시켜 **없는 위반**을 만든다. 보이는 것만 남긴다.
       🔴 그리고 `checkVisibility` 가 참인 것이 «사람 눈에 보임»은 아니다(덮인 것·밀린 것을
       못 가른다) — 36대 유언. */
    const visible = typeof el.checkVisibility === "function"
      ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })
      : !!el.offsetParent;
    if (!visible) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom <= 0 || r.top >= document.documentElement.scrollHeight) continue;

    /* 🔴 **T7-8b 가 «새로» 재는 것** — `inert` 조상 아래의 요소는 **pointer 로 활성화할 수 없다.**
       2.5.8 의 주어가 「target(= pointer 로 활성화되는 영역)」이므로 inert 는 **대상이 아니다.**
       ⇒ 투어가 열리면 배경이 inert 가 되어 **모집단 자체가 바뀐다.** 빼서 초록을 만드는 것이
       아니라 «질문이 바뀌는» 자리라, **두 수를 다 낸다**(all / non-inert). */
    const inertAncestor = typeof el.closest === "function" ? el.closest("[inert]") : null;

    /* 🔴 «Inline» 예외 후보 — 문장 안에 든 링크인가. 기계는 여기까지, 판단은 사람. */
    const p = el.parentElement;
    const inlineCandidate =
      !!p && cs.display.startsWith("inline") &&
      Array.from(p.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim().length > 1);

    /* 🔴 **경계 상자 ≠ 실제 눌리는 자리.** `.fkt-hit::before` 가 히트 영역을 세로로 넓힌다 —
       `getBoundingClientRect()` 는 그 확장을 못 본다. 그래서 `elementFromPoint` 로 훑는다.
       1px 격자라 참값은 [span, span+2] 사이 — **관대한 상한(span+2)으로 판정**해 위반을
       «과다» 신고하지 않게 한다(35대 「+0.6px 편향」 자리). */
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const owns = (x, y) => {
      const e = document.elementFromPoint(x, y);
      // 🔴 부모를 «소유»로 세면 안 된다 — 부모 컨테이너 크기가 이 대상의 히트 상자로 둔갑한다.
      return !!e && (e === el || el.contains(e));
    };
    let hit = null;
    if (owns(cx, cy)) {
      const walk = (dx, dy) => { let k = 0; for (let s = 1; s <= 60; s++) { if (!owns(cx + dx * s, cy + dy * s)) break; k = s; } return k; };
      const L = walk(-1, 0), R2 = walk(1, 0), U = walk(0, -1), D = walk(0, 1);
      hit = { left: cx - L, right: cx + R2, top: cy - U, bottom: cy + D, w: L + R2 + 2, h: U + D + 2 };
    }

    targets.push({
      role: roleOf(el),
      name: name(el),
      w: Number((hit ? hit.w : r.width).toFixed(2)),
      h: Number((hit ? hit.h : r.height).toFixed(2)),
      boxW: Number(r.width.toFixed(2)),
      boxH: Number(r.height.toFixed(2)),
      hitScanned: !!hit,
      cx: Number(cx.toFixed(2)),
      cy: Number(cy.toFixed(2)),
      left: Number((hit ? hit.left : r.left).toFixed(2)),
      top: Number((hit ? hit.top : r.top).toFixed(2)),
      right: Number((hit ? hit.right : r.right).toFixed(2)),
      bottom: Number((hit ? hit.bottom : r.bottom).toFixed(2)),
      inlineCandidate,
      inert: !!inertAncestor,
      planted: el.id.startsWith("__ctl_"),
    });
  }
  return {
    targets,
    url: location.pathname + location.search,
    pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
    pointerFine: window.matchMedia("(pointer: fine)").matches,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    dialogOpen: document.querySelectorAll('[role="dialog"]').length,
    inertRoots: document.querySelectorAll("[inert]").length,
  };
};

/* ── 판정 산식(SC 문면 그대로) ───────────────────────────────────────────── */
const R = 12; // 지름 24 → 반지름 12
const circleHitsRect = (c, t) => {
  const nx = Math.max(t.left, Math.min(c.cx, t.right));
  const ny = Math.max(t.top, Math.min(c.cy, t.bottom));
  return Math.hypot(c.cx - nx, c.cy - ny) < R;
};
const circlesHit = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy) < R * 2;

export function judge(targets) {
  const under = (t) => t.w < 24 || t.h < 24;
  return targets.map((t, i) => {
    const aaaPass = t.w >= 44 && t.h >= 44;
    if (!under(t)) return { ...t, i, undersized: false, aaPass: true, why: "24×24 이상", partners: [], partnerCount: 0, aaaPass };
    const partners = [];
    targets.forEach((o, j) => {
      if (i === j) return;
      if (circleHitsRect(t, o)) partners.push({ kind: "target", role: o.role, name: o.name });
      else if (under(o) && circlesHit(t, o)) partners.push({ kind: "circle", role: o.role, name: o.name });
    });
    return {
      ...t, i, undersized: true,
      aaPass: partners.length === 0,
      why: partners.length === 0 ? "Spacing 예외로 통과" : "Spacing 예외 미충족",
      partners: partners.slice(0, 4),
      partnerCount: partners.length,
      aaaPass,
    };
  });
}

/* ── 대조군 — 뷰포트 «상대» 좌표로 심는다 ────────────────────────────────
   🔴 고정 좌표는 좁은 폭·낮은 높이에서 화면 밖으로 나가 **전제가 죽는다**(§⑧-7 ⑥).
   T7-8b 는 **높이 축**을 여니 그 위험이 폭보다 크다 — y 도 뷰포트 상대로 잡는다. */
export const PLANT = ({ w, h }) => {
  const mk = (id, x, y, sz) => {
    const b = document.createElement("button");
    b.id = id; b.setAttribute("aria-label", id);
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${sz}px;height:${sz}px;z-index:2147483000;`;
    document.body.appendChild(b);
  };
  const cx = Math.round(w / 2), cy = Math.round(h / 2);
  mk("__ctl_bad_a__", cx - 21, cy, 12);
  mk("__ctl_bad_b__", cx - 3, cy, 12);              // 중심 간 18px < 24 ⇒ 원 교차
  mk("__ctl_good__", Math.max(4, w - 80), Math.max(4, h - 80), 60);
};
export const REMOVE = () =>
  ["__ctl_bad_a__", "__ctl_bad_b__", "__ctl_good__"].forEach((id) => document.getElementById(id)?.remove());

export const CTL_IDS = ["__ctl_bad_a__", "__ctl_bad_b__", "__ctl_good__"];

/**
 * 대조군 판정 — **두 갈래로 갈라서** 낸다.
 *  ① **전제**(모집단 도달) = 심은 3개가 «실제 페이지 스캔»에 잡히는가. 안 잡히면 `exit 2`.
 *  ② **산식**(판정력) = 심은 3개«만»의 모집단에서 bad 는 위반, good 은 통과인가.
 *
 * 🔴 왜 갈랐나 — 36대 그물은 대조군을 «페이지 전체 모집단» 안에서 판정했다. 그러면 심은
 *    60×60 옆에 **진짜 대상이 있기만 해도** 대조군②가 빨강이 되어, 「내 산식이 틀렸다」와
 *    「이웃이 가까웠다」가 한 색으로 접힌다. T7-8b 는 상태(모달·투어)를 여느라 **화면이 붐빈다** —
 *    그 접힘이 실제로 일어난다. 그래서 **판정력은 격리 모집단으로, 도달성은 실페이지로** 잰다.
 *    (실페이지 안에서의 값도 «값으로» 남긴다 — 게이트로만 안 쓴다.)
 */
export function judgeControls(scanTargets) {
  const planted = scanTargets.filter((t) => CTL_IDS.includes(t.name));
  const reached = CTL_IDS.filter((id) => planted.some((t) => t.name === id));
  const isolated = judge(planted);
  const inPage = judge(scanTargets);
  const pick = (rows, id) => rows.find((r) => r.name === id) ?? null;
  return {
    reached,
    missing: CTL_IDS.filter((id) => !reached.includes(id)),
    isolated: {
      bad: pick(isolated, "__ctl_bad_a__"),
      good: pick(isolated, "__ctl_good__"),
    },
    inPage: {
      bad: pick(inPage, "__ctl_bad_a__"),
      good: pick(inPage, "__ctl_good__"),
    },
  };
}

export const die = (why, extra) => {
  console.error(`[exit2] ${why}`);
  if (extra) console.error(JSON.stringify(extra, null, 2));
  process.exit(2);
};
