import { Placeholder } from "@/components/placeholder";

export default async function WorkOrderPage({ params }: PageProps<"/work-orders/[woId]">) {
  const { woId } = await params;
  return (
    <Placeholder
      screen="④ 작업지시서 편집·승인"
      route="/work-orders/[woId]"
      ids={[woId]}
      planned={[
        "초안 편집 — 부품·예상 시간·체크리스트",
        "근거 패널 — 인용한 SOP 절(3.2·3.3)이 옆에 붙는다",
        "🔴 안전 조치는 삭제 불가(SOP -REQUIRES-> SafetyRule이 근거)",
        "승인 / 반려 — 사람이 마지막에 판단한다",
      ]}
    />
  );
}
