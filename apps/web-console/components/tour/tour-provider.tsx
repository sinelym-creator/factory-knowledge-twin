"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TOUR_STEPS, TOUR_TOTAL, readAdvance, type TourStep } from "@/components/tour/tour-steps";
import { TourOverlay } from "@/components/tour/tour-overlay";
import { TOUR_OPEN_EVENT } from "@/components/tour/tour-reopen";

/**
 * T6-5 가이드 투어 — 상태와 진행(정본 = `docs/design/t6-5-guided-tour-spec.md` ③).
 *
 * 🔴 **OFF 일 때 렌더가 0 이다**(규격 ⑤ · 폐하 09-03 13:46 「OFF = 평상시 직접 조작」).
 *    초대 카드와 오버레이는 상태가 그것을 요구할 때만 트리에 든다 — 투어를 안 켠 사람의
 *    화면에는 이 기능이 «없다». 그래서 기존 e2e 가 이 파일 때문에 흔들리지 않는다.
 *
 * 🔴 **상태는 브라우저에만 산다**(`localStorage` `fkt.tour.v1`). 서버·계약 무접촉이고,
 *    읽기는 마운트 «뒤»에 한 번 한다 — 렌더 중에 읽으면 서버(모름)와 브라우저(앎)가 다른
 *    트리를 내 하이드레이션이 갈린다(D-2 와 같은 병). 그래서 첫 페인트에는 아무것도 없다.
 * 🔴 **저장은 전부 try/catch** — 사생활 모드에서 던지는데, 튜토리얼 하나 때문에 콘솔이
 *    죽는 것은 실패 방향이 틀렸다. 못 적으면 이 탭에서만 진행이 안 남는다.
 *
 * 🔴 **화면을 넘나드는 스텝은 «클릭이 곧 이동»이다.** 클릭 스텝은 진행을 저장한 «뒤» 이동이
 *    일어나야 한다 — 새 화면에서 컴포넌트가 다시 마운트되면 메모리 상태는 사라지고 저장소만
 *    남기 때문이다. 그래서 클릭 감지는 capture 단계에서 듣고 즉시 저장한다.
 */

/* 🔴 5상태(규격 ⑧-2 · D-38). 앞판의 4상태는 **「잠깐 끊기」와 「다시 보지 않기」가
   같은 `skipped` 로 접혔다** — 둘 다 초대 카드가 «영구히» 사라졌다.
   규칙 ① **사용자가 명시적으로 고르지 않은 것은 영구가 아니다** — Esc 는 의사 표시가 아니라
   탈출 키다. ② `dismissed` 는 단계를 기억한다(1단계부터면 다시 끊는다). */
type TourStatus = "never" | "running" | "dismissed" | "suppressed" | "completed";
type TourState = { v: 1; status: TourStatus; step: number };

/** 재개 지점 — 「이어서」는 `running`·`dismissed` 뿐이고 나머지는 1단계다(⑧-2 표). */
function resumeStepOf(loaded: TourState): number {
  return loaded.status === "running" || loaded.status === "dismissed" ? loaded.step : 0;
}

const KEY = "fkt.tour.v1";
const INITIAL: TourState = { v: 1, status: "never", step: 0 };

function readState(): TourState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<TourState>;
    // 🔴 «모르는 형태»를 고쳐 쓰지 않는다 — 버전이 다르면 처음으로 돌린다(잘못 읽은 값으로
    //    투어가 엉뚱한 스텝에서 열리는 것보다, 처음부터 여는 쪽이 덜 틀린다).
    if (parsed.v !== 1) return INITIAL;
    const step = typeof parsed.step === "number" ? Math.min(Math.max(parsed.step, 0), TOUR_TOTAL - 1) : 0;
    return { v: 1, status: migrate(parsed.status), step };
  } catch {
    return INITIAL;
  }
}

/* 🔴 **저장된 `skipped` 는 어느 쪽인지 알 수 없다** — 그래서 «보수적으로» `dismissed` 다.
   틀렸을 때 최악이 「초대 카드가 한 번 더 뜸」이고 반대는 「영구히 못 봄」이라 **비대칭**이다
   (⑧-2 이관 규칙). 저장 키를 올리지 «않는» 이유도 같다 — 올리면 저장분이 통째로 `never` 가
   되어 끝까지 본 사람에게도 초대가 다시 뜬다. */
