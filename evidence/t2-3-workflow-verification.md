# T2-3 독립 검증 — LangGraph 조사 워크플로우 · runs 표면 · 이벤트 스트림

> 리바이2 8대 · 2026-08-30 · 근거 등급 **E1(실측)** — 코드 독해분은 **E2** 로 따로 표기
>
> **판정: PASS** — 대상 = develop `3b21a3f`(구현 PR#118 + 계약 v0.1.3 append PR#119).
> 계획 v0.2 의 축 8개를 그대로 집행했다. **결함 0건** · 자산 13종 1회 실행 전건 `exit 0`.
> 🔴 이 PASS 는 §0 의 오른쪽 열과 §0.1 의 「못 잰 열」을 포함해서 읽어야 한다.

## 0. 판정 범위

| 이 판정이 덮는 것 | 덮지 «않는» 것 |
|---|---|
| runs 표면 5 + `/graph/paths?byRun` 계약 형상·대조군 | 조사 «품질»(후보가 옳은 원인인가) — 평가 티켓의 몫 |
| 이벤트 32건의 스키마 전수 준수 · `seq` 단조 · WS≡REST | LLM 출력 문장의 사실성 — 공개 경로엔 LLM 이 없다(J-5) |
| 자격 증명 비노출 3면(응답·이벤트·로그) + egress 가드 | 부하·동시성 — 측정 안 했다 |
| 대본 S3~S7 결속 · 후보 순위 · 0건 단계 부재 | 화면 렌더링 — T2-6 이후 |
| T2-1 재사용(새 검색 경로 부재) · SSOT 쓰기 0 · 재기동 소실 | T2-4(replay fixture) · T2-5(WO CRUD) 범위 |
| 실행 중 이벤트 루프 응답성 | `/graph/paths?from&to` 축 — 501 로 남아 있다(§4 소견①) |

### 0.1 🔴 못 잰 열 — 초록으로 적지 않는다

**합성 게이트웨이 «도달 가능»(`/live/status.online = true`) 상태에서의 거동.**
그 열은 운영자 로컬 전용이 설계의 참이며(계약 v0.1.2·v0.1.3 · J-5), 스텁으로 흉내 내면
「도달 가능」의 정의 자체가 바뀌어 **다른 것을 재게 된다**(오케 판정 08-30 — ⓑ 불허).
이 스택에서는 `online=false` 열만 쟀다. 나머지 열의 실측은 **데모 리허설(운영자 게이트) 시점에
결속**된다. 그때까지 「게이트가 있을 때도 옳다」는 **아직 아무도 실증하지 않았다.**

## 1. 측정 조건

| 축 | 값 |
|---|---|
| 대상 | develop `3b21a3f` · uvicorn 이 소스를 직접 load |
| 🔴 낡은 실행 배제 | 착지분으로 주 워크트리를 갱신한 뒤 **서버를 새로 띄웠다**. 이전 커밋을 물고 있던 프로세스는 종료했다 |
| 스택 | `fkt-levi2` — pg `5534` · neo4j `7574/7587` · venv = 주 체크아웃(langgraph 1.2.11 · websockets 16.1.1) |
| 기대값 출처 | 🔴 **정본에서 뽑았다** — 단계 목록 = 이벤트 스키마 `stepId` enum · 후보 규칙 = 대본 §3 「유력 = FM-BRG-WEAR」 · 경로 목록 = 계약 경로 표 · 상태 목록 = 색인 뷰 |
| 축 확정 시점 | 🔴 **구현물 무접촉 상태에서 계획 v0.2 로 먼저 세웠다**(PR#117). 구현은 그 뒤에 읽었다 |

## 2. 축별 결과

### 축① runs 표면 + `/graph/paths` (J-1·J-2) — **PASS** (`run_surface_drill` 17/17)

| 행 | 실측 |
|---|---|
| `POST /scenarios/{id}/runs` | `{runId, incidentId, mode}` · `incidentId=INC-2026-014`(seed 참조) |
| `GET /runs/{id}` | 완주 후 `status=completed` · `candidates` 2건 · `workOrderDraftId` 있음 |
| `GET /runs/{id}/events` | 32건 · 배열 순서 == `seq` 순서 |
| `POST /runs/{id}/stop` | `{status:"stopped"}` **+ `run.stopped` 이벤트**(F-3b — 타임라인이 닫힌다) |
| `WS /ws/runs/{id}` | 스트림 32건(축②에서 REST 와 대조) |
| `/graph/paths?byRun` | 경로 5건 · `{evidenceId, nodes, edges}` 고정 template 형상 |
| **대조군 5종** | 없는 시나리오·run·events·stop·byRun 전부 `404 not_found` — 「없는 것을 없다고」 |

🔴 **임의 Cypher 파라미터는 존재하지 않는다**(§16.2 Stop 조건 축) — 노출 파라미터는 `from`·`to`·
`byRun` 셋뿐이고 셋 다 ID 값이다.

### 축② 이벤트 스키마 독립 파싱 — **PASS** (`event_schema_drill` 6/6)

🔴 **검증기를 내가 썼다.** `jsonschema` 를 의존에 두지 않으므로 스키마가 쓰는 어휘만 구현했고,
**스키마가 새 어휘를 쓰기 시작하면 조용히 통과시키지 않고 `exit 2` 로 죽는다**(미지원 어휘 감사).
자기 검증 표본 11종(계약 형상 1 · 이탈 10) 전건 기대대로 — 필수 누락 · `type↔payload` 결속 위반 ·
`stepId` enum 밖 · `additionalProperties` 위반(payload 안쪽 포함) · `seq` 음수 · `ts` 형식 ·
`candidates` 빈 배열 · doc-chunk 신뢰필드 누락을 실제로 잡는다.

| 행 | 실측 |
|---|---|
| S-01 이벤트 32건 전건 스키마 준수 | 위반 0 — **스키마 밖 필드 0**(조용한 계약 확장 없음) |
| S-02 `seq` 단조 증가 · 유일 | `0…31` |
| S-03 한 run 의 이벤트만 | runId 1종 |
| S-04 어휘 통일 | `doc-chunk` · `record` · `graph-path` — 🔴 `alarm`·`sensor-series` **미발행**(판정 준수) |
| S-05 타임라인이 열리고 닫힌다 | `run.started` … `run.completed` |
| S-06 **WS ≡ `/events`** | WS 32건 · REST 32건 · `(seq, type)` 열 동일 |

### 축③ 자격 증명 비노출 — **PASS** (`credential_leak_drill` 3면 + egress 가드)

| 면 | 실측 |
|---|---|
| 응답 | 계약 경로 표 22건에서 파생한 요청 **14건**(있는 ID·없는 ID 둘 다) · 누출 **0** · 미해제 skip 11 |
| 이벤트 | run 1회의 **32건** 전문 스캔 · 누출 **0**(🔴 키는 대개 `note`·`summary`·`message` 로 샌다) |
| 로그 | 서버 로그 전문 · 누출 **0** |

스캐너 자기 검증 7종(깨끗 2 · 누출 5) — 키 형상 · env 이름 · DSN · traceback · 절대경로를 실제로
잡는다. 🔴 **반사 표본을 포함**했다: 내가 보낸 `ANTHROPIC_API_KEY` 가 400 메시지로 되돌아온 것을
누출로 세지 않는다(8대 자기 실수의 성문 · 원장 Q-23 계보).

**egress 가드 생존 재확인 (E1 · 독립 재현)** — 가드가 **실제로 환경을 바꾸는지**를 직접 쟀다:

| 입력 env | 부팅 후 |
|---|---|
| `LANGCHAIN_TRACING_V2=true` | `false` |
| `LANGSMITH_TRACING=true` | `false` |
| `LANGCHAIN_ENDPOINT=https://api.smith.langchain.com` | **제거됨(None)** |

J-5 의 「강제 false」가 성문대로 동작한다. 🔴 가드는 **부팅을 거부하지 않고 값을 고쳐서 뜬다** —
그것이 J-5 의 처방이므로 red 가 아니다. 계획 v0.2 의 red 조건(「true 인 채 부팅이 성립하면 red」)은
이 실측에서 「true 인 채로는 성립하지 않는다」로 충족된다.

### 축④ `mode` 축과 게이트 축 (계약 v0.1.3) — **PASS**(잰 열) / **미측정**(게이트 열)

🔴 **계획 v0.2 의 red 조건을 착수 전에 뒤집었다.** v0.1.3 이 `mode` 를 «이벤트 출처» 축으로
확정했으므로, 「live 요청에 `mode:"live"` 로 답하면 말없는 강등」이라는 옛 조건을 그대로 들고
갔으면 **참인 동작을 결함으로 셀 뻔했다**.

| 행 | 실측 |
|---|---|
| 실행된 run 의 `mode` | `live` — 참(단계들이 실제로 돌았다) |
| `mode:"replay"` 요청 | `501 not_implemented` + 사유(「fixture 축 = T2-4」) — 🔴 **없는 것을 있다고 하지 않는다** |
| 게이트 축 | `/live/status.online = false` — 공개 스택에서 참(v0.1.2) |
| 게이트 도달 가능 열 | §0.1 — **못 쟀다** |

### 축⑤ 대본 결속 · 「조용한 0건 단계 통과」 — **PASS** (`scenario_script_drill` 15/15)

| 행 | 실측 |
|---|---|
| 선언한 plan == 스키마 `stepId` 전 단계 | `structured·vector·graph·synthesize·draft_work_order` |
| 선언한 단계가 전부 완료로 닫힌다 | 5/5 |
| 🔴 검색 3단계가 근거를 «낸다» | structured **9** · vector **5** · graph **5** — 0건 단계 없음 |
| synthesize 결론 | 후보 **2건** |
| draft_work_order 결론 | 초안 id 있음 |
| 대본 §3 유력 후보 | `rank1 = FM-BRG-WEAR` — 대본에서 뽑은 기대값과 일치 |
| 대본 S6 후보 2개 이상 | `[(1, FM-BRG-WEAR), (2, FM-TOOL-IMB)]` · 후보마다 근거 묶음 있음 |
| 낸 근거를 «자기 kind 의 소비처»로 편다 | `record`+`doc-chunk` **14건 → `/evidence` 전건 200** · `graph-path` **5건 → `/graph/paths?byRun` 전건 존재** |

🔴 **검색 단계와 결론 단계를 갈라 쟀다.** 「evidence 0건이면 red」를 다섯 단계에 그대로 걸면
synthesize·draft_work_order 가 **참인데 빨개진다** — 그 둘은 근거를 «내는» 자리가 아니라
«쓰는» 자리다. 대신 그 둘은 결론(후보·초안 id)의 존재로 잰다.

**대본 S5 대조 (관측 → 충족)**: 대본은 「4-hop · Component 경유 · `SAF-LOTO-01` 까지」를 기대
evidence 로 적는다. 실물 경로 5건의 hop 분포는 **[2, 3, 4]**, 종단은
`CP-204-BRG-01` · `FM-BRG-WEAR` · `MR-2024-0004` · `SOP-BRG-INSP-014` · `SAF-LOTO-01` 로
**4-hop 안전 규정 종단이 실재**한다. 대본 재바인딩 불요.

### 축⑥ T2-1 재사용 — **PASS**

| 행 | 실측 |
|---|---|
| vector 단계 근거 ⊆ 같은 질문의 `compare` 결과 | run 5건 · compare 5건 · **compare 밖 0건** — 새 검색 경로의 흔적 없음 |
| 하류 회귀 | T2-1·T2-2 자산 **8종 전건 green**(FAIL 0) — T2-3 이 아래를 깨지 않았다 |

### 축⑦ J-3 「SSOT 쓰기 0」 — **PASS** (`ssot_write_drill`)

지문 = `information_schema` 에서 뽑은 **29 테이블 · 950,372행**. run 1회 전후 **변화 0**.
비교기 자기 검증 3종(무변·증가·신설) — 늘어난 행과 새 테이블을 실제로 잡는다.

**재기동 소실 실측(E1)**: run 생성 → 조회 `200` → 서버 재기동 → 같은 runId 조회 **`404 not_found`**.
J-3 이 「성문된 대가」라 부른 것이 **사실로도 그렇다**.

### 축⑧ blocking 0 — **PASS** (HTTP 표면만으로 측정 · 결합 0)

조사 실행 «중» `/api/health` 응답 시간을 20ms 간격으로 샘플링했다.

| 구간 | n | p50 | p95 | max |
|---|---:|---:|---:|---:|
| 유휴 | 75 | 24.0ms | 30.2ms | 48.4ms |
| 실행 중 | 226 | **7.3ms** | 29.3ms | 195.4ms |

실행 중 p50·p95 가 유휴 대비 상승하지 않는다 — 단계 실행이 이벤트 루프를 잡고 있지 않다.
🔴 다만 공개 경로의 synthesize 는 결정적 집계이고 **LLM 호출이 없다**(J-5). 즉 이 초록은
「LLM 호출이 비동기 경계 안에 있다」의 실증이 아니라 **「지금 도는 경로에 blocking 이 없다」**의
실증이다 — 그 구분을 여기 적어 둔다.

## 3. 계수

| | |
|---|---|
| 자산 | **13종**(T2-1·T2-2 8종 회귀 + T2-3 5종) |
| 실행 | 1회 · 전건 `exit 0` |
| 판정 행 | **176**(FAIL **0**) + 요약행이 덮는 왕복 38건 = 판정 항목 **214** |
| 원문 | `evidence/t2-3-final-run.log` — 계수는 이 파일에서 세었다 |

## 4. 소견 (E3 — 결함으로 계수하지 않는다 · 판정 회부분 포함)

**소견① — `/graph/paths?from&to` 축이 `501` 로 남아 있다.** J-2 는 `/graph/paths` 를 T2-3 해제로
확정했고, 실제로 `?byRun` 은 열렸다. `from&to` 축은 「이 축의 소비 화면(T2-3 은 byRun 만 쓴다)」이라는
**사유를 달고** 501 이다 — 조용한 누락이 아니라 명시적 미해제이며, 계약 README 원칙2(「붙일 근거가
없으면 내보내지 않는다」)와도 정합한다. 🔴 다만 계약 경로 표는 두 질의 형태를 **한 행**에 적으므로
「해제」의 단위가 라우트인지 질의 형태인지는 성문되어 있지 않다. **판정 회부** — 이 상태를
「해제 완료」로 셀지, 잔여로 남길지.

**소견② — `GET /runs/{runId}` 에 세션 축이 없다.** J-3 은 저장소를 「프로세스 내 **세션 스코프**」로
판정했는데, 계약의 조회 라우트에는 `sessionId` 가 없다(경로·질의 어디에도). 즉 runId 를 아는 쪽은
누구나 읽는다 — runId 가 추측 불가한 난수라 실질 위험은 낮고, 대본 S9 의 「타 세션 무영향」은
«리셋» 축이라 이번 범위 밖이다. 계약 개정 사안이라 결함으로 세지 않되, 세션 격리를 **주장하게 될
때**(T2-4/T2-6) 이 자리가 먼저 정해져야 한다.

**소견③ — 이 초록이 «무엇의» 초록인지.** 축⑧에 적은 것과 같은 계열이다. 공개 경로에는 LLM 이
없으므로 이번 판정은 「synthesize 가 구독 프록시가 아니다」를 **구조로**(live 노드 미등록 · E2 코드
독해) 확인했을 뿐, 게이트가 있을 때의 거동은 §0.1 그대로 미측정이다.

## 5. 내가 틀렸던 자리 (그물의 자기 정정 2건 — 남긴다)

**① 너무 일찍 봤다.** `event_schema_drill` 이 처음 `S-05`(타임라인이 닫힌다)에 red 를 냈다.
원인은 대상이 아니라 **run 생성 직후에 이벤트를 읽은 나**였다 — 실행 «중»의 타임라인은 당연히
안 닫혀 있다. 완주를 기다리는 `settle()` 을 넣고 그 사유를 함수 머리말에 성문했다.
**빨강도 그 주어를 물어야 한다.**

**② 계획의 red 조건이 판정보다 낡아 있었다.** 축④의 「live 라고 답하면 red」는 v0.1.3 이전의
독법이었다. 착수 전에 계약 원문을 실독해 뒤집지 않았으면 **참인 동작을 결함으로 보고**할 뻔했다.
🔴 그물은 처방과 함께 바뀐다 — 7대 유언의 반대 방향 사례로 남긴다.

## 6. Q-9 결속 (오케 발주 ⓒ)

실물 후보는 **rank1 `FM-BRG-WEAR`(스핀들 베어링 마모) · rank2 `FM-TOOL-IMB`(공구 불균형)** 이며,
rank2 의 `confidenceNote` 는 「정비 이력 0건 · 문서 인용 1건 · 그래프 경로 없음 · 🔴 대응 SOP 매핑
없음」이다. 대본 §3 의 「유력 = FM-BRG-WEAR」와 「후보 2개」를 둘 다 만족한다 — **대본 재바인딩 불요**.

## 7. 재현 명령

```powershell
# 스택 · 서버 (services/ai-api · 의존은 환경변수로만)
docker ps --filter name=fkt-levi2
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000 --host 127.0.0.1

# 자산 13회 (리포 루트 · exit 0 = 기대대로 · 1 = 어긋남 · 2 = 측정 불가/미해제)
python tests/api/anchor_extraction_probe.py
python tests/api/anchor_boundary_drill.py
python tests/api/citation_roundtrip_drill.py --inject-drift
python tests/api/scenario_allowlist_drill.py
python tests/api/freshness_badge_drill.py --inject-stale
python tests/api/injection_surface_drill.py
python tests/api/error_shape_drill.py --cut-neo4j
python tests/api/dependency_code_drill.py --cut-postgres
python tests/api/run_surface_drill.py
python tests/api/event_schema_drill.py
python tests/api/scenario_script_drill.py
python tests/api/ssot_write_drill.py --run
python tests/api/credential_leak_drill.py --log <서버 로그>
```
