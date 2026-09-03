# PROGRESS — factory-knowledge-twin 작업 현황판

> **«지금»만 담는다.** Phase 상태 = project-plan §4 · 진행률 = 티켓 원장 · 재개 = checkpoint 1 Read. done 10행 초과분은 CHANGELOG로 회전.

## in progress

| Phase | 티켓 | 담당 |
|---|---|---|
| 7 | 🔴 **T7-1 접근성 설정 대응** — 고대비·강제색상·큰 글자 **측정 중**(🔴 코드 변경 0 = 시안 컨펌 전 · 상한 45분 · 착수 18:24) | 센쿠2 36대 |
| 7 | 🔴 **T7-2 브라우저 호환 축** — webkit·firefox × 4뷰포트 × 2테마 **측정 중**(수리 금지·회부 · 상한 60분 · 착수 18:24) | 리바이2 35대 |
| 6 | ✅ **미측 1건 = 종결 09-03 17:57**(한 실행에서 「보임 2표본 → 걷힘 0건」 확인) — 구문: **잠정 문장의 «중간 노출»** — 「실려 나갔고 · 최종 화면에 안 남았고 · **중간은 재지 못했다**」. 처방 확보(스텁이 `error` 를 4초 늦게 보내면 1.5초 표본에 걸린다) · 창 45초 · 오늘 닫는 중 | 오케(브라우저) + 센쿠2(창) |
| 6 | ✅ **T6-4·T6-5 = 전건 종결** — 미측 7축 → 대상 결함 **6건 검출·수리·재측** · 공개면 착지 3축(다크·투어·대비) **PASS**(외부 경로 · 근거 = 공인 IP) · 대조군 전 축 발화 | 리바이2 34대 |
| 6 | ✅ **승격 6회차 = 공개면 반영 확인** — main `1987ab3` · CSS 마커 5종 검출 · **외부 도달 확정**(캐시버스터 재호출 7.77초) · 🔴 판정기를 승격 前에 울려 RED 확인 | 오케 + 센쿠2 |
| 6 | ✅ **서버 축(D-24 계열) 배포 실증 = 전건 PASS** · 정리(폐하 하명) 완료 · **배포 무접촉** | 센쿠2 35대 |

## todo

| Phase | 태스크 | 선결 |
|---|---|---|
| 6 | 리바이2 ⑦ 공개 replay rationale 1회(승격 뒤) · README 「AI 조사」 문면 = LLM 축 정렬 소조각(후보) · 전대 원시 5건 리포 착지 PR(후보) | 승격 READY |
| 6 | 관문 뒤 소조각(전부 비차단) = Q-73 2차 판정(진행 중) · verdict 관문 행 · OFF 창 재현 1회(자비스 Funnel OFF 창 필요) · `API_BASE` 공용 상수(tests/api) · `t44_outage_watch` 자식 rc 판정 · 21대 마감 6단계 | D-004 ✅ 16:59 · #391 판정 뒤 |

## 릴리스 뒤 개선 (폐하 「이후 개선사항으로 기록하고 개선」 09-02 10:40)

| 항목 | 내용 | 근거 |
|---|---|---|
| 🔶 **Q-72 부분 저하** | 색인과 어긋난 문서 조각이 있으면 지금은 조사 전체가 `step_failed:vector` 로 멈춘다(fail-closed · 승인) → 어긋난 조각만 배제 + 경고 이벤트로 계속(코드 변경 + GS-01 회귀 1회) | 원장 Q-72 · runbook §4-1d |
| ✅ **D-22 reset-modal 귀속** | 대상 결함 아님 · 진범 = 그물 전제(`FallbackBanner` 는 online 이면 안 뜸) · 손잡이 1개 프록시 3열(자극 계수 overridden 0/9) · 그물 수정 PR 후보(`reset-modal.spec.ts:72` → `getByText(...).toHaveCount(0)`) | 원장 D-22 · #414 · 그물 수정 #416 병합(09-03) |
| ✅ **D-21 ⓒ 폴링 전환** | 구현 #397 · 계약 v0.1.10 #396 · README 각주 #402 · **독립 검증 PASS #404**(로컬 ⓗ 5/5 · 공개 3/4 · 간격 = 못 잼 = 제품 진실) · 429 = 드러냄+중단 · 🔴 WS 미개통 자체는 남음(대체 ≠ 해소 · 층 소견) · 잔여 = main 승격 3회차(T6-1 과 묶음) | 원장 D-21 · #404 |
| 🔶 **T5-1 Benchmark** | 평가셋 30문·전략 4 비교(§30.4) · §35.7 ⑥ · 초안 10문 v0.2 까지 착지 | 원장 T5-1 · D-004 |
| 🔶 **T5-2 Gate 7 잔여** | ⑤ 관리자 endpoint · ⑨ malformed WS 미충족 · ⑦⑧⑪ 대조군 서버 2본 측정 불가 · 재색인 경유 주입 미측 | 원장 T5-2 · `evidence/t5-2-gate7-map.md` |
| 🔶 **T5-3 CI 보류 workflow** | 보류 6종(API contract · fixture schema · SSOT manifest · ontology · Docker build · Replay E2E smoke) | 원장 T5-3 |
| 🔶 **T5-4 운영 절차 티켓** | restart/health 대응 절차 정본화(runbook §4·D-17 정책 ⓒ·재부팅 갈림은 이미 착지 · 티켓 단위 미발주) | 원장 T5-4 |
| ✅ **Q-73 networkidle** | 그물 개정 #398 + 회귀 **133/0/3** #404(자기 개정 회귀 4+1 검출 → `sessionReady()`) · 완료 | 원장 Q-73 · #404 |

