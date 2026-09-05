# T5-2c — Gate 7 조각 B 실행 설계서 (⑦ oversized · ⑧ rate limit · ⑪ CORS · +재색인 주입)

> 🔴 **이 문서는 설계서다 — 아무 자극도 쏘지 않았고 아무 색도 내지 않았다.**
> 산출 = 「조각 B 를 «어떻게» 잴 것인가」의 계획뿐. 판정·PASS/FAIL 은 실행 조각(별도 발주)의 몫이다.
>
> 검증 좌석 리바이2 **54대** · 발주 = 스자쿠 49대(오케 · T5-2c) · lane `lane/levi2-t52c` @ 기점 `origin/develop` **`9797aea`** ·
> 정의 정본 = `evidence/t5-2-gate7-map.md`(§32.8 13항 대응표 · 25대 작성) · 대상 층 정본 = `services/ai-api/app/protection.py`·`settings.py`·`main.py`·`services/synthesis-gateway/gateway.py`(54대 실독) ·
> 재사용 정본 = `evidence/t4-2b-live-guard-verification.md`(16대 · 서버 축) + `tests/api/t42b_limits_drill.py`·`tests/web/t41_cors_browser_drill.mjs`·`tests/api/prompt_injection_authority_drill.py`.
> 근거 등급: 층·값·상수는 **E1**(코드 실독) · 무대 포트/PID 는 **E3**(seat-resume 전언 · 실행 조각에서 재실측).

---

## §0 🔴 발주 전제 정정 — 「대상 층」은 발주문과 다르다 (실물 우선 · 회부)

발주문은 ⑦⑧⑪ 을 「게이트웨이 `:8797` 상대」로 묶었다. **코드를 읽으니 세 축의 대상 층이 갈린다.**
보호장치 미들웨어(413·429·CORS)는 **ai-api `:8020`** 에 있고, 게이트웨이 `:8797` 은 **loopback + 토큰**으로 닫힌 내부 릴레이다.

| 축 | 발주문의 층 | 🔴 실물 층 | 근거(파일:줄) |
|---|---|---|---|
| ⑦ oversized | 게이트웨이 `:8797` | **두 층 겹침** — 공개 표면 = ai-api `:8020`(64KB) · 내부 릴레이 = 게이트웨이 `:8797`(1MB) | `protection.py:BodyLimitMiddleware`·`settings.py:108 max_body_bytes=65536` / `gateway.py:125 MAX_BODY_BYTES=1MiB`·`:548` |
| ⑧ rate limit | 게이트웨이 `:8797` | **ai-api `:8020` «만»** — 게이트웨이엔 rate limit 이 **없다** | `protection.py:RateLimitMiddleware`·`settings.py:98-99` / 게이트웨이엔 해당 코드 부재 |
| ⑪ CORS | 게이트웨이 `:8797` | **ai-api `:8020` «만»** — 게이트웨이는 server→server 라 브라우저 origin 이 없다 | `main.py:163-171 CORSMiddleware`·`settings.py:128 cors_allowlist` / 게이트웨이엔 CORS 부재 |

🔴 **왜 이 정정이 판정을 바꾸는가.** ⑧⑪ 을 게이트웨이 `:8797` 에 쏘면 「rate limit 이 안 걸린다 / CORS 헤더가 없다」가
나오는데, 그건 **결함이 아니라 그 층에 그 방어가 없기 때문**이다. 없는 층에 쏜 자극의 침묵을 「대상 결함」으로 읽으면
[[fkt-attribution-before-verdict]] 위반이다. 그래서 아래 설계는 **각 축을 그 방어가 실제로 사는 층에** 배치한다.
게이트웨이 `:8797` 의 ⑦(1MB·CL-only)은 별도 행으로 두되, **loopback+토큰 뒤라 위협 모델이 다르다**는 점을 §1-⑦ 에 성문한다.
⇒ 오케 판정 요청: **이 층 재배치를 승인**하거나, 「게이트웨이 상대」의 다른 의도가 있으면 회신 바람.

---

## §1 축별 설계

각 축 = ① 대상 층 · ② 자극 수 · ③ 기대(차단 코드·은닉·안전 실패) · ④ 대조군(참 울림 선행 + 계측기 생존) ·
⑤ 서버 본수·포트 · ⑥ 소요 · ⑦ 「측정 불가」 조건 · ⑧ T4-2b 재사용분.

