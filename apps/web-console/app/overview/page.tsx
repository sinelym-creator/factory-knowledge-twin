import { cookies, headers } from "next/headers";

import { OverviewBody } from "@/components/overview/overview-body";
import { Unavailable } from "@/components/unavailable";
import {
  CONTRACT,
  type EquipmentDetail,
  type Overview,
  type Scenario,
  apiGetServer,
} from "@/lib/contract";
import { SESSION_COOKIE, parseSession } from "@/lib/session";
import { fetchSessionRuns } from "@/lib/session-runs";

/**
 * ① Factory Overview (wireframes §1) — 실데이터 결선 (T3-2).
 *
 * 🔴 **첫 화면은 서버에서 그린다.** 방문자가 처음 보는 1초에 빈 껍데기를 보이지 않기 위해서다.
 *    다만 서버 렌더가 초록인 것이 «브라우저도 산다»는 뜻은 아니다 — V-1이 정확히 그 함정이었다
 *    (서버 렌더는 멀쩡한데 브라우저의 /api/* 가 전부 401). 그래서 이 화면의 상호작용
 *    (스파크라인·조사 시작·설비 팝오버)은 **브라우저가 직접 부른다**: 두 축이 다 살아야
 *    화면이 산 것이다.
 *
 * 🔴 **plantId를 코드에 박지 않는다.** `/plants`로 물어서 «있는 것»을 쓴다 — 박아 두면
 *    seed가 바뀐 날 화면이 조용히 빈다.
 */
export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ intro?: string }>;
}) {
  // 🔴 안내 카드를 «다시 여는» 자리는 URL 이다(§0.1 ① 재노출 · 앱바 `?`). 클라이언트 이벤트
  //    버스로 하면 다른 화면의 `?` 는 아무 일도 못 하고, 그 침묵은 고장과 구별되지 않는다.
  const { intro } = await searchParams;
  const jar = await cookies();
  const cookieHeader = (await headers()).get("cookie") ?? "";
  const session = parseSession(jar.get(SESSION_COOKIE)?.value);

  const plants = await apiGetServer<{ plantId: string; name: string }[]>(
    CONTRACT.plants,
    cookieHeader,
  );
  if (plants.state !== "ok" || plants.data.length === 0) {
    return (
      <Unavailable
        screen="① Factory Overview"
        why={plants.state !== "ok" ? plants.why : "공장 목록이 비어 있다"}
        // 🔴 제목은 세그먼트 레이아웃이 이미 그렸다 — 여기서 또 h1 을 내면 두 개가 된다
        heading={false}
      />
    );
  }
  const plant = plants.data[0];

  const [overview, scenarios] = await Promise.all([
    apiGetServer<Overview>(CONTRACT.plantOverview(plant.plantId), cookieHeader),
    apiGetServer<Scenario[]>(CONTRACT.scenarios, cookieHeader),
  ]);
  if (overview.state !== "ok") {
    return <Unavailable screen="① Factory Overview" why={overview.why} heading={false} />;
  }

  // 🔴 헤드라인 문장은 «가장 심각한 활성 알람 1건»이다 — 정렬은 서버가 했고(계약 v0.1.7-정정)
  //    화면은 첫 줄을 읽을 뿐이다. 최댓값을 화면이 고르면 그 규칙이 화면마다 갈린다.
  const top = overview.data.activeAlarms[0] ?? null;
  // 무엇이 임계를 넘었는지는 «센서의 측정 종류»가 말한다. id(`SN-204-VIB`)에서 뜻을 추측하지
  // 않고 설비 상세를 한 번 더 물어서 실제 낱말을 가져온다 — 추측한 낱말은 틀리고, 틀린 문장이
  // 헤드라인에 서면 그것이 화면의 첫인상이 된다.
  const topEquipment = top
    ? await apiGetServer<EquipmentDetail>(CONTRACT.equipment(top.equipmentId), cookieHeader)
    : null;

  return (
    <OverviewBody
      plantName={plant.name}
      overview={overview.data}
      scenarios={scenarios.state === "ok" ? scenarios.data : []}
      sessionId={session?.id ?? null}
      sessionOrigin={session?.origin ?? null}
      sessionRuns={await fetchSessionRuns()}
      headline={buildHeadline(overview.data, topEquipment?.state === "ok" ? topEquipment.data : null)}
      // 🔴 「받은 시각」은 «서버가 이 응답을 그린 순간»이다 — 렌더 안에서 시계를 읽으면 서버와
      //    브라우저가 다른 초를 그려 hydration 이 깨진다(결함 D-2 · lib/time.ts 머리말).
      receivedAt={new Date().toISOString()}
      forceIntro={intro === "1"}
    />
  );
}

function buildHeadline(
  overview: Overview,
  equipment: EquipmentDetail | null,
): { text: string; alarmId: string | null; equipmentId: string | null } {
  const top = overview.activeAlarms[0];
  if (!top) {
    // 🔴 wireframes §1 인터랙션 ⑥의 대체문. 「알람이 없다」를 빈 자리로 두면 화면은
    //    «데이터가 안 왔다»와 «지금 정상이다»를 같은 모습으로 그린다.
    return { text: "모든 라인이 정상 가동 중입니다.", alarmId: null, equipmentId: null };
  }
  const line = overview.lines.find((l) =>
    l.equipment.some((e) => e.equipmentId === top.equipmentId),
  );
  const eq = line?.equipment.find((e) => e.equipmentId === top.equipmentId);
  const sensor = equipment?.sensors.find((s) => s.sensorId === top.sensorId);
  const what = sensor ? `${sensor.measurementType} 측정값` : `${top.sensorId} 관측값`;
  const numbers =
    top.observedValue !== null && top.thresholdValue !== null
      ? ` (임계 ${top.thresholdValue} → 관측 ${top.observedValue}${sensor ? ` ${sensor.unit}` : ""})`
      : "";
  return {
    text: `지금 ${line?.name ?? "알 수 없는 라인"}의 ${eq?.name ?? top.equipmentId}에서 ${what}이 임계를 넘고 있습니다${numbers}.`,
    alarmId: top.alarmId,
    equipmentId: top.equipmentId,
  };
}
