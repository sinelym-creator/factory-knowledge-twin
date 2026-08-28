---
asset_class: contract
description: API·이벤트 계약 패키지 — 소비 규칙·버전 정책 (T0-5)
status: draft
lifecycle: D1 동결 → 이후 변경 = 버전 상승 + 호환성 검토(비호환 = Stop 조건)
size_limit: 3KB
---

# packages/contracts — API·Event Contract

> 🔴 **본 패키지는 오케(Integration owner)만 변경한다**(baseline §33.2). 다른 lane은 버전 명시로 소비만 한다.

## 구성

| 파일 | 내용 |
|---|---|
| `rest-api-v0.1.md` | REST 엔드포인트 계약(경로·메서드·요청/응답 형태·오류) |
| `agent-events-v0.1.schema.json` | agent 진행 이벤트 envelope + payload 스키마(WebSocket·replay 공용) |

## 원칙

1. **replay ⊂ live**: replay fixture의 이벤트는 live 이벤트와 «같은 스키마»의 부분집합이다 — envelope `mode` 필드만 다르다. Sandbox와 Live가 같은 화면 코드를 쓰기 위한 조건.
2. **evidence는 실체 참조**: 모든 evidence 항목은 `sourceId`(온톨로지 ID 체계 — T0-6)로 실데이터를 가리킨다. 붙일 근거가 없으면 필드를 비우는 게 아니라 이벤트를 내보내지 않는다.
3. **공개 금지 경로 부재**(baseline §16.2): 임의 SQL/Cypher/코드 실행·파일 접근·tool 임의 지정 엔드포인트는 계약에 존재하지 않는다 — 추가 시도 = Stop 조건.
4. **버전 규칙**: 파일명에 버전 명시(v0.1 → v0.2 = 새 파일 + 구본 superseded 표기). 비호환 변경 필요 시 작업 중단 → 운영자 회귀(§33.6).

## 검증 방법 (D2 contract test의 씨앗)

- `tests/contract/`에서 ① FastAPI 응답 ↔ rest-api 계약 대조 ② live run 이벤트 스트림 ↔ schema 검증 ③ replay fixture 전건 ↔ 동일 schema 검증(mode=replay).