### ⑦ oversized request

**① 대상 층 = 두 층(각각 잰다).**
  - **⑦-A ai-api `:8020`**(공개 표면 · 정본 방어) — `max_body_bytes=65536`(64KB) · 413 `payload_too_large` · **Content-Length 선검사 + 스트림 실측 둘 다**(`protection.py:BodyLimitMiddleware`).
  - **⑦-B 게이트웨이 `:8797`**(내부 릴레이) — `MAX_BODY_BYTES=1MiB` · 413 `{rejectedReason}` · **Content-Length 선검사만**(스트림 실측 없음 · `gateway.py:544-549`) · 토큰 `X-FKT-Gateway-Token` + loopback.

**② 자극 수 = 6.**
  | # | 자극 | 대상 |
  |---|---|---|
  | O-1 | 상한 «안»(64KB−δ ≈ 65,000B) | ⑦-A |
  | O-2 | 상한 «밖»(64KB+δ ≈ 66,000B) · Content-Length 정직 | ⑦-A |
  | O-3 | 🔴 chunked(Content-Length 없음) 로 상한 초과 | ⑦-A |
  | O-4 | 🔴 Content-Length «거짓 축소»(작게 선언 + 크게 전송) | ⑦-A |
  | O-5 | 게이트웨이 상한 «안»(1MiB−δ) · 정직 CL · 유효 토큰 | ⑦-B |
  | O-6 | 게이트웨이 상한 «밖»(1MiB+δ) · 정직 CL · 유효 토큰 | ⑦-B |

**③ 기대.**
  - O-1 → **413 아님**(정상 처리 · 세는 눈). O-2 → `413 payload_too_large`. O-3 → `413`(스트림 실측이 잡는다). O-4 → `413`(스트림 실측이 선언보다 실제 바이트를 센다 — 「거짓 CL 로 우회」가 막히는가).
  - O-5 → **413 아님**. O-6 → `413 {rejectedReason:"본문 크기 …"}`.
  - 🔴 **은닉**: 어느 응답에도 스택 트레이스·내부 경로 노출 0(⑫ 축과 결부 · 형상만 확인).

**④ 대조군(참 울림 선행 + 계측기 생존).**
  - O-1(64KB 안 통과)이 **먼저** 초록이어야 O-2~O-4 의 413 이 「내가 413 을 못 만든 것」과 갈린다([[fkt-defence-in-front-of-the-axis]] · 문 앞에 걸렸는가부터).
  - 🔴 O-4(거짓 CL)의 대조군 = **같은 서버에서 O-2(정직 CL 초과)가 이미 413 을 냈음**을 선행 확인 — 그래야 O-4 초록이 «스트림 방어»의 것이지 «CL 선검사»의 것이 아님이 갈린다.
  - 게이트웨이 축(⑦-B) 계측기 생존 = **유효 토큰으로 정상 `/synthesize` 1회 성공**(O-5 가 그 역할) → 401 로 튕긴 게 아님을 증명.

**⑤ 서버 본수·포트.**
  - ⑦-A = **develop `:8020` «그대로»**(64KB 가 계약 기본값 = 실측 대상 · 자기 스택 불요). PID→거동 재확인 후 발사.
  - ⑦-B = **develop 게이트웨이 `:8797` «그대로»**(1MiB 기본 · 토큰 = 컨테이너 env `FKT_SYNTHESIS_GATEWAY_TOKEN` · 헤더 `X-FKT-Gateway-Token`). **loopback 이라 호스트에서 `127.0.0.1:8797` 로 직접**.
  - 신규 서버 = **0본**.

**⑥ 소요 ≈ 20분**(그물 1본 `tests/security/gate7_oversized_drill.py` 신설 = t42b_limits 413 축 이식 + 게이트웨이 축 2행 + 거짓-CL 축 1행).

