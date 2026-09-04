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

/** 셀렉터 = `data-testid` 값(규격 ⑧-3 의 `Selector`). */
export type Selector = string;

/**
 * T7-39 — 본문 «끝»에 붙는 안내 꼬리. 앞 문장은 상태와 무관하게 늘 같고, **뒷문장만** 갈린다.
 *
 * 🔴 **두 갈래의 앞문장을 한 자리에 둔다.** 문장 두 벌을 통째로 적어 두면 한쪽만 고쳐질 때
 *    같은 안내가 화면 상태에 따라 다른 말을 한다 — 갈리는 것은 «뒷문장 하나»뿐임을 타입이 말한다.
 * 🔴 **여기 있는 것은 여전히 «문면»뿐이다**(이 파일 머리말). 「지금 online 인가」를 읽어
 *    둘 중 하나를 고르는 것은 콜아웃의 일이다 — 스텝 표는 상태를 모른다.
 */
export type TourNote = {
  /** 상태와 무관한 앞문장. */
  lead: string;
  /** `online: true`(LIVE) 및 «아직 모르는» 회차(확인 중·미연결)에서 쓰는 뒷문장. */
  live: string;
  /** `online: false`(REPLAY) 로 **확인된** 회차의 뒷문장. */
  offline: string;
};

/**
 * 🔴 **진행 조건은 «단계 정의 안에만» 산다**(규격 ⑧-3 · 폐하 재가 09-03 ⑤).
 *    앞판은 조건이 코드 세 곳(Enter 처리 · 클릭 리스너 · 링크 이동)에 흩어져 있었고,
 *    그래서 한 곳만 고치면 나머지 둘이 조용히 어긋났다.
 *    런타임은 **`readAdvance()` 한 함수**에서만 `advance` 를 읽는다 — 이 성질은 grep 으로 잰다:
 *    `grep -n '\.advance' apps/web-console` 이 그 함수 «안»만 짚어야 한다.
 *
 * 🔴 **규격의 두 kind 에 `link` 를 더했다.** ⑧-3 의 타입은 `info`·`interactive` 뿐인데,
 *    실재하는 9단계 중 2단계(`start`·`done`)가 **화면을 옮기는 링크**로 진행한다. 규격 타입을
 *    그대로 쓰면 그 둘을 표현할 수 없어 «있는 동작이 사라진다» — 지우는 대신 kind 를 하나 늘리고
 *    이 자리에 사유를 남긴다(규격 개정은 오케 scope).
 */
export type TourStep =
  | {
      kind: "info";
      id: string;
      /** 이 스텝이 사는 화면 — pathname 접두. */
      route: string;
      /** 없거나 null = 환영·마무리 카드(중앙 · 스포트라이트 없음). */
      target?: Selector | null;
      title: string;
      /** ≤2줄 — 「무엇을 했나 / 왜」(규격 ①-2). */
      body: string;
      /** 본문 «끝»에 붙는 안내 꼬리(T7-39) — 없으면 아무것도 안 붙는다. */
      note?: TourNote;
      advance: "next";
    }
  | {
      kind: "interactive";
      id: string;
      route: string;
      target: Selector;
      title: string;
      body: string;
      /** 본문 «끝»에 붙는 안내 꼬리(T7-39) — 없으면 아무것도 안 붙는다. */
      note?: TourNote;
      advance: { on: "click" | "change" | "custom"; of: Selector; timeoutMs?: number };
      /** 기본 true(E3) — 대상이 안 눌리는 상황에서 투어 전체가 막히는 비용이 더 크다. */
      allowSkip: boolean;
    }
  | {
      kind: "link";
      id: string;
      route: string;
      target?: Selector | null;
      title: string;
      body: string;
      /** 본문 «끝»에 붙는 안내 꼬리(T7-39) — 없으면 아무것도 안 붙는다. */
      note?: TourNote;
      advance: { to: string; label: string };
    };

/** 런타임이 보는 «해석된» 진행 조건. 화면도 provider 도 이것만 본다. */
export type AdvancePlan =
  | { ui: "next" }
  | { ui: "await"; on: "click" | "change" | "custom"; of: Selector; timeoutMs?: number; allowSkip: boolean }
  | { ui: "link"; to: string; label: string };

