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
     🔴 후보는 **둘뿐이다**(대상에 붙이기 / 대상 옆으로 비키기). 전방위 탐색을 하지 않는다 —
        복잡도가 값을 넘는다.
     🔴 **겹침 0 을 약속하지 않는다.** 둘 다 가리면 «덜 가리는» 쪽을 고르고, 얼마나 가렸는지를
        `data-tour-covered` 로 남긴다 — 못 피한 것을 피한 척하지 않는다.
     🔴 **결정적이어야 한다.** 애니메이션 위상에 따라 자리가 흔들리면 재측의 판정선이 죽는다
        (검증이 `fkt-stagger` 8px 흔들림으로 겪은 자리). 그래서 «유의미하게 나을 때만» 비킨다
        — 미세한 차이로는 뒤집지 않는다. */
  const clampLeft = (x: number) =>
    Math.min(Math.max(12, x), Math.max(12, window.innerWidth - CALLOUT_W - 12));
  const [placement, setPlacement] = useState<{ left: number; side: "anchor" | "beside"; covered: number } | null>(
    null,
  );
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
    const anchorLeft = clampLeft(hole.left);
    const besideLeft = clampLeft(hole.left + hole.width + 12);
    const a = coverAt(anchorLeft);
    /* 같은 자리로 클램프되면 후보가 하나뿐이다 — 재계산하지 않는다. */
    const b = besideLeft === anchorLeft ? a : coverAt(besideLeft);
    const beside = b < a * 0.8;
    setPlacement(
      beside
        ? { left: besideLeft, side: "beside", covered: b }
        : { left: anchorLeft, side: "anchor", covered: a },
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
