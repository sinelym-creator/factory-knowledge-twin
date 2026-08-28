---
asset_class: operations
description: 티켓 원장 — 진행률 유일 산법(✅/총)
status: active
lifecycle: 단위 완료·분모 변경 시 갱신 · 분모 변경은 「N→M」 선행 선언
size_limit: 8KB
---

# 티켓 원장 — factory-knowledge-twin

> **진행률의 유일 정본** = 본 원장의 티켓별 ✅/총(가중치 금지). 계층 = project-plan §5. 티켓은 해당 일차 발주 시 등재한다(선행 과계획 금지) — Phase 0은 전량 등재. 티켓 상세(AC 전문·하위 태스크·경과) = `docs/plan/tickets/T{ID}.md`(발주 시 생성 · 발주문 겸용).

## 원장 (진행률 = ✅ 3 / 총 12)

### 부트스트랩 (D0 · 완결)

| ID | 티켓 | 담당 | 상태 |
|---|---|---|---|
| B-1 | GitHub Public 개설 + 공개 경계 감사 + 이력 재구성 | 오케 | ✅ 08-28 |
| B-2 | CI 위생 게이트(GitHub-hosted) 배선 | 오케 | ✅ 08-28 |
| B-3 | 7일 작업 플랜 수립 + 운영 사이클 결속 | 오케 | ✅ 08-28 |

### Phase 0 — 제품·UX 방향 확정 (D0~D1 · AC 상세는 발주문에)

| ID | 티켓 | 담당 | AC 요지 | 상태 |
|---|---|---|---|---|
| T0-1 | `docs/product/product-brief.md` 초안 | 오케 | 사용자·문제·가치·3분 데모 narrative — 운영자 승인 가능 상태 | 대기 |
| T0-2 | `docs/product/ux-direction.md` — visual direction 3안 | 구현 | 3안 각: 무드·레이아웃·팔레트·대표 화면 1커트 + 선택 근거 | 대기 |
| T0-3 | P0 핵심 화면 wireframe + route/interaction 목록 | 구현 | Overview·Incident·Evidence·WorkOrder·전략비교 5화면 | 대기 |
| T0-4 | `docs/product/golden-scenario-spec.md` 초안(storyboard) | 오케 | 시나리오 단계·기대 evidence·데모 스크립트 | 대기 |
| T0-5 | `packages/contracts/` API·event contract v0.1 | 오케 | REST·WebSocket·replay event 스키마 — D1 동결 | 대기 |
| T0-6 | `docs/product/data-ontology-spec.md` v0.1 | 구현 | entity·relation·identifier 체계 — D1 동결 | 대기 |
| T0-7 | `docs/product/system-architecture.md` | 오케 | container·network·data flow·trust boundary | 대기 |
| T0-8 | 평가 질문 초안 8~10문 + acceptance threshold | 검증 | Direct·Multi-hop·Safety·Unanswerable 포함 | 대기 |
| T0-9 | Phase 0 산출물 독립 검증(AC 대조·정합) | 검증 | 전 산출물 PASS/FAIL 판정 + 지적사항 | 대기 |

### Phase 1+ (D2~ · 각 일차 발주 시 등재)

— 미등재.
