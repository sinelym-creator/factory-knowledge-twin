"use client";

import { useMemo, useState } from "react";

import { Sparkline } from "@/components/overview/sparkline";
import { StartInvestigation } from "@/components/overview/start-investigation";
import type { ActiveAlarm, Overview, OverviewEquipment, Scenario } from "@/lib/contract";

/**
 * ① Overview 본문 (wireframes §1) — 좌 트리 280 · 중앙 카드 그리드 · 우 도크 380.
 *
 * 🔴 **상태는 색«만»으로 말하지 않는다**(§10 · baseline §11.3): 점 색 + 도형(●▲■) + 글자를
 *    함께 쓴다. 색각 이상에서 색만 다른 두 카드는 같은 카드다.
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

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-danger",
  warning: "text-warn",
  info: "text-muted",
};

export function OverviewBody({
  plantName,
  overview,
  scenarios,
  sessionId,
  sessionOrigin,
  headline,
}: {
  plantName: string;
  overview: Overview;
  scenarios: Scenario[];
  sessionId: string | null;
  sessionOrigin: string | null;
  headline: { text: string; alarmId: string | null; equipmentId: string | null };
}) {
  const [lineFilter, setLineFilter] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(true);

  const shown = useMemo(
    () =>
      overview.lines
        .filter((l) => lineFilter === null || l.lineId === lineFilter)
        .flatMap((l) => l.equipment.map((e) => ({ ...e, lineId: l.lineId, lineName: l.name }))),
    [overview.lines, lineFilter],
  );
  const lineTotal = overview.lines.length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 🔴 화면 제목은 «있되 자리를 먹지 않는다». 와이어프레임 §1 은 상단을 헤드라인
          문장에 주었지만, 제목 없는 문서는 스크린리더가 「여기가 어디인지」를 못 읽는다.
          앞판 placeholder 에는 h1 이 있었고 실데이터로 갈아 끼우며 내가 떨어뜨렸다 —
          셸 그물이 그 자리에서 물었다(키보드·스크린리더 축은 눈으로 안 보인다). */}
      <h1 className="sr-only">① Factory Overview</h1>
      {/* ── 상태 헤드라인 (B요소 ①) ─────────────────────────────────────── */}
      <section
        className="flex items-center gap-3 rounded border border-edge bg-panel px-4 py-3"
        data-testid="headline"
      >
        <span className={headline.alarmId ? "text-danger" : "text-ok"} aria-hidden>
          {headline.alarmId ? "■" : "●"}
        </span>
        <p className="min-w-0 flex-1 text-sm">{headline.text}</p>
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
        className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded border border-edge bg-panel px-4 py-2 text-xs"
        data-testid="kpi-strip"
        aria-label="공장 지표"
      >
        <Kpi label="가동 라인" value={`${overview.kpi.lineActive}/${lineTotal}`} />
        <Kpi label="활성 알람" value={overview.kpi.alarmCount} />
        {/* 🔴 계약 필드는 openIncidents 지만 SSOT에 'open' 상태값은 없다 — 서버가
            status<>'closed' 로 센다(계약 v0.1.7 판정). 화면 낱말은 그 뜻대로 «진행»이다. */}
        <Kpi label="진행 Incident" value={overview.kpi.openIncidents} />
        <Kpi label="승인 대기 WO" value={overview.kpi.pendingWorkOrders} />
        <span className="ml-auto text-muted">
          {plantName} · 이 화면을 받은 시각 {new Date().toLocaleTimeString("ko-KR")}
        </span>
      </section>

      <div className="flex min-w-0 gap-3">
        {/* ── 계층 트리 ─────────────────────────────────────────────────── */}
        <nav
          className="w-70 shrink-0 rounded border border-edge bg-panel p-3"
          aria-label="공장 계층"
          data-testid="hierarchy-tree"
        >
          <p className="id text-xs text-muted">{plantName}</p>
          <ul className="mt-2 space-y-1">
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
        <section className="min-w-0 flex-1" data-testid="equipment-grid" aria-label="설비 목록">
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {shown.map((e) => (
              <EquipmentCard key={e.equipmentId} equipment={e} alarms={overview.activeAlarms} />
            ))}
          </div>
          {shown.length === 0 && (
            <p className="rounded border border-edge bg-panel p-4 text-sm text-muted">
              이 라인에 등록된 설비가 없습니다.
            </p>
          )}
        </section>

        {/* ── 우측 도크 ─────────────────────────────────────────────────── */}
        <aside className="w-95 shrink-0 space-y-3" aria-label="알람과 시나리오">
          {showIntro && <IntroCard onClose={() => setShowIntro(false)} />}

          <section className="rounded border border-edge bg-panel p-3" data-testid="alarm-dock">
            <p className="text-xs text-muted">활성 알람 {overview.activeAlarms.length}건</p>
            {overview.activeAlarms.length === 0 ? (
              <p className="mt-2 text-sm text-muted">지금 울고 있는 알람이 없습니다.</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {overview.activeAlarms.map((a) => (
                  <li key={a.alarmId} className="border-t border-edge pt-2 first:border-0 first:pt-0">
                    <p className={`text-xs ${SEVERITY_TONE[a.severity] ?? "text-danger"}`}>
                      ▲ {a.severity}
                    </p>
                    <p className="id mt-1 text-xs">{a.alarmId}</p>
                    <p className="id text-xs text-muted">
                      {a.equipmentId} · {a.sensorId}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      임계 {a.thresholdValue} → 관측 {a.observedValue}
                    </p>
                    <div className="mt-2">
                      <StartInvestigation
                        scenarioId={scenarios[0]?.scenarioId ?? "GS-01"}
                        sessionId={sessionId}
                        sessionOrigin={sessionOrigin}
                        testId="start-from-alarm"
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded border border-edge bg-panel p-3" data-testid="scenario-dock">
            <p className="text-xs text-muted">승인된 시나리오</p>
            {scenarios.length === 0 ? (
              <p className="mt-2 text-sm text-muted">승인된 시나리오를 가져오지 못했습니다.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {scenarios.map((s) => (
                  <li key={s.scenarioId}>
                    <span className="text-ai" aria-hidden>
                      ◉
                    </span>{" "}
                    <span className="id text-xs">{s.scenarioId}</span> {s.title}
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
    <span>
      <span className="text-muted">{label}</span> <span className="id font-semibold">{value}</span>
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
      className={`w-full rounded px-2 py-1 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai ${
        active ? "bg-bg text-ink" : "text-muted hover:bg-bg hover:text-ink"
      }`}
    >
      {label}
      {id && <span className="id ml-1 text-xs text-muted">{id}</span>}
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
      className="rounded border border-edge bg-panel p-3 focus-within:outline focus-within:outline-2 focus-within:outline-ai"
      data-testid="equipment-card"
      data-equipment={equipment.equipmentId}
      data-status={equipment.status}
    >
      <div className="flex items-center gap-2">
        <span className={mark.tone} title={mark.label} aria-hidden>
          {mark.icon}
        </span>
        <span className="id min-w-0 flex-1 truncate text-xs">{equipment.equipmentId}</span>
        {mine.length > 0 && <span className="text-xs text-danger">알람 {mine.length}</span>}
      </div>
      <p className="mt-1 truncate text-sm">{equipment.name}</p>
      <p className="text-xs text-muted">
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
      className="rounded border border-ai/40 bg-panel p-3"
      data-testid="intro-card"
      aria-label="처음 오셨나요"
    >
      <div className="flex items-start gap-2">
        <p className="flex-1 text-sm font-semibold">처음 오셨나요?</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded px-1 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
          aria-label="안내 닫기"
        >
          ✕
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        이 화면은 synthetic 공장 1곳의 상태입니다.
      </p>
      <ol className="mt-2 space-y-1 text-xs">
        <li>① 지금 설비에 알람이 떠 있습니다</li>
        <li>② 「조사 시작」을 누르면 AI가 근거를 모읍니다</li>
        <li>③ 원인 후보와 작업지시서 초안을 사람이 승인합니다</li>
      </ol>
      <p className="mt-2 text-xs text-muted">언제든 ⟲ 로 처음으로 돌아갑니다.</p>
    </section>
  );
}
