# T2-3 독립 검증 계획 v0.2 — LangGraph 조사 워크플로우

> 리바이2 8대 · 2026-08-30 · **계획 문서**(측정 기록 아님 · 근거 등급은 실행 후 부여)
>
> **v0.2** — 회부 2건 판정 반영(오케 08-30) + 그물 3종 착수분 실측 기록.
>
> 🔴 **구현물 무접촉 상태에서 세웠다.** 축을 먼저 정본에서 세우고 나서 구현을 읽는다 —
> 순서를 뒤집으면 내 축이 구현을 복창하게 된다(5대 계보 「그물의 주어」).
>
> 정본으로 읽은 것: `docs/plan/tickets/T2-3.md`(AC + 게이트 + J-1~J-6 판정 append) ·
> `packages/contracts/rest-api-v0.1.md`(runs 표면 · Evidence · v0.1.2 append) ·
> `packages/contracts/agent-events-v0.1.schema.json` · `docs/product/golden-scenario-spec.md`(S1~S9).

## 0. 이 계획이 세우는 축과, 세우지 «않는» 축

| 잰다 | 재지 않는다 |
|---|---|
| runs 표면 5 + `/graph/paths` 계약 준수 | 조사 «품질»(후보가 옳은 원인인가) — 평가 티켓의 몫 |
| 이벤트 스키마 독립 파싱 · `seq` 단조 | LLM 출력 문장의 사실성 — synthetic PoC 경계(§0.2) |
| Claude 자격 증명 비노출 전수 | 부하·동시성 — 측정 안 한다 |
| replay 강등 정직성 | 화면 렌더링 — T2-6 이후 |
| 「조용한 0건 단계 통과」 | T2-5(WO CRUD)·T2-4(replay fixture) 범위 |
| 전략 독립성 재검(T2-1 재사용) · SSOT 쓰기 0 | |

## 1. 축별 계획 — 「무엇이 빨강이면 결함인가」를 먼저 적는다

### 축① runs 표면 + `/graph/paths` 계약 준수 (J-1 · J-2)

| 재는 것 | red 조건 |
|---|---|
| 해제 라우트 == J-1 판정분 5건 + `/graph/paths` 1:1 | 계약 밖 경로 1건이라도 · 판정분 중 미해제 1건이라도 |
| `POST /scenarios/{id}/runs` → `{runId, incidentId, mode}` | 필드 누락 · `mode` 가 enum 밖 |
| `GET /runs/{id}` → `{status, candidates[], workOrderDraftId?}` | 완주 후 `candidates` 가 빈 배열(§runCompleted minItems 1 과 갈림) |
| `GET /runs/{id}/events` → 배열 · `seq` 순 | 순서가 `seq` 와 다름 |
| `POST /runs/{id}/stop` → `{status:"stopped"}` + `run.stopped` 이벤트 | 응답만 있고 이벤트가 없다(F-3b — 타임라인이 안 닫힌다) |
| `WS /ws/runs/{id}` 스트림 | — |
| `/graph/paths` 에 **임의 Cypher 파라미터 부재** | Cypher·쿼리 문자열을 받는 파라미터가 하나라도 존재 = **Stop 조건**(§16.2) |
| **대조군** 없는 scenarioId·없는 runId·없는 run 에 stop | 200 을 주면 red(「없는 것을 없다고 말한다」 — T2-2 계보) |
| **대조군** 완주 전 `GET /runs/{id}` | 완주 전인데 `status` 가 완료를 주장하면 red |

### 축② 이벤트 스키마 독립 파싱 · `seq` 단조

🔴 **구현의 검증기를 복창하지 않는다.** 스키마 정본(`agent-events-v0.1.schema.json`)을 내가
읽어 내 파서로 건다. 구현이 같은 파일을 쓰더라도, 「쓴다고 적힌 것」과 「실제로 나가는 것」은
다른 사건이다.

| 재는 것 | red 조건 |
|---|---|
| 전 이벤트가 필수 6필드(`runId·seq·ts·mode·type·payload`) | 하나라도 누락 |
| `type` ↔ `payload` 결속(allOf/if-then) | `step.started` 인데 payload 에 `step` 없음 등 |
| `additionalProperties:false` 준수 | 스키마 밖 필드가 실려 나감(계약 확장을 «조용히» 한 자리) |
| `seq` 단조 증가 · run 내 유일 | 역행·중복·건너뜀 |
| `ts` 가 RFC3339 | 파싱 실패 |
| `mode` 가 요청 mode 와 정합 | live 요청인데 이벤트가 replay(강등이면 축④가 잡는다) |
| **두 원천 일치** `WS` 스트림 ≡ `GET /events` 배열 | 같은 run 인데 이벤트 집합·순서가 다름 |
| **자기 검증** 스키마 위반 표본 4종을 내 파서가 잡는가 | 못 잡으면 exit 2(측정 불가) |
| **생존 신호** 이벤트 총 건수 | 0건이면 초록이 아니라 고장 |

