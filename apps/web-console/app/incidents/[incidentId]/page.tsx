import { headers } from "next/headers";

import { ResumeRun } from "@/components/incident/resume-run";
import { RunConsole } from "@/components/incident/run-console";
import { SensorTrend } from "@/components/incident/sensor-trend";
import { Unavailable } from "@/components/unavailable";
import {
  type ActiveAlarm,
  CONTRACT,
  type EquipmentDetail,
  type Incident,
  type Overview,
  type RunSnapshot,
  type ErrorDetail,
  type Series,
  type SeriesWindow,
  apiGetServer,
} from "@/lib/contract";
import { isStaticRun, loadStaticReplay, staticLookup } from "@/lib/static-replay";

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
async function resolveAlarm(alarmIds: string[], get: Getter): Promise<ActiveAlarm | null> {
  if (alarmIds.length === 0) return null;
  const plants = await get<{ plantId: string }[]>(CONTRACT.plants);
  if (plants.state !== "ok" || plants.data.length === 0) return null;
  const overview = await get<Overview>(CONTRACT.plantOverview(plants.data[0].plantId));
  if (overview.state !== "ok") return null;
  return overview.data.activeAlarms.find((a) => alarmIds.includes(a.alarmId)) ?? null;
}

/**
 * 「계약 경로 하나를 물어 그 답을 받는다」 — 🔴 **답의 출처만 다르고 형태는 같다.**
 *
 * Live 는 ai-api 에 묻고, 정적 replay 는 굳혀 둔 사본에서 찾는다(T4-2a). 두 갈래를 이 한
 * 자리에 모아 두면 아래 렌더 코드는 자기가 어느 경로에 있는지 «몰라도» 된다 — 그것이
 * 「live/replay 렌더 분기 0」의 실제 모습이다. 분기가 화면 안으로 퍼지면, 한쪽만 고치는 날
 * 두 경로가 다른 화면을 그리기 시작한다.
 */
type Getter = <T>(
  path: string,
) => Promise<
  { state: "ok"; data: T } | { state: "unavailable"; why: string; status?: number; detail?: ErrorDetail }
>;

