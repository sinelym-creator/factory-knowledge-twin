"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { pickPlacement, type TourPlacement } from "./pick-placement";

import { useLiveStatus } from "@/components/live-status";
import { useTourAllowed } from "@/components/tour/tour-allowed";
import { readAdvance, type TourStep } from "@/components/tour/tour-steps";

/**
 * T6-5 가이드 투어 — 보이는 부분(스포트라이트 · 콜아웃 · 초대 카드 · 진행 점).
 *
 * 🔴 **딤은 조작을 막지 않는다**(규격 ③·①-3). 어두운 면은 `pointer-events:none` 이고
 *    대상에는 «구멍»이 뚫린다 — 큰 `box-shadow` 로 사각 구멍을 만드는 방식이라 클릭이
 *    그대로 대상에 닿는다. 사람을 가둬 놓고 튜토리얼을 강요하지 않는다.
 * 🔴 **모션은 T6-4 유틸을 그대로 쓴다**(`.fkt-sheet`·`.fkt-pulse`·`.fkt-pop`) — reduced-motion
 *    전역 규칙이 한 곳에서 전부 끄고, 그때 정지 링이 남아 정보 손실이 0 이다(규격 ④-6).
 * 🔴 **대상을 못 찾으면 «못 찾았다»고 말한다.** 조용히 넘기면 투어가 빈 화면을 가리키고,
 *    사람은 자기가 뭘 놓쳤다고 생각한다 — 화면이 사실을 말하고 다음으로 갈 길을 준다.
 */

type Rect = { top: number; left: number; width: number; height: number };

type Props =
  | {
      mode: "invite";
      /** 잠깐 끊었던 사람인가(⑧-2 `dismissed`) — 문면과 버튼이 「이어서」가 된다. */
      resume?: boolean;
      onStart: () => void;
      onLater: () => void;
      onNever: () => void;
    }
  | {
      mode: "step";
      step: TourStep;
      index: number;
      total: number;
      /** 지금 화면이 이 스텝의 화면인가 — 아니면 콜아웃이 그 사실을 말한다. */
      onRoute: boolean;
      onNext: () => void;
      onSkip: () => void;
      onGoto: (href: string) => void;
    };

/** 포커스를 실제로 받을 수 있는 것들. `tabindex="-1"` 은 «순회» 대상이 아니라 제외한다. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 그 요소 자신이 받을 수 있으면 자신을, 아니면 «안»의 첫 번째를 준다(D-42 · ⓑ). */
function focusableIn(root: HTMLElement): HTMLElement | null {
  if (root.matches(FOCUSABLE)) return root;
  return root.querySelector<HTMLElement>(FOCUSABLE);
}

export function TourOverlay(props: Props) {
  if (props.mode === "invite") {
    return (
      /* 🔴 **떠 있는 카드를 문서 흐름으로 내렸다**(검증 좌석 실측: `fixed` 우하단 카드가
         첫 방문 화면에서 알람 독·안내 카드·설비 카드와 **6쌍씩 겹쳤다** — 1280·1440·tablet·1920).
         「막지 않는다」는 원칙은 «클릭을 막지 않는다»였는데, 겹침은 그와 별개로 **보이는 것을
         가린다**. 배너 형태면 둘 다 지킨다: 아무것도 가리지 않고, 배경도 그대로 조작된다. */
      <aside
        className="fkt-card fkt-rise mx-auto mt-5 flex w-full max-w-[1440px] flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-3"
        data-testid="tour-invite"
        aria-label="가이드 투어 안내"
      >
        {/* 🔴 **좁은 폭에서는 flex 계산 자체를 없앤다**(D-67 · 폐하 아이폰 Safari 실물 19:57).
            증상은 본문이 한 글자 폭으로 눌린 것이었다. 앞판은 `flex-wrap` 컨테이너 안에서
            본문이 `flex-1`(= `flex: 1 1 0%`) — 「가진 것 없이 남는 만큼」이라 자기가 얼마나
            필요한지를 말하지 않고, 그 판단을 **엔진에 맡긴다**. 남는 폭이 없다고 본 엔진은
            줄을 바꾸는 대신 이 칸을 min-content 까지 누를 수 있다.
            🔴 그래서 basis 를 키우는 대신 **좁은 폭에서 가로 배치를 그만둔다**: `sm`(640) 아래
            에서는 세로로 쌓아 본문이 카드 폭을 통째로 받고, wrap 이 없으니 «어느 엔진의 어떤
            계산에도» 걸리지 않는다. 640 이상은 지금까지와 같은 가로다.
            🔴 이 처방은 **재현 위에 서 있지 않다** — playwright webkit 26.5 는 6/6 정상이었다
            (iPhone 14 에뮬·320~390·resume 카드 포함). 그래서 엔진 가설을 고치는 대신
            **가설이 성립할 자리를 없앴다**. 실기기 축은 검증 좌석·폐하 재확인 몫이다. */}
        <div className="min-w-0 w-full sm:w-auto sm:flex-1 sm:basis-[18rem]">
          <p className="text-body-c font-semibold">
            {props.resume ? "보시던 곳부터 이어서 볼까요?" : "둘러보시겠습니까?"}
          </p>
          <p className="mt-1 text-foot text-muted">
            이 콘솔이 알람 하나를 어떻게 조사하는지, 실제 화면을 눌러 가며 9단계로 보여 드립니다.
            녹화된 조사로 진행하니 아무것도 실행되지 않습니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={props.onStart}
            className="fkt-btn fkt-btn-primary rounded-pill px-5"
            data-testid="tour-start"
          >
            {props.resume ? "이어서 보기" : "둘러보기 시작"}
          </button>
          <button
            type="button"
            onClick={props.onLater}
            className="fkt-btn fkt-btn-secondary rounded-pill px-4"
            data-testid="tour-later"
          >
            나중에
          </button>
          {/* 🔴 「다시 보지 않기」에 죄책감 문구를 붙이지 않는다(규격 ①-6). */}
          <button
            type="button"
            onClick={props.onNever}
            className="fkt-hit rounded-pill px-2 py-1 text-foot text-placeholder hover:text-muted"
            data-testid="tour-never"
          >
            다시 보지 않기
          </button>
        </div>
      </aside>
    );
  }

  return <TourStepView {...props} />;
}

