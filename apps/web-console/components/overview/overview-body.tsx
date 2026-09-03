"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { Sparkline } from "@/components/overview/sparkline";
import { StartInvestigation } from "@/components/overview/start-investigation";
import type { ActiveAlarm, Overview, OverviewEquipment, Scenario } from "@/lib/contract";
import { TZ_LABEL, clock, stamp } from "@/lib/time";

/**
 * ① Overview 본문 (wireframes §1) — 재수립본(폐하 09-03 14:24 「디자인·레이아웃 다시」).
 *
 * 🔴 **레이아웃 원칙 = 화면마다 «하나의 주인공»**. 이 화면의 주인공은 지표가 아니라 «지금 무슨
 *    일이 났는가»라는 문장이다. 그래서 순서가 바뀌었다: 큰 헤드라인 문장 + 조사 시작 → KPI 4카드
 *    → 설비 그리드 + 알람 독. 앞판은 작은 글자 한 줄로 시작해 무엇을 먼저 봐야 할지 말하지
 *    않았다(폐하 14:24 「내용 구성이 아니라 디자인이 문제 · 레이아웃도 더 신경」).
 * 🔴 **분리는 테두리가 아니라 표면 밝기 차로 한다.** 선은 «같은 카드 안 리스트 행» 사이에만
 *    남는다(`.fkt-rows`) — 모든 면에 1px 을 두르는 것이 「애플 아님」의 1번 신호였다.
 * 🔴 **상태는 색«만»으로 말하지 않는다**(§10 · baseline §11.3): 점 색 + 도형(●▲■) + 글자를
 *    함께 쓴다. 색각 이상에서 색만 다른 두 카드는 같은 카드다. 재설계에서도 이 규율은 그대로다 —
 *    도형은 «장식»이 아니라 문구의 일부라 SVG 로 바꾸지 않았다(선형 아이콘은 내비·액션에만).
 * 🔴 **모르는 status를 «정상»으로 접지 않는다.** SSOT enum이 늘면 여기가 먼저 모르게 되는데,
 *    그때 조용히 ●(정상)로 그리면 이상한 설비가 멀쩡해 보인다 — 모르면 ■로 세우고 원문을
 *    툴팁에 남긴다(눈에 보이는 쪽으로 틀린다).
 */
const STATUS_MARK: Record<string, { icon: string; tone: string; label: string }> = {
  normal: { icon: "●", tone: "text-ok", label: "정상" },
  warning: { icon: "▲", tone: "text-warn", label: "주의" },
};
const UNKNOWN_MARK = { icon: "■", tone: "text-danger", label: "알 수 없음" };

function markOf(status: string) {
  return STATUS_MARK[status] ?? { ...UNKNOWN_MARK, label: `알 수 없음(${status})` };
}

/**
 * 알람 severity — 🔴 **색«만»으로 가르지 않는다**(§10 · baseline §11.3 · 회부 R-2).
 *
 * 같은 화면의 설비 카드는 ●▲■ 를 지키는데 알람 도크만 `▲` 고정이었다 — 색각 이상에서는
 * 네 줄이 전부 같은 줄로 보였다. 두 자리가 «같은 규칙»을 쓰도록 표를 나란히 둔다.
 * 🔴 모르는 severity 를 낮은 쪽으로 접지 않는다(설비 카드의 `UNKNOWN_MARK` 와 같은 축) —
 *    enum 이 늘면 여기가 먼저 모르게 되고, 그때 조용히 ● 로 그리면 위험이 정보로 보인다.
 */
const SEVERITY_MARK: Record<string, { icon: string; tone: string; label: string }> = {
  critical: { icon: "■", tone: "text-danger", label: "위험" },
  warning: { icon: "▲", tone: "text-warn", label: "주의" },
  info: { icon: "●", tone: "text-muted", label: "정보" },
};

function severityMark(severity: string) {
  return SEVERITY_MARK[severity] ?? { ...UNKNOWN_MARK, label: `알 수 없음(${severity})` };
}

