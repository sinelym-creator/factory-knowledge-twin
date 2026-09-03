"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { TOUR_STEPS, TOUR_TOTAL, type TourStep } from "@/components/tour/tour-steps";
import { TourOverlay } from "@/components/tour/tour-overlay";

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

type TourStatus = "never" | "active" | "done" | "skipped";
type TourState = { v: 1; status: TourStatus; step: number };

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
    const status: TourStatus =
      parsed.status === "active" || parsed.status === "done" || parsed.status === "skipped"
        ? parsed.status
        : "never";
    return { v: 1, status, step };
  } catch {
    return INITIAL;
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

  useEffect(() => {
    const loaded = readState();
    // `?tour=1` 로 들어오면 «다시 보기»다 — 끝냈거나 건너뛴 사람도 열 수 있어야 한다(규격 ①-3).
    if (wants && loaded.status !== "active") {
      const resumed: TourState = { v: 1, status: "active", step: loaded.status === "done" ? 0 : loaded.step };
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
      if (next.status !== "active") clearTourParam();
    },
    [clearTourParam],
  );

  const step: TourStep | null =
    state?.status === "active" ? (TOUR_STEPS[state.step] ?? null) : null;

  const advance = useCallback(() => {
    if (!state) return;
    const at = state.step + 1;
    if (at >= TOUR_TOTAL) {
      commit({ v: 1, status: "done", step: TOUR_TOTAL - 1 });
      return;
    }
    commit({ v: 1, status: "active", step: at });
  }, [state, commit]);

  const stop = useCallback(
    (how: "skipped" | "done") => {
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
      if (e.key === "Escape") stop("skipped");
      // Enter = 다음(읽는 스텝만) — 입력 요소 안에서는 가만히 있는다.
      if (e.key === "Enter" && step.advance.kind === "next") {
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
    if (!step || step.advance.kind !== "click" || !step.target) return;
    const sel = `[data-testid="${step.target}"]`;
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
        commit({ v: 1, status: last ? "done" : "active", step: last ? TOUR_TOTAL - 1 : at });
      }
      router.push(href);
    },
    [state, commit, router],
  );

  if (!state) return null;

  // 초대 카드 — 아직 한 번도 안 본 사람이 overview 에 있을 때만(막지 않는다 · 규격 ①-3).
  if (state.status === "never") {
    if (!pathname.startsWith("/overview")) return null;
    return (
      <TourOverlay
        mode="invite"
        onStart={() => commit({ v: 1, status: "active", step: 0 })}
        onLater={() => setState({ ...state, status: "never" })}
        onNever={() => commit({ v: 1, status: "skipped", step: 0 })}
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
      onSkip={() => stop("skipped")}
      onGoto={goto}
    />
  );
}