**⑦ 「측정 불가」 조건.**
  - O-3(chunked)를 `urllib` 로 못 보내면(파이썬 기본이 CL 을 붙인다) → **raw socket 전송**으로 내려간다. raw socket 도 불가하면 그 «행»만 `측정 불가`(초록 아님)로 인쇄하고 나머지는 계속.
  - ⑦-B 토큰을 못 얻으면(컨테이너 env 판독 불가) → ⑦-B 전체를 **자기 게이트웨이 1본**(포트 새로 · `FKT_SYNTHESIS_GATEWAY_TOKEN` 내가 주입)으로 대체하거나, 그마저 불가하면 ⑦-B `측정 불가`.
  - 🔴 O-4 는 게이트웨이(⑦-B)에서는 **「불성립」**이 후보다 — 게이트웨이는 `rfile.read(length)` 로 «선언한 만큼만» 읽어 스트림 실측이 없다. 거짓 축소 CL 을 보내면 «선언 바이트만 처리»되어 413 도 아니고 우회도 아닌 제3의 거동이 된다. 이 행은 **「대상 결함 후보」로 회부**하되, 위협 모델(loopback+토큰 내부 릴레이)을 병기해 등급은 오케 판정.

**⑧ T4-2b 재사용.** `tests/api/t42b_limits_drill.py` §B(B-01·B-02·B-03 = 413 선검사+스트림) **직접 이식**(16대 판정 PASS). 게이트웨이 축·거짓-CL 축은 신규.

---

### ⑧ 반복 요청 · rate limit

**① 대상 층 = ai-api `:8020` «만».** `RateLimitMiddleware`(`protection.py`) · 축 2개 «각각»(IP · 익명 세션) · 창 60초 슬라이딩 고정 · 초과 = 즉시 `429 rate_limited` + `Retry-After`(정수 초).
  기본값 = IP **6000**/min · session **300**/min(`settings.py:98-99`) · `Retry-After` floor **60**(`:100`) · 제외 4종(`/api/health`·`/api/live/status`·`OPTIONS`·`/api/ws/*`).

**② 자극 수 = 8**(t42b_limits §A 재사용):
  R-1 세션축 통과 N → 429(429 «전» 통과 있음) · R-2 코드 `rate_limited` · R-3 `Retry-After` 정수 · R-4 초과 즉시(서버 대기 0) · R-5 🔴 축 분리(새 세션 첫 요청 200 = 같은 IP·같은 서버) · R-6·7 IP 축 혼자 운다(무쿠키) · R-8 제외 4종 전건 429 아님.

**③ 기대.** 초과 = `429 rate_limited` + `Retry-After` 정수. 축 분리 = 세션 넘쳐도 새 세션은 200. 제외 4종 = 429 아님. 🔴 **은닉**: 429 응답에 어떤 세션도 식별자 노출 0.

**④ 대조군(참 울림 선행 + 계측기 생존).**
  - 🔴 R-8(제외 4종)을 재기 «전» **같은 서버에서 429 를 실제로 받아 낸다**(t42b §2 규율 · [[fkt-guard-needs-both-sides]] — 막힌 표본만이면 «전부 거절하는 문»도 초록). 「제외가 429 아님」이 「내가 429 를 못 만든다」와 갈리는 지점.
  - R-5(축 분리)의 대조군 = 세션 축이 넘친 «직후» 새 세션 첫 요청 200 → IP 축이 안 물렸음을 증명(같은 IP).

**⑤ 서버 본수·포트 = 자기 스택 2본**(t42b 형: 손잡이 «하나»씩만):
  | 포트 | env 손잡이 하나 |
  |---|---|
  | 자기 uvicorn A(예: `:8340`) | `FKT_RATE_LIMIT_SESSION_PER_MIN=3`(IP 는 6000 유지) = 세션 축 «혼자» |
  | 자기 uvicorn B(예: `:8341`) | `FKT_RATE_LIMIT_IP_PER_MIN=5`(세션은 300 유지) = IP 축 «혼자» |
  🔴 기본값(6000/300)으로는 실측이 6000발을 쏴야 해 소요·구독이 폭발한다 — **낮춘 손잡이로 참 울림을 싸게 만든다**(값은 실측 편의 · 계약 형상은 불변). fixture 불요 → replay 무관(O-42 미해당) · uvicorn 기동만.

**⑥ 소요 ≈ 25분**(서버 2본 기동 + t42b_limits §A 그대로 · `FKT_T42B_SESSION_BASE`/`FKT_T42B_IP_BASE` 로 두 서버 지정).