### 축③ 🔴 Claude 자격 증명 비노출 전수 (AC · J-5)

이 축은 **하나라도 새면 즉시 FAIL**이다 — 공개 Sandbox(§15.2·§34.6)의 경계다.

| 재는 것 | red 조건 |
|---|---|
| 응답 전수(runs 5 + graph/paths + T2-2 표면) 스캔 | 키 형상(`sk-ant-`·`Bearer `·`ANTHROPIC_*`)·env 이름·절대경로·traceback |
| 이벤트 전수(WS + `/events`) 스캔 | 같음 — 특히 `run.failed.message`·`step.*.note`·`summary` |
| 서버 로그 스캔 | 같음(로그는 응답보다 느슨해지기 쉬운 자리) |
| **구조적 프록시 차단**(J-5) | 게이트 env 부재인데 live 노드가 «등록»돼 있으면 red — 공개 경로에서 synthesize 가 구독 프록시가 될 수 있다 |
| **egress 부팅 assert**(J-5) | `LANGSMITH_*`·`LANGCHAIN_TRACING*` 이 true 인 채 부팅이 성립하면 red |
| **자기 검증** 가짜 키 표본을 스캐너가 잡는가 | 못 잡으면 exit 2 |
| 🔴 **반사 배제**(Q-23 계보) | 내가 던진 문자열이 되비친 것을 «누출»로 세지 않는다 — 판정 전 내 입력을 지운다(8대 실수 재발 방지) |

### 축④ replay 강등 정직성

계약: 「live 불가 시 `mode:"replay"` 로 **강등 응답**」 · 이벤트: `run.failed.fallback:"replay"`.
`/live/status online` = 로컬 게이트웨이 도달 가능(v0.1.2) — 공개 Sandbox 에서 `false` 가 **참**이다.

| 재는 것 | red 조건 |
|---|---|
| live 요청 · 게이트 부재 → 응답 `mode` | `"live"` 라고 답하면 red(**말없는 강등** = 거짓말) |
| 강등이 이벤트로도 보이는가 | 응답만 replay 이고 이벤트에 신호 0 이면 red |
| replay 요청이 replay 로 돈다 | 조용히 live 로 올라가면 red |
| `/live/status.online` ↔ 실제 강등 여부 정합 | `online:true` 인데 강등, `false` 인데 live 실행 — 둘 다 red |
| **대조군** 게이트 env 를 준 상태(운영자 로컬)와의 대조 | 🔴 내 스택에 게이트 env 가 없으면 이 열은 **잴 수 없다** — 못 잰 것을 초록으로 적지 않는다(회부 대상) |

### 축⑤ 「조용한 0건 단계 통과」 (계보 축 · AC 「폴백 침묵 금지」)

7대 유언 「빈 결과끼리의 일치는 일치가 아니다」의 T2-3 판이다.

| 재는 것 | red 조건 |
|---|---|
| 단계별 `step.evidence` 건수 | 어떤 단계가 0건인데 `step.completed` 로 닫히면 red — 실패는 **보이게** 실패해야 한다 |
| 대본 S3~S7 ↔ step 대응 | 대본이 기대한 evidence «유형»이 빈 단계 = FAIL(spec §3 회귀 판정) |
| 폴백 침묵 | 한 단계가 다른 단계 결과로 «조용히» 채워지면 red(T2-1 계보 — 전략 간 폴백 금지) |
| **생존 신호** run 전체 evidence 총건 | 0이면 측정 불가(exit 2) |
| 후보 순위 | 유력 = `FM-BRG-WEAR` 가 아니면 FAIL(spec §3) |
| **대조군** Unanswerable 질의 | 「근거 없음」을 답해야 PASS — 지어내면 red(spec §3 각주 · T0-8) |

### 축⑥ 전략 독립성 재검 — T2-3 이 T2-1 을 «재사용»하는가 (게이트 2 · J-4)

| 재는 것 | red 조건 |
|---|---|
| vector·graph 단계의 evidenceId 집합 ↔ 같은 질문의 `compare` 결과 | 새 검색 경로의 흔적(=compare 로 재현 불가한 evidenceId) |
| structured = 별도 읽기 전용 조회(J-4 b) · **compare 무접촉** | compare 출력 바이트가 T2-2 시점과 달라지면 red |
| **회귀** T2-1·T2-2 자산 8종 | 1행이라도 red 로 바뀌면 T2-3 이 하류를 깼다 |
| `/evidence` 로 열리는가 | run 이 낸 evidenceId 가 T2-2 표면에서 404 면 red(V-6 계보 — 낸 근거를 못 편다) |

