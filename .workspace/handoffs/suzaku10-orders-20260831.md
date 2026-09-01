# 스자쿠 10대 선작성 발주문 (2026-08-31 23:1x · 트리거 대기 · 팀 채널 발신 시 그대로 붙여넣기 · 11대 승계용)

> 트리거: §A = 센쿠2 18대 D-3 PR 병합 즉시 · §B = §A 발신 직후(센쿠2 18대 완결 보고 착신 시) · §C = 센쿠2 PR-1 착지 시 · §D = 완결마다 · §E = 10대 교대 시.
> 🔴 **상태(08-31 23:36)**: §A **발신됨**(23:36 · 리바이2 16대 착수 · +«chip·reset 실재» 1행 추가 · 대상 = PR#242 `831af7a` → develop `684aa0a`) · §B **발신됨**(23:36 · 센쿠2 18대 착수 · 기점 `684aa0a`) · §C **대기**(PR-1 착지 시) · §D 사용 중(T4-2a 23:34 적용) · T5 티켓 5본 착지 PR#243.
> 발주 전 «실물 grep 1회» 완료분(23:07 · develop `ad8b2a3`): `errors.py:66 dependency_unavailable` · `investigations.py:130 resources.pg_pool is None`(판정 근거 아님) · `session_store.py:35 SESSION_TTL_SEC = 8h · :78/:135 lazy _sweep · :125 def _sweep` · 스키마 `agent-events-v0.1.schema.json:24 "run.queued"`(enum 9 · `:38` payload $ref runQueued) · ai-api 코드 내 `run.queued`·`FKT_LIVE_CONCURRENCY`·`FKT_LIVE_QUEUE_MAX`·`FKT_MAX_BODY_BYTES`·`FKT_MAX_QUESTION_CHARS`·`Retry-After` = **0건**(PR-1 이 채운다) · 셸 `run.queued` 0건(PR-2 몫) · tests/api 드릴 = **21종**(`*_drill.py` 20 + `anchor_extraction_probe.py` · 헬퍼 `_colocation.py`·`_session.py` 제외) · 그물 `tests/web/q50_entry_badge_timing.mjs`(11090B) · `tests/web/_blackhole_server.mjs` 실재.
> 재부팅 후 실측(23:03): compose 컨테이너 자동 복귀 Up healthy · `docker run` 계열 2본 Exited(255) = `fkt-levi2-t35-seeded`(8061) · `fkt-levi2-t41-seeded`(8059) → `docker start` · 셸 4벌·8004·8074·8077 사망 · 8010 생존.

## A. 리바이2 16대 · T4-1 ②′ 단축 재검 1행 (센쿠2 18대 D-3 PR 병합 시 · 조각 경계에서)

<@1542718716116996116> 🔻 [FKT] **스자쿠 — T4-1 단축 재검 1행(②′) · 대상 = D-3 픽스 PR#___ (develop `___` · 입장 form 네이티브 제출 → JS 경로 fetch + 클라이언트 항해 · `live-status.tsx` 무접촉).** 정본 = 14대 T4-1 재검 판정문 ②(FAIL · 12.5s · `/` 묶음 50s) 와 «같은 자극·같은 그물·한 변수(셸 sha)».
```
자극   블랙홀(받고 안 답함 · `node _blackhole_server.mjs 8074` · 🔴 거부(리슨 0)가 아니다 — 자릿수가 다르다) · 셸 = `_wt/levi2-t41r` 를 PR 병합 sha 로 재빌드(FKT_API_BASE = 블랙홀 8074) · production build
BEFORE 14대 ② 값 그대로 인용(재측 불요 · 판정문에 이미 있음): 본 경로 12.49~12.97s(3회) · `/` 묶음 50s checking
AFTER  그물 `q50_entry_badge_timing.mjs` 본 경로 3회 + `/` 묶음 대조군 1회 — 배지 «미연결» + 정적 제안 = 상한(2s)+ε 안(17대 자기 실측 = 2,257/2,563ms · 참고) · 전이 url = `/` · checking 중 제안 0(R-3 유지) · `t41_live_status_timeout` 상한 ≈2.0s · 빈 화면 0
판정   3/3 + 대조군 1/1 = PASS → **T4-1 완결(+1/47) + Q-37·44·46 종결** · 판정문 `evidence/t4-1-public-shape-verification.md` 아래 append(②′ 절 · 자리·자극·결과·자수) · write = evidence/** 1파일 · PR + 내 멘션
       FAIL = D-3 유지 + 값 1행(어느 축이 얼마) → 센쿠2 재픽스 · 🔴 «거부 619ms» 로 PASS 를 만들지 않는다(자극 확인 = 8074 가 accept 하고 답하지 않음을 먼저 1줄)
```
T4-2a ⑧ 도중이면 «축 경계»에서 끼워 넣어라(⑧ 브라우저 suite 는 통째 · 그 앞뒤). 순서는 네 판단.

## B. 센쿠2 18대 · T4-2b PR-1 «서버 축» (D-3 PR 병합 + 완결 보고 착신 시)

<@1542718134002253844> 🔻 [FKT] **스자쿠 — 발주 = T4-2b PR-1 서버 축(ⓐ~ⓔ + Q-48 시작 전 판정) · 정본 = 티켓 `docs/plan/tickets/T4-2.md` 게이트 2·3 + AC ①~④·⑦ + 계약 `packages/contracts/rest-api-v0.1.md` v0.1.9 append(139~150행 · 낱말 갈림 0 = 코드에서 넓히지 않는다 · 갈리면 회부).**
```
범위   ⓐ 동시 Live 상한 semaphore(env FKT_LIVE_CONCURRENCY 기본 1) + bounded queue(FKT_LIVE_QUEUE_MAX 기본 2) · 큐 진입 = 200 {runId,incidentId,mode:"live"} 그대로 + 이벤트 `run.queued{position≥1, estimatedWaitSec|null}`(스키마 :24/:38 실재 · 서버 수기 사본 = schemas 에 추가 · 순위 변동 시 같은 type 재발행 seq 증가 · 슬롯 나면 run.started) · 둘 다 차면 503 `live_capacity_exhausted` + Retry-After + message Replay 안내 · replay 에 큐 없음(fixture 32건 무영향) · 큐 대기 상한 초과 = run.failed + payload.fallback:"replay"
       ⓑ run timeout(env) → `run.stopped reason=timeout`(스키마 139행 enum 기존 · 호출자 0 → 채움) + 안전 종료(리소스 해제 실측 = 세마포어 반환·태스크 취소·WS 종료) + Replay 안내
       ⓒ rate limit 429 `rate_limited` — 축 2개 «각각»(IP · 익명 세션 쿠키 · 무쿠키 = IP 만) · 즉시 429(서버 대기 0) · Retry-After 정수 초 · 제외 4종 = GET /api/health · GET /api/live/status · OPTIONS · WS 핸드셰이크 /ws/runs/{runId} · XFF 첫 값 신뢰 = env 켤 때만(기본 소켓 주소)
       ⓓ 413 `payload_too_large`(FKT_MAX_BODY_BYTES 기본 65536 · Content-Length 선검사 + 스트림 실측 둘 다 · 전 라우트) · 422 `question_too_long`(FKT_MAX_QUESTION_CHARS 기본 500 · allowlist 대조 «앞» · 두 축 겹치면 413 먼저)
       ⓔ session TTL 주기 정리(`session_store.py:35` 8h 유지 · lazy _sweep :78/:135 에 «주기 태스크» 추가 · 주기 env) · 만료 = 404 은닉 «유지»(T3-1 그물 session_guard_drill 회귀 0)
       Q-48 시작 전 판정 = `/health` 의존 프로브(postgres·neo4j 하나라도 unavailable) → fixture 있으면 200 mode:"replay" 강등 / 없으면 503 `dependency_unavailable`(errors.py:66 재사용 · 501 금지) · 🔴 `investigations.py:130 pg_pool is None` 은 근거 아님(핸들 유무) · 프로브 ≤5s stale 허용(그 틈 = run.failed fallback:"replay")
자기 실측 🔴 초록 3문 선행 · 동시 3요청(2 실행 + 1 큐 → run.queued 형상·position · 4번째 → 503+Retry-After) · timeout env 1s → run.stopped(timeout) + 리소스 전/후 수치 · 429 두 축 각각 + 제외 4종 각 1회(429 아님 확인) · 413/422 경계값(65536/65537 · 500/501자) · TTL 만료 404 + 주기 정리 로그 1행 · Q-48 = pg 컨테이너 stop → 200 mode:replay / fixture 없는 시나리오 → 503 · 대조군 = 의존 정상 live 그대로 · tests/api 21종 회귀 · 「rc 0 ≠ 한 일」 · 서버 = 네 트리·네 포트(8004 · q3 DB)
자리   새 lane `lane/senku2-t4-2b-pr1-server`(기점 = develop 병합 sha) · write = services/ai-api/** (+ 서버 수기 사본) · 🔴 tests/** 무접촉(그물 = 검증 좌석 회부) · SSOT·계약 무접촉(갈림 = 회부) · LLM 0 · 새 의존성 0 · 별 PR + 내 멘션 · 완료 = 리바이2 §C 독립 검증 PASS
```
그 뒤 PR-2 셸 축(ⓕ WS 재연결/상태 재조회 · ⓖ Live 실패 시 Replay 자동 제안 «동작» · Q-50 SSR 직렬 해소 · 셸 run.queued 수기 사본) = 발주문 그때.

## C. 리바이2 · T4-2b PR-1 독립 검증 (PR-1 착지 시 · 9대 §D 골격 → 본문)

<@1542718716116996116> 🔻 [FKT] **스자쿠 — 리바이2 발주 = T4-2b PR-1 «서버 축» 독립 검증 · 대상 = PR#___ (develop `___`) · 정본 = 티켓 T4-2.md AC ①~④·⑦ + 계약 v0.1.9 append(139~150행 · 낱말 갈림 0).**
```
축 ①  동시성: 3요청(2 실행 + 1 큐 = 큐 쪽 이벤트 1행이 run.queued{position:1} · 슬롯 나면 run.started · seq 단조) · 4번째 = 503 live_capacity_exhausted + Retry-After 정수 · 🔴 replay 요청은 큐 무영향(동시에 넣어 200 즉시)
축 ②  timeout env 1s → run.stopped reason=timeout · 세마포어 «반환» 실측(뒤이은 live 요청이 즉시 실행) · WS 종료 · 부분 성공 0
축 ③  429 두 축 «각각»(IP 축 = 무쿠키 · 세션 축 = 같은 쿠키) + Retry-After · 제외 4종 각 1회 «429 아님» · XFF 미신뢰 기본(헤더 넣어도 소켓 주소로 뭉침 = 대조군)
축 ④  413/422 경계값(65536 통과 · 65537 413 · 500자 통과 · 501자 422 · 둘 겹치면 413) · 오류 형상 = error_shape_drill 회귀
축 ⑤  TTL: 짧은 env 로 만료 → 404 은닉(session_guard_drill 회귀 0) · 주기 정리 실행 흔적 1행 · 만료 전 세션 무영향
축 ⑥  Q-48: pg 컨테이너 stop → /health unavailable → live 요청 = 200 mode:replay(fixture 있음) / 503 dependency_unavailable(없음 · 501 아님) · 대조군 = 의존 정상 live 그대로 · 부분 초록 관측 1행(Q-56 표본)
축 ⑦  회귀: tests/api 21종 · T2-3 그물(run_surface·event_schema) · 스키마 대조(run.queued payload = :38 $ref) · contract-surface 빌드 «뒤» 계약 밖 0
자리   lane/levi2-t4-2b-verify · 판정문 evidence/t4-2b-live-guard-verification.md(축별 append · §0 자수 표) · 서버 = 네 트리·네 포트(센쿠2 8004 무접촉) · 초록 3문 · 자극 «수» · PR + 내 멘션 · PASS = T4-2b «서버 축» PASS(완결 = PR-2 뒤) · FAIL = D-n 등급 분리 → 픽스 → 단축 재검
```

## D. 완결 선언·관문 보고 서식 (완결마다 · 삼중 표기 · 시각+제목 인용)

- 팀 채널: `[FKT] 스자쿠 10대 — T4-x «완결» 선언(NN/47 · PR#__ 병합 <sha> · HH:MM)` + 채택 근거 3줄(검증 판정문 §·값·대조군) + 다음 발주 1줄.
- 폐하 직보(1542753131518103623): 헤더 `[FKT]` · 제목+시각 인용(메시지 ID 아님) · **삼중 표기** = 원장 NN/47 · 전체 계획 ≈%(E3 · Phase 가중) · 완결 후보 잔여 n · 근거 등급 · 잰 범위 1줄 · 결정 대기 항목(있으면).
- 자비스 채널: 1줄(완결 · PR · 다음 발주) — 이 채널이 리더 그룹방.

## E. 10대 교대 시 «11대» 1착 (census 55% 통보 시)

0. 하던 «축»만 끝낸다(판정 회부 중이면 판정까지) → checkpoint 좌석 절 + 본 파일 §A~§C 트리거 상태(발신됨/대기) 갱신 → PROGRESS «지금» 행 갱신 → 마감 PR → Open PR 0 확인 → 인계 3줄(develop sha · 좌석 2본 lane tip + 진행 축 · 다음 트리거) → 자비스 킬 가(🔴 열쇠 창 23:49~00:11 안이면 창 밖으로 미룬다).
1. 11대 1착 = `git pull` → checkpoint 1 Read → 팀 채널 착신 큐 fetch → 순찰 cron 7·27·47 재등록 → 자비스 기동 회신 → 본 파일 §A~§C 중 «대기» 상태인 트리거 확인 후 착신 순 처리. 좌석 wake 는 «교대 대상이 아닌 좌석»에는 보내지 않는다(살아 있는 좌석은 그대로 · 리더 교체 1줄만 팀 채널에).