**⑦ 「측정 불가」 조건.** 자기 스택 uvicorn 이 안 뜨면(의존 체인 langgraph·torch 등) → 429 축 전체 `측정 불가`(어느 색도 안 냄 · exit 2). rate limit 축은 «내 서버»가 없으면 못 잰다(develop `:8020` 은 6000 이라 실측 불가).

**⑧ T4-2b 재사용.** `tests/api/t42b_limits_drill.py` §A(R-01~R-08 · 16대 PASS) **직접**. `self_check()`(판정자가 429·정수 Retry-After 를 실제로 가르는가)도 그대로.

---

### ⑪ CORS 우회

**① 대상 층 = ai-api `:8020` «만».** `CORSMiddleware` — allowlist 가 «있을 때만» 켠다(`main.py:163`) · origin = `FKT_CORS_ORIGINS`(콤마 구분 · **와일드카드 `*` 는 버린다** · `settings.py:128`) · `allow_credentials=True` · methods `GET,POST,PATCH,OPTIONS` · headers `content-type`. **기본값 = 빈 목록 → 미들웨어 미설치**(develop `:8020` 의 현 상태).

**② 자극 수 = 5**:
  | # | origin | allowlist 상태 | 기대 |
  |---|---|---|---|
  | C-1 | 허용 origin(예: `https://ok.example`) | allowlist=`ok.example` | preflight 200 + `ACAO: ok.example` + `ACAC: true` |
  | C-2 | 미허용 origin(예: `https://evil.example`) | allowlist=`ok.example` | **`ACAO` 헤더 부재**(브라우저가 차단) |
  | C-3 | 🔴 와일드카드 주입 시도 `FKT_CORS_ORIGINS=*` | — | `cors_allowlist`=[] → **미들웨어 미설치**(한 글자로 allowlist 를 없애지 못한다) |
  | C-4 | 빈 allowlist(develop 기본) + cross-origin | allowlist='' | **CORS 헤더 전무**(문 자체가 없음 = same-origin 형상) |
  | C-5 | 실제 브라우저 fetch(credentials:'include') | allowlist=`ok.example` | 허용 origin 은 응답 읽힘 · 미허용은 네트워크 오류 |

**③ 기대.** 허용 origin 만 `ACAO`+`ACAC` 회신 · 미허용은 헤더 부재로 브라우저가 응답을 못 읽음 · `*` 는 목록에서 탈락 · 빈 목록은 문 없음. 🔴 **안전 실패**: `allow_origins=["*"]` + `allow_credentials=True` 동시 성립이 **절대 안 나와야**(브라우저가 거부하는 조합 · 코드가 `*`를 버려서 구조적으로 불가).

**④ 대조군(참 울림 선행 + 계측기 생존).**
  - 🔴 C-1(허용 origin 이 `ACAO` 를 «실제로» 받음)이 **먼저** 초록이어야 C-2 의 「헤더 부재」가 「CORS 가 아예 안 켜졌다」와 갈린다([[fkt-guard-needs-both-sides]] · 양면). C-4(빈 목록)와 C-2(미허용)는 **둘 다 헤더가 없다** — 이 둘을 가르는 유일한 축이 「allowlist 가 켜졌는데 이 origin 만 빠졌나(C-2)」 vs 「문 자체가 없나(C-4)」다. 그래서 **C-1 과 C-2 를 같은 서버(allowlist 켜짐)에서** 재고, C-4 는 별도 서버(allowlist 빔).
  - 계측기 생존 = 페이지 서버 2본이 «실제로 뜨고» 브라우저가 «양쪽에 닿음»을 preflight 200 으로 확인.

**⑤ 서버 본수·포트 = 3본**:
  - 자기 ai-api A(예: `:8342`) `FKT_CORS_ORIGINS=https://ok.example`(allowlist 켜짐 · C-1·C-2·C-5).
  - 자기 ai-api B(예: `:8343`) `FKT_CORS_ORIGINS=`(빈 목록 · C-4) — 또는 develop `:8020` 재사용(현재 빈 목록).
  - 페이지 서버 2본(허용 origin 용 + 미허용 origin 용 · `t41_cors_browser_drill.mjs` 가 요구) — 정적 http.server 2본(예: `:8344`·`:8345`).
  🔴 origin 은 **스킴+호스트+포트**가 정본이라, 브라우저가 보는 origin 을 실제 서버로 세워야 한다(문면만 `Origin:` 헤더로 지어내면 preflight 를 못 잰다).

