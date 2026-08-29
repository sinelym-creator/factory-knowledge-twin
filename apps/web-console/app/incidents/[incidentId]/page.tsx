import { Placeholder } from "@/components/placeholder";

export default async function IncidentPage({ params }: PageProps<"/incidents/[incidentId]">) {
  const { incidentId } = await params;
  return (
    <Placeholder
      screen="② Incident 조사"
      route="/incidents/[incidentId]?run={runId}&step={stepId}"
      ids={[incidentId]}
      planned={[
        "4분할(baseline §11.2): 좌 조사 타임라인 · 중앙 센서 추세 · 우 원인 후보 · 하단 evidence",
        "근거 상시 도크(§2.1) — 후보마다 근거가 붙어 다닌다",
        "TTAE 표시(§2.2) — 🔴 측정-주장 경계: 실측 전 수치는 «잠정 목표»",
        "「초안 보기」가 ④ 작업지시서로 넘긴다",
      ]}
    />
  );
}
