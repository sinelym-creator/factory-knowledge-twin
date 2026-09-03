import { STATIC_RUN_ID } from "@/lib/static-replay/run-id";

/**
 * T6-5 가이드 투어 — 스텝 표(정본 = `docs/design/t6-5-guided-tour-spec.md` ②).
 *
 * 🔴 **여기에 있는 것은 «어디를 가리키고 무엇을 설명하는가»뿐이다.** 상태·모션·배치는
 *    Provider·콜아웃이 든다 — 스텝이 늘 때 고칠 곳이 한 곳이어야 한다.
 * 🔴 **대상은 `data-testid` 로 찾는다.** 기존 컴포넌트를 한 줄도 고치지 않는 것이 이 티켓의
 *    조건(규격 머리말 「무변경」)이고, testid 는 이미 그물이 쓰는 안정된 표지다.
 * 🔴 **투어는 REPLAY 로만 돈다**(규격 ①-4). 그래서 조사 시작 스텝은 사람에게 LIVE 버튼을
 *    누르게 «강요하지 않고», 콜아웃이 녹화 재생 경로로 데려간다 — 투어가 구독을 태우면
 *    「안전한 샌드박스」라는 말이 거짓이 된다(§33 ⑤ 구독 상한).
 * 🔴 **문구에 내부 예외명·헤더명·경로를 쓰지 않는다**(§15.2). synthetic 임을 첫 스텝이 말한다.
 */

/** 투어가 쓰는 incident — 정적 재생본이 담은 회차(자산과 같은 값을 두 곳에 적지 않는다). */
export const TOUR_INCIDENT_ID = "INC-2026-014";
export const TOUR_REPLAY_HREF = `/incidents/${TOUR_INCIDENT_ID}?run=${encodeURIComponent(STATIC_RUN_ID)}&tour=1`;

export type TourAdvance =
  /** 「다음」 버튼으로 넘어간다(읽는 스텝). */
  | { kind: "next" }
  /** 대상을 «직접 클릭»해야 넘어간다 — 클릭 없이는 다음이 없다(규격 ⑥ 흐름). */
  | { kind: "click" }
  /** 콜아웃이 링크로 데려간다(화면이 바뀌는 스텝 · REPLAY 경로 고정). */
  | { kind: "link"; href: string; label: string };

export type TourStep = {
  id: string;
  /** 이 스텝이 사는 화면 — pathname 접두. 안 맞으면 콜아웃이 「그 화면으로 갑니다」를 말한다. */
  route: string;
  /** 스포트라이트 대상(`data-testid`) · null = 화면 중앙 카드(완료 스텝). */
  target: string | null;
  title: string;
  /** ≤2줄 — 「무엇을 했나 / 왜」(규격 ①-2). */
  body: string;
  advance: TourAdvance;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "headline",
    route: "/overview",
    target: "headline",
    title: "지금 무슨 일이 났는지부터",
    body: "서버가 활성 알람 중 가장 심각한 1건을 골라 문장으로 만듭니다. 순위를 정하는 것은 서버이고, 화면은 그 첫 줄을 크게 보여 줍니다. 이 화면의 값은 전부 synthetic 데이터입니다.",
    advance: { kind: "next" },
  },
  {
    id: "alarm",
    route: "/overview",
    target: "alarm-card",
    title: "알람은 «울린 행»의 값이 앵커다",
    body: "임계와 관측값이 나란히 있습니다. 기준은 센서의 임계표가 아니라 실제로 울린 그 알람 행의 값입니다 — 둘이 다를 수 있어서 화면은 울린 값을 씁니다.",
    advance: { kind: "next" },
  },
  {
    id: "start",
    route: "/overview",
    target: "start-from-alarm",
    title: "조사를 시작하면 에이전트가 5단계를 돕니다",
    body: "구조화 조회 → 문서 검색 → 그래프 추적 → 종합 → 작업지시 초안. 투어에서는 녹화 재생으로 같은 조사를 보여 줍니다(실제 AI 호출 0).",
    advance: { kind: "link", href: TOUR_REPLAY_HREF, label: "녹화 재생으로 조사 보기" },
  },
  {
    id: "timeline",
    route: "/incidents/",
    target: "run-timeline",
    title: "다섯 단계가 실제로 지나간 자리",
    body: "단계마다 걸린 시간과 모은 근거 수가 남습니다. 종합 단계에서 AI 가 문장을 쓸 때, 근거를 인용하지 못한 문장은 전량 거부됩니다.",
    advance: { kind: "next" },
  },
  {
    id: "candidate",
    route: "/incidents/",
    target: "candidates",
    title: "후보마다 근거 ID 가 붙는다",
    body: "화면의 모든 주장은 근거로 되돌아갈 수 있습니다. 근거 칩을 누르면 그 원본으로 갑니다 — 다음 스텝에서 직접 눌러 봅니다.",
    advance: { kind: "next" },
  },
  {
    id: "evidence",
    route: "/incidents/",
    target: "candidate",
    title: "근거 칩을 직접 눌러 보세요",
    body: "후보 카드 안의 근거 ID 를 누르면 그 근거 화면이 열립니다. 눌러야 다음으로 넘어갑니다.",
    advance: { kind: "click" },
  },
  {
    id: "trust",
    route: "/evidence/",
    target: "trust-header",
    title: "출처·시각·신선도를 함께 말한다",
    body: "이 근거가 어디서 왔고 언제 것인지, 오래되었으면 그렇다고 화면이 말합니다. 낡은 근거를 조용히 최신처럼 보여 주지 않습니다.",
    advance: { kind: "next" },
  },
  {
    id: "approval",
    route: "/evidence/",
    target: null,
    title: "AI 는 제안까지, 승인은 사람이",
    body: "조사 결과로 작업지시서 «초안»이 나옵니다. 초안은 사람이 승인해야 효력이 생깁니다 — 이 콘솔은 결정을 대신하지 않습니다.",
    advance: { kind: "next" },
  },
  {
    id: "done",
    route: "/evidence/",
    target: null,
    title: "둘러보기가 끝났습니다",
    body: "이제 직접 조작해 보세요. 다시 보고 싶으면 상단 「?」를 누르면 됩니다.",
    advance: { kind: "link", href: "/overview", label: "직접 해보기" },
  },
] as const;

export const TOUR_TOTAL = TOUR_STEPS.length;
