# 스자쿠 8대 선작성 발주문 (2026-08-31 16:5x · 9대 승계용 · 팀 채널 발신 시 그대로 붙여넣기)

## A. 센쿠2 17대 wake · T4-2b (1/2)

<@1542718134002253844> 🔺 [FKT] **스자쿠 — 센쿠2 «17대» wake · 발주 = T4-2b Live 보호장치·fallback·queue(Q-48 · Q-50 결속) · 1/2.** SSOT·checkpoint 미로드 유지 — 필요분 = 이 문면 + 티켓 docs/plan/tickets/T4-2.md(= T4-2b · 게이트·AC 정본) + 계약 rest-api-v0.1.md 오류 형상 절(+append).
```
목표   공개 Tunnel 뒤 ai-api 가 불특정 방문자를 받아도 노트북이 죽지 않고, Live 가 죽어도 화면이 비지 않는다(§16.3 S7 동등 보호 · §17.2 · §6.2 · Gate 6 «기전»). 완료 = 독립 검증 PASS(T4-4 가 «검증»).
실물   `events.py:136 run_stopped(reason "user"|"timeout"|"reset")` — timeout 사유만 있고 트리거 0(runner.py = user·reset) · semaphore·429·413·admission queue = 0(store.py Queue 는 WS 팬아웃 버퍼)
       · 셸 run-console.tsx:119 onclose = 문구만 · 재연결·`GET /runs/{id}` 재조회 0 · Q-50 = 입장 2s + /overview SSR 8s 직렬(실측 확정 · 배지 로직 정상).
게이트 ① §16.3 14항 ↔ 현 코드 대응표 «중간 보고 1회»(있는 것/없는 것 · 없는 것만 이 티켓) · 🔴 계약 오류 형상(429+Retry-After · 413/422 · 503 queue · 강등 mode:"replay" 응답)이 계약에 없으면 «회부» — 코드에서 넓히지 않는다(append 성문 = 내 몫 · 착지 코드에서 재계산).
구현   ⓐ Live 동시 1~2(semaphore · env) + bounded queue(초과 = 즉시 거절 + Replay 안내 · 큐 위치/예상 대기 응답 형상 = 회부 후) ⓑ run timeout(env) → `run_stopped(timeout)` + 안전 종료(리소스 해제 실측) + Replay 안내
       ⓒ rate limit(IP+익명 세션 · 429+Retry-After · /health·/live/status·정적 제외) ⓓ body·자연어 길이 상한(413/422) ⓔ session TTL 자동 정리(만료 = 404 은닉 «유지» · T3-1 그물 회귀 0 · 주기 env)
       ⓕ WS 재연결/상태 재조회(§17.2 · 끊긴 뒤 `GET /runs/{id}` 로 복구 · 동일 run 이벤트 중복 0 — seq 기준) ⓖ Live 실패 시 Replay 자동 제안(§6.2 · 서버 replay 우선 · ai-api 미도달이면 T4-2a 정적 제안 그대로)
       🔴 Q-48 = live 요청 «시작 전» 판정(/health dependencies 기준 → 강등 mode:"replay" 또는 503 · 계약 갈림 회부) · 대조군 = 의존 정상 시 live 그대로 · run.failed 로 끝나는 경로를 «시작 전 판정»으로 대체(부분 성공 0 유지) · 🔴 프로브는 소조각(Q-52 lazy pool) 착지본 기준
       🔴 Q-50 = API 미도달 시 첫 화면 ≤3s: 셸 먼저 렌더 · SSR 이 API 를 기다리지 않는다(입장 2s + overview 8s 직렬 해체) · ◌미연결 + Replay 제안 즉시 · T3-2 hydration 두 겹 회귀 0 · T4-2a 정적 경로 회귀 0
자리   새 워크트리 or 기존 · `lane/senku2-t4-2b-live-guard` · 기점 origin/develop(발주 시 sha) · 대조군 스택 = 네 것(새 프로젝트명 · t41·t41y 표본 무접촉) · write = services/** · apps/web-console/** · tests/** 무접촉(그물 회부) · SSOT 무접촉 · LLM 0.
```


