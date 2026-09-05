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
- 🔴 **좌석 ctx census = 매 보고 끝 1줄**(추정치·시각·성격 병기 · 못 재면 「census: 계측 수단 없음 — 외부 실측 요청」으로 명시 — 침묵은 미보고다) · **오케 순찰 = 총괄(자비스) census 시간당 1회 청구**(3좌석 · 그 값이 정본) · **50% 초과 = 즉시 교대 신청**(50% 이하 예고 금지) · 60% hard · 운영자 실측 착신 = 즉시 집행(운영자 하명 09-02 09:39·12:31 · 리바이2 25대 62% 미검출 재발 방지 성문).
- 좌석 교대·재기동 wake 발주문에 **본 규율 동봉 의무**(오케 집행) — 새 대(代)가 규율 없이 뜨지 않게 한다.
- 🔴 **조각 보고 = 조각마다 멘션 + (1/2)(2/2) 표기**(09-02 16:07 센쿠2 2부 미착신 실증 — 멘션 없는 조각은 오케 세션에 주입되지 않는다 · 「보인다 ≠ 들어온다」). 가능하면 1조각(≤2000자).
- 🔴 **메시지 헤더에 손 라벨 시각을 쓰지 않는다 — Discord ts 가 정본** · 판정에 쓰는 시각만 본문에 `date` 실측값으로 명시(예: `date 23:24:59`) · 판정 창은 메시지 ts 로만 잡는다(09-04 23:31 자비스·스자쿠 합의 · 손 라벨이 2~3분 앞서 「회신이 발신보다 앞서는」 표가 생긴 6차 재발의 구조 처방).
- **순찰 fetch 폭 = 최근 10건 이상** · 발주 상한 시각엔 상한 전후 메시지를 직접 fetch — 3건만 떠서 뒤에 쌓인 보고에 밀린 착지 보고를 「보고 0」으로 오판한 자리(09-05 00:01 · 오케 책임).

## 4. 지금

| | |
|---|---|
| 재개 | `.claude/context/checkpoint.md` **1 Read** |
| 현황판 | `PROGRESS.md`(«지금»만) |
| 계획 | `project-plan.md`(Phase 0~6 + 기한 §1 = 7일 상한 09-04 · 순서 §2) |

## 5. Git

- 브랜치: `develop` 작업 · `main` 승격(운영자 게이트) · Conventional Commits(영어).
- 🔴 **배포·승격 절차(운영자 하명 09-05 20:03~20:06 · 영구 규칙)**: 🔴 **develop 환경 ≠ production 환경(분리 · 운영자 20:07 「디벌롭과 프로덕션은 구분해」)** — ① develop 병합 → ② **develop 배포 환경에서 독립 검증**(무대 = **`infra/develop-stage.ps1`** 스택 `fkt-dev-ai-api` `:8020` + 게이트웨이 `:8797` · 화면 축 = 로컬 빌드(Vercel develop preview 없음 · T7-42 ⑥ 실측) · runbook §8 · 무대 재검·E2E · 이상 없음 실측 · **production = `:8010`·`:8787`·공개 도메인은 검증 무대가 아니다 · 무접촉**) → ③ **승격 청구**(운영자 DM · 근거 = ② 결과) → ④ **운영자 허가** → ⑤ production 배포(main 병합 · Vercel production · 컨테이너 재생성). 🔴 허가 없는 production 변경 0 — 「production 라이브 경로에 닿는 변경」(게이트웨이 프롬프트 파일 등 실행 중 프로세스가 읽는 것 포함)도 배포다: production 이 읽지 않는 자리(develop 스택)에서 검증한 뒤 ③으로 간다. 결정 위임(09-05 19:13)은 이 절차를 덮지 않는다.
- GitHub Public 개설·push는 운영자 확인 후(공개 행위). 그 전까지 로컬 git만.
- lane 브랜치는 병합 즉시 원격에서 삭제한다(`gh pr merge --merge --delete-branch`) — 원격 = `develop`·`main` 만(운영자 하명 09-01 12:16 「정리 가능한 것은 정리」 · lane 99본 정리). 병합된 lane 재push 금지 · 새 작업 = 새 lane.
- 🔴 **좌석(구현·검증) 작업 = worktree 에서만**: `git worktree add ../_wt/{slug}-{ticket} -b lane/{slug}-{ticket} origin/develop`(리포 **형제** 디렉토리 `../_wt/` · 리포 안에 만들면 `?? _wt/` 로 메인 트리를 더럽힌다). **메인 체크아웃(`factory-knowledge-twin/`)은 오케 전용** — 좌석의 편집·브랜치 생성·stash 금지. 좌석 파일 이전은 **경로 지정** stash(`git stash push -u -- <내 파일>`)만 — 경로 무지정은 타 좌석 파일을 삼킨다(09-01 12:42~12:56 3건 재발 성문).
- 🔴 **worktree 제거 전 = 컨테이너 마운트 대조 의무**(D-13 · 09-01 15:49 사고): `docker ps -a` 전수의 `Mounts.Source` 에 제거 대상 경로가 **한 건이라도** 잡히면 제거 금지. gitignored 볼륨(`.volumes-*`)은 `git status --porcelain` 이 못 본다 — 「git 이 깨끗하다」≠「지워도 되는 게 없다」. `git worktree remove` 는 ignored 파일까지 디렉토리째 지운다. 배포 컨테이너의 바인드 볼륨은 워크트리 안에 두지 않는다(리포·`_wt/` 밖 고정 경로).
- 🔴 **앞 명령의 성공을 뒤 명령의 전제로 쓰지 마라** — 커밋이 hook 에 막혔는데 `push` 가 그대로 돌아 원격 lane 이 빈 브랜치가 된 자리(09-05 01:05 리바이2 · #690) · 무조건 `push --delete` 가 CI 미완 PR 을 닫은 자리(09-05 00:5x · #688). 커밋→푸시→PR→병합→삭제는 **각 단계의 결과를 실측(rc·`git log`·`gh pr view --json state`)한 뒤** 다음으로 간다 · `&&` 로 묶지 않은 것은 「실패해도 다음이 돈다」는 뜻이지 안전이 아니다.
- **Windows 에서 `git worktree remove` 는 `node_modules`·`.next` 잔여로 「Directory not empty」 실패 후 등록만 해제될 수 있다** — 디렉토리 삭제(`Remove-Item -Recurse -Force`) 뒤 `git worktree prune` 까지가 정리이고, 확인은 목록이 아니라 **경로 실재**로 한다(09-04 23:58 리바이2 실측). 제거 전 3단 대조 = 병합 실측(`git rev-list --count origin/develop..lane` 0) · Mounts.Source ∩ `_wt` 0 · **실행 프로세스 cwd 가 그 워크트리 안이면 제외 — cwd 는 `psutil` 로 pid 별 직독(명령줄·exe 는 보조 · 09-05 21:33 리바이2 실측: 서버 5대가 명령줄·exe 0건 · cwd 5건 = 명령줄만 봤으면 삭제) · cwd 판독 불가 pid 가 개발 도구면 그 트리 보류**(무대 `:8199` 보존 사례). cwd 스캔은 **자기 계보(self+조상 pid)를 배제**하고 **2.5초 간격 2표본의 교집합**만 「산 것」으로 센다 — 스캐너 자신의 셸이 그 트리를 cwd 로 잡아 거짓 HOLD 를 낸 자리(09-05 21:58 리바이2 실측).