/** 안내 카드 «세션 상태» 기록 자리 — wireframes §0.1 ①.
 *
 * 🔴 `localStorage` 가 아니다(정본 명문). 브라우저 수명 내내 남는 저장소에 적으면 「세션의
 *    첫 진입」이 「이 브라우저의 첫 진입」이 되어 세션 격리와 어긋난다. `sessionStorage` 는
 *    탭 수명이고, 키에 sessionId 를 넣어 «다른 세션이면 다시 본다»를 만든다.
 * 🔴 저장소 접근은 전부 try/catch 다 — 사생활 모드·차단 설정에서 던지는데, 안내 카드 하나
 *    때문에 화면 전체가 죽는 것은 실패 방향이 틀렸다.
 */
const INTRO_KEY = (sessionId: string | null) => `fkt.intro.seen:${sessionId ?? "anon"}`;

function introSeen(sessionId: string | null): boolean {
  try {
    return window.sessionStorage.getItem(INTRO_KEY(sessionId)) === "1";
  } catch {
    // 읽지 못하면 «안 봤다»로 친다 — 처음 온 사람에게 안내가 안 뜨는 쪽보다 낫다.
    return false;
  }
}

function markIntroSeen(sessionId: string | null): void {
  try {
    window.sessionStorage.setItem(INTRO_KEY(sessionId), "1");
  } catch {
    // 못 적으면 다음 진입에 다시 뜬다 — 조용히 실패하되 화면은 살아 있다.
  }
  for (const l of introListeners) l();
}

/** `useSyncExternalStore` 구독자 — 저장소에 적은 사실을 화면이 «즉시» 알게 한다. */
const introListeners = new Set<() => void>();
function subscribeIntro(onChange: () => void): () => void {
  introListeners.add(onChange);
  return () => introListeners.delete(onChange);
}