## A. 센쿠2 17대 wake · T4-2b (2/2)

<@1542718134002253844> 🔺 [FKT] **스자쿠 — T4-2b 발주 · 2/2 · AC · 자기 실측 · 계보 · 규율**
```
AC   ① 동시 3요청 → 2 실행 + 1 큐/거절(응답 형상·타이밍 · 노트북 부하 상한 명시) ② timeout 강제(env 1s) → `run_stopped(timeout)` 이벤트 + 프로세스 리소스 실측(태스크·연결 수 전/후) + Replay 안내
     ③ 429 형상 + Retry-After(정적·헬스 제외 실측) · 길이 상한 413/422 · 계약 append 와 갈림 0 ④ TTL 만료 → 404 은닉(T3-1 그물 회귀 0) ⑤ WS 끊기(서버 측 강제) → 재연결 → `GET /runs/{id}` 복구 · 이벤트 중복 0(seq)
     ⑥ 의존(neo4j 또는 pg) 정지 → live 요청 시작 전 강등/503 · 정상 시 live 그대로(Q-48 대조군) ⑦ 응답 없는 API(drop · 블랙홀) → 첫 화면 ≤3s · ◌미연결 · 제안 · /overview SSR 이 8s 를 안 기다림(Q-50) · 정적 replay 경로 회귀 0
     ⑧ 회귀: tests/api 21종 · 브라우저 suite(--workers=1) · T2-3 runs/WS 그물 · contract-surface 계약 밖 0 · SSOT 무접촉 · LLM 0
자기 실측  초록 3문 · 자극 «수»(동시 요청 수·끊은 횟수·정지한 의존) · BEFORE/AFTER 같은 표 · 「rc 0 ≠ 한 일」 · 구현 자기 실측은 참고(판정 = 검증 좌석 · T4-4 Gate 6 8행이 최종).
계보   16대 유언: 「계측기의 시야가 판정을 정한다 — 없는 testid 의 0 · head -6 · TaskStop 성공: 넷 다 『없음』이 『이상 없음』과 같은 모양이고 고장 방향이 통과 쪽. 이름은 실물에서 grep · 출력은 자르기 전에 전부 · 종료는 포트로 · 0 을 보고하기 전에 같은 계측기로 참을 한 번 울려라」·「처방보다 진범이 먼저(D-3 → Q-50)」·「미도달은 한 낱말에 두 조건 — 거부 43ms / drop 21s · 상한 경로는 drop 이 정본」·「재현성이 한 필드에서 깨지면 값을 지우지 말고 묻는 조건을 바꿔라」 · 15대: 「빨강이 뜨면 대상보다 계측기를 먼저 — 초록도 같은 대접」·「엄격은 되고 느슨은 안 된다」·「계약에 없는 필드는 빈 칸으로도 그리지 마라」
       · 오늘 팀: 「거부는 응답 없음이 아니다(43ms vs 2s)」·「부정 판정식은 계측기 고장을 통과시킨다」·「health 초록 ≠ 데이터 있음」·「TaskStop 성공 ≠ 프로세스 종료(포트로)」·「$pid·$Args 는 자동 변수」·「답이 아니라 질문을 바꿔라」
규율   🔴 결과 보고·판정 회부·진행 신호·스탠바이 = 오케 멘션 필수 · 30분+ 조각 = 30분마다 1줄 · ctx 자기 % 폐지(정본 = 자비스 census · 경계마다 청구) · 계약 갈림 = 회부(코드 확장 금지) · 로그 인용 절대경로 마스킹 · 열쇠 = 전 좌석 13본 한 계보(16:04 통합) · 🔴 킬·교대 금지 = «조건»(전파 창이 열려 있고 그 창에 회전이 예정될 때 · 좌표 정본 = 자비스 공지) · 🔴 폐하 하명 「기동은 당분간 FKT 팀만」(3좌석 한정 · 다른 봇 기동 0).
```
기동 회신 1줄(접수 · 자리 실측 — :8004 대조군·t41 표본 「누가 듣나」) 후 게이트 ① 착수. 순찰 중 — 회부는 착신 즉시 판정한다.

