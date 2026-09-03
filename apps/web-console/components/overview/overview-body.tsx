"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

import { Sparkline } from "@/components/overview/sparkline";
import { StartInvestigation } from "@/components/overview/start-investigation";
import type { ActiveAlarm, Overview, OverviewEquipment, Scenario } from "@/lib/contract";
import { TZ_LABEL, clock, stamp } from "@/lib/time";

/**
 * ① Overview 본문 (wireframes §1) — 좌 트리 280 · 중앙 카드 그리드 · 우 도크 380.
 *
 * 🔴 **상태는 색«만»으로 말하지 않는다**(§10 · baseline §11.3): 점 색 + 도형(●▲■) + 글자를
 *    함께 쓴다. 색각 이상에서 색만 다른 두 카드는 같은 카드다.
 * 🔴 **모르는 status를 «정상»으로 접지 않는다.** SSOT enum이 늘면 여기가 먼저 모르게 되는데,
 *    그때 조용히 ●(정상)로 그리면 이상한 설비가 멀쩡해 보인다 — 모르면 ■로 세우고 원문을
 *    툴팁에 남긴다(눈에 보이는 쪽으로 틀린다).
 *
 * T6-4 ③(overview 행 3개 + ⑧): 카드 r16·shadow-1 · 헤드라인 title 22 · KPI 값 head mono ·
 * 설비 카드 좌측 4px 상태 바 + hover 상승 + 스태거 진입 · 알람 항목 = 카드(bg-3 r12) + 심각도 pill ·
 * 레이아웃 = <md 1열 스택 · md 2열(트리+그리드 / 도크 아래) · lg 3열. testid·문구·DOM 순서 불변.
 */
