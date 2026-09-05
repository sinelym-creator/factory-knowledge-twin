# Factory Knowledge Twin

공장 설비에 이상이 생기면, 담당자는 센서 기록·점검 절차서·"베테랑 머릿속의 관계 지식"을 따로따로 뒤져야 합니다. 그 사이 설비는 서 있습니다.

이 프로젝트는 그 세 가지를 하나로 묶어 두고, AI가 정해진 절차대로 조사한 뒤 **원문 인용과 그래프 경로가 붙은** 원인 후보와 작업지시 초안을 내놓는 운영 콘솔입니다. 확정은 항상 사람이 합니다.

포트폴리오용 PoC입니다. 데이터는 전부 합성(synthetic)이고, 실제 공장이나 설비와 연결되어 있지 않습니다.

## 화면에서 벌어지는 일

1. 공장 전경에서 진동 알람이 뜬 CNC 설비를 클릭합니다.
2. 3주간 완만히 오르다 최근 하루 급등한 진동 그래프를 확인합니다.
3. "AI 조사"를 누르면 에이전트가 수치 조회 → 문서 검색 → 관계 추적을 단계별로 진행합니다. 과정이 화면에 그대로 흐릅니다.
4. 원인 후보(예: 베어링 마모)마다 매뉴얼 원문 인용과 설비→고장→절차→안전규정 경로가 붙어 나옵니다.
5. AI가 만든 작업지시 초안(안전 잠금 절차 포함)을 사람이 고치고 승인하거나 반려합니다.
6. 리셋하면 처음부터. 방문자마다 독립된 공간이 주어집니다.

로컬 AI 엔진이 꺼져 있어도 데모는 돕니다. 미리 기록한 조사 과정을 재생하는 REPLAY 모드가 기본이고, 엔진이 켜지면 같은 화면이 LIVE 모드로 바뀝니다. 어느 모드인지는 화면 배지에 항상 표시됩니다.

## 구조

```mermaid
flowchart LR
    V[브라우저] --> W[Next.js 콘솔<br/>Vercel · 상시 가동]
    W --> R[Replay 재생]
    W -.->|LIVE 모드일 때만| A[FastAPI + LangGraph<br/>로컬 PC]
    A --> P[(PostgreSQL<br/>pgvector)]
    A --> N[(Neo4j<br/>지식그래프)]
    A -.->|소유자가 켤 때만| S[합성 게이트웨이<br/>Claude Code CLI]
```

- **정본은 PostgreSQL 하나**입니다. 벡터 색인과 그래프는 언제든 다시 만들 수 있는 파생물입니다.
- **조사 절차는 LangGraph 상태 기계**로 돕니다. 계획 → 수치 조회 → 문서 검색 → 그래프 추적 → 종합 → 작업지시 초안 → 사람의 판단. 단계마다 이벤트가 남고 그대로 재생할 수 있습니다.
- **검색은 세 가지**(벡터·하이브리드·그래프)를 나란히 비교할 수 있습니다.
- **근거 없는 결론은 내보내지 않습니다.** 답할 수 없으면 "근거 없음"이 정답입니다.
- **LLM 합성은 선택 사항**입니다. 소유자 PC의 Claude Code CLI(구독)를 감싼 로컬 게이트웨이가 켜져 있을 때만 붙고, 응답이 조사 근거 밖을 인용하면 전부 거부됩니다. 공개 API로 구독이 나가지 않습니다. 세션당 Live 조사는 시간당 5회로 제한되며, 재생은 제한이 없습니다.

## 기술 스택

| 계층 | 기술 |
|---|---|
| 프론트엔드 | Next.js (Vercel) |
| 백엔드 | Python FastAPI · WebSocket |
| AI 워크플로우 | LangGraph |
| 검색 | pgvector · 하이브리드 · GraphRAG |
| 지식그래프 | Neo4j |
| 데이터 | PostgreSQL |
| 임베딩 | 로컬 모델 `intfloat/multilingual-e5-small` (처음 받을 때만 네트워크 필요) |

## 실행

새 클론에서 한 줄로 세웁니다.

```powershell
pwsh infra/bootstrap.ps1 -ProjectName fkt-<이름>
```

Docker 스택 기동 → 마이그레이션 → 합성 데이터 시드 → 벡터 색인 → 그래프 투영을 순서대로 돌리고, 끝에 health와 청크·노드 수를 검산합니다. 2026-09-04에 새 클론 한 대에서 완주를 확인했습니다(약 4분). 다른 환경에서도 되는지는 아직 재보지 않았습니다.

각 단계의 명령·옵션·주의사항은 [runbook §4](docs/deployment/runbook.md)에 있습니다.