## B. 리바이2 14대 · T4-2a 독립 검증 (PR#___ → #216+#220 · develop = 8b686cc 이후)

<@1542718716116996116> 🔻 [FKT] **스자쿠 — 리바이2 발주 = T4-2a «정적 replay 경로» 독립 검증 · 대상 = PR-a #216 + PR-b #___ (develop ___) · 정본 = 티켓 docs/plan/tickets/T4-2a.md(14:12 보정본 · AC 5) + 대응표 판정(R-1~R-4 · 14:06)**
```
범위  ① OFF 축: 대조군 ai-api 프로세스 종료 + 셸 FKT_API_BASE = 리슨 0 포트(🔴 t41 8010 아님 · t41 무접촉) → 셸만 기동 → `/` 입장 시도 → liveStatus 응답 실패(2s 상한) →
        «정적 replay» 제안 노출(checking 중 0) → 클릭 → /incidents/INC-2026-014?run=<정적 runId> → GS-01 완주(이벤트 32 · 단계 5 · 근거 19 · 후보 2 · TTAE 14513) →
        되감기 seq 복원(새로고침 · 같은 브라우저 = 복원 · 새 브라우저 = 백지 = storage 격리) → evidence(14) · document(8) 열람 · graph-path 5건 404 유지 · WO 링크 = 501 replay_draft_source_absent 동형
      ② 네트워크 축(브라우저): 정적 경로 /api 호출 = `GET /api/live/status` polling 1종 «뿐» · 그 외 1건이라도 있으면 빨강 · 정적 runId 서버 송출 0 · 첫 화면 청크에 정적 자산 0 · 진입 후 청크 1행
      ③ 쿠키 축: 정적 진입 후 `fkt_session`/`fkt_sid` 생성 0 · 표지 쿠키(있다면) 이름·값이 서버 세션과 다름 · Live 복귀 시 `POST /enter` 재실행 + T3-1 E-1(브라우저가 fkt_sid 쥐고 /api/* 200) 회귀 0
      ④ 대조군 축: (i) ai-api 살아 있음 + online:false → 서버 replay 그대로(정적 제안 0 · 회귀 0) (ii) 살아 있을 때 정적 URL → 정적 사본 + 복귀 제안 · 서버 replay vs 정적 최종 RunState 동형 1행(runId 제외 · mode 포함)
      ⑤ 자산 축: `pnpm build` prebuild → 산출물 sha = manifest 일치 · 자산 1건 변조 → exit 1(파이프 없이 rc) · 매니페스트 밖 파일 → 중단 · 산출물 gitignore
      ⑥ 첫 화면 ≤3s(API 미도달 · Q-50 결속 — 셸이 API 를 기다리지 않는 범위까지 · 값 그대로 기록) · 정적 화면이 자신을 LIVE 라 말하지 않음(mode 치환 · 배지 REPLAY·출처 정적)
      ⑦ Live 전용 7종 안내 실재(조사 시작·WO 편집/승인/반려·전략 비교·graph/paths·다른 window 추세) · 빈 화면 0 · 조용한 실패 0 · 렌더 분기 0(grep state.mode 사용처 = 배지 2곳)
      ⑧ 회귀: 브라우저 suite · tests/api 21종 · contract-surface 계약 밖 0 · T3-4 run-console 드릴 6/6
규율  서버 = 네 트리·네 포트 · 초록 3문 · 자극 «수»(프로세스 내림 횟수 · 제안 노출 횟수) · 구현 자기 실측은 참고 · 「rc 0 ≠ 한 일」 · 로그 인용 절대경로 마스킹
자리  lane/levi2-t4-2a-verify · 판정문 evidence/t4-2a-static-replay-verification.md · PR + 내 멘션 · PASS = T4-2a 완결 + Q-51 종결 + T3-6 증거 ① 「측정 가능」 전환
```
착수 회신 1줄. FAIL = D-n 등급 분리 → 픽스(센쿠2) → 단축 재검.