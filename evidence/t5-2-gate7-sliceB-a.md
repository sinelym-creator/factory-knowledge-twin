# T5-2c 조각 (a) — Gate 7 ⑦ oversized · ⑧ rate limit 독립 검증

> 검증 좌석 리바이2 **54대** · 발주 = 스자쿠 49대(T5-2c 조각 a) · lane `lane/levi2-t52d` @ 기점 `origin/develop` **`638796d`** ·
> 정본 = 계약 `packages/contracts/rest-api-v0.1.md` v0.1.9(`:143` 429 · `:144` 413) + 코드 `services/ai-api/app/protection.py`·`settings.py`·`services/synthesis-gateway/gateway.py`(E1 실독) ·
> 설계 = `evidence/t5-2-gate7-sliceB-design.md`(#825) · 측정 2026-09-06 07:0x KST(`date` 실측 병기 아래) · 근거 **E1**(전건 실측).
>
> **판정 = ⑦(oversized) PASS · ⑧(rate limit) PASS · 대상 결함 신규 회부 0건.** ⑦-B 게이트웨이 거짓-CL 1행은 «불성립»(설계 예고대로 · 계수 밖).

---

## §0 계측기 — 내 것부터 (자수)

| # | 무엇이 거짓말했나 | 어떻게 드러났나 | 교정 |
|---|---|---|---|
| 1 | 첫 무대 계획 = 발주문의 「⑦-A = develop `:8020`」 | 드릴이 `_colocation.require(BASE)` 로 «BASE 가 내 트리를 읽는가»를 fixture 자극으로 묻는다 — develop `:8020` 을 쓰면 **develop-stage 의 fixture 를 흔드는 쓰기**가 된다(공유 무대 침범) | 같은 이미지(`fkt-ai-api:dev-947f63d`)로 **내 컨테이너**를 띄우고 내 fixture 를 바인드 → 코드 동일 + 귀속 증명 |
| 2 | 게이트웨이 O-5(상한 안·유효 토큰)를 «정상 JSON»으로 보낼 뻔했다 | 그러면 크기 게이트 통과 후 `synthesize` 가 claude CLI 를 불러 **구독을 태운다** | 깨진 JSON 으로 크기·토큰 게이트 «직후» 400 에서 멈춤 + 게이트웨이를 `SYNTHESIS_CLI_BIN=<없는 이름>` 으로 기동(이중 차단) |
| 3 | probe 출력이 cp949 에서 죽었다(401 본문의 em dash) | `UnicodeEncodeError: 'cp949'` — 대상 응답이 아니라 내 print 가 깨졌다 | 모든 probe `PYTHONIOENCODING=utf-8` |

🔴 **셋 다 대상의 것이 아니다.** 1 은 «귀속을 어디서 증명하나», 2 는 «구독 안전», 3 은 «내 콘솔 인코딩»이다.

---

## §1 측정 조건 — 🔴 귀속·손잡이를 먼저 세웠다

**무대(전건 자기 스택 · 이미지 `fkt-ai-api:dev-947f63d` = develop `:8020` 과 «코드 동일»):**

| 컨테이너 | 포트 | 바꾼 손잡이 «하나» | 역할 |
|---|---|---|---|
| `fkt-levi2-t52d-base` | `:8850` | (기본값 · 64KB · IP 6000 · session 300) | ⑦-A 413 경계 · colocation |
| `fkt-levi2-t52d-sess` | `:8851` | `FKT_RATE_LIMIT_SESSION_PER_MIN=3`(IP 6000 유지) | ⑧ 세션 축 «혼자» |
| `fkt-levi2-t52d-ip` | `:8852` | `FKT_RATE_LIMIT_IP_PER_MIN=5`(session 300 유지) | ⑧ IP 축 «혼자» |
| gateway(`gateway.py` 직접) | `:8853` | 내 토큰 · `SYNTHESIS_CLI_BIN=<없는 이름>` | ⑦-B 게이트웨이 413 |

- DB = 내 levi2 스택(`host.docker.internal:5534` postgres · `:7587` neo4j) · health 200 · postgres/neo4j `state:ok` 실측.
- **귀속 증명(colocation)**: 내 fixture(`data/replay/gs-01.events.jsonl`)에 표지를 심었다 되돌리니 `:8850` 재생본에 그 표지가 나왔다 → **`:8850` 은 이 트리를 읽는다**(md5 원복 확인). session_store 는 **in-memory**(`session_store.py:74`)라 세션은 DB 무관.
- 🔴 **코드 동일 = 거동 동일.** 세 컨테이너와 develop `:8020` 은 같은 이미지다 — 413/429 미들웨어(`protection.py`)는 바이트 동일. 내 컨테이너에서 잰 값은 develop `:8020` 의 것과 같고, «귀속»은 내 트리에서 증명됐다([[fkt-code-same-is-not-attribution]] 를 만족시킨 자리).

**손잡이 정본(E1 · `settings.py`):** `max_body_bytes=65536`(:108) · `rate_limit_ip_per_min=6000`(:98) · `rate_limit_session_per_min=300`(:99) · `rate_limit_retry_after_sec=60`(:100) · `trust_forwarded_for=False`(:104) · 게이트웨이 `MAX_BODY_BYTES=1MiB`(`gateway.py:125`).

---

## §2 ⑧ 반복 요청 · rate limit (계약 `:143`) — **PASS**

그물 = `tests/api/t42b_limits_drill.py`(16대 · 재실측) · `FKT_T42B_SESSION_BASE=:8851` `FKT_T42B_IP_BASE=:8852` · 자기검증(429·정수 Retry-After 판정자) 선행 PASS.

| 행 | 무엇 | 실측 |
|---|---|---|
| R-01 | 🔴 세는 눈 — 429 «전»에 통과가 있다(세션 축) | 통과 **3** → 429 **3**(손잡이 3 확인) |
| R-02 | 초과가 `429 rate_limited` | 코드 `rate_limited` |
| R-03 | `Retry-After` 가 «정수 초» | `60` |
| R-04 | 초과는 «즉시»(서버 대기 0) | 429 응답 최대 **28ms** |
| R-05 | 🔴 축 «분리» — 다른 세션은 따로 센다 | 새 세션 첫 요청 **200**(같은 IP·같은 서버) |
| R-06·07 | IP 축이 «혼자» 운다(무쿠키) | 통과 **5** → 429 **3** · `rate_limited` · RA `60`(손잡이 5 확인) |
| R-08 | **제외 4종** | `/api/health` 200 · `/api/live/status` 200 · `OPTIONS` 405 · WS 핸드셰이크 404 — 전건 **429 아님** |
| R-09 | XFF 기본 미신뢰 | 헤더 없음 **429** · XFF 위조 **429**(갈리지 않음 = 헤더 안 믿음) |

🔴 **대조군이 자극을 갈랐다.** 세션 축(통과3·429 3)과 IP 축(통과5·429 3)이 **손잡이 값 그대로** 갈렸다 — 한 서버에서 값만 바꿨으면 무엇이 그 색을 냈는지 못 가른다([[fkt-one-handle-column]]). 제외 4종은 **같은 서버에서 429 를 먼저 받아 낸 뒤** 쟀다(부정 판정식 앞에 세는 눈).
🔴 **R-09 조건 병기**: 내 컨테이너는 배포 Dockerfile CMD(`--no-proxy-headers`)로 뜬다 — D-8(러너 XFF 선점 · 16대 §6)이 여기서 안 걸리는 조건이다. 컨테이너 기본 기동에서 XFF 미신뢰가 참이다(D-8 은 `9ea7bb5` 에서 종결 · 재litigate 아님).

---

## §3 ⑦ oversized request — **PASS**(두 층 각각)

### ⑦-A ai-api `:8020`(공개 표면 · 64KB · stream+CL) — 그물 `t42b_limits_drill.py` B-01~03 · `FKT_API_BASE=:8850`

| 행 | 무엇 | 실측 |
|---|---|---|
| B-01 | 🔴 세는 눈 — 상한 «안»은 413 이 아니다 | 65,388B → **422 invalid_request**(413 아님 · 크기 게이트 통과 후 스키마에서 걸림) |
| B-02 | 상한 «밖» = `413 payload_too_large` | 66,588B → **413 payload_too_large** |
| B-03 | 🔴 chunked(무 Content-Length)도 막는다 | → **413 payload_too_large**(스트림 실측이 잡는다) |

### ⑦-B 게이트웨이 `:8797`(내부 릴레이 · 1MiB · CL-only · token+loopback) — 그물 🆕 `tests/security/gate7_oversized_gateway.py` · `:8853`

| 행 | 무엇 | 실측 |
|---|---|---|
| GW-00 | 🔴 계측기 생존 — 토큰 게이트 양면 | 무토큰 **401** · 오토큰 **401** · 유효 **200**(문이 닫히고 내 것엔 열린다) |
| O-5 | 대조군 — 상한 «안»(유효 토큰)은 413 아님 | 53B → **400**(413/401 아님 = 크기·토큰 게이트 통과 · 합성 미도달 · 구독 0) |
| O-6 | 상한 «밖» = 413(CL 선검사 · 본문 미판독) | 1,052,672B → **413** · `rejectedReason` 있음 |
| O-4gw | 🔴 거짓 축소 CL — **불성립** | 선언 20B · 전송 8,192B → **400**(게이트웨이는 declared 만 읽는다) · **전체 정상처리 = 아니오** |

🔴 **O-4gw 는 «불성립»이다(설계 예고대로 · 계수 밖).** 게이트웨이는 `body = self.rfile.read(length)`(`gateway.py:551`)로 **선언한 바이트만** 읽는다 — ai-api 의 스트림 실측이 없다. 그래서 거짓으로 작게 선언한 CL 은 **413 도(20 ≤ 1MiB) 우회도(전체 8KB 를 정상 본문으로 처리 안 함)** 아닌 제3의 거동(잘린 20B 를 JSON 으로 못 읽어 400)이다. 방어의 «부재»를 재는 자리라 색을 내지 않았다([[fkt-guard-needs-both-sides]] · 없는 문은 시험되지 않는다).
🔴 **다만 «우회»는 아니다** — 만약 전체를 정상 처리했다면 그건 진짜 상한 우회라 빨강으로 올렸을 것이다(그물에 그 갈래를 심어 뒀다). 위협 모델 = loopback + 토큰 내부 릴레이라 ai-api 공개 표면과 등급이 다르다. **대상 결함 아님 · 회부 0.**

---

## §4 계수 · map 반영

| 항 | 조각 a 前(map §2) | 조각 a 後 | 근거 |
|---|---|---|---|
| ⑦ oversized | 🔴 측정 불가 | **PASS**(두 층) | §3 |
| ⑧ rate limit | 🔴 측정 불가 | **PASS** | §2 |

🔴 **측정 불가 3(⑦⑧⑪) → 1(⑪).** ⑪ CORS 는 조각 (b) 로 남는다(브라우저 축). ⑤ D-87(FAIL)·⑨(부분)·재색인 주입(미측)은 **무변** — 이 조각이 건드리지 않았다. `evidence/t5-2-gate7-map.md` §1 ⑦⑧ 행·§2 계수 갱신.

---

## §5 이 판정이 말하지 «않는» 것 · 무대 처분

- ⑦-A/⑧ 은 **develop `:8020` 이 아니라 코드 동일 자기 컨테이너**에서 쟀다 — 귀속은 내 트리에서 증명됐고, develop `:8020` 은 같은 이미지라 거동이 같다(§1). develop `:8020` 자체를 «직접» 잰 값은 아니다(그럴 필요가 colocation 앞에서 사라졌다).
- O-4gw 「불성립」은 게이트웨이에 스트림 방어가 «없다»는 코드 사실(E1)의 거동 확인이지, 결함이 아니다.
- **정지 보고**: 이 조각의 무대 4본(`fkt-levi2-t52d-base`·`-sess`·`-ip` 컨테이너 3 + gateway `:8853` 프로세스 1)은 보고 뒤 정지한다(오케 승인 시). 내 levi2 postgres/neo4j(5534/7587)·develop 무대·t76 **무접촉**.