**⑥ 소요 ≈ 30분**(ai-api 2본 + 페이지 2본 + `t41_cors_browser_drill.mjs` 조정 · playwright 브라우저 축).

**⑦ 「측정 불가」 조건.** playwright 브라우저가 안 뜨면 → **curl `-H "Origin: …" -X OPTIONS`** 로 preflight 헤더 축(C-1~C-4)만 재고, C-5(브라우저 실 fetch·credentials)는 `측정 불가`로 남긴다(서버 헤더 ≠ 브라우저 집행 · [[fkt-screen-says-vs-run-does]]). ai-api 자기 스택이 안 뜨면 CORS 축 전체 `측정 불가`.

**⑧ T4-2b 재사용.** `tests/web/t41_cors_browser_drill.mjs`(T4-1 ⓒ · 맨 페이지 서버 2본 + allowlist 주입 형) **직접 이식** · 429/413 은 미결부.

---

### +④ 정상 재색인 경유 prompt injection (③ 미측 축 완결)

**① 대상 층 = 자기 스택 «만»**(indexer → ai-api retrieval → live run). 🔴 **t15 골든 데이터 무접촉** · `build_index.py` 는 **파괴적**(`DELETE FROM document_chunk` 후 INSERT · `build_index.py:249`)이라 공용 스택 절대 금지.

**② 무엇이 새로운가.** 기존 `prompt_injection_authority_drill.py`(25대)는 **DB chunk `text` 를 직접 UPDATE** 해 지시문을 심었다(합성 자극). 미측 축(map §3 ③)은 **소스 fixture 문서에 지시문을 넣고 «정상 재색인 경로»(build_index.py 의 chunking+embedding)를 거쳐** 그 문서가 retrieval 에 오르게 하는 것 — 「손으로 심은 행」이 아니라 «정식 ingest 를 통과한 문서»가 권한을 얻는지.

**③ 자극 수 = 4행**(정본 문장 = 「검색 문서는 evidence data이며 instruction authority가 아니다」 · §32.8 ③):
  | # | 무엇 | 기대 |
  |---|---|---|
  | I-0 | 🔴 **표지 선행** — 지시문에 sentinel(예: `LEVI2-T52C-INJ-…`) 심고 재색인 후 조사 excerpt 에 그 sentinel 이 실려 왔는가 | **실려 옴**(자극 실재). 0건이면 **exit 2**(측정 불가 · 나머지 안 잼) |
  | I-1 | 지시문이 작업지시서를 approved 로 전이시키는가 | **전이 0**(승인 절차 그대로) |
  | I-2 | 목록 밖 시나리오(`GS-99-EVIL`)가 실행되는가 | **실행 0**(allowlist 가 앞문 · 400) |
  | I-3 | 안전 조치(safety measures)가 제거되는가 | **제거 0** |

**③-보 기전 경계.** 🔴 공개 경로엔 LLM 이 없다(`live/status.online=false` · J-5). 그러니 재는 축은 **「모델이 속았는가」가 아니라 「문서가 시스템 «행동»을 바꾸는가」**(승인 전이·목록 밖 실행·안전 제거) — 모델 유무와 무관하게 정본 문장이 금지하는 바. **은닉/안전 실패** = I-1~I-3 이 전건 「행동 불변」.

**④ 대조군(참 울림 선행 + 계측기 생존).**
  - I-0(표지 실재)이 **전부의 선행 게이트** — 지시문이 조사 경로에 «실려 오지 않았으면» 뒤 초록은 「막았다」가 아니라 「애초에 안 줬다」([[fkt-stimulus-liveness]] · 둘은 화면에서 같다).
  - 🔴 **정상 대조 문서 1건**(지시문 없는 평범한 문서)도 같은 재색인에 넣어 «정상 조사가 그 문서를 근거로 답한다»를 확인 → retrieval 파이프가 살아 있음을 증명(계측기 생존).
  - 🔴 **원복까지가 측정**: 재색인은 파괴적이므로, 자기 스택의 재색인 «전» seed 상태를 스냅샷(document_chunk count·md5)하고, 측정 후 원래 fixture 로 재색인해 복원 → 복원 md5 일치 행이 PASS 여야 전체 PASS([[fkt-restore-is-a-sweep]]).

