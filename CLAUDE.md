# factory-knowledge-twin — 주법

> **이 리포에서만 참인 것**만 적는다. 글로벌 컨벤션(~/.claude/CLAUDE.md)이 기본이다.

## 1. 무엇인가

**Factory Knowledge Twin — AI Operations Console.** 제조 데이터·Ontology·RAG·Agent를 운영 가능한 제품 UX로 연결하는 **Portfolio-grade Product PoC**(역량 시연용 · 🔴 **기한 = 개시 08-28 후 최대 7일 = 09-04 «상한» · 상한이지 목표가 아니며 더 빨리 끝낸다**(운영자 확정 08-28 · project-plan §1 · baseline §33.4 14일표는 원문 보존일 뿐 일정 근거 아님) · GitHub Public · Apache-2.0).

🔴 **단일 baseline = `docs/baseline/poc-baseline-v0.2.md`** — 범위·완료 기준·라이선스·공개 경계 변경은 **baseline 먼저 개정**(§0.3). 이 주법은 baseline을 재기술하지 않는다.

## 2. 도메인 제약 (baseline 요지 — 원문이 정본)

- 🔴 **측정-주장 경계**(§0.2): synthetic PoC 결과를 실제 공장 ROI로 표현하지 않는다. `Target`/`Actual`/`PASS·FAIL`/Evidence 분리. 실측 전 수치는 «잠정 목표».
- 🔴 **구현 보고 ≠ acceptance**(§32.1): 독립 검증 PASS + E2E 통합 PASS만 Release 범위에 든다.
- 🔴 **Golden Scenario 회귀 = 최우선 복구**(§33.1) · Day 8 이후 기능 동결 · P0 고정, P1/P2는 P0 완료 후 승인.
- 🔴 **공개 경계**(§15.2·§16·§34.6): synthetic data만 · Claude 구독을 공개 API로 노출 금지 · secret/절대경로/실데이터 커밋 금지 · 임의 SQL·Cypher·코드 실행 경로 금지.
- **Stop 조건**(§33.6) 발생 시 신규 기능 중단 → 운영자 회귀.

## 3. 팀 (3좌석 · write-scope lane = baseline §33.2)

| 좌석 | 직무 | 독점 write scope |
|---|---|---|
| 오케스트레이터 | 플랜·작업 지시·워크플로우 관리 · 설계 · 시나리오 테스트 계획 · 통합 | `packages/contracts/**` · `docs/**` |
| 구현 | 프레임워크·환경 설치 · 구현 | `apps/**` · `services/**` · `data/**` · `packages/ontology/**` |
| 검증 | 설계·구현·시나리오 검증 · E2E(playwright) · 보안 | `benchmarks/**` · `tests/**` · `evidence/**` |

- 오케가 전체 플랜 기준으로 발주하고 **최종 완료까지 책임**진다. 보고 라인: 팀 오케스트레이터 → **운영자 직보**.
- 매일 최소 2회 integration reconciliation(§33.5) · 근거 등급(E1 실측/E2 출처/E3 소견/E4 가설) 병기.

### 통신·순찰 규율 (운영자 하명 08-30 · 전 좌석·전 세대 적용 — 재발 방지 성문)

- 🔴 **결과 보고 = 오케 멘션 필수 · 예외 없음**(완료 보고·판정 회부·진행 신호·대기 진입·회귀 사안). 멘션 없는 보고는 미착신 취급 — 오케 세션은 멘션에만 깨어난다(시스템 성질).
- 🔴 **오케 = 주기 순찰 의무**(팀 채널 fetch — 멘션은 보조 신호). 확인 책임은 신호가 아니라 리더에게 귀속 — 공백 재발 시 보고 서식은 「순찰 태만 · 오케 책임」이다.
- **유휴 최소화**: 오케는 다음 티켓 발주문을 선작성해 발주 공백을 없애고, 판정 회부는 착신 즉시 처리한다. 좌석은 작업 완료 후 «스탠바이 신고»(멘션)까지가 보고다.
- 좌석 교대·재기동 wake 발주문에 **본 규율 동봉 의무**(오케 집행) — 새 대(代)가 규율 없이 뜨지 않게 한다.

## 4. 지금

| | |
|---|---|
| 재개 | `.claude/context/checkpoint.md` **1 Read** |
| 현황판 | `PROGRESS.md`(«지금»만) |
| 계획 | `project-plan.md`(Phase 0~6 + 기한 §1 = 7일 상한 09-04 · 순서 §2) |

## 5. Git

- 브랜치: `develop` 작업 · `main` 승격(운영자 게이트) · Conventional Commits(영어).
- GitHub Public 개설·push는 운영자 확인 후(공개 행위). 그 전까지 로컬 git만.
- lane 브랜치는 병합 즉시 원격에서 삭제한다(`gh pr merge --merge --delete-branch`) — 원격 = `develop`·`main` 만(운영자 하명 09-01 12:16 「정리 가능한 것은 정리」 · lane 99본 정리). 병합된 lane 재push 금지 · 새 작업 = 새 lane.
- 🔴 **좌석(구현·검증) 작업 = worktree 에서만**: `git worktree add ../_wt/{slug}-{ticket} -b lane/{slug}-{ticket} origin/develop`(리포 **형제** 디렉토리 `../_wt/` · 리포 안에 만들면 `?? _wt/` 로 메인 트리를 더럽힌다). **메인 체크아웃(`factory-knowledge-twin/`)은 오케 전용** — 좌석의 편집·브랜치 생성·stash 금지. 좌석 파일 이전은 **경로 지정** stash(`git stash push -u -- <내 파일>`)만 — 경로 무지정은 타 좌석 파일을 삼킨다(09-01 12:42~12:56 3건 재발 성문).