/**
 * ② Incident 조사 (wireframes §2) — 컨텍스트 + run 진입 동선 (T3-2).
 *
 * 🔴 **실행 축은 `?run=` 이 있을 때만 선다**(T3-4 착지). Agent 타임라인·evidence 스트립·
 *    재생 컨트롤·TTAE 는 이벤트 스트림(WS) 위에 서므로 클라이언트 컴포넌트(`RunConsole`)가
 *    맡고, 이 서버 컴포넌트는 «컨텍스트»(센서 추세·설비)를 만들어 그 중앙 열로 넘긴다.
 *    run 이 없으면 예전 그대로 «조사를 아직 돌리지 않았다»고 말한다 — 없는 것을 그리지 않는다.
 *
 * 🔴 스냅샷(`GET /runs/{id}`)은 여기서 «한 번» 받아 콘솔의 첫 페인트를 채운다. WS 가 못 붙는
 *    경우에도 후보가 서게 하는 «빈 화면 0» 축이다 — 그 뒤의 정본은 이벤트다.
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

  /**
   * 🔴 **정적 replay 진입 신호는 `?run=` 값 하나다**(T4-2a · 오케 채택 2026-08-31).
   *    이 화면의 헤더·설비·추세는 서버 컴포넌트가 만들므로 browser storage 를 볼 수 없다 —
   *    그래서 진입 표지가 URL 이어야 한다. 셸 내부 규약이며 계약 표면도, 신규 라우트도 아니다.
   * 🔴 자산은 정적 경로에서만 싣는다(동적 import) — Live 방문자는 내려받지 않는다(§17.1·Q-50).
   */
  const bundle = isStaticRun(run) ? await loadStaticReplay() : null;
  const get: Getter = (path) =>
    bundle ? Promise.resolve(staticLookup(bundle, path)) : apiGetServer(path, cookieHeader);

  const incident = await get<Incident>(CONTRACT.incident(incidentId));
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
    get<EquipmentDetail>(CONTRACT.equipment(incident.data.equipmentId)),
    // 🔴 `?run=` 이 없으면 «묻지 않는다». 없는 run 을 물어 404 를 받고 그것을 화면에 「오류」로
    //    그리면, 아직 조사를 시작하지 않은 정상 상태가 결함처럼 보인다.
    // 🔴 정적 경로에서도 «묻지 않는다» — 정적 runId 는 서버에 없는 id 이고(오케 가드레일 ①),
    //    그리고 스냅샷은 애초에 「이벤트가 없을 때 자리를 지키는」 물건이다. 정적은 32건 전열을
    //    처음부터 쥐고 있으므로 채울 빈자리가 없다.
    run && !bundle
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
  const alarmRow = await resolveAlarm(incident.data.alarmIds, get);
  const sensorFromAlarm = alarmRow
    ? (eq?.sensors.find((s) => s.sensorId === alarmRow.sensorId) ?? null)
    : null;
  const alarmSensor = sensorFromAlarm ?? eq?.sensors[0] ?? null;
  const sensorSource: "alarm" | "fallback" = sensorFromAlarm ? "alarm" : "fallback";

  /**
   * 정적 경로의 창별 센서 사본 — 🔴 **굳힌 창만 담는다.** 없는 창을 빈 배열로 채우면 화면이
   * 「데이터가 0점이다」와 「그 창을 안 담았다」를 같은 모습으로 그린다. 키가 없으면 차트가
   * 「Live 전용」이라 말한다(대응표 #10).
   */
  let staticSeries: Partial<Record<SeriesWindow, Series>> | undefined;
  if (bundle && alarmSensor) {
    staticSeries = {};
    for (const w of ["24h", "3w"] as const) {
      const hit = staticLookup<Series>(bundle, CONTRACT.sensorSeries(eq!.equipmentId, alarmSensor.sensorId, w));
      if (hit.state === "ok") staticSeries[w] = hit.data;
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {/* 🔴 제목은 sr-only 다 — 헤더 줄이 이미 같은 사실(id·설비·제목)을 «보여» 주므로 화면에
          두 번 쓰지 않되, 문서에는 제목이 있어야 스크린리더가 여기가 어디인지 읽는다. */}
      <h1 className="sr-only">② Incident 조사 · {incident.data.incidentId}</h1>
      <section data-testid="incident-header">
        <div className="flex flex-wrap items-baseline gap-2">
          <p className="fkt-section-label flex items-center gap-1.5">
            <span className="id">{incident.data.incidentId}</span>
            <span className="text-placeholder">·</span>
            <span className="id">{incident.data.equipmentId}</span>
          </p>
          <span className="ml-auto fkt-pill bg-fill text-muted">
            {incident.data.status} · {incident.data.severity}
          </span>
        </div>
        {/* 🔴 **제목이 이 화면의 얼굴이다**(T6-4 재수립 · 폐하 09-03 14:24 「레이아웃도 더
            신경」). 앞판은 id·설비·제목이 «같은 크기 한 줄»로 나열돼, 무엇을 조사하는
            화면인지가 눈에 먼저 들어오지 않았다 — 사실은 그대로 두고 무게만 바꿨다. */}
        <p className="fkt-display mt-2 max-w-[860px]">{incident.data.title}</p>
        {/* 🔴 TTAE 표시행은 run 이 있을 때 «콘솔이» 그린다 — 실측값(elapsedMs 누적 →
            totalElapsedMs)은 이벤트 위에 서기 때문이다. 여기에 같은 줄을 또 두면 한 사실이
            두 자리에서 갈린다(같은 것을 두 번 만들지 않는다). */}
        {/* 🔴 D-60 — 이 세션이 이 상황을 이미 조사했다면 그 주소로 되돌린다(새 조회 0).
            기억이 없으면 아무 일도 하지 않고 아래 「아직 시작하지 않았습니다」가 그대로 선다. */}
        {!run && <ResumeRun incidentId={incidentId} />}
        {!run && (
          <p className="mt-2 text-foot text-muted" data-testid="ttae-row-idle">
            이 화면은 아직 조사를 시작하지 않았습니다. Overview 의 「조사 시작」을 누르면 여기로 옵니다.
            <span className="ml-2">
              │ 같은 조사를 사람이 수작업으로: 45분{" "}
              <span className="fkt-pill text-warn">잠정 목표 · 미실측</span>
            </span>
          </p>
        )}
      </section>

      {/* 중앙 열 = 센서 추세 + 설비 컨텍스트 — run 유무와 무관하게 «같은 것»을 그린다 */}
      {(() => {
        const context = (
          <>
            {eq && alarmSensor ? (
              <SensorTrend
                equipmentId={eq.equipmentId}
                sensorId={alarmSensor.sensorId}
                unit={alarmSensor.unit}
                source={sensorSource}
                alarm={alarmRow}
                alarmIds={incident.data.alarmIds}
                staticSeries={staticSeries}
              />
            ) : (
              <p className="fkt-card p-6 text-body-c text-muted">
                설비 컨텍스트를 가져오지 못해 추세를 그릴 수 없습니다.
              </p>
            )}

            {eq && (
              <section className="fkt-card p-5" data-testid="equipment-context">
                <p className="text-body-c">
                  설비: {eq.name} · {eq.equipmentClass} {eq.model} · 설치 {eq.installedOn}
                </p>
                <p className="mt-1 text-foot text-muted">
                  라인 <span className="id">{eq.lineId}</span> · 중요도 {eq.criticality} · 센서{" "}
                  {eq.sensors.length}종
                </p>
                {eq.maintenanceSummary.length > 0 && (
                  <p className="mt-2 text-foot text-muted">
                    최근 정비:{" "}
                    {/* 🔴 여기 찍는 id 는 «정비 기록»의 id 다(MR-…). 계약 정정 전에는 이 자리에
                        work order id 가 나갔고, 그것은 근거로 열리지 않는 id 였다. */}
                    <span className="id text-ink">{eq.maintenanceSummary[0].maintenanceRecordId}</span>{" "}
                    {eq.maintenanceSummary[0].type} · {eq.maintenanceSummary[0].completedOn?.slice(0, 10)}
                  </p>
                )}
              </section>
            )}
          </>
        );

        return run ? (
          <RunConsole
            key={run}
            runId={run}
            initialSnapshot={snapshot.state === "ok" ? snapshot.data : null}
            // 🔴 정적 경로는 이벤트 전열을 «미리» 넘겨받는다 — 콘솔은 WS 를 열지 않고,
            //    그 아래 `reduceEvents`·타임라인·되감기는 한 줄도 달라지지 않는다(AC ⑤).
            staticEvents={bundle ? bundle.events : undefined}
          >
            {context}
          </RunConsole>
        ) : (
          <div className="flex min-w-0 flex-col gap-6 xl:flex-row">
            {/* 🔴 run 이 없을 때는 «없다»고 말한다 — 빈 패널을 조사 화면처럼 그리지 않는다 */}
            <section
              className="fkt-card w-full shrink-0 p-5 xl:w-80"
              data-testid="timeline-idle"
            >
              <p className="fkt-section-label">Agent 타임라인</p>
              <p className="mt-2 text-body-c">아직 조사를 돌리지 않았습니다.</p>
              <p className="mt-1 text-foot text-muted">
                Overview 의 「조사 시작」을 누르면 여기로 옵니다. 그때 단계·근거·경과가 이
                자리에 나타납니다.
              </p>
            </section>
            <section className="min-w-0 flex-1 space-y-6">{context}</section>
            <aside className="fkt-card w-full shrink-0 p-5 xl:w-[380px]" data-testid="candidates-idle">
              <p className="fkt-section-label">원인 후보</p>
              <p className="mt-2 text-body-c text-muted">조사를 시작하면 여기에 후보가 섭니다.</p>
            </aside>
          </div>
        );
      })()}

    </div>
  );
}