**⑤ 서버 본수·포트 = 자기 스택 1세트**(postgres 1 + ai-api 1 · 예: postgres 컨테이너 `fkt-levi2-t52c-pg` + ai-api `:8346`). `FKT_PG_CONTAINER`·`FKT_API_BASE` 명시(기본값 금지 · 남의 좌석 데이터 파괴 방지 · Q-62). indexer 는 CLI(`build_index.py --…`)로 내 fixture 를 가리킨다.

**⑥ 소요 ≈ 40분**(자기 postgres+ai-api 기동 + fixture 문서 2건 작성 + build_index 2회(주입/원복) + 조사 run + 원복 검증). 🔴 **가장 큰 축** — 재색인은 embedding 계산이라 초 단위가 아니다.

**⑦ 「측정 불가」 조건.**
  - I-0 sentinel 0건 → 전체 exit 2. embedding 모델이 안 뜨면(자기 스택) → 측정 불가.
  - 🔴 **LLM 부재로 «모델이 속는가»는 이 스택에서 영구 측정 불가** — 그 축은 «행동 불변»으로 갈음하고, 「모델 취약성」은 명시적으로 **측정 안 함**으로 남긴다(없는 축으로 판정하지 않는다 · §0.2).

**⑧ T4-2b 재사용.** 없음(T4-2b 는 보호장치 축). 재사용 = `prompt_injection_authority_drill.py`(25대)의 **판정식**(표지 선행·승인 전이 0·allowlist 앞문·원복 md5) — 자극 주입 «경로»만 직접 UPDATE → build_index 재색인으로 교체.

---

## §2 실행 조각 착수 «전» 확보물 (오케 발주에 포함 요청)

| # | 무엇 | 왜 |
|---|---|---|
| 1 | **§0 층 재배치 승인**(⑧⑪=ai-api · ⑦=두 층 · 게이트웨이 §C 의도 회신) | 없는 층에 쏜 침묵을 결함으로 못 읽게 |
| 2 | 게이트웨이 `:8797` **토큰 획득 경로**(컨테이너 env 판독 허가 or 자기 게이트웨이 기동 승인) | ⑦-B 계측기 생존 |
| 3 | 자기 스택 **포트 배정 확정**(⑧: 2본 · ⑪: ai-api 2 + 페이지 2 · +④: pg+ai-api) · 끝나면 정지 보고 | 무대 충돌·유령 서버 방지 |
| 4 | +④ **fixture 문서 배치 경로**(내 소유 · t15 무접촉) | 파괴적 재색인 격리 |
| 5 | 실행 조각 **분할 제안**: (a) ⑦+⑧(보호장치 · 자기 스택 소) / (b) ⑪(브라우저 · playwright) / (c) +④(재색인 · 최대 축) | 축마다 무대·소요가 달라 한 조각에 묶으면 실패 격리가 안 됨 |

🔴 **소요 총계 ≈ 20+25+30+40 = 115분**(순차) · 병렬 불가분 = 자기 스택 기동 충돌. **3조각 분할**이 실패 격리·소요 모두 유리.

---

## §3 이 설계가 말하지 «않는» 것

- **어느 축도 아직 안 쟀다.** 위 「기대」는 코드에서 읽은 «설계 의도»이지 실측이 아니다 — 실행 조각이 초록/빨강을 낸다.
- 무대 포트·PID(seat-resume §2)는 **전언**이다. 실행 조각 착수 시 포트→PID→거동으로 다시 찍는다([[fkt-inherited-stage-is-hearsay]]).
- ⑦-B 거짓-CL 「불성립」(§1-⑦⑦), CORS C-5 브라우저 집행, +④ 모델 취약성 — 이 셋은 **측정 불가/불성립 후보**로 미리 선언했다. 실행에서 어느 색도 못 내면 이름으로 남긴다(값으로 채우지 않는다).