### 축⑦ J-3 「SSOT 쓰기 0」 실측 (내가 추가하는 축)

J-3 은 저장소를 «프로세스 내 세션 스코프 · SSOT 쓰기 0» 으로 판정했다. 이것은 **주장이 아니라
측정 가능한 사실**이다.

| 재는 것 | red 조건 |
|---|---|
| run 실행 전후 SSOT 테이블 행수·`updated_at` 최대값 | 한 테이블이라도 변하면 red |
| 재기동 후 run 소실 | 남아 있으면 J-3 과 어긋난다(성문된 대가가 사실과 다름) |
| 세션 격리 | 다른 sessionId 의 run 이 보이면 red(S9 계보) |

### 축⑧ blocking 0 (AC · §7)

`tools/measure_loop_lag.py` 가 이미 있다. LLM 호출이 비동기 경계 밖이면 이벤트 루프가 멈추고
**WS 진행 스트림이 함께 멈춘다** — 그게 이 축이 지키는 문장이다.
red 조건: synthesize 실행 중 루프 지연이 기준선 대비 유의하게 상승 · WS 이벤트 간격이 단계
실행 시간만큼 벌어짐.

## 2. 회부 2건 — **판정 완료**(오케 08-30) · 축에 반영한 내용

### 회부① `evidenceRef.kind` 어휘가 두 정본에서 갈린다 → **판정 수령**

🔴 **판정**: AC 를 「근거 evidenceRef 전건이 **«자기 kind 의 계약 소비처»로 해석 가능**」으로
재해석(채택 — 내 소견 그대로) · 어휘는 **소비처 어휘로 통일** —
구조화 실체(AL·MR·EQ·CP…)는 `record` · 문서는 `doc-chunk` · 경로는 `graph-path` ·
🔴 **`alarm`·`sensor-series` 는 T2-3 에서 내지 않는다**(쓰게 되는 순간 = 회부 사안).

**축에 반영한 red 조건**
- `step.evidence` 의 `kind` 가 `alarm`·`sensor-series` 면 **red**(스키마는 통과하지만 어휘 판정 위반)
  → `event_schema_drill` 의 `S-04` 행이 그것이다. 스키마 준수와 «따로» 센다.
- `doc-chunk|record` → `/evidence` 로 열려야 red 아님 · `graph-path` → `/graph/paths?byRun` 으로
  열려야 red 아님(축⑥ 「낸 근거를 못 편다」 판정을 kind 별 소비처로 갈라 적용).

### 회부② 강등의 «양쪽» → **판정 수령**

🔴 **판정**: ⓒ 채택 + ⓐ 결속 · **ⓑ 주입 흉내 불허**.
「게이트 있음 → live」 열은 운영자 로컬 전용이 **설계의 참**이라 공개 스택에서 못 재는 것이 맞다 —
판정문에 「못 쟀다」를 명시하고, 그 열의 실측은 데모 리허설(운영자 게이트) 시점에 결속한다.
스텁 게이트는 「도달 가능」의 정의 자체를 바꿔 **그 열이 다른 것을 재게 된다**(불허 사유).

**내가 잴 것**: 강등 열 전체(요청→응답 `mode`·이벤트 신호·`/live/status` 정합) +
「env 부재 시 live 노드 미등록」(코드 독해 **E2** 병기 허용).

### (기록) 회부 당시의 논거

#### 회부①의 원문

| 정본 | kind 어휘 |
|---|---|
| `agent-events-v0.1.schema.json` `$defs.evidenceRef.kind` | `alarm` · `sensor-series` · `record` · `doc-chunk` · `graph-path` (**5종**) |
| 계약 v0.1.1 `GET /evidence` | `doc-chunk` · `record` (**2종** · 나머지는 T2-2 범위 밖으로 성문) |

그런데 T2-3 AC 는 「근거 evidenceId **전건**이 kind `doc-chunk|record` 로 해석됨(E1)」이고,
대본 S5 는 **graph path 4-hop** 을 기대 evidence 로 요구하며, J-2 는 graph-path evidenceId 의
소비처를 `/graph/paths?byRun` 으로 정했다.

셋을 그대로 두면 서로 어긋난다:
- 이벤트가 `kind:"graph-path"` 를 내면 → 스키마 준수 · **AC 위반**(`/evidence` 로 안 열린다)
- 내지 않으면 → AC 충족 · **대본 S5 미충족**(그래프 근거가 이벤트에 없다)
- `kind:"alarm"` 도 같은 자리다 — 같은 `AL-…` 을 이벤트는 `alarm`, `/evidence` 는 `record` 로 부른다

