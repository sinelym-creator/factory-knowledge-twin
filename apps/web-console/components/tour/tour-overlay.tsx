"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import type { TourStep } from "@/components/tour/tour-steps";

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

export function TourOverlay(props: Props) {
  if (props.mode === "invite") {
    return (
      /* 🔴 **떠 있는 카드를 문서 흐름으로 내렸다**(검증 좌석 실측: `fixed` 우하단 카드가
         첫 방문 화면에서 알람 독·안내 카드·설비 카드와 **6쌍씩 겹쳤다** — 1280·1440·tablet·1920).
         「막지 않는다」는 원칙은 «클릭을 막지 않는다»였는데, 겹침은 그와 별개로 **보이는 것을
         가린다**. 배너 형태면 둘 다 지킨다: 아무것도 가리지 않고, 배경도 그대로 조작된다. */
      <aside
        className="fkt-card fkt-rise mx-auto mt-5 flex w-full max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-3 px-5 py-4"
        data-testid="tour-invite"
        aria-label="가이드 투어 안내"
      >
        <div className="min-w-0 flex-1">
          <p className="text-body-c font-semibold">둘러보시겠습니까?</p>
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
            둘러보기 시작
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
            className="rounded-pill px-2 py-1 text-foot text-placeholder hover:text-muted"
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

  useEffect(() => {
    titleRef.current?.focus();
  }, [index]);

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
  const below = hole ? hole.top + hole.height + 12 : 0;
  const fitsBelow = hole ? below + 220 < window.innerHeight : false;
  /* 🔴 좌표를 «인라인 값»이 아니라 «변수»로 넘긴다. 인라인 `top`/`width` 는 클래스보다
     세서 `max-md:top-auto`·`max-md:w-auto` 를 무력화한다 — 그러면 <md 에서 top 과 bottom 이
     «동시에» 고정돼 시트가 화면 높이의 66% 로 늘어나고, 그 몸통이 가리켜야 할 대상을 덮는다
     (리바이2 34대 실측 390: 스텝 2 에서 대상의 98.4% 를 덮음 · 1440 은 0%). 변수로 넘기면
     데스크톱은 그대로 좌표를 쓰고, <md 에서는 미디어쿼리가 이겨 진짜 바텀 시트가 된다. */
  const style: React.CSSProperties = hole
    ? ({
        "--tour-top": `${fitsBelow ? below : Math.max(12, hole.top - 232)}px`,
        "--tour-left": `${Math.min(Math.max(12, hole.left), Math.max(12, window.innerWidth - CALLOUT_W - 12))}px`,
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
            ? "top-[var(--tour-top)] left-[var(--tour-left)] w-[360px] max-md:inset-x-3 max-md:top-auto max-md:bottom-3 max-md:w-auto"
            : "inset-x-3 bottom-3 md:right-5 md:left-auto md:w-[360px]"
        }`}
        style={hole ? style : undefined}
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
        <p className="mt-2 text-foot leading-relaxed text-muted">{step.body}</p>

        {!onRoute && (
          <p className="mt-3 rounded-chip bg-inset px-3 py-2 text-foot text-warn">
            이 단계는 다른 화면에서 이어집니다 — 아래 버튼으로 이동하세요.
          </p>
        )}
        {missing && onRoute && (
          <p className="mt-3 rounded-chip bg-inset px-3 py-2 text-foot text-warn" data-testid="tour-target-missing">
            이 화면에서 가리킬 자리를 찾지 못했습니다 — 데이터가 아직 오지 않았거나 이 상태에는
            없는 요소입니다. 건너뛰고 계속할 수 있습니다.
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
            {step.advance.kind === "link" ? (
              <button
                type="button"
                onClick={() => onGoto(step.advance.kind === "link" ? step.advance.href : "/overview")}
                className="fkt-btn fkt-btn-primary rounded-pill px-4 text-foot"
                data-testid="tour-goto"
              >
                {step.advance.kind === "link" ? step.advance.label : "다음"}
              </button>
            ) : step.advance.kind === "click" && !missing ? (
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
