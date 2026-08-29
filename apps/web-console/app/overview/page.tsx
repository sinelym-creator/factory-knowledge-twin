import { Placeholder } from "@/components/placeholder";

export default function OverviewPage() {
  return (
    <Placeholder
      screen="① Factory Overview"
      route="/overview?plant=FAC-A"
      planned={[
        "설비 12대 카드 그리드(4열) — 이상 1대만 도드라진다",
        "40px KPI 스트립(상시 고정) · 24h 스파크라인",
        "우측 알람·시나리오 도크 — 「▸ 조사 시작」이 ②로 넘긴다",
        "첫 진입 안내 카드(§0.1 — 세션 최초 1회 · 오버레이 아님)",
      ]}
    />
  );
}