## blocked (운영자)

| ✅ **D-13 종결(16대 · 16:26)** — 폐하 「재구성」 16:11:02 → 센쿠2 6단계 ≈15분(볼륨 `_stack/.volumes-t15` · migrate 8본 선행(순서표 누락 보완) · seed 28/28 · neo4j 재적재 309/448 내용 대조 어긋남 0 · health ok/ok) · 실물 = postgres named volume `fkt-senku2-t15_pgdata` / neo4j bind 잔존(비대칭 · 후속) · 스크립트 PR #323 병합 `295c95d`(hygiene 절대경로 → 상대 기본값 수정 뒤) · 게이트 #321 병합 `1d32fa7` · 폐하 보고 16:14(사유)·16:27(종결) |
| 🔶 **D-12e = 축1 설치 부분 PASS(부팅 20/20 · 설치 40 · 실패 0) / 축2 구제 판정 불가** — 판정표 5행(리바이2 #327 · `fallback=`≥1 + 그 req 의 sid 만이 작동 증거 · mod 는 곁가지) · 판정 창 ①②(17:05~17:07 · 80/80 · fallback 0) = 미오염 · 다음 창 조건 = NXDOMAIN 연속 ≥3(자비스 폴링) · 🔴 D-14 로 오늘 승격 불가 → 축2 판정은 내일 |
| 🔴 **D-14 Vercel 일일 배포 상한 100 도달(17:06 · prod 8 + preview 92)** — 오늘 승격 불가 · 처방 ⓐ lane/* preview 끔(vercel.json 1줄 · 센쿠2 선준비) = **폐하 「진행」 17:12:21 → 센쿠2 집행 중** · 팀 규율 = push 묶기 · 승격 ≤4/일 목표 · PR 판정은 hygiene + 독립 재실행만(Vercel check = 상한 사유) |

## done

| 태스크 | 산출물 | 시점 |
|---|---|---|
| ✅ **D-004 §35.7 최종 관문 승인(21대)** — 폐하 「전건 권장안 승인」 16:59(id 1544617819784609803) · 최종 상태 = **「Release 후보 — 축소 적용(v0.3)」** · D-21 = ⓐ · T5-5 완결(43/47) · T5-1~T5-4 이관 · 상신 계보 15:59→16:24(DM 결정 건 별도) | `docs/decisions/004-release-gate-verdict.md` · 원장 헤더·D-21·T5-1~T5-5 | 09-02 16:59 |
| ✅ **D-21 층 분리 + D-20 스캐너 종결 + Q-73 1차(21대)** — 리바이2 26대 PR#388 `696d0e1`(같은 쿠키·run · Vercel 경유 opened=false / Funnel 직결 opened=true · 열 B = tailnet self 사정거리) · CGNAT 0(대조군 1→0) · PR#390 `7348fa8`(Q-73 비결정 · 열 P 원본 통과 · 계측기 `_q73_netcount.mjs`) | `evidence/d21-ws-layer-split.md` · `evidence/q73-networkidle-split.md` · `tests/web/_q73_netcount.mjs` | 09-02 16:2x |
| ✅ **T3-6 본 판정 「조건부 PASS」(21대)** — 리바이2 26대 PR#386 `6b433b3` · 공개 셸 브라우저 E2E · §21 증거 ② 5/5 · ③ 7/7(D-7 Esc 초록) · ④ 16/16 · ① 인용+정적 재생 완주 · suite 97/32/2 · 빨강 32 주어 = 자기 부하/D-21/Q-73 · 조건 3 · 자수 4 · §35.7 2·5·9 행 갱신 · 42/47 | `evidence/t3-6-e2e-verification.md` · `evidence/t5-5-gate-verdict.md` §35.1·3·4·7 | 09-02 15:46 |
| ✅ **README 실행 발췌 자동 대조 축(21대)** — 센쿠2 29대 PR#387 `ce74b06` · 발췌 블록 ↔ 링크가 지목한 파일·절 «일치» 대조 · 명령·개수 박지 않음 · 자기 검증 자극 계수(0 = 실패) · 대조군 참 1·변조 4 · 러너 로그 6/6 | `scripts/check-readme-versions.mjs` · `.github/workflows/ci.yml`(step 이름·주석) | 09-02 15:40 |
| ✅ **D-19·D-20 수리 전건 + README 6줄 발췌(20대)** — D-19 CI 시크릿 게이트 하이픈 축 #378 `2fac2d0` + 프로브 런타임 조립 #379 · D-20 CGNAT 치환 3건(#379·#380·#381 TEST-NET-3) + CI 게이트 step #382 `bed3da3` · README 「▶ 실행」 6줄 발췌(잠정 · runbook §4 문자열 일치 6/6) #383 `d3e455e` | `.github/workflows/ci.yml` · `README.md` · evidence 2 · `apps/web-console/scripts/retry-drill.mjs` · 원장 | 09-02 14:59 |
| ✅ **P6 공개 경계 최종 스캔(20대)** — 리바이2 26대 PR#377 `3096e6e` · 6축×모집단 2(트리 469 · 이력 832커밋) · 대조군 어긋나면 exit 2 · 트리 위반 **0** · D-15 잔여 사정거리 종결 · 이력 축 §35.4 ⑦ 채움 · 회부 2 = **D-19**(CI 시크릿 게이트 하이픈 사각) · **D-20**(CGNAT IP 8히트 · 폐하 ⓐ 승인) | `tests/api/public_boundary_scan.py` · `evidence/t5-6-public-boundary-final-scan.md` · verdict §35.4 | 09-02 14:12 |
| ✅ **D-18 잔여 2 = `tests/**` 6본 project 인자(20대)** — 센쿠2 29대 PR#376 `39b66a4` · 재현 6/6 exit 2 → `-Project` 배열 11/11 · 판정 행 3모드 무변 · 격리 스택 잔해 0 | `tests/data/run-*.ps1` 4 · `tests/graph/run-graph-verify.ps1` · `tests/schema/run-probes.ps1` | 09-02 14:07 |
| ✅ **Q-70 외부 재실측 PASS + Q-69 화면 축 실물(19대)** — 리바이2 25대 PR#373 · Funnel OFF 창 11:59:33~12:05:33(자비스) · 창 안 확정 6/6(`startedAt`) · `/enter` 2,497~3,840ms ≤8,000ms · `cappedOut` 없음 · health/live 500 6/6 · 「미연결」 6/6↔기준선 0/3 · 24대 25.5s 대비 ≈10배 · Q-69 배지 `◌미연결` 실물 · 복구 지연 상한 ≤4분 08초 · gap 15s 이탈 명기 | `evidence/t4-4-external-outage-verification.md` §9 · `evidence/t5-5-gate-verdict.md` 3곳 | 09-02 12:28 |
| ✅ **D-17 종결(E2E) + 배포 DB restart 정책 ⓒ(19대)** — GS-01 공개 경로 replay 완주(`RUN-dac5edac664f` · 32 이벤트 · 5단계 · D-17 이미지) · 폐하 「권장 승인」 12:14 → t15 postgres·neo4j `unless-stopped`(센쿠2 · StartedAt 불변 = 무재시작 증명) · `-prev` = `no`(8010 충돌 차단 · 롤백 = 수동 start) | 컨테이너 4본 정책표 · 원장 D-17·Q-63 | 09-02 12:24 |
| ✅ **README 표 자동 대조 그물(19대)** — 센쿠2 28대 PR#372 `a029837` · `scripts/check-readme-versions.mjs` + hygiene step 1 · 기대값·출처 경로 0(README 가 지목한 파일을 읽음) · 비교 0건 = 실패 · 매 실행 참/변조 두 번 · 러너 로그 3/3 | `scripts/` · `.github/workflows/ci.yml` | 09-02 11:40 |
| ✅ **Cypher 드릴 앵커 정본화(19대 · 하드코딩 원칙)** — 리바이2 25대 PR#370 `a256ca0` · 리터럴 앵커 6줄 제거 → `allowlist.APPROVED_QUESTIONS` 실행 시점 추출 · 못 뽑으면 exit 2 · 결과 무변 | `tests/api/cypher_surface_drill.py` | 09-02 11:2x |
| ✅ **D-18 잔여 seed.ps1 수리(19대)** — 센쿠2 28대 PR#368 `f001176` · 재현 먼저(비기본 project 에서 `:56` exit 1 · 컨테이너 healthy) → `-Project` 배열 5곳 · 후보 목록 문면 · 대조군 4열 · TRUNCATE 형 재적재 ≠ skip 형 멱등 · tests 6본 = 검증 별건 | `data/seed.ps1` | 09-02 10:55 |