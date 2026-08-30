import { headers } from "next/headers";

import { SensorTrend } from "@/components/incident/sensor-trend";
import { Unavailable } from "@/components/unavailable";
import {
  type ActiveAlarm,
  CONTRACT,
  type EquipmentDetail,
  type Incident,
  type Overview,
  type RunSnapshot,
  apiGetServer,
} from "@/lib/contract";

/**
 * incident 의 `alarmIds[]` 를 «알람 행»으로 되돌린다 — 계약 안에서만.
 *
 * 🔴 알람의 `sensorId`·`thresholdValue` 를 싣는 응답은 `overview.activeAlarms[]` 하나다
 *    (`equipment.recentAlarms[]` 에는 `sensorId` 가 없다 — 계약 v0.1.7). 그래서 plantId 를
 *    `/plants` 로 물어 overview 를 편다. 계약 밖 경로를 만들지 않는다.
 * 🔴 «활성» 알람만 실린다는 한계를 그대로 둔다. 해소된 알람의 센서까지 되짚으려면 계약이
 *    넓어져야 하고, 그것은 코드가 아니라 계약이 정할 일이다 — 못 찾으면 null 을 돌려주고
 *    화면이 그 사실을 말한다.
 */
async function resolveAlarm(
  alarmIds: string[],
  cookieHeader: string,
): Promise<ActiveAlarm | null> {
  if (alarmIds.length === 0) return null;
  const plants = await apiGetServer<{ plantId: string }[]>(CONTRACT.plants, cookieHeader);
  if (plants.state !== "ok" || plants.data.length === 0) return null;
  const overview = await apiGetServer<Overview>(
    CONTRACT.plantOverview(plants.data[0].plantId),
    cookieHeader,
  );
  if (overview.state !== "ok") return null;
  return overview.data.activeAlarms.find((a) => alarmIds.includes(a.alarmId)) ?? null;
}

/**
 * ② Incident 조사 (wireframes §2) — 컨텍스트 + run 진입 동선 (T3-2).
 *
 * 🔴 **이 티켓이 채우는 것은 «컨텍스트»까지다.** Agent 타임라인·evidence 스트립·재생 컨트롤은
 *    이벤트 스트림(WS) 위에 서므로 T3-4 자리다. 여기서 미리 그리면 「있는데 안 도는 것」이
 *    되고, 그 상태가 제일 늦게 발견된다 — 자리 표시로 «없다»고 말한다.
 */