전제 조건은 리포가 선언한 값 그대로입니다(CI가 이 표를 리포 실물과 대조합니다).

| 무엇 | 값 | 출처 |
|---|---|---|
| Docker | compose 스택 `pgvector/pgvector:pg16` · `neo4j:5-community` | `docker-compose.yml` |
| pnpm | **10.32.1** | `apps/web-console/package.json` |
| Node | **22** | `.github/workflows/security.yml` |
| Python | CI는 3.12, 새 클론 실측은 3.14 | 단일 선언 없음 |

bootstrap이 돌리는 여섯 단계의 정본 명령입니다. 5·6단은 venv를 먼저 만들어야 하고, 5단은 `PGPORT`를 꼭 지정해야 합니다(안 주면 다른 스택을 색인합니다).

<!-- excerpt:runbook-4 -->
| # | 정본 명령 | 정본 |
|---|---|---|
| 1 | `docker compose up -d` | [runbook §4-1](docs/deployment/runbook.md) |
| 2 | `$env:COMPOSE_PROJECT_NAME='<project>'` | [runbook §4-1a](docs/deployment/runbook.md) |
| 3 | `pwsh services/ai-api/db/migrate.ps1` | [runbook §4-1](docs/deployment/runbook.md) |
| 4 | `pwsh data/seed.ps1` | [runbook §4-1](docs/deployment/runbook.md) |
| 5 | `services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py` | [runbook §4-1](docs/deployment/runbook.md) |
| 6 | `services\projector\.venv\Scripts\python.exe services\projector\build_projection.py` | [runbook §4-1](docs/deployment/runbook.md) |
<!-- /excerpt:runbook-4 -->

## 디자인 · 접근성

다크 기본, 시스템 글꼴, 390~1440px 반응형. 대비 미달 0, 터치 대상 44px, 강제 색 모드와 `prefers-reduced-motion` 대응, 키보드만으로 가이드 투어 완주까지 확인했습니다. Chromium·WebKit·Firefox 에뮬레이션에서 오류 0. 실기기와 실사용자 검증은 아직 없습니다.

첫 방문에는 게임 튜토리얼처럼 한 걸음씩 짚어 주는 가이드 투어가 뜹니다. 언제든 "?"로 다시 열 수 있고, `?intro=1&tour=1`로 바로 열 수도 있습니다.

## 어디까지 검증했나

계획 정본은 [test-plan-v1.md](docs/plan/test-plan-v1.md)입니다. 초록만 세지 않고, 일부러 깨뜨려 빨강을 봤는지를 함께 기록합니다.

| 축 | 결과 (2026-09-04) |
|---|---|
| 골든 시나리오 | 10/10 완주 · 런타임 오류 0 |
| API 계약 | 74/74 |
| E2E (Playwright) | 135 passed · 3 failed(무대 부재) · 4 skipped |
| 예외 상황 25건 | 23 PASS · 2 미검증 |

구현 좌석의 초록은 완료가 아닙니다. 검증 좌석이 독립 무대에서 다시 잰 뒤에만 완료로 칩니다.

**성능 수치는 아직 없습니다.** 지연(P50/P95)과 벤치마크는 측정 전이라 빈 칸으로 둡니다. Live 합성 1건은 18~19초로, 잠정 목표 10초에 미달합니다.

## 알려진 제약

- 공개 셸(Vercel 경로)에서는 조사 실행의 WebSocket 스트림이 열리지 않습니다. 2초 간격 조회로 같은 화면을 만들고, 그 사실을 화면에 띄웁니다. 어느 구간이 끊는지는 아직 좁혀 재지 않았습니다.
- 오프라인 머신에서 임베딩 모델 다운로드 없이 세울 수 있는지는 재보지 않았습니다.
- 라이브 데모 링크는 이 문서에 싣지 않습니다.

## 안전 경계

- 모든 데이터는 합성 데이터입니다. 실제 회사·고객·설비 정보가 없습니다.
- 실제 설비를 제어하지 않습니다. 작업지시와 승인은 샌드박스 안의 시뮬레이션입니다.
- AI 판단은 사람의 승인 없이 확정되지 않습니다.
- Claude 구독을 공개 API로 노출하지 않습니다.

## 현재 상태

Release 후보 — 축소 적용(v0.3). 판정 정본 = [evidence/t5-5-gate-verdict.md](evidence/t5-5-gate-verdict.md), 결정 = [docs/decisions/004](docs/decisions/004-release-gate-verdict.md). 진행 원장 = [docs/plan/ticket-ledger.md](docs/plan/ticket-ledger.md).

## License

[Apache-2.0](LICENSE)
