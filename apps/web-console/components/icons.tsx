/**
 * 선형 아이콘 5종 — SF Symbols 톤(1.75px 스트로크 · 둥근 끝 · 24 그리드) · 인라인 SVG · 의존성 0.
 *
 * 🔴 전부 장식이다(`aria-hidden`). 뜻은 옆의 글자·sr-only 라벨이 말한다(§17.3 아이콘·문구 병기).
 *    유니코드 글리프(▣▲⧉⟲?)는 폰트마다 굵기·정렬이 달라 값싸 보였다 — 폐하 14:15.
 * 🔴 상태 도형 ●▲■ 은 여기 없다: 그것은 «문구»의 일부(색각 규율 §11.3)라 글자로 남는다.
 */
type Props = { className?: string };

const base = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

/** Overview — 2×2 그리드 */
export function IconGrid({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </svg>
  );
}

/** Incidents — 경고 삼각형 */
export function IconAlert({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4.5 20.5 19h-17L12 4.5Z" />
      <path d="M12 10v4" />
      <path d="M12 16.75h.01" />
    </svg>
  );
}

/** Compare — 겹친 두 창 */
export function IconCompare({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <rect x="3.5" y="6.5" width="11" height="11" rx="2.5" />
      <path d="M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 20.5 5v8a1.5 1.5 0 0 1-1.5 1.5h-1.5" />
    </svg>
  );
}

/** 안내 다시 보기 — 물음표 */
export function IconQuestion({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M9.25 9.5a2.75 2.75 0 1 1 3.9 2.5c-.75.4-1.15 1-1.15 1.75V14" />
      <path d="M12 17.25h.01" />
    </svg>
  );
}

/** 리셋 — 되감는 화살표 */
export function IconReset({ className }: Props) {
  return (
    <svg {...base} className={className}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v4.2h4.2" />
    </svg>
  );
}

/** 브랜드 마크 — 겹친 사각(«쌍둥이») · 레일·입장 화면 */
export function IconMark({ className }: Props) {
  return (
    <svg {...base} className={className} strokeWidth={2}>
      <rect x="3.5" y="3.5" width="12" height="12" rx="3" />
      <rect x="8.5" y="8.5" width="12" height="12" rx="3" />
    </svg>
  );
}