// 🔴 상태 바는 «정상이 아닌 것»에만 색을 준다(원칙 ①-4 절제된 색 · 폐하 13:43 「복잡하지 않게」).
//    12장 전부 초록 띠를 두르면 주의 1장이 묻힌다 — 정상은 점·글자가 이미 말한다.
const STATUS_MARK: Record<string, { icon: string; tone: string; bar: string; label: string }> = {
  normal: { icon: "●", tone: "text-ok", bar: "bg-transparent", label: "정상" },
  warning: { icon: "▲", tone: "text-warn", bar: "bg-warn", label: "주의" },
};
const UNKNOWN_MARK = { icon: "■", tone: "text-danger", bar: "bg-danger", label: "알 수 없음" };

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

  return (
    <div className="fkt-rise flex min-w-0 flex-col gap-3">
      {/* 🔴 화면 제목(h1)은 이제 «세그먼트 레이아웃»에 있다(`app/overview/layout.tsx`).
          여전히 있되, Suspense 경계 «밖»이라 스트리밍 교체 창에 두 벌이 되지 않는다.
          제목을 여기에 «도로» 두지 마라 — 그 순간 두 곳이 같은 제목을 그린다. */}
      {/* ── 상태 헤드라인 (B요소 ①) ─────────────────────────────────────── */}
      <section
        className="fkt-card fkt-hero flex flex-col gap-3 px-5 py-5 md:flex-row md:items-center"
        data-testid="headline"
      >
        <span className={`text-head ${headline.alarmId ? "text-danger" : "text-ok"}`} aria-hidden>
          {headline.alarmId ? "■" : "●"}
        </span>
        <p className="min-w-0 flex-1 text-head font-semibold leading-snug tracking-tight md:text-title">
          {headline.text}
        </p>
        {headline.alarmId && (
          // 🔴 이 버튼과 알람 카드의 버튼은 «같은 동작»이다(§1 인터랙션 ⑥ — 진입 이중화).
          //    처음 온 방문자는 문장에서, 익숙한 사용자는 도크에서 출발한다.
          <StartInvestigation
            scenarioId={scenarios[0]?.scenarioId ?? "GS-01"}
            sessionId={sessionId}
            sessionOrigin={sessionOrigin}
            testId="start-from-headline"
          />
        )}
      </section>

      {/* ── KPI 스트립 ──────────────────────────────────────────────────── */}
      <section
        className="fkt-card flex flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 text-foot"
        data-testid="kpi-strip"
        aria-label="공장 지표"
      >
        <Kpi label="가동 라인" value={`${overview.kpi.lineActive}/${lineTotal}`} />
        <Kpi label="활성 알람" value={overview.kpi.alarmCount} />
        {/* 🔴 계약 필드는 openIncidents 지만 SSOT에 'open' 상태값은 없다 — 서버가
            status<>'closed' 로 센다(계약 v0.1.7 판정). 화면 낱말은 그 뜻대로 «진행»이다. */}
        <Kpi label="진행 Incident" value={overview.kpi.openIncidents} />
        <Kpi label="승인 대기 WO" value={overview.kpi.pendingWorkOrders} />
        <span className="text-cap text-muted md:ml-auto" data-testid="received-at">
          {plantName} · 이 화면을 받은 시각 {clock(receivedAt) ?? "—"} {TZ_LABEL}
        </span>
      </section>

      {/* ⑧ 레이아웃: <md 1열 · md 2열(트리 | 그리드 · 도크는 아래 전폭) · lg 3열(트리 | 그리드 | 도크) */}
      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-[14rem_minmax(0,1fr)] lg:grid-cols-[17rem_minmax(0,1fr)_22rem]">
        {/* ── 계층 트리 ─────────────────────────────────────────────────── */}
        <nav
          className="fkt-card min-w-0 p-3"
          aria-label="공장 계층"
          data-testid="hierarchy-tree"
        >
          <p className="id px-2 text-cap text-muted">{plantName}</p>
          <ul className="mt-2 space-y-0.5">
            <li>
              <TreeButton
                active={lineFilter === null}
                onClick={() => setLineFilter(null)}
                label={`전체 (${overview.lines.reduce((n, l) => n + l.equipment.length, 0)}대)`}
              />
            </li>
            {overview.lines.map((l) => (
              <li key={l.lineId}>
                <TreeButton
                  active={lineFilter === l.lineId}
                  onClick={() => setLineFilter(l.lineId)}
                  label={`${l.name} (${l.equipment.length}대)`}
                  id={l.lineId}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* ── 설비 카드 그리드 ───────────────────────────────────────────── */}
        <section className="min-w-0" data-testid="equipment-grid" aria-label="설비 목록">
          <div className="fkt-stagger grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {shown.map((e) => (
              <EquipmentCard key={e.equipmentId} equipment={e} alarms={overview.activeAlarms} />
            ))}
          </div>
          {shown.length === 0 && (
            <p className="fkt-card p-4 text-body-c text-muted">
              이 라인에 등록된 설비가 없습니다.
            </p>
          )}
        </section>

        {/* ── 우측 도크 ─────────────────────────────────────────────────── */}
        <aside className="min-w-0 space-y-3 md:col-span-2 lg:col-span-1" aria-label="알람과 시나리오">
          {showIntro && <IntroCard onClose={closeIntro} />}

          <section className="fkt-card p-4" data-testid="alarm-dock">
            <p className="text-cap font-semibold tracking-wide text-muted">활성 알람 {overview.activeAlarms.length}건</p>
            {overview.activeAlarms.length === 0 ? (
              <p className="mt-2 text-body-c text-muted">지금 울고 있는 알람이 없습니다.</p>
            ) : (
              <ul className="fkt-stagger mt-3 space-y-2">
                {overview.activeAlarms.map((a) => {
                  const sev = severityMark(a.severity);
                  return (
                  <li
                    key={a.alarmId}
                    className="rounded-btn bg-inset p-3"
                    data-testid="alarm-card"
                    data-severity={a.severity}
                  >
                    <p className={`fkt-pill text-foot ${sev.tone}`}>
                      <span aria-hidden>{sev.icon}</span> {sev.label} · {a.severity}
                    </p>
                    <p className="id mt-2 text-foot font-semibold">{a.alarmId}</p>
                    <p className="id text-cap text-muted">
                      {a.equipmentId} · {a.sensorId}
                    </p>
                    {/* 🔴 발생 시각 — §1 알람 패널 표시 7항 중 하나였고 빠져 있었다(회부 R-1).
                        목업의 「12:03」 자리다. 시각이 없으면 「지금 난 일」과 「며칠 전부터
                        울고 있는 일」이 같은 줄로 보인다 — seed 의 이 알람은 후자다. */}
                    <p className="mt-1 text-cap text-muted" data-testid="alarm-raised-at">
                      발생 {stamp(a.raisedAt) ?? a.raisedAt} {TZ_LABEL}
                    </p>
                    <p className="mt-1 text-cap text-muted">
                      임계 {a.thresholdValue} → 관측 {a.observedValue}
                    </p>
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

          <section className="fkt-card p-4" data-testid="scenario-dock">
            <p className="text-cap font-semibold tracking-wide text-muted">승인된 시나리오</p>
            {scenarios.length === 0 ? (
              <p className="mt-2 text-body-c text-muted">승인된 시나리오를 가져오지 못했습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-body-c">
                {scenarios.map((s) => (
                  <li key={s.scenarioId}>
                    <span className="text-ai" aria-hidden>
                      ◉
                    </span>{" "}
                    <span className="id text-cap">{s.scenarioId}</span> {s.title}
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

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="text-muted">{label}</span>{" "}
      <span className="id text-head font-semibold tracking-tight">{value}</span>
    </span>
  );
}

function TreeButton({
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
      className={`min-h-11 w-full rounded-btn px-3 py-1.5 text-left text-body-c transition-colors duration-(--fkt-dur-1) md:min-h-9 ${
        active ? "bg-ai/12 font-semibold text-ai" : "text-muted hover:bg-inset hover:text-ink"
      }`}
    >
      {label}
      {id && <span className="id ml-1 text-cap text-muted">{id}</span>}
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
      className="fkt-card relative overflow-hidden p-4 pl-5 transition-[transform,box-shadow] duration-(--fkt-dur-1) ease-(--ease-smooth) hover:-translate-y-0.5 hover:shadow-2 focus-within:outline focus-within:outline-2 focus-within:outline-ai"
      data-testid="equipment-card"
      data-equipment={equipment.equipmentId}
      data-status={equipment.status}
    >
      {/* 좌측 4px 상태 바 — ●▲■ 와 «같은 사실»을 한 번 더 말한다(색만이 아니라 도형·글자와 함께) */}
      <span className={`absolute inset-y-0 left-0 w-1 ${mark.bar}`} aria-hidden />
      <div className="flex items-center gap-2">
        <span className={mark.tone} title={mark.label} aria-hidden>
          {mark.icon}
        </span>
        <span className="id min-w-0 flex-1 truncate text-cap text-muted">{equipment.equipmentId}</span>
        {mine.length > 0 && <span className="fkt-pill text-danger">알람 {mine.length}</span>}
      </div>
      <p className="mt-2 truncate text-body-c font-semibold tracking-tight" title={equipment.name}>
        {equipment.name}
      </p>
      <p className="text-foot text-muted">
        {mark.label} · {equipment.lineName}
      </p>
      {/* 🔴 스파크라인은 «브라우저»가 series를 따로 부른다 — overview 응답에 시계열을 싣지
          않는 것이 계약 v0.1.7의 결정이고(집계 비대 방지), 그 덕에 이 카드가 브라우저
          네트워크 축의 실물 표본이 된다. */}
      <Sparkline
        equipmentId={equipment.equipmentId}
        sensorId={equipment.sensorIds[0] ?? null}
      />
    </article>
  );
}

function IntroCard({ onClose }: { onClose: () => void }) {
  return (
    <section
      className="fkt-card fkt-pop p-4 outline outline-1 -outline-offset-1 outline-ai/40"
      data-testid="intro-card"
      aria-label="처음 오셨나요"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-head font-semibold tracking-tight">처음 오셨나요?</p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-pill bg-inset text-muted transition-colors duration-(--fkt-dur-1) hover:text-ink"
          aria-label="안내 닫기"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-foot text-muted">
        이 화면은 synthetic 공장 1곳의 상태입니다.
      </p>
      <ol className="mt-3 space-y-1.5 text-body-c">
        <li>① 지금 설비에 알람이 떠 있습니다</li>
        <li>② 「조사 시작」을 누르면 AI가 근거를 모읍니다</li>
        <li>③ 원인 후보와 작업지시서 초안을 사람이 승인합니다</li>
      </ol>
      <p className="mt-3 text-foot text-muted">언제든 ⟲ 로 처음으로 돌아갑니다.</p>
    </section>
  );
}