export default async function IncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ incidentId: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { incidentId } = await params;
  const { run } = await searchParams;
  const cookieHeader = (await headers()).get("cookie") ?? "";

  const incident = await apiGetServer<Incident>(CONTRACT.incident(incidentId), cookieHeader);
  if (incident.state !== "ok") {
    // 🔴 「그런 incident 가 없다」와 「지금 못 물어봤다」를 가른다. 서버는 사유 코드를 나눠
    //    답하는데 화면이 둘을 한 모습으로 그리면 그 구분이 화면에서 사라진다.
    const missing = incident.status === 404;
    return (
      <Unavailable
        screen={`② Incident 조사 · ${incidentId}`}
        why={missing ? `그런 incident 가 없다 (${incidentId})` : incident.why}
        kind={missing ? "not-found" : "unavailable"}
      />
    );
  }

  const [equipment, snapshot] = await Promise.all([
    apiGetServer<EquipmentDetail>(CONTRACT.equipment(incident.data.equipmentId), cookieHeader),
    // 🔴 `?run=` 이 없으면 «묻지 않는다». 없는 run 을 물어 404 를 받고 그것을 화면에 「오류」로
    //    그리면, 아직 조사를 시작하지 않은 정상 상태가 결함처럼 보인다.
    run
      ? apiGetServer<RunSnapshot>(CONTRACT.run(run), cookieHeader)
      : Promise.resolve({ state: "unavailable", why: "run 미지정" } as const),
  ]);

  const eq = equipment.state === "ok" ? equipment.data : null;

  /* 🔴 **차트의 센서를 id 문자열로 «추측»하지 않는다**(회부 R-3).
   *
   * 앞판은 `sensors.find(s => s.sensorId.includes("VIB"))` 였다. 주석은 「이 incident 를 울린
   * 센서」라고 적었지만 코드는 그 관계를 «읽지 않았다» — 이름에 VIB 가 든 센서를 골랐을 뿐이다.
   * 같은 PR 의 `overview/page.tsx` 는 「id 에서 뜻을 추측하지 않는다」를 성문하고 있었으니,
   * 한 PR 안에서 규율이 갈린 것이다. 그리고 VIB 가 없는 설비(EQ-CNV-205)에서는 조용히
   * `sensors[0]` 로 떨어져 «알람과 무관한 추세를 근거처럼» 배치했다.
   *
   * 정본 근거는 **알람 행의 `sensorId` 실값**이다 — 계약 v0.1.7-정정이 `activeAlarms[]` 에
   * `sensorId`·`thresholdValue` 를 싣는다. incident 의 `alarmIds[]` 와 맞춰 그 행을 집는다.
   *
   * 🔴 못 찾으면 «못 찾았다»고 말한다. seed 실측: 활성 알람은 1건뿐이고(AL-20260826-0041 ·
   *    INC-2026-014) 나머지 incident 의 `alarmIds` 는 전부 비어 있다. 그때 첫 센서를 조용히
   *    그리면 앞판의 병이 이름만 바꿔 되살아난다 — 그래서 아래 `source` 가 화면과 DOM 양쪽에
   *    「이 곡선이 알람의 것인가」를 남긴다(거동으로 물을 수 있게).
   */
  const alarmRow = await resolveAlarm(incident.data.alarmIds, cookieHeader);
  const sensorFromAlarm = alarmRow
    ? (eq?.sensors.find((s) => s.sensorId === alarmRow.sensorId) ?? null)
    : null;
  const alarmSensor = sensorFromAlarm ?? eq?.sensors[0] ?? null;
  const sensorSource: "alarm" | "fallback" = sensorFromAlarm ? "alarm" : "fallback";

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* 🔴 제목은 sr-only 다 — 헤더 줄이 이미 같은 사실(id·설비·제목)을 «보여» 주므로 화면에
          두 번 쓰지 않되, 문서에는 제목이 있어야 스크린리더가 여기가 어디인지 읽는다. */}
      <h1 className="sr-only">② Incident 조사 · {incident.data.incidentId}</h1>
      <section className="rounded border border-edge bg-panel px-4 py-3" data-testid="incident-header">
        <div className="flex flex-wrap items-center gap-2">
          <span className="id text-sm">{incident.data.incidentId}</span>
          <span className="text-muted">·</span>
          <span className="id text-sm">{incident.data.equipmentId}</span>
          <span className="text-sm">{incident.data.title}</span>
          <span className="ml-auto rounded border border-edge px-2 py-0.5 text-xs text-muted">
            {incident.data.status} · {incident.data.severity}
          </span>
        </div>
        {/* ⏱ TTAE 표시행 — 🔴 §2.2 측정-주장 경계. 실측값과 «잠정 목표»를 한 줄에 두되
            꼬리표로 갈라 둔다. 단축률(%)은 실측 전에 쓰지 않는다. */}
        <p className="mt-2 text-xs text-muted" data-testid="ttae-row">
          {run ? (
            <>
              조사 <span className="id">{run}</span>
              {snapshot.state === "ok" ? ` · 상태 ${snapshot.data.status}` : " · 스냅샷 못 가져옴"}
            </>
          ) : (
            "이 화면은 아직 조사를 돌리지 않았습니다 — Overview의 「조사 시작」이 여기로 옵니다."
          )}
          <span className="ml-2">
            │ 같은 조사를 사람이 수작업으로: 45분 «잠정 목표 · 미실측»
          </span>
        </p>
      </section>

      <div className="flex min-w-0 gap-3">
        {/* 좌 — Agent 타임라인(T3-4 자리) */}
        <section
          className="w-80 shrink-0 rounded border border-dashed border-edge bg-panel p-3"
          data-testid="timeline-placeholder"
        >
          <p className="text-xs text-muted">Agent 타임라인</p>
          <p className="mt-2 text-sm">이 자리는 T3-4다.</p>
          <p className="mt-1 text-xs text-muted">
            단계 진척·소요·요약은 WebSocket 이벤트 위에 선다. 지금 그리면 「있는데 안 도는 것」이
            되므로 자리만 남긴다.
          </p>
        </section>

        {/* 중 — 센서 추세 + 설비 컨텍스트 */}
        <section className="min-w-0 flex-1 space-y-3">
          {eq && alarmSensor ? (
            <SensorTrend
              equipmentId={eq.equipmentId}
              sensorId={alarmSensor.sensorId}
              unit={alarmSensor.unit}
              source={sensorSource}
              alarm={alarmRow}
              alarmIds={incident.data.alarmIds}
            />
          ) : (
            <p className="rounded border border-edge bg-panel p-4 text-sm text-muted">
              설비 컨텍스트를 가져오지 못해 추세를 그릴 수 없습니다.
            </p>
          )}

          {eq && (
            <section className="rounded border border-edge bg-panel p-3" data-testid="equipment-context">
              <p className="text-sm">
                설비: {eq.name} · {eq.equipmentClass} {eq.model} · 설치 {eq.installedOn}
              </p>
              <p className="mt-1 text-xs text-muted">
                라인 <span className="id">{eq.lineId}</span> · 중요도 {eq.criticality} · 센서{" "}
                {eq.sensors.length}종
              </p>
              {eq.maintenanceSummary.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  최근 정비:{" "}
                  {/* 🔴 여기 찍는 id 는 «정비 기록»의 id 다(MR-…). 계약 정정 전에는 이 자리에
                      work order id 가 나갔고, 그것은 근거로 열리지 않는 id 였다. */}
                  <span className="id text-ink">{eq.maintenanceSummary[0].maintenanceRecordId}</span>{" "}
                  {eq.maintenanceSummary[0].type} · {eq.maintenanceSummary[0].completedOn?.slice(0, 10)}
                </p>
              )}
            </section>
          )}
        </section>

        {/* 우 — 원인 후보 */}
        <aside className="w-100 shrink-0 rounded border border-edge bg-panel p-3" data-testid="candidates">
          <p className="text-xs text-muted">원인 후보</p>
          {snapshot.state === "ok" && snapshot.data.candidates.length > 0 ? (
            <ul className="mt-2 space-y-3">
              {snapshot.data.candidates.map((c, i) => (
                <li key={c.failureModeId ?? i} className="border-t border-edge pt-2 first:border-0 first:pt-0">
                  <p className="text-sm">
                    <span className="text-ai">{c.rank ?? i + 1}</span>{" "}
                    <span className="id text-xs">{c.failureModeId}</span>
                  </p>
                  <p className="text-sm">{c.label}</p>
                  {c.confidenceNote && <p className="mt-1 text-xs text-muted">{c.confidenceNote}</p>}
                  {c.evidenceIds && (
                    <p className="mt-1 text-xs text-muted">근거 {c.evidenceIds.length}건</p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">
              {run ? "아직 후보가 나오지 않았습니다." : "조사를 시작하면 여기에 후보가 섭니다."}
            </p>
          )}
        </aside>
      </div>

      {/* 하단 — Evidence 스트립(T3-4 자리) */}
      <section
        className="rounded border border-dashed border-edge bg-panel p-3"
        data-testid="evidence-strip-placeholder"
      >
        <p className="text-xs text-muted">Evidence 스트립 · 이벤트 상세 패널</p>
        <p className="mt-1 text-sm">이 자리는 T3-4다 — run 이 수집한 근거가 실시간으로 쌓이는 곳.</p>
      </section>
    </div>
  );
}
