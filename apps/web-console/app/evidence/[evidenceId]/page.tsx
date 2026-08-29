import { Placeholder } from "@/components/placeholder";

export default async function EvidencePage({ params }: PageProps<"/evidence/[evidenceId]">) {
  const { evidenceId } = await params;
  return (
    <Placeholder
      screen="③ Evidence 뷰"
      route="/evidence/[evidenceId]?run={runId}&tab=graph|doc"
      ids={[evidenceId]}
      planned={[
        "graph 탭 — 4-hop 경로 강조(설비 → 부품 → 고장모드 → SOP → 안전규정)",
        "doc 탭 — 문서 원문 + 인용 구간 강조 · revision·hash 표기",
        "모달 + 딥링크 양쪽으로 열린다(같은 URL이 같은 근거를 가리킨다)",
      ]}
    />
  );
}
