import { Placeholder } from "@/components/placeholder";

export default function ComparePage() {
  return (
    <Placeholder
      screen="⑤ 검색 전략 비교"
      route="/compare?run={runId}&q={questionId}"
      planned={[
        "3열 결과 — Vector · Hybrid · GraphRAG 같은 질문에 나란히",
        "질문 선택은 상단 1줄(🔴 chat-first 금지 — 입력창이 주인공이 되지 않는다)",
        "전략별 근거 카드가 ③ Evidence로 연결된다",
      ]}
    />
  );
}
