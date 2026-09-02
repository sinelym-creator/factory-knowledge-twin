# PROGRESS — factory-knowledge-twin 작업 현황판

> **«지금»만 담는다.** Phase 상태 = project-plan §4 · 진행률 = 티켓 원장 · 재개 = checkpoint 1 Read. done 10행 초과분은 CHANGELOG로 회전.

## in progress

| Phase | 티켓 | 담당 |
|---|---|---|
| 4 | **T4-3 공개 RC** — ✅ 게이트 2 코드 4칸+ⓔ+ⓖ(PR#268·#270·#272·#273) · ✅ 게이트 3 노트북 층(Funnel `:8443` 상시 · 배포 3본 · 드릴 3면 0 · 10:42) · ✅ 셸 층 착지 **https://factory-knowledge-twin.vercel.app**(main 승격 PR#271 · Redeploy 11:02 · 3층 PASS) · ✅ main 재승격 PR#282 `232d599`(D-10 픽스 라이브 11:53 · 폐하 E1) · 🔴 **D-11 진행** = Production `/api/*` 엣지 rewrite 간헐 502 `DNS_HOSTNAME_EMPTY`(12:19~ · 44~80% · 외부 층 = Vercel 엣지 한정 · 우리 축 0) → 폐하 재가 (C) GET 1회 재시도 + (B) 함수 프록시 병행 → ✅ **(C) 라이브 13:01:15**(PR#289→#290 main `0bf99c1` · 브라우저 GET 축만 · 셸 502 불변 3/5) → ✅ **(B) 함수 프록시 라이브 13:30:48**(PR#293→#294 main `4b6916d` · `X-Matched-Path: /api/[...path]` · WS 만 rewrite 잔존 · 효과 미측(전 0/15) · 회귀 없음) → **D-11 종결(구조적 우회)** · 🔴 **D-12 완화·관측 승격 · 미종결(P0 · #297 → main `8d6e745` 14:30 · 뭉치 10건 구제 0/10 · 검증 #302 「관측 성립 · 구제 미성립 · 해소 아님」 · D-12b 사유 코드 #301 → main `8556577` 14:55 · 승격 직후 창 0건 · 🔴 2차 뭉치 15:13:51~15:30:43 ≈17분 입장 불통(`ENOTFOUND` · 리졸버 노드 오염 · 인스턴스 단위) → Q-67+Q-68 승격 15:30:43 = 인스턴스 교체로 복구(인과 미분리) · **D-12d DNS 우회 lookup #316 병합 15:44(undici 8.10.1 · 승격 재상신 중)** · Q-66 종결 #305 · 검증 #302·#314·#315)** = `/enter` 서버사이드 세션 발급 뭉치는 간헐 실패(함수 egress 새 연결 · ai-api 도달 0 · 13:26~13:35 35/35 pending → 13:42~ 6/6 성공) → 다음 사이클 1착(완화 = 네트워크 실패 한정 재시도 + why 로깅 · 발주문 초안 有) · 검증 큐 잔여 = Gate 6 외부 ⓐⓑ·동시 요청·귀속(evidence §4.4) · ✅ C 칸 재부팅 1회 실측 **17 PASS / 0 FAIL / SKIP 1**(SKIP = ai-api healthcheck 미정의 · 잰 것 아님 · 15대 14:17 · Q-66 계측기 위양성 1차) → ✅ 판정문 PR#298 병합(C 칸 PASS 한정) · 잔여 = T4-4 본 판정 → 완결 판정 | 오케(배포·승격 직접) + 센쿠2(코드·문서) + 리바이2(외부 검증) |

## todo

| Phase | 태스크 | 선결 |
|---|---|---|
| 3·4 | T3-6·T4-4 그물 선행 소조각(검증 좌석 — D-3 재검·Q-41·Q-42 사이 유휴 메움) | 검증 좌석 흐름 보며 |
| 4 | T4-3 Tunnel·Vercel 공개 RC(🔴 운영자 확인 1회 재상신) | T4-1·T4-2 |
| 5·6 | T3-6 재실행 9(검증 ≈1h) · 최종 판정문 「Release 후보 — 축소 적용(v0.3)」(오케) · 공개 경계 최종 스캔(검증) · CHANGELOG 오늘분 · 원장 종결 · §35.7 관문 상신 · 소조각 = README 6줄+clean env 재실측 짝 · verdict §4 조건 9 갱신 · `API_BASE` 공용 상수(tests/api) · `t44_outage_watch` 자식 rc 판정(§8.7-2 기지) · `tests/**` 6본 compose project 인자 | 승격 ✅ 11:18 · 외부 재실측 ✅ 12:05 → 재부팅 ✅ 13:20(ⓒ 자동 복귀 PASS 13:38) → 20대 = 스캔 ✅ #377 · tests 6본 ✅ #376 → **진행 중 14:1x** = 센쿠2 D-19 CI 게이트 수리(+D-20 CGNAT 게이트 축) · 리바이2 D-20 치환(evidence 3히트) → 다음 = `apps/` 2히트 치환(센쿠2) · 원장 3히트(오케) · T3-6 본 판정 · 최종 판정문 |

## 릴리스 뒤 개선 (폐하 「이후 개선사항으로 기록하고 개선」 09-02 10:40)

| 항목 | 내용 | 근거 |
|---|---|---|
| 🔶 **Q-72 부분 저하** | 색인과 어긋난 문서 조각이 있으면 지금은 조사 전체가 `step_failed:vector` 로 멈춘다(fail-closed · 승인) → 어긋난 조각만 배제 + 경고 이벤트로 계속(코드 변경 + GS-01 회귀 1회) | 원장 Q-72 · runbook §4-1d |

## blocked (운영자)

| ✅ **D-13 종결(16대 · 16:26)** — 폐하 「재구성」 16:11:02 → 센쿠2 6단계 ≈15분(볼륨 `_stack/.volumes-t15` · migrate 8본 선행(순서표 누락 보완) · seed 28/28 · neo4j 재적재 309/448 내용 대조 어긋남 0 · health ok/ok) · 실물 = postgres named volume `fkt-senku2-t15_pgdata` / neo4j bind 잔존(비대칭 · 후속) · 스크립트 PR #323 병합 `295c95d`(hygiene 절대경로 → 상대 기본값 수정 뒤) · 게이트 #321 병합 `1d32fa7` · 폐하 보고 16:14(사유)·16:27(종결) |
| 🔶 **D-12e = 축1 설치 부분 PASS(부팅 20/20 · 설치 40 · 실패 0) / 축2 구제 판정 불가** — 판정표 5행(리바이2 #327 · `fallback=`≥1 + 그 req 의 sid 만이 작동 증거 · mod 는 곁가지) · 판정 창 ①②(17:05~17:07 · 80/80 · fallback 0) = 미오염 · 다음 창 조건 = NXDOMAIN 연속 ≥3(자비스 폴링) · 🔴 D-14 로 오늘 승격 불가 → 축2 판정은 내일 |
| 🔴 **D-14 Vercel 일일 배포 상한 100 도달(17:06 · prod 8 + preview 92)** — 오늘 승격 불가 · 처방 ⓐ lane/* preview 끔(vercel.json 1줄 · 센쿠2 선준비) = **폐하 「진행」 17:12:21 → 센쿠2 집행 중** · 팀 규율 = push 묶기 · 승격 ≤4/일 목표 · PR 판정은 hygiene + 독립 재실행만(Vercel check = 상한 사유) |

## done

| 태스크 | 산출물 | 시점 |
|---|---|---|
| ✅ **P6 공개 경계 최종 스캔(20대)** — 리바이2 26대 PR#377 `3096e6e` · 6축×모집단 2(트리 469 · 이력 832커밋) · 대조군 어긋나면 exit 2 · 트리 위반 **0** · D-15 잔여 사정거리 종결 · 이력 축 §35.4 ⑦ 채움 · 회부 2 = **D-19**(CI 시크릿 게이트 하이픈 사각) · **D-20**(CGNAT IP 8히트 · 폐하 ⓐ 승인) | `tests/api/public_boundary_scan.py` · `evidence/t5-6-public-boundary-final-scan.md` · verdict §35.4 | 09-02 14:12 |
| ✅ **D-18 잔여 2 = `tests/**` 6본 project 인자(20대)** — 센쿠2 29대 PR#376 `39b66a4` · 재현 6/6 exit 2 → `-Project` 배열 11/11 · 판정 행 3모드 무변 · 격리 스택 잔해 0 | `tests/data/run-*.ps1` 4 · `tests/graph/run-graph-verify.ps1` · `tests/schema/run-probes.ps1` | 09-02 14:07 |
| ✅ **Q-70 외부 재실측 PASS + Q-69 화면 축 실물(19대)** — 리바이2 25대 PR#373 · Funnel OFF 창 11:59:33~12:05:33(자비스) · 창 안 확정 6/6(`startedAt`) · `/enter` 2,497~3,840ms ≤8,000ms · `cappedOut` 없음 · health/live 500 6/6 · 「미연결」 6/6↔기준선 0/3 · 24대 25.5s 대비 ≈10배 · Q-69 배지 `◌미연결` 실물 · 복구 지연 상한 ≤4분 08초 · gap 15s 이탈 명기 | `evidence/t4-4-external-outage-verification.md` §9 · `evidence/t5-5-gate-verdict.md` 3곳 | 09-02 12:28 |
| ✅ **D-17 종결(E2E) + 배포 DB restart 정책 ⓒ(19대)** — GS-01 공개 경로 replay 완주(`RUN-dac5edac664f` · 32 이벤트 · 5단계 · D-17 이미지) · 폐하 「권장 승인」 12:14 → t15 postgres·neo4j `unless-stopped`(센쿠2 · StartedAt 불변 = 무재시작 증명) · `-prev` = `no`(8010 충돌 차단 · 롤백 = 수동 start) | 컨테이너 4본 정책표 · 원장 D-17·Q-63 | 09-02 12:24 |
| ✅ **README 표 자동 대조 그물(19대)** — 센쿠2 28대 PR#372 `a029837` · `scripts/check-readme-versions.mjs` + hygiene step 1 · 기대값·출처 경로 0(README 가 지목한 파일을 읽음) · 비교 0건 = 실패 · 매 실행 참/변조 두 번 · 러너 로그 3/3 | `scripts/` · `.github/workflows/ci.yml` | 09-02 11:40 |
| ✅ **Cypher 드릴 앵커 정본화(19대 · 하드코딩 원칙)** — 리바이2 25대 PR#370 `a256ca0` · 리터럴 앵커 6줄 제거 → `allowlist.APPROVED_QUESTIONS` 실행 시점 추출 · 못 뽑으면 exit 2 · 결과 무변 | `tests/api/cypher_surface_drill.py` | 09-02 11:2x |
| ✅ **D-18 잔여 seed.ps1 수리(19대)** — 센쿠2 28대 PR#368 `f001176` · 재현 먼저(비기본 project 에서 `:56` exit 1 · 컨테이너 healthy) → `-Project` 배열 5곳 · 후보 목록 문면 · 대조군 4열 · TRUNCATE 형 재적재 ≠ skip 형 멱등 · tests 6본 = 검증 별건 | `data/seed.ps1` | 09-02 10:55 |
| ✅ **T5-2 대응표(19대)** — 리바이2 25대 PR#367 `844f420` · 13항+유지 1 = 14행 · 새 실행 0 · 모든 칸 출처 [V]/[N] · 두 원본 불일치 0 · PASS 6/조건부 1/부분 2/측정 불가 3/미충족 2 · 「Gate 7 은 서 있지 않다」 · 시각 열 = 원본에 없어 만들지 않음 | `evidence/t5-2-gate7-map.md` | 09-02 10:44 |
| ✅ **T5-2 신설 3 착지(19대)** — 리바이2 25대 PR#366 `84a585a` · SQL 질의 표면(「도달 불가」 단서) · Cypher 층 A/B(파라미터 바인딩 · 추출기 = ID 토큰) · 문서 prompt injection(표지 선행 · 조건부 PASS · 무결성 배제 기전 · 재색인 경유 축 미측) · Gate 7 미충족 4→2 · 부산물 Q-72(fail-closed 유지) | `tests/api/{query_surface_sql,cypher_surface,prompt_injection_authority}_drill.py` · `evidence/t5-2-gate7-new-nets.md` | 09-02 10:31 |
| ✅ **D-17 배포 반영(19대)** — 센쿠2 28대 · 8010 이미지 `fkt-deploy-ai-api:6e1487d` · starlette 1.3.1 · 로컬·공개 health 200 `build 6e1487d` · 의존 불통 3분 38초(🔴 오케 발주 결함 = 승계 목록에 network 누락 → 「같은 형상 = inspect 전량 diff」 게이트) · GS-01 = 외부 재실측에서 E2E 대조 · 롤백면 `-prev` 존치 | 컨테이너 `fkt-deploy-ai-api` | 09-02 10:08 |
| ✅ **P6 README 실행 절(19대)** — 센쿠2 28대 PR#365 `6e1487d` · runbook §4 정본 지목(복제 0) · 전제조건 실측표 · 「배포 후 게시」 자기 선언 제거 · KPI «측정 전 빈 칸» · 「Release 후보 — 축소 적용(v0.3)」 · 「Portfolio Release」 0 · 판정 「이대로 확정」(§35.6 README 만으로 = 미충족 유지 · 6줄+재실측 짝은 별건) | `README.md` | 09-02 10:0x |
| ✅ **D-18 migrate.ps1 project 선택 수리 + runbook 5단(18대)** — 센쿠2 28대 PR#362 `03056f6` · 4곳 `-p` · 미지정 실패 문면 · 주석 실측대로 · runbook §4 = compose→project→migrate→seed→indexer venv+색인→projector venv+투영 · 스키마 008 · 네트워크 문장 | `services/ai-api/db/migrate.ps1` · `docs/deployment/runbook.md` | 09-02 09:26 |