**내 소견(E3)**: AC 문장을 「evidenceId 전건이 **해당 kind 의 계약 소비처로** 해석 가능」으로
읽는 것이 세 정본을 다 살린다(doc-chunk·record → `/evidence` · graph-path → `/graph/paths?byRun`).
`alarm`/`sensor-series` 는 어휘 정렬이 필요하다 — 같은 실체를 두 이름으로 부르면 화면이 분기한다.
🔴 **판정 없이는 이 축을 red 로도 green 으로도 못 센다.** 판정을 받아 계획 v0.2 에 반영한다.

#### 회부②의 원문 — 축④ replay 강등의 «양쪽» 을 내 스택에서 못 잰다

강등 정직성은 「게이트 있음 → live」와 「게이트 없음 → replay 로 강등하고 그렇다고 말한다」의
**두 열**이라야 판정이 선다(4대 유언 — 대조군 없는 초록은 아무것도 가르지 못한다).
내 스택에는 로컬 synthesize 게이트 env 가 없으므로 «게이트 있음» 열을 만들 수 없다.

선택지: ⓐ 운영자 로컬 환경에서 그 열만 별도 실측(운영자 시간 필요) · ⓑ 게이트 도달 가능
여부를 주입으로 흉내(내 스택 한정 · 승인 필요) · ⓒ 이번 판정에서 그 열을 «못 쟀다»로 명시하고
범위 밖으로 성문. 🔴 **어느 쪽이든 「못 쟀다」를 초록으로 적지 않는다** — 판정 요청.

## 3. 그물 선행 설계 (구현물 무접촉 — 지금 만들 수 있는 것)

| 신설 예정 자산 | 무엇을 재는가 | 구현 의존 |
|---|---|---|
| `tests/api/event_schema_drill.py` | 스키마 정본으로 이벤트 전수 검증 + `seq` 단조 + 어휘 판정 | ✅ **착수 완료** — 자기 검증 11/11 |
| `tests/api/credential_leak_drill.py` | 계약 경로 전수 + 로그 면 키·경로 스캔 + 반사 배제 | ✅ **착수 완료** — 자기 검증 7/7 · 현 표면 누출 0 |
| `tests/api/ssot_write_drill.py` | run 전후 SSOT 무변 실측(J-3) | ✅ **착수 완료** — 자기 검증 3/3 · 지문 29테이블 |
| `tests/api/run_surface_drill.py` | runs 5 + graph/paths 형상·대조군 | 라우트 해제 후(형상이 없으면 대조군을 못 세운다) |
| `tests/api/scenario_script_drill.py` | 대본 S3~S7 ↔ step 이벤트 대응 · 0건 단계 · 후보 순위 | 실행 후 |

### 착수 3종의 실측 (지금 · E1)

| 자산 | 자기 검증 | 지금 돌린 결과 |
|---|---|---|
| `event_schema_drill --samples-only` | 표본 11종(계약 형상 1 · 이탈 10) 전건 기대대로 | 대상 판정 아님(이벤트 표면 미해제) |
| `credential_leak_drill --log …` | 표본 7종(깨끗 2 · 누출 5 · **반사 1 포함**) | 계약 경로 22건 중 응답 9건 훑어 **누출 0** · 미해제 skip 16 · 로그 면 누출 0 |
| `ssot_write_drill` | 표본 3종(무변·증가·신설) | 지문 = **29테이블 950,372행** — T2-3 착지 후 이 지문이 기준선이다 |

🔴 세 자산 모두 **미해제(501)를 red 로 세지 않는다** — skip 하거나 `exit 2`(측정 불가)로 죽는다.
「아직 안 만들었다」를 결함으로 세면 그 표는 착지 전까지 계속 빨갛고, 진짜 빨강이 묻힌다.

🔴 `event_schema_drill` 은 검증기를 **내가 썼다**. 이 리포는 `jsonschema` 를 의존에 두지 않고,
J-6 처럼 공유 venv 에 설치하는 것은 조율 비용이 든다. 대신 스키마가 쓰는 어휘만 구현하고,
**스키마가 새 어휘를 쓰기 시작하면 조용히 통과시키지 않고 `exit 2` 로 죽는다**(미지원 어휘 감사).

🔴 선행 작성은 **골격과 자기 검증까지**만 한다. 기대값을 구현이 아니라 정본(스키마·대본·계약)에서
뽑는 구조를 먼저 세워 두면, 구현 착지 후 「구현을 보고 기대값을 맞추는」 유혹이 사라진다.

## 4. 실행 순서 (착지 후)

1. 회귀 먼저 — T2-1·T2-2 자산 8종(하류를 깼는지부터)
2. 축① 표면 → 축② 스키마 → 축⑦ SSOT → 축⑥ 재사용 (읽기·무해)
3. 축⑤ 대본 결속 → 축④ 강등 → 축⑧ blocking
4. 축③ 자격 증명 전수 — **마지막에 한 번 더 전 산출물 대상으로** 돌린다(중간에 생긴 로그까지 포함)