/** 🔴 `advance` 를 읽는 리포의 «유일한» 함수. 늘리지 말 것 — 늘리는 순간 ⑧-3 이 깨진다. */
export function readAdvance(step: TourStep): AdvancePlan {
  switch (step.kind) {
    case "info":
      return { ui: "next" };
    case "interactive":
      return {
        ui: "await",
        on: step.advance.on,
        of: step.advance.of,
        timeoutMs: step.advance.timeoutMs,
        allowSkip: step.allowSkip,
      };
    case "link":
      return { ui: "link", to: step.advance.to, label: step.advance.label };
  }
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    kind: "info",
    id: "headline",
    route: "/overview",
    /* 🔴 **첫 걸음은 가리키지 않는다 — 환영 카드다**(target = null · 스포트라이트 없음).
       앞판은 `headline` 을 가리켰고, 그 자리는 말풍선이 첫 화면에서 76자를 덮는 자리였다
       (검증 실측 PR #496). 가릴 대상이 없으면 그 문제는 «고쳐지는» 것이 아니라 **없어진다**.
       미연결 배지가 스포트라이트되는 최악 조합도 같이 사라진다. */
    target: null,
    title: "둘러보기를 시작합니다",
    body: "알람 하나가 조사·근거·조치로 이어지는 흐름을 아홉 걸음으로 따라갑니다. 이 화면의 값은 전부 synthetic 데이터이고, 둘러보기는 녹화된 재생본으로만 돕니다.",
    advance: "next",
  },
  {
    kind: "info",
    id: "alarm",
    route: "/overview",
    target: "alarm-card",
    title: "알람은 «울린 행»의 값이 앵커다",
    body: "임계와 관측값이 나란히 있습니다. 기준은 센서의 임계표가 아니라 실제로 울린 그 알람 행의 값입니다 — 둘이 다를 수 있어서 화면은 울린 값을 씁니다.",
    advance: "next",
  },
  {
    kind: "link",
    id: "start",
    route: "/overview",
    target: "start-from-alarm",
    title: "조사를 시작하면 에이전트가 5단계를 돕니다",
    body: "구조화 조회 → 문서 검색 → 그래프 추적 → 종합 → 작업지시 초안. 투어에서는 녹화 재생으로 같은 조사를 보여 줍니다(실제 AI 호출 0).",
    /* 🔴 **투어가 «무엇을 보여 주는지»를 이 걸음이 말한다**(T7-39 · 폐하 문면 ①).
       여기서 사람은 처음으로 「조사 보기」를 누르는데, 그것이 실제 AI 조사가 아니라 녹화
       재생이라는 사실이 화면 어디에도 없었다 — 눌러 본 사람은 자기가 조사를 «돌렸다»고 읽는다. */
    note: {
      lead: "둘러보기는 미리 녹화된 조사를 재생합니다.",
      live: "실제 AI 조사는 둘러보기를 닫은 뒤 알람에서 시작하세요.",
      offline: "지금은 재생 모드입니다.",
    },
    advance: { to: TOUR_REPLAY_HREF, label: "녹화 재생으로 조사 보기" },
  },
  {
    kind: "info",
    id: "timeline",
    route: "/incidents/",
    target: "run-timeline",
    title: "다섯 단계가 실제로 지나간 자리",
    body: "단계마다 걸린 시간과 모은 근거 수가 남습니다. 종합 단계에서 AI 가 문장을 쓸 때, 근거를 인용하지 못한 문장은 전량 거부됩니다.",
    advance: "next",
  },
  {
    kind: "info",
    id: "candidate",
    route: "/incidents/",
    target: "candidates",
    title: "후보마다 근거 ID 가 붙는다",
    body: "화면의 모든 주장은 근거로 되돌아갈 수 있습니다. 근거 칩을 누르면 그 원본으로 갑니다 — 다음 스텝에서 직접 눌러 봅니다.",
    advance: "next",
  },
  {
    kind: "interactive",
    id: "evidence",
    route: "/incidents/",
    target: "candidate",
    title: "근거 칩을 직접 눌러 보세요",
    body: "후보 카드 안의 근거 ID 를 누르면 그 근거 화면이 열립니다. 눌러야 다음으로 넘어갑니다.",
    /* 진행 = 후보 카드 «안»의 근거 칩 클릭. 대상과 «누를 것»이 같은 자리라 `of` 도 같다. */
    advance: { on: "click", of: "candidate" },
    allowSkip: true,
  },
  {
    kind: "info",
    id: "trust",
    route: "/evidence/",
    target: "trust-header",
    title: "출처·시각·신선도를 함께 말한다",
    body: "이 근거가 어디서 왔고 언제 것인지, 오래되었으면 그렇다고 화면이 말합니다. 낡은 근거를 조용히 최신처럼 보여 주지 않습니다.",
    advance: "next",
  },
  {
    kind: "info",
    id: "approval",
    route: "/evidence/",
    target: null,
    title: "AI 는 제안까지, 승인은 사람이",
    body: "조사 결과로 작업지시서 «초안»이 나옵니다. 초안은 사람이 승인해야 효력이 생깁니다 — 이 콘솔은 결정을 대신하지 않습니다.",
    advance: "next",
  },
  {
    kind: "link",
    id: "done",
    route: "/evidence/",
    target: null,
    title: "둘러보기가 끝났습니다",
    body: "이제 직접 조작해 보세요. 다시 보고 싶으면 상단 「?」를 누르면 됩니다.",
    advance: { to: "/overview", label: "직접 해보기" },
  },
] as const;

export const TOUR_TOTAL = TOUR_STEPS.length;