function migrate(raw: unknown): TourStatus {
  switch (raw) {
    case "never":
    case "running":
    case "dismissed":
    case "suppressed":
    case "completed":
      return raw;
    case "active":
      return "running";
    case "done":
      return "completed";
    case "skipped":
      return "dismissed";
    default:
      return "never";
  }
}

function writeState(next: TourState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 못 적으면 이 탭 안에서만 진행이 유지된다 — 조용히 실패하되 화면은 살아 있다.
  }
}

export function TourProvider() {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const wants = params.get("tour") === "1";

  /** null = 아직 저장소를 안 읽었다(첫 페인트) — 그동안 아무것도 그리지 않는다. */
  const [state, setState] = useState<TourState | null>(null);
  /* 「나중에」 = 이 탭에서만 접는다. 저장으로 남기면 «명시적으로 고르지 않은 것»이 영구가 된다. */
  const [laterHidden, setLaterHidden] = useState(false);

  useEffect(() => {
    const loaded = readState();
    // `?tour=1` 로 들어오면 «다시 보기»다 — 끝냈거나 건너뛴 사람도 열 수 있어야 한다(규격 ①-3).
    if (wants && loaded.status !== "running") {
      const resumed: TourState = { v: 1, status: "running", step: resumeStepOf(loaded) };
      writeState(resumed);
      setState(resumed);
      return;
    }
    setState(loaded);
  }, [wants]);

  /* 🔴 «투어는 꺼졌는데 URL 은 켜졌다고 말하는» 상태를 남기지 않는다.
     `?tour=1` 이 붙은 채 Esc 로 끊으면, 앱바 `?`(= `/overview?intro=1&tour=1`)를 다시 눌러도
     `wants` 가 true→true 라 아래 effect 의 deps 가 움직이지 않는다 — 리마운트가 없는 회차에는
     메모리의 `skipped` 가 그대로 남아 «재개가 렌더 0 으로 끝난다»(리바이2 34대 실측: 3회 중 2회
     안 열림 · 새로고침 열만 100% 열림 = 마운트가 강제되기 때문). 저장(step)은 원래도 멀쩡했다
     — 깨진 것은 «표시 경로»였다. 상태가 active 를 벗어나는 자리에서 URL 도 함께 끄면, 다음 `?`
     클릭이 «항상» false→true 전이가 되어 재개가 결정적으로 열린다. */
  const clearTourParam = useCallback(() => {
    if (!wants) return;
    const rest = new URLSearchParams(params.toString());
    rest.delete("tour");
    const qs = rest.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [wants, params, pathname, router]);

  const commit = useCallback(
    (next: TourState) => {
      writeState(next);
      setState(next);
      if (next.status !== "running") clearTourParam();
    },
    [clearTourParam],
  );

  /* 🔴 URL 말고 «이벤트»로도 열린다 — 앱바 `?` 는 같은 pathname 안에서 쿼리만 붙는
     이동이라 3회 중 2회 `location` 이 안 바뀐다(리바이2 34대 귀속 6런: 클릭은 6/6 닿았고
     직접 이동은 4/4 열렸다 = 이동만 안 일어난다). 열기를 이동에만 매달아 두면 «사람이 가장
     자연스럽게 누르는 자리»가 아무 반응이 없다. 그래서 두 경로를 둔다: 이동이 되면 URL 이
     열고, 안 되면 이 리스너가 연다. 둘 다 같은 자리에 착지한다(끝냈으면 처음부터·아니면 이어서). */
  useEffect(() => {
    const onOpen = () => {
      const loaded = readState();
      commit({ v: 1, status: "running", step: resumeStepOf(loaded) });
    };
    window.addEventListener(TOUR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, onOpen);
  }, [commit]);

  const step: TourStep | null =
    state?.status === "running" ? (TOUR_STEPS[state.step] ?? null) : null;

  const advance = useCallback(() => {
    if (!state) return;
    const at = state.step + 1;
    if (at >= TOUR_TOTAL) {
      commit({ v: 1, status: "completed", step: TOUR_TOTAL - 1 });
      return;
    }
    commit({ v: 1, status: "running", step: at });
  }, [state, commit]);

  const stop = useCallback(
    (how: "dismissed" | "completed") => {
      if (!state) return;
      commit({ v: 1, status: how, step: state.step });
      /* 🔴 끊고 나면 포커스를 «왔던 자리»로 돌려놓는다 — 앱바의 `?`(재개 링크)다.
         오버레이가 사라질 때 포커스가 있던 요소도 함께 사라지므로, 두지 않으면 브라우저가
         포커스를 문서 맨 앞(`body`)으로 떨어뜨린다(리바이2 34대 실측: Esc 3회 전부 `body`).
         키보드만 쓰는 사람에게 그것은 「방금 있던 자리로 돌아가려면 Tab 을 처음부터 다시
         밟아라」와 같다 — 규격 ⑤ 「Esc = 종료(포커스 = `?` 링크로 복귀)」의 명문이다.
         🔴 언마운트가 «끝난 뒤»에 옮겨야 해서 다음 프레임에서 잡는다(같은 틱에 부르면
         사라지는 오버레이가 포커스를 도로 가져간다). */
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => {
          const back = document.querySelector('[data-testid="intro-reopen"]');
          if (back instanceof HTMLElement) back.focus();
        });
      }
    },
    [state, commit],
  );

  /* Esc = 언제든 종료(규격 ⑤) — 진행은 남는다. 🔴 `keydown` 이 아니라 `keyup` 을 쓰지 않는다:
     모달·시트가 같은 키를 보는 화면이 있어 capture 로 먼저 잡되 전파는 막지 않는다(투어가
     다른 것의 Esc 를 삼키면, 사람은 닫으려던 것이 안 닫히는 화면을 만난다). */
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => {
      /* 🔴 Esc 는 «잠깐 끊음»이다 — 영구가 아니다(⑧-2 규칙 ①). 앞판은 여기서 `skipped` 로
         굳혀 초대 카드를 영영 못 보게 만들었다. */
      if (e.key === "Escape") stop("dismissed");
      // Enter = 다음(읽는 스텝만) — 입력 요소 안에서는 가만히 있는다.
      if (e.key === "Enter" && readAdvance(step).ui === "next") {
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea" && tag !== "select" && tag !== "button" && tag !== "a") {
          advance();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, stop, advance]);

  /* 「직접 클릭」 스텝 — 대상 «안»에서 일어난 클릭만 진행으로 센다.
     🔴 capture 로 듣고 «즉시» 저장한다: 그 클릭이 라우팅을 일으키면 이 컴포넌트는 다음
        화면에서 새로 마운트되고, 그때 남아 있는 것은 저장소뿐이다. */
  useEffect(() => {
    if (!step) return;
    const plan = readAdvance(step);
    if (plan.ui !== "await" || plan.on !== "click") return;
    const sel = `[data-testid="${plan.of}"]`;
    const onClick = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest(sel)) advance();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, advance]);

  const onRoute = useMemo(() => (step ? pathname.startsWith(step.route) : true), [step, pathname]);

  const goto = useCallback(
    (href: string) => {
      // 링크 스텝은 «이동 전에» 진행을 저장한다(위와 같은 이유).
      if (state) {
        const at = Math.min(state.step + 1, TOUR_TOTAL - 1);
        const last = state.step + 1 >= TOUR_TOTAL;
        commit({ v: 1, status: last ? "completed" : "running", step: last ? TOUR_TOTAL - 1 : at });
      }
      router.push(href);
    },
    [state, commit, router],
  );

  if (!state) return null;

  /* 초대 카드 — overview 에서만(막지 않는다 · 규격 ①-3).
     🔴 `dismissed` 에도 «보인다»(⑧-2 표) — 잠깐 끊은 사람에게 돌아갈 길이 있어야 한다.
        앞판은 Esc 한 번으로 이 카드가 영영 사라졌다. `suppressed`·`completed` 는 숨긴다. */
  if (state.status === "never" || state.status === "dismissed") {
    if (!pathname.startsWith("/overview") || laterHidden) return null;
    const resume = state.status === "dismissed";
    return (
      <TourOverlay
        mode="invite"
        resume={resume}
        onStart={() => commit({ v: 1, status: "running", step: resume ? state.step : 0 })}
        /* 「나중에」는 «이 탭에서만» 접는다 — 저장을 건드리면 그게 곧 영구가 된다. */
        onLater={() => setLaterHidden(true)}
        onNever={() => commit({ v: 1, status: "suppressed", step: 0 })}
      />
    );
  }

  if (!step) return null;

  return (
    <TourOverlay
      mode="step"
      step={step}
      index={state.step}
      total={TOUR_TOTAL}
      onRoute={onRoute}
      onNext={advance}
      onSkip={() => stop("dismissed")}
      onGoto={goto}
    />
  );
}