export function OverviewBody({
  plantName,
  overview,
  scenarios,
  sessionId,
  sessionOrigin,
  headline,
  receivedAt,
  forceIntro,
}: {
  plantName: string;
  overview: Overview;
  scenarios: Scenario[];
  sessionId: string | null;
  sessionOrigin: string | null;
  headline: { text: string; alarmId: string | null; equipmentId: string | null };
  /** 🔴 «서버가 이 응답을 그린 순간» — 렌더 안에서 `new Date()` 를 부르지 않는 이유는
   *  lib/time.ts 머리말에 있다(D-2). 값이 prop 이라 SSR·하이드레이션이 같은 글자를 낸다. */
  receivedAt: string;
  /** 앱바 「?」로 «명시적으로» 열고 들어온 진입(wireframes §0.1 ① 재노출). */
  forceIntro: boolean;
}) {
  const [lineFilter, setLineFilter] = useState<string | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  /* 🔴 **노출 여부를 «상태»가 아니라 «파생»으로 둔다.**
   *
   *   보였다 = 앱바 `?` 로 직접 열었거나(forceIntro) · 이 세션에서 아직 안 봤다(!seen)
   *
   * 앞판 D-1 의 병은 `useState(true)` 였다 — 마운트마다 참이라 새로고침도 재진입도 «첫
   * 진입»이었다. 그렇다고 초기값만 프롭으로 바꾸면 이번엔 재열람이 죽는다(실측): 앱바 `?`
   * 는 같은 라우트 안의 이동이라 React 가 인스턴스를 재사용하고, useState 의 «초기값»은
   * 다시 평가되지 않는다. 두 병 다 「상태가 프롭·저장소를 못 따라간다」는 한 형태다 —
   * 그래서 따라가야 할 것이 없게 파생으로 만든다.
   *
   * 🔴 저장소는 `useSyncExternalStore` 로 읽는다. 렌더 중에 직접 읽으면 서버는 못 읽고
   *    브라우저는 읽어 두 트리가 갈리는데(방금 고친 D-2 와 같은 병), 이 훅은 서버 스냅샷을
   *    따로 받아 그 갈림을 구조적으로 막는다. 서버 스냅샷 = `true`(=본 것으로 친다): 서버는
   *    세션 저장소를 알 수 없으니 «모르면 안 띄우는» 쪽으로 틀린다.
   */
  const seen = useSyncExternalStore(
    subscribeIntro,
    () => introSeen(sessionId),
    () => true,
  );
  const showIntro = forceIntro || !seen;

  const closeIntro = useCallback(() => {
    markIntroSeen(sessionId);
    // 🔴 `?intro=1` 을 남긴 채 닫으면 새로고침이 다시 연다 — 「닫았다」가 지켜지지 않는다.
    //    🔴 `history.replaceState` 가 아니라 라우터로 지운다: 주소만 바꾸면 `forceIntro`
    //       프롭이 true 로 남아 카드가 닫히지 않는다.
    if (forceIntro) router.replace(pathname, { scroll: false });
  }, [forceIntro, sessionId, router, pathname]);

  const shown = useMemo(
    () =>
      overview.lines
        .filter((l) => lineFilter === null || l.lineId === lineFilter)
        .flatMap((l) => l.equipment.map((e) => ({ ...e, lineId: l.lineId, lineName: l.name }))),
    [overview.lines, lineFilter],
  );
  const lineTotal = overview.lines.length;
  const equipTotal = overview.lines.reduce((n, l) => n + l.equipment.length, 0);
  const headMark = headline.alarmId ? UNKNOWN_MARK : STATUS_MARK.normal;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {/* 🔴 화면 제목(h1)은 «세그먼트 레이아웃»에 있다(`app/overview/layout.tsx`).
          Suspense 경계 «밖»이라 스트리밍 교체 창에 두 벌이 되지 않는다. 제목을 여기에
          «도로» 두지 마라 — 그 순간 두 곳이 같은 제목을 그린다. */}

      {/* ── ① 히어로 = 이 화면의 주인공(리서치 §3 「헤드라인 문장 먼저」) ─────────── */}
      <section className="fkt-rise max-w-[760px]" data-testid="headline">
        <p className="fkt-section-label flex items-center gap-1.5">
          <span className={headMark.tone} aria-hidden>
            {headMark.icon}
          </span>
          지금 공장 상태
        </p>
        <p className="fkt-display mt-2.5">{headline.text}</p>
        {headline.alarmId && (
          // 🔴 이 버튼과 알람 카드의 버튼은 «같은 동작»이다(§1 인터랙션 ⑥ — 진입 이중화).
          //    처음 온 방문자는 문장에서, 익숙한 사용자는 도크에서 출발한다.
          <div className="mt-5">
            <StartInvestigation
              scenarioId={scenarios[0]?.scenarioId ?? "GS-01"}
              sessionId={sessionId}
              sessionOrigin={sessionOrigin}
              testId="start-from-headline"
            />
          </div>
        )}
      </section>

      {/* ── ② KPI 4카드 — 값이 주인공, 라벨은 종속(리서치 §7-5) ────────────────── */}
      <section aria-label="공장 지표">
        <div
          className="fkt-stagger grid grid-cols-2 gap-4 xl:grid-cols-4"
          data-testid="kpi-strip"
        >
          <KpiCard label="가동 라인" value={overview.kpi.lineActive} unit={`/ ${lineTotal}`} />
          <KpiCard label="활성 알람" value={overview.kpi.alarmCount} unit="건" alert />
          {/* 🔴 계약 필드는 openIncidents 지만 SSOT에 'open' 상태값은 없다 — 서버가
              status<>'closed' 로 센다(계약 v0.1.7 판정). 화면 낱말은 그 뜻대로 «진행»이다. */}
          <KpiCard label="진행 Incident" value={overview.kpi.openIncidents} unit="건" />
          <KpiCard label="승인 대기 WO" value={overview.kpi.pendingWorkOrders} unit="건" />
        </div>
        <p className="mt-3 text-foot text-placeholder" data-testid="received-at">
          {plantName} · 이 화면을 받은 시각 {clock(receivedAt) ?? "—"} {TZ_LABEL}
        </p>
      </section>

      {/* ── ③ 설비 그리드 + 알람 독(보조 열) ──────────────────────────────────── */}
      <div className="flex min-w-0 flex-col gap-8 xl:flex-row xl:gap-6">
        <section className="min-w-0 flex-1" data-testid="equipment-grid" aria-label="설비 목록">
          <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <p className="fkt-section-label">설비 {shown.length}대</p>
            {/* 🔴 계층 트리 → «라인 필터 칩»으로 형태만 바꿨다(리서치 §7 「하나의 주인공 +
                보조」). 280px 나무를 왼쪽에 세우면 주인공이 셋(트리·그리드·도크)이 된다.
                기능·testid·라인 목록은 그대로다 — 바뀐 것은 형태뿐이다. */}
            <nav
              className="flex min-w-0 flex-wrap gap-1.5"
              aria-label="공장 계층"
              data-testid="hierarchy-tree"
            >
              <LineChip
                active={lineFilter === null}
                onClick={() => setLineFilter(null)}
                label={`전체 ${equipTotal}대`}
              />
              {overview.lines.map((l) => (
                <LineChip
                  key={l.lineId}
                  active={lineFilter === l.lineId}
                  onClick={() => setLineFilter(l.lineId)}
                  label={`${l.name} ${l.equipment.length}대`}
                  id={l.lineId}
                />
              ))}
            </nav>
          </div>

          <div className="fkt-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((e) => (
              <EquipmentCard key={e.equipmentId} equipment={e} alarms={overview.activeAlarms} />
            ))}
          </div>
          {shown.length === 0 && (
            <p className="fkt-card p-6 text-body-c text-muted">이 라인에 등록된 설비가 없습니다.</p>
          )}
        </section>

        <aside className="w-full shrink-0 space-y-4 xl:w-(--spacing-dock)" aria-label="알람과 시나리오">
          {showIntro && <IntroCard onClose={closeIntro} />}

          <section className="fkt-card overflow-hidden" data-testid="alarm-dock">
            <p className="fkt-section-label px-5 pt-4 pb-1">
              활성 알람 {overview.activeAlarms.length}건
            </p>
            {overview.activeAlarms.length === 0 ? (
              <p className="px-5 pb-4 text-body-c text-muted">지금 울고 있는 알람이 없습니다.</p>
            ) : (
              <ul className="fkt-rows">
                {overview.activeAlarms.map((a) => {
                  const sev = severityMark(a.severity);
                  return (
                    <li
                      key={a.alarmId}
                      className="px-5 py-4"
                      data-testid="alarm-card"
                      data-severity={a.severity}
                    >
                      <div className="flex items-start gap-3">
                        {/* 색 타일 = 상태색 15% 배경 + 도형(색«만»이 아니다) */}
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-chip text-cap ${sev.tone}`}
                          style={{ background: "color-mix(in srgb, currentColor 15%, transparent)" }}
                          title={sev.label}
                          aria-hidden
                        >
                          {sev.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="id truncate text-body-c font-semibold" title={a.alarmId}>
                            {a.alarmId}
                          </p>
                          <p className={`text-foot ${sev.tone}`}>
                            {sev.label} · {a.severity}
                          </p>
                          {/* 🔴 발생 시각 — §1 알람 패널 표시 7항 중 하나였고 빠져 있었다(회부 R-1).
                              시각이 없으면 「지금 난 일」과 「며칠 전부터 울고 있는 일」이 같은
                              줄로 보인다 — seed 의 이 알람은 후자다.
                              🔴 같은 줄 우측에 두면 340px 폭에서 id 를 세 줄로 깨뜨렸다(실측) —
                                 두 사실을 위아래로 나눈다. */}
                          <p className="mt-0.5 text-foot text-placeholder" data-testid="alarm-raised-at">
                            발생 {stamp(a.raisedAt) ?? a.raisedAt} {TZ_LABEL}
                          </p>
                        </div>
                      </div>
                      <dl className="mt-3 flex gap-2 rounded-chip bg-inset px-3 py-2 text-foot">
                        <dt className="text-muted">설비</dt>
                        <dd className="id min-w-0 flex-1 truncate">
                          {a.equipmentId} · {a.sensorId}
                        </dd>
                        <dt className="text-muted">임계 → 관측</dt>
                        <dd className="id fkt-num font-semibold">
                          {a.thresholdValue} → {a.observedValue}
                        </dd>
                      </dl>
                      <div className="mt-3">
                        <StartInvestigation
                          scenarioId={scenarios[0]?.scenarioId ?? "GS-01"}
                          sessionId={sessionId}
                          sessionOrigin={sessionOrigin}
                          testId="start-from-alarm"
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="fkt-card overflow-hidden" data-testid="scenario-dock">
            <p className="fkt-section-label px-5 pt-4 pb-1">승인된 시나리오</p>
            {scenarios.length === 0 ? (
              <p className="px-5 pb-4 text-body-c text-muted">
                승인된 시나리오를 가져오지 못했습니다.
              </p>
            ) : (
              <ul className="fkt-rows">
                {scenarios.map((s) => (
                  <li key={s.scenarioId} className="flex items-center gap-3 px-5 py-3.5">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-pill bg-ai" aria-hidden />
                    <span className="min-w-0 flex-1 text-body-c">{s.title}</span>
                    <span className="id shrink-0 text-cap text-placeholder">{s.scenarioId}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** KPI 카드 — 값 40px/700 tabular-nums · 라벨 13px/600 보조 · 단위는 baseline 정렬(리서치 §1-6). */
function KpiCard({
  label,
  value,
  unit,
  alert,
}: {
  label: string;
  value: string | number;
  unit?: string;
  /** 값이 0 보다 크면 위험색으로 «값만» 물든다 — 카드 배경을 물들이지 않는다(강조는 하나). */
  alert?: boolean;
}) {
  const hot = alert && Number(value) > 0;
  return (
    <article className="fkt-card px-5 py-4">
      <p className="fkt-section-label">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className={`fkt-num text-kpi leading-none ${hot ? "text-danger" : ""}`}>{value}</span>
        {unit && <span className="text-body-c text-muted">{unit}</span>}
      </p>
    </article>
  );
}

/** 라인 필터 칩 — pill · 선택은 채움 + 흰 글자(테두리 0). */
function LineChip({
  active,
  onClick,
  label,
  id,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  id?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-pill px-3 py-1 text-foot transition-colors duration-(--fkt-dur-1) ${
        active ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink"
      }`}
      title={id}
    >
      {label}
    </button>
  );
}

function EquipmentCard({
  equipment,
  alarms,
}: {
  equipment: OverviewEquipment & { lineName: string };
  alarms: ActiveAlarm[];
}) {
  const mark = markOf(equipment.status);
  const mine = alarms.filter((a) => a.equipmentId === equipment.equipmentId);
  return (
    <article
      className="fkt-card fkt-hoverable flex min-h-[148px] flex-col p-4 focus-within:outline focus-within:outline-2 focus-within:outline-ai"
      data-testid="equipment-card"
      data-equipment={equipment.equipmentId}
      data-status={equipment.status}
    >
      <div className="flex items-center gap-2.5">
        {/* 색 원 + 도형 — 리서치 §3 「색 원 안 심볼」을 색각 규율과 합친 자리 */}
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-pill text-cap ${mark.tone}`}
          style={{ background: "color-mix(in srgb, currentColor 15%, transparent)" }}
          title={mark.label}
          aria-hidden
        >
          {mark.icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-body-c font-semibold">{equipment.name}</span>
        {mine.length > 0 && (
          <span className="fkt-pill shrink-0 text-danger">알람 {mine.length}</span>
        )}
      </div>
      <p className="mt-1 truncate text-foot text-muted">
        <span className="id">{equipment.equipmentId}</span> · {mark.label} · {equipment.lineName}
      </p>
      {/* 🔴 스파크라인은 «브라우저»가 series를 따로 부른다 — overview 응답에 시계열을 싣지
          않는 것이 계약 v0.1.7의 결정이고(집계 비대 방지), 그 덕에 이 카드가 브라우저
          네트워크 축의 실물 표본이 된다. */}
      <div className="mt-auto">
        <Sparkline equipmentId={equipment.equipmentId} sensorId={equipment.sensorIds[0] ?? null} />
      </div>
    </article>
  );
}

function IntroCard({ onClose }: { onClose: () => void }) {
  return (
    <section className="fkt-card p-5" data-testid="intro-card" aria-label="처음 오셨나요">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-title font-semibold tracking-[-0.01em]">처음 오셨나요?</p>
        <button
          type="button"
          onClick={onClose}
          className="fkt-hoverable -mr-1 -mt-1 flex h-7 w-7 items-center justify-center rounded-pill text-muted hover:text-ink"
          aria-label="안내 닫기"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-body-c text-muted">이 화면은 synthetic 공장 1곳의 상태입니다.</p>
      <ol className="fkt-rows mt-4 list-decimal rounded-chip bg-inset pl-0 text-body-c [&>li]:list-inside">
        <li className="px-3.5 py-2.5">지금 설비에 알람이 떠 있습니다</li>
        <li className="px-3.5 py-2.5">「조사 시작」을 누르면 AI가 근거를 모읍니다</li>
        <li className="px-3.5 py-2.5">원인 후보와 작업지시서 초안을 사람이 승인합니다</li>
      </ol>
      <p className="mt-3 text-foot text-placeholder">언제든 리셋으로 처음으로 돌아갑니다.</p>
    </section>
  );
}