function TourStepView({
  step,
  index,
  total,
  onRoute,
  onNext,
  onSkip,
  onGoto,
}: Extract<Props, { mode: "step" }>) {
  /* 🔴 진행 조건은 `readAdvance()` 로만 읽는다(규격 ⑧-3) — 화면이 `advance` 를 직접 뜯어보면
     조건을 읽는 자리가 둘이 되고, 그게 앞판이 어긋난 이유다. */
  const plan = readAdvance(step);
  /* 🔴 허용 노드는 «상태»로 받는다(T7-28 · D-1). 셀렉터로 한 번 읽으면 그 뒤에 붙는 것을
     영영 못 본다 — 아래 포커스 경계 효과가 이 값을 의존 배열에 넣어 다시 계산한다. */
  const { allowed: registered } = useTourAllowed();
  /* 🔴 **이미 도는 폴링의 값을 나눠 쓴다**(T7-39 · 새 호출 0). `live-status` 컨텍스트는 셸이
     이미 30초마다 채우고 있고, 여기서 다시 물으면 같은 사실을 두 곳에서 따로 묻게 된다. */
  const live = useLiveStatus();
  const [rect, setRect] = useState<Rect | null>(null);
  const [missing, setMissing] = useState(false);
  const titleRef = useRef<HTMLParagraphElement | null>(null);

  /* 대상 위치를 «화면 좌표»로 따라간다 — 스크롤·리사이즈·레이아웃 변화 전부. 🔴 폴링이 아니라
     이벤트 + ResizeObserver 로 듣는다(초당 60번 도는 타이머는 이 화면의 다른 애니메이션을 굶긴다). */
  useLayoutEffect(() => {
    if (!step.target || !onRoute) {
      setRect(null);
      setMissing(false);
      return;
    }
    let raf = 0;
    const find = () => document.querySelector<HTMLElement>(`[data-testid="${step.target}"]`);
    const measure = () => {
      const el = find();
      if (!el) {
        setRect(null);
        setMissing(true);
        return;
      }
      setMissing(false);
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    // 대상이 화면 밖이면 가운데로 끌어온다(규격 ⑤ 모바일 항과 같은 처방).
    const first = find();
    if (first) first.scrollIntoView({ block: "center", behavior: "smooth" });
    else setMissing(true);

    const onFrame = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onFrame, true);
    window.addEventListener("resize", onFrame);
    const ro = first ? new ResizeObserver(onFrame) : null;
    if (first && ro) ro.observe(first);
    // 스텝이 열린 직후 레이아웃이 한 번 더 움직이는 화면이 있어 두 박자 뒤 재측한다.
    const t1 = setTimeout(measure, 240);
    const t2 = setTimeout(measure, 640);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener("scroll", onFrame, true);
      window.removeEventListener("resize", onFrame);
      ro?.disconnect();
    };
  }, [step.target, onRoute, index]);

  /* 🔴 **포커스 경계**(규격 ⑧-4 · 폐하 재가 09-03 ⓒ). 규격에 이 규정 «자체»가 없었다.
     ① `info` 단계 — 순회는 말풍선 «안»만. 배경은 `inert`.
     ② `interactive` 단계 — 순회 = 말풍선 ∪ 대상(및 자손). 🔴 대상을 닫으면 그 단계를 못 넘긴다.
     ③ 진입 초기 포커스 — `info` = 말풍선 첫 버튼 / `interactive` = **대상 요소**.
        이것이 D-37 의 「대상까지 Tab 9회」를 **0회**로 만드는 자리다.
     🔴 `aria-modal` 은 붙이지 않는다(⑧-5) — `interactive` 단계는 다이얼로그 «밖» 대상을
        눌러야 하는데, 붙이면 스크린리더가 그 대상을 탐색 트리에서 지운다.
     🔴 배경에 `aria-hidden` 도 쓰지 않는다 — 포커스는 여전히 들어간다(가리기만 한다). */
  useEffect(() => {
    const callout = calloutRef.current;
    if (!callout) return;
    const targetEl =
      plan.ui === "await" ? document.querySelector<HTMLElement>(`[data-testid="${plan.of}"]`) : null;
    /* 🔴 **안내 카드는 «배경»이 아니다**(D-1 재개방). 규격 ⑧-4 의 주어는 「배경을 막는다」인데,
       앱바 「?」는 `/overview?intro=1&tour=1` 로 가서 **안내와 투어를 «함께» 띄운다** — 그때
       안내 카드를 배경으로 분류하면 그 카드의 「안내 닫기」가 `inert` 뒤로 들어가 «출구가
       사라진다»(검증 실측: 재진입 시 5×5 격자 25/25 점을 셸 본문이 먹고 클릭이 8초 타임아웃 ·
       첫 진입에서는 21/25 가 카드 것이라 눌린다). 🔴 같은 버튼이 «경로에 따라» 눌리고 안
       눌리는 것은 설계일 수 없다. 그래서 함께 뜬 것은 허용 노드에 넣는다.
       카드가 없으면(이미 닫았거나 처음이 아니면) 아무 일도 없다 — 투어 OFF 화면은 불변이다.

       🔴 **T7-28 — 그 카드를 «셀렉터»로 찾지 않는다.** 앞판은 이 자리에서
       `querySelector('[data-testid="intro-card"]')` 를 **효과가 도는 그 순간 한 번** 읽었다.
       카드가 그 뒤에 붙으면 다시 읽을 계기가 없어, 카드는 배경으로 분류된 채 `inert` 뒤로
       들어간다(재열람 19/19 FAIL · 카드 첫 등장 시 `main` 이 이미 `inert`). 이제 카드가
       스스로 등록하고, 그 «집합»이 아래 의존 배열에 들어간다 — 언제 붙든 다시 계산된다. */
    const allowed: HTMLElement[] = [callout];
    if (targetEl) allowed.push(targetEl);
    for (const el of registered) {
      /* 사라진 노드를 허용에 넣으면 `keep` 사슬이 문서 밖을 가리켜 아무것도 안 지킨다. */
      if (el.isConnected && !allowed.includes(el)) allowed.push(el);
    }

    /* 허용 노드로 가는 «조상 경로»는 통과시키고 그 형제만 `inert` 로 덮는다.
       최상위를 통째로 덮으면 대상까지 같이 죽는다 — 그게 ② 를 깨는 자리다. */
    const keep = new Set<Element>();
    for (const el of allowed) {
      let n: Element | null = el;
      while (n) {
        keep.add(n);
        n = n.parentElement;
      }
    }
    const changed: HTMLElement[] = [];
    const supportsInert = typeof HTMLElement !== "undefined" && "inert" in HTMLElement.prototype;
    if (supportsInert) {
      const walk = (parent: Element) => {
        for (const child of Array.from(parent.children)) {
          if (!(child instanceof HTMLElement)) continue;
          if (allowed.includes(child)) continue;
          if (keep.has(child)) {
            walk(child);
            continue;
          }
          if (child.inert) continue;
          child.inert = true;
          changed.push(child);
        }
      };
      walk(document.body);
    }

    /* 🔴 폴백 = «포커스가 새면 되돌린다». `tabindex` 를 문서 전체에 저장·복원하지 않는
       이유: `interactive` 단계의 클릭이 곧 화면 이동이라 복원 시점에 그 DOM 이 이미 없다 —
       그러면 「투어 OFF = 화면 변화 0」(규격 ⑤)이 깨진 채로 남는다. 이 감시는 아무것도 바꾸지
       않으므로 언마운트로 흔적 없이 사라진다. `inert` 가 있는 브라우저에서도 뒷받침으로 둔다. */
    const inRange = (n: EventTarget | null) =>
      n instanceof Node && allowed.some((a) => a === n || a.contains(n));
    const onFocusIn = (e: FocusEvent) => {
      if (inRange(e.target)) return;
      const first = callout.querySelector<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? callout).focus();
    };
    document.addEventListener("focusin", onFocusIn, true);

    /* 🔴 **T7-35(D-52) — 폴백이 «있다»와 «막는다»는 다른 사실이다.**
     *
     * 위 `focusin` 감시는 **키보드 축만** 되돌린다. `inert` 가 없는 브라우저에서 마우스로
     * 범위 밖을 누르면 아무것도 막지 않아 그대로 화면이 넘어갔다 — 리바이2 X-22 실측:
     * `delete HTMLElement.prototype.inert` 로 강제한 열에서 투어 중 `nav-compare` 클릭이
     * **`/compare` 이동**으로 끝났다(지원 열은 막힘 · `inert` 걸린 요소 15 → 0 이 갈래 증인).
     *
     * 🔴 **캡처 단계**여야 한다 — 링크·버튼의 자기 핸들러보다 «먼저» 서야 이동을 막는다.
     * 🔴 `pointerdown` 과 `click` 을 **둘 다** 막는다: 앞의 것은 포커스·드래그 개시를,
     *    뒤의 것은 키보드로 활성화된 클릭과 합성 클릭을 잡는다.
     * 🔴 지원 열에서는 `inert` 가 먼저 막아 이 가드가 **발동 0 인 것이 정상**이다 — 그래서
     *    발동을 «세되» 커밋본에 흔적을 남기지 않는다(내부 카운터 · 실측은 아래 두 열의
     *    화면 결과로 가른다).
     * 🔴 되돌리는 방법은 `onFocusIn` 과 **같다** — 두 축이 다른 자리로 포커스를 보내면
     *    같은 사건이 입력 방식에 따라 다르게 끝난다.
     */
    let blocked = 0;
    const onPointer = (e: Event) => {
      if (inRange(e.target)) return;
      blocked += 1;
      e.preventDefault();
      e.stopPropagation();
      const first = callout.querySelector<HTMLElement>(
        'button, a[href], [tabindex]:not([tabindex="-1"])',
      );
      (first ?? callout).focus();
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("click", onPointer, true);

    /* ③ 초기 포커스. 🔴 «한 번만» 부르면 안 된다 — 클릭으로 넘어온 단계는 그 클릭이 곧 화면
       이동이라, 이 시점에 대상이 아직 DOM 에 없다(실측: `interactive` 초기 포커스가 `body`).
       그래서 다음 프레임과 정착 후 한 번 더 시도하되, **이미 범위 안에 포커스가 있으면
       건드리지 않는다** — 사람이 이미 Tab 으로 옮겨 둔 자리를 빼앗지 않기 위해서다. */
    const focusInitial = () => {
      if (inRange(document.activeElement)) return;
      const t =
        plan.ui === "await"
          ? document.querySelector<HTMLElement>(`[data-testid="${plan.of}"]`)
          : null;
      if (t && !allowed.includes(t)) allowed.push(t);
      /* 🔴 **셀렉터가 «맞게» 풀리는 것과 «포커스를 받을 수 있는 것»을 가리키는 것은 다르다.**
         `[data-testid="candidate"]` 는 평범한 `<li>` 라 `.focus()` 가 **예외도 경고도 없이
         아무 일도 안 했다**(D-42 추적 실측: `picked="LI/candidate"` 다음 줄이 `active="BODY/"`).
         그래서 가리킨 것 «안»의 첫 포커스 가능 요소로 내려간다 — 스크린리더도 그때 이름을 읽는다.
         🔴 `<li>` 자체에 `tabIndex` 를 붙이지 «않는다»: 포커스가 껍데기에 앉으면 「이걸 누르세요」의
            대상과 실제 누를 것이 어긋나 Tab 이 한 번 더 필요해진다(오케 판정 ⓐ 미채택). */
      const el = (t ? focusableIn(t) : null) ?? focusableIn(callout) ?? titleRef.current;
      el?.focus();
      /* 🔴 **안전망 — `focus()` 는 조용히 실패한다.** 불렀다고 갔다고 치면 그 순간 포커스는
         「아무 데도 아닌 곳」(`body`)에 떨어지고, 그게 D-42 퇴행의 정의였다. 부른 «뒤» 결과를
         읽어 확인하고, 안 갔으면 말풍선 제목으로 갚는다(앞판이 조건 없이 주던 자리다). */
      if (!inRange(document.activeElement)) titleRef.current?.focus();
    };
    focusInitial();
    const raf = window.requestAnimationFrame(focusInitial);
    const settle = window.setTimeout(focusInitial, SETTLE_MS);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      document.removeEventListener("focusin", onFocusIn, true);
      /* 🔴 포인터 가드는 `focusin` 을 떼는 «그 자리»에서 함께 뗀다 — 두 감시의 수명이 갈리면
         투어가 끝난 화면에서 클릭이 막히는 회차가 생긴다(규격 ⑤ 화면 변화 0 위반). */
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("click", onPointer, true);
      void blocked; /* 발동 계수 — 실측용으로만 세고 화면·로그에는 남기지 않는다 */
      for (const el of changed) el.inert = false;
    };
    /* 🔴 **`registered` 가 의존 배열에 «있어야» 이 수리가 성립한다**(T7-28). 카드가 붙는
       시점은 이 효과가 도는 시점보다 뒤일 수 있고, 그때 배열 참조가 바뀌면서 효과가 다시
       돈다 — React 가 «먼저» 위 cleanup 을 돌려 이전 회차의 `changed` 를 전부
       `inert=false` 로 되돌린 다음 새 허용 집합으로 다시 계산한다. 그 순서가 이 수리의 전부다. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step.id, plan.ui, plan.ui === "await" ? plan.of : "", registered]);

  /* 🔴 콜아웃의 «실제» 높이를 재서 배치에 쓴다. 220px 로 어림잡던 값이 실물과 어긋나
     데스크톱에서도 대상을 16.6% 덮었다(리바이2 34대 실측 1440 스텝 4). 추정으로 배치하면
     추정만큼 겹친다. */
  const calloutRef = useRef<HTMLElement | null>(null);
  const [calloutH, setCalloutH] = useState(220);
  /* 🔴 스텝이 바뀔 때 한 번만 재면 «한 프레임 늦은 높이»로 배치한다 — 리바이2 34대 실측:
     규칙대로면 top 이 699 여야 할 칸이 632 에 앉았고, 역산하면 그때 쓰인 높이는 직전 스텝의
     것(256)이었다. 그래서 옆 칸이 새로 겹쳤다. 높이가 «변할 때마다» 다시 재게 둔다. */
  useLayoutEffect(() => {
    const el = calloutRef.current;
    if (!el) return;
    const measure = () => setCalloutH(el.getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [index, step.id]);

  /* 첫 걸음 = 가리킬 대상이 없는 «환영 카드». 대상을 못 찾은 상태(`missing`)와는 다르다 —
     이쪽은 설계상 없는 것이라 「자리를 못 찾았다」 안내를 띄우지 않는다. */
  const isWelcome = index === 0 && !step.target;

  /* 꼬리 문장 — 앞문장은 늘 같고 뒷문장만 갈린다(`tour-steps.ts` `TourNote`). */
  const noteOffline = step.note ? live.mode === "replay" : false;
  const note = step.note
    ? `${step.note.lead} ${noteOffline ? step.note.offline : step.note.live}`
    : null;

  const pad = 8;
  const hole: Rect | null = rect
    ? {
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  /* 콜아웃 배치 — 대상 아래에 공간이 있으면 아래, 없으면 위. <md 는 바텀 시트(규격 ⑤).
     🔴 좌표를 클램프한다: 화면 밖으로 나간 콜아웃은 「보이지만 읽을 수 없는」 상태가 된다. */
  const CALLOUT_W = 360;
  /* 진입 스태거 최대 지연 280ms + `--fkt-dur-3` 400ms — 그 뒤면 주변이 제자리다. */
  const SETTLE_MS = 700;
  const below = hole ? hole.top + hole.height + 12 : 0;
  const fitsBelow = hole ? below + calloutH + 12 < window.innerHeight : false;
  /* 🔴 <md 는 바텀 시트라 «항상 화면 아래»에 선다 — 그래서 대상이 아래쪽에 있으면 시트가
     그 위에 앉는다(리바이2 34대 실측 390 스텝 2: 대상의 100% 가 덮여 링이 아예 안 보였다).
     scrollIntoView({block:'center'}) 로는 못 피한다: 대상이 화면 가운데 와도 시트는 여전히
     아래 200~300px 을 차지한다. 그래서 «시트를 반대편으로 보낸다» — 대상이 시트 자리와 겹칠
     높이면 위에 붙인다. 규격 ⑤ 의 목적은 「하단에 붙는 것」이 아니라 «대상을 보여 주며
     설명하는 것»이다. */
  /* 🔴 단 «대상이 화면보다 클 때»는 뒤집지 않는다. 뒤집기는 대상이 시트보다 작을 때만
     통한다 — 목록 컨테이너처럼 대상이 뷰포트를 거의 채우면 시트를 어디 두어도 겹치고, 그때
     위로 보내면 «머리»(상단 1/3 · 사람이 먼저 읽는 곳)를 덮는다. 리바이2 34대 실측 390 스텝 4:
     전체 덮임은 23.4→23.3 으로 그대로인데 머리 덮임은 **0% → 69.9%** 로 악화했다. 하단에
     남으면 꼬리만 가린다. 같은 처방이 한 기준에서는 개선이고 다른 기준에서는 악화였다. */
  const targetFillsViewport = hole ? hole.height > window.innerHeight - calloutH - 24 : false;
  const sheetGoesTop = hole
    ? !targetFillsViewport && hole.top + hole.height > window.innerHeight - calloutH - 24
    : false;
  /* 🔴 좌표를 «인라인 값»이 아니라 «변수»로 넘긴다. 인라인 `top`/`width` 는 클래스보다
     세서 `max-md:top-auto`·`max-md:w-auto` 를 무력화한다 — 그러면 <md 에서 top 과 bottom 이
     «동시에» 고정돼 시트가 화면 높이의 66% 로 늘어나고, 그 몸통이 가리켜야 할 대상을 덮는다
     (리바이2 34대 실측 390: 스텝 2 에서 대상의 98.4% 를 덮음 · 1440 은 0%). 변수로 넘기면
     데스크톱은 그대로 좌표를 쓰고, <md 에서는 미디어쿼리가 이겨 진짜 바텀 시트가 된다. */
  /* 🔴 **가로 자리를 «고르게» 한다.** 앞판은 가로가 대상의 left 하나로 고정이라 선택지가
     없었고, 그 자리에 무엇이 있든 그대로 덮었다 — 실측(2026-09-03 · 공개면 9단계 전수):
     **8/9 스텝에서 「읽는 것」을 가렸다**(KPI 값·알람 ID·원인 후보 이름 · 100% 덮인 것 다수).
     🔴 정적 규칙(항상 반대편 등)으로는 못 닫는다. step5 는 0건인데 step6~9 는 «거의 같은
        자리»에서 6~10건이다 — 자리가 안전했던 게 아니라 그 시점에 그 자리가 비어 있었고,
        조사가 진행되면 같은 영역이 후보 카드로 채워진다. 화면이 시간에 따라 채워지므로
        「어느 쪽이 안전한가」는 미리 못 정한다. 그래서 **그때 보고 고른다.**
     🔴 **«지목한 대상»을 덮지 않는 것이 «글자를 덜 덮는 것»보다 앞선다**(규격 ⑧-8).
        앞판은 이 순위가 없어서 «덜 덮는 쪽»만 봤고, 그 결과 대상 위에 그대로 앉는 걸음이 남았다
        (D-45 · 센쿠2 38대 실측 1440: 5번째 걸음에서 대상과 51,823px² 겹침).
     🔴 후보를 **둘에서 다섯으로** 넓힌다 — 앞판의 둘(대상에 붙이기 `anchor` / 대상 오른쪽
        `beside`)로는 **화면 오른쪽 끝에 붙은 대상에서 두 자리가 같은 값으로 클램프**된다. 실측:
        5번째 걸음의 `beside` 원자리 1436 → 상한 1068 로 눌려 `anchor`(1028)와 40px 차가 되고,
        도크 글자 블록이 콜아웃보다 가로로 넓어 **덮은 넓이가 20,789 로 정확히 같았다**(비율 1.000).
        🔴 그래서 **문턱(0.8) 을 아무리 낮춰도 안 뒤집힌다** — 문턱이 아니라 후보가 좁았다.
     🔴 넓히되 **전방위 탐색은 여전히 안 한다.** 대상에 붙는 세 자리(`anchor`·`beside`·`before`)를
        먼저 보고, 거기에 안 덮는 자리가 없을 때만 화면 양 끝을 쓴다. 사유: 안 덮는 자리 중
        «글자를 가장 덜 덮는» 곳이 5번째 걸음에서는 `left=12`(312px²)인데 **대상은 x=1028** 이다 —
        규격 순위만 따르면 **가리키는 것에서 1,000px 떨어진 자리**가 뽑힌다. 안내는 대상 곁에 선다.
     🔴 **겹침 0 을 여전히 약속하지 않는다.** 안 덮는 후보가 하나도 없으면 «덜 덮는» 쪽으로
        떨어지고, 그 사실을 `data-tour-clear="no"` 로 남긴다 — 못 피한 것을 피한 척하지 않는다.
        덮은 넓이는 그대로 `data-tour-covered` 로 남는다.
     🔴 **경성 조건은 «불리언»이라 미세한 차이로 흔들리지 않는다** — 아래 «결정적» 조건과
        충돌하지 않는다. 안 덮는 후보끼리의 동점은 **후보 순서**로 깨서 결정적으로 만든다.
     🔴 **결정적이어야 한다.** 애니메이션 위상에 따라 자리가 흔들리면 재측의 판정선이 죽는다
        (검증이 `fkt-stagger` 8px 흔들림으로 겪은 자리). 그래서 «유의미하게 나을 때만» 비킨다
        — 미세한 차이로는 뒤집지 않는다. */
  const clampLeft = (x: number) =>
    Math.min(Math.max(12, x), Math.max(12, window.innerWidth - CALLOUT_W - 12));
  /* 🔴 자리 고르기 «규칙»은 `pick-placement.ts` 로 옮겼다 — 화면 없이 재기 위해서다(U-01~U-03).
     여기 남는 것은 «DOM 이 있어야 아는 값»(덮은 넓이)을 구해 넘기는 일뿐이다. */
  const [placement, setPlacement] = useState<TourPlacement | null>(null);
  const holeKey = hole ? `${hole.top}:${hole.left}:${hole.width}:${hole.height}` : "";
  /* 🔴 **자리를 고를 때 주변이 아직 안 와 있었다.** 진입 애니메이션(스태거)이 끝나기 전에는
     주변 카드가 제자리에 없어 두 후보 다 «덮는 게 적다»로 나오고, 그러면 anchor 가 이긴다.
     step1 이 그 자리였다 — 검증 실측(PR #496): 정착 뒤 같은 산식은 `14414 < 18575×0.8` 로
     beside 를 고른다. 즉 **처방이 자기 규칙을 못 지키는 자리**였다.
     대상이 안 움직이므로 `holeKey` 는 불변이고, 그래서 **재계산이 영영 안 온다.**

     🔴 **주변 내용을 deps 에 넣지 않는다.** 넣으면 화면이 변할 때마다 자리가 흔들려
     바로 위 성문의 «결정적» 조건이 죽고, 재측의 판정선도 같이 죽는다.
     대신 **«시점»을 하나 더 둔다** — 스텝이 열리고 정착한 뒤 **딱 한 번** 다시 고른다.
     매 프레임이 아니고 내용에 반응하지도 않는다 — 고정된 두 시점뿐이라 여전히 결정적이다.
     정착 = 스태거 최대 지연(280ms) + 진입 길이(`--fkt-dur-3` = 400ms) 뒤. */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setSettled(false);
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, [index, step.id]);
  useLayoutEffect(() => {
    if (!hole) {
      setPlacement(null);
      return;
    }
    const top = Number.parseFloat(String((style as Record<string, string>)["--tour-top"] ?? "0"));
    /* 후보 사각형이 «읽는 것»을 얼마나 덮는가. 빈 자리를 덮는 것은 결함이 아니므로
       직접 텍스트를 가진 «보이는» 요소만 센다(sr-only·1px·clip-path 는 사람이 못 본다). */
    const coverAt = (left: number) => {
      const box = { left, top, right: left + CALLOUT_W, bottom: top + calloutH };
      let sum = 0;
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        if (el.closest("[data-testid=\"tour-callout\"]") || el.closest("[data-testid=\"tour-spotlight\"]")) continue;
        if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim())) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
        if (cs.clipPath && cs.clipPath !== "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        sum +=
          Math.max(0, Math.min(box.right, r.right) - Math.max(box.left, r.left)) *
          Math.max(0, Math.min(box.bottom, r.bottom) - Math.max(box.top, r.top));
      }
      return Math.round(sum);
    };
    /* 앞의 세 자리 = 대상 곁 · 뒤의 두 자리 = 화면 양 끝(마지막 수단). 순서가 곧 우선순위다.
       🔴 «곁이냐»는 **후보 자신이 들고 있어야 한다.** 목록에서의 «순번»으로 판정하면, 앞의
       후보가 중복으로 빠진 걸음에서 화면 끝이 세 번째로 올라와 «곁»으로 둔갑한다 — 실측
       (센쿠2 38대 · 1440 · 2·3번째 걸음): `beside` 가 `anchor` 와 같은 값으로 클램프돼 빠지자
       `edge-start`(x=12) 가 뽑혀, 대상이 x=1068 인데 말풍선이 화면 왼쪽 끝에 섰다. */
    setPlacement(
      pickPlacement({ hole, top, calloutW: CALLOUT_W, calloutH, viewportW: window.innerWidth, coverAt }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, step.id, calloutH, holeKey, settled]);

  const style: React.CSSProperties = hole
    ? ({
        "--tour-top": `${
          /* 🔴 데스크톱 좌표 경로에도 «대상이 화면을 채우면 위로 올리지 않는다»를 건다.
             `max-md` 쪽에만 넣었더니 1440 은 그 경로를 안 타서 값이 한 자리도 안 움직였다
             (리바이2 34대: 머리 덮임 49.9% → 49.9%). 대상이 크면 `fitsBelow` 가 거짓이 되어
             `top` 이 12 로 떨어지는데, 그 대상은 화면 위쪽부터 시작하므로 «머리»를 덮는다.
             아래에 두면 꼬리만 가린다 — 390 에서 이미 그 자리로 착지시킨 규칙이다. */
          targetFillsViewport
            ? Math.max(12, window.innerHeight - calloutH - 12)
            : fitsBelow
              ? below
              : Math.max(12, hole.top - calloutH - 12)
        }px`,
        "--tour-left": `${placement?.left ?? clampLeft(hole.left)}px`,
      } as React.CSSProperties)
    : {};

  return (
    <>
      {/* 딤 + 구멍 — 클릭은 통과한다(pointer-events:none) */}
      {hole && (
        <div
          /* 🔴 링 굵기는 클래스로 둔다(인라인 outline 은 미디어쿼리를 못 탄다) — 규격 ④-6
             「모션을 줄인 사람에게는 pulse 대신 «정지 링 3px»」. 움직임을 뺀 자리를 굵기로 갚는다. */
          className="pointer-events-none fixed z-40 rounded-card outline-2 motion-reduce:outline-[3px] transition-all duration-(--fkt-dur-3) ease-spring"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            boxShadow: "0 0 0 9999px var(--fkt-scrim)",
            outlineStyle: "solid",
            outlineColor: "var(--fkt-tint)",
            outlineOffset: 0,
          }}
          aria-hidden
          data-testid="tour-spotlight"
        />
      )}

      <section
        className={`fkt-card fkt-sheet fixed z-50 p-5 shadow-2 ${
          hole
            ? `top-[var(--tour-top)] left-[var(--tour-left)] w-[360px] max-md:inset-x-3 max-md:w-auto ${
                sheetGoesTop ? "max-md:top-3 max-md:bottom-auto" : "max-md:top-auto max-md:bottom-3"
              }`
            : isWelcome
              ? /* 🔴 환영 카드만 «화면 중앙»이다. 대상이 없는 다른 스텝(완료 등)은 있던
                   자리(우하단)에 그대로 둔다 — 가운데로 옮기면 그 스텝들이 새로 덮는다.
                   <md 는 규격 ⑤ 대로 바텀 시트를 유지한다. */
                "inset-x-3 bottom-3 md:inset-x-auto md:top-1/2 md:bottom-auto md:left-1/2 md:w-[360px] md:-translate-x-1/2 md:-translate-y-1/2"
              : "inset-x-3 bottom-3 md:right-5 md:left-auto md:w-[360px]"
        }`}
        ref={calloutRef}
        style={hole ? style : undefined}
        data-tour-placement={placement?.side ?? "anchor"}
        data-tour-covered={placement?.covered ?? ""}
        /* 🔴 «안 덮는 자리를 찾았는가»를 값으로 남긴다 — 못 찾은 경우를 셀 수 있어야 한다. */
        data-tour-clear={placement ? (placement.clear ? "yes" : "no") : ""}
        role="region"
        aria-label="가이드 투어"
        aria-live="polite"
        data-testid="tour-callout"
        data-step={step.id}
        data-index={index}
      >
        <p
          ref={titleRef}
          tabIndex={-1}
          className="text-body font-semibold tracking-[-0.01em] outline-none"
          data-testid="tour-title"
        >
          {step.title}
        </p>
        {/* 🔴 **꼬리는 «본문과 같은 문단»에 붙는다**(T7-39 · 요소 신규 0). 새 `<p>` 를 세우면
            그 자리가 다른 걸음에서도 자리를 차지하고, 말풍선 높이 계산(`calloutH`)이 걸음마다
            달라진다 — 배치 규칙이 이미 그 높이 위에 서 있다.
            🔴 `online:false` «로 확인된» 회차만 뒷문장을 바꾼다. 확인 중·미연결은 「모르는」
            상태라, 그때 「지금은 재생 모드입니다」라고 적으면 화면이 모르는 것을 말한다. */}
        <p
          className="mt-2 text-foot leading-relaxed text-muted"
          data-tour-note={note ? (noteOffline ? "replay-offline" : "replay") : undefined}
        >
          {step.body}
          {note ? ` ${note}` : ""}
        </p>

        {!onRoute && (
          <p className="mt-3 rounded-chip bg-inset px-3 py-2 text-foot text-warn">
            이 단계는 다른 화면에서 이어집니다. 아래 버튼으로 이동해 주세요.
          </p>
        )}
        {missing && onRoute && (
          <p className="mt-3 rounded-chip bg-inset px-3 py-2 text-foot text-warn" data-testid="tour-target-missing">
            이 화면에서 가리킬 자리를 찾지 못했습니다. 데이터가 아직 오지 않았거나 지금 상태에는
            없는 요소입니다. 건너뛰고 계속하실 수 있습니다.
          </p>
        )}

        <div className="mt-4 flex items-center gap-3">
          {/* 진행 점 — 현재 점만 크고, 지난 점은 채운다(규격 ④-4) */}
          <div className="flex items-center gap-1" data-testid="tour-progress" aria-hidden>
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={`rounded-pill transition-all duration-(--fkt-dur-2) ${
                  i === index
                    ? "fkt-pop h-1.5 w-4 bg-ai"
                    : i < index
                      ? "h-1.5 w-1.5 bg-ai/70"
                      : "h-1.5 w-1.5 bg-fill"
                }`}
              />
            ))}
          </div>
          <span className="text-cap text-placeholder">
            {index + 1}/{total}
          </span>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onSkip}
              className="rounded-pill px-2.5 py-1 text-foot text-placeholder hover:text-muted"
              data-testid="tour-skip"
            >
              건너뛰기
            </button>
            {plan.ui === "link" ? (
              <button
                type="button"
                onClick={() => onGoto(plan.to)}
                className="fkt-btn fkt-btn-primary rounded-pill px-4 text-foot"
                data-testid="tour-goto"
              >
                {plan.label}
              </button>
            ) : plan.ui === "await" && !missing ? (
              <span className="fkt-pill text-ai" data-testid="tour-await-click">
                직접 눌러 보세요
              </span>
            ) : (
              <button
                type="button"
                onClick={onNext}
                className="fkt-btn fkt-btn-primary rounded-pill px-4 text-foot"
                data-testid="tour-next"
              >
                다음
              </button>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
