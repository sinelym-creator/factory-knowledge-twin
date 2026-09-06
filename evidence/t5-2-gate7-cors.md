# Gate 7 ⑪ CORS — 서버 축 실측 (검증 좌석 · 리바이2 55대 · 조각 b)

- 측정 모델: `claude-opus-5`
- 측정 창: 2026-09-06 08:01:40 ~ 08:03:45 (`date` 실측)
- 무대: develop `:8020`(읽기 GET/OPTIONS 만) + **내 컨테이너 `:8850`**(손잡이 1개만 다름)
- production `:8010`·공개 도메인 **무접촉**

## 0. 「측정 불가」였던 사유를 닫는다 (발주 축 ⑤)

`services/ai-api/app/main.py:174` —

```python
allowlist = settings.cors_allowlist
if allowlist:
    app.add_middleware(CORSMiddleware, allow_origins=allowlist, allow_credentials=True,
                       allow_methods=["GET", "POST", "PATCH", "OPTIONS"], allow_headers=["content-type"])
```

`settings.cors_origins` 기본값은 `""`(`settings.py:55`)이고, 목록이 비면 **미들웨어를 아예 달지 않는다**
(설계 성문: 「열려 있는데 비어 있는 문」을 만들지 않는다).

**무대 `fkt-dev-ai-api` 의 env 에 `FKT_CORS_ORIGINS` 는 없다**(`docker inspect .Config.Env` grep = 0건).
즉 무대에는 **CORS 문 자체가 없다** — 방어가 부재한 층에 쏜 자극은 어떤 색도 내지 못한다.
그것이 ⑪이 「측정 불가」였던 사유이고, **대상 결함이 아니라 무대 조건**이다.

그래서 축을 값으로 만들려면 **allowlist 를 켠 열**이 필요하다 — 손잡이 하나만 바꿔 세웠다.

## 1. 두 열 — 손잡이는 `FKT_CORS_ORIGINS` 하나

| | 열 A (무대) | 열 B (내 컨테이너) |
|---|---|---|
| 주소 | `127.0.0.1:8020` | `127.0.0.1:8850` |
| 이미지 | `fkt-ai-api:dev-dd1a2e1` | **`fkt-ai-api:dev-dd1a2e1`**(동일) |
| `FKT_CORS_ORIGINS` | **미설정** | `https://factory-knowledge-twin.vercel.app` |
| health | 200 · build `dd1a2e1` · pg ok · neo4j ok | 200 |

🔴 귀속: 두 열의 **이미지가 같다**(`docker inspect .Config.Image` 실측). 따라서 아래 차이의 원인은
코드가 아니라 그 손잡이 하나다. (열 B 의 `/api/health.build` 는 `unknown` — 그 라벨은 배포 스크립트가
주입하는 값이라 `docker run` 직접 기동에는 없다. 귀속은 자기 신고가 아니라 **이미지 동일성**으로 세운다.)

## 2. 축별 실측

### ① 허용 origin 반영 — **PASS** (열 B · 08:03:17)

`GET /api/health` + `Origin: https://factory-knowledge-twin.vercel.app`

```
HTTP/1.1 200 OK
access-control-allow-origin: https://factory-knowledge-twin.vercel.app
access-control-allow-credentials: true
vary: Origin
```

`vary: Origin` 이 함께 나온다 — 캐시가 origin 별로 갈린다(반영이 「고정 값」이 아니라 검사 결과다).

### ② 대조군 — **PASS** (같은 실행 · 같은 서버)

`Origin: https://evil.example` → `HTTP/1.1 200` · **`access-control-allow-origin` 부재**.
브라우저는 ACAO 없는 응답을 스크립트에 넘기지 않는다.

관측 그대로 기록: 이 응답에도 `access-control-allow-credentials: true` 는 남는다(Starlette
`CORSMiddleware` 가 simple response 에 preset 헤더를 붙이고 ACAO 만 origin 검사 결과로 더하는 거동).
**ACAO 가 없으면 ACAC 단독은 브라우저에게 무의미**하므로 노출 축 결론은 바뀌지 않는다 — 다만
「헤더가 하나 보인다」를 「문이 열렸다」로 읽지 않기 위해 적어 둔다.

### ③ preflight — **PASS** (열 B · 08:03:41 · 3갈래)

| 자극 | 코드 | ACAO | 본문 |
|---|---|---|---|
| `OPTIONS /api/scenarios` · allowed origin · `ACRM: POST` | **200** | 반영됨 | — |
| 같은 origin · `ACRM: DELETE` | **400** | 반영됨 | `Disallowed CORS method` |
| `Origin: evil` · `ACRM: POST` | **400** | **부재** | `Disallowed CORS origin` |

허용 200 응답의 계약값:

```
access-control-allow-methods: GET, POST, PATCH, OPTIONS
access-control-allow-headers: Accept, Accept-Language, Content-Language, Content-Type, content-type
access-control-max-age: 600
```

코드 선언(`allow_methods=["GET","POST","PATCH","OPTIONS"]` · `allow_headers=["content-type"]`)과 일치.
`Accept`·`Accept-Language`·`Content-Language`·`Content-Type` 은 Starlette 이 더하는 safelisted 기본이다.

🔴 **문을 양면으로 시험했다** — 통과 표본 1(200) + 막힘 표본 2(메서드·origin). 막힘만 봤다면
「전부 거절하는 문」도 같은 초록을 냈을 것이다.

### ④ 자격증명 축 — 값 기록

`access-control-allow-credentials: true`(허용 열 · preflight·simple 양쪽).
코드 주석대로 **allowlist 와 짝**이다 — 와일드카드(`*`)는 `settings.py:149` 가 목록에서 걸러내므로
「`*` + credentials」 조합은 구조적으로 생기지 않는다.

### ⑤ 열 A 대조 — CORS 문 부재의 «모양»

| 자극 | 열 A (`:8020`) |
|---|---|
| simple GET · allowed origin | 200 · **CORS 헤더 전부 부재** |
| simple GET · evil origin | 200 · **CORS 헤더 전부 부재** |
| `OPTIONS /api/scenarios` · allowed origin | **405 Method Not Allowed** · `allow: GET` |

405 가 「문이 없다」의 서명이다 — CORSMiddleware 가 없으니 OPTIONS 가 라우터까지 가서 거절된다.
열 A 의 두 origin 이 **구별되지 않는다**는 것이 「이 열로는 ①을 못 잰다」의 값이다.

## 3. 판정

**⑪ CORS = 서버 축 PASS** — allowlist 가 있는 형상에서 문은 목록대로 열리고(①·③·④),
목록 밖은 origin·메서드 두 갈래로 막힌다(②·③). 무대 기본값이 「문 없음」인 것은 **설계대로**다.

🔴 **이 초록의 범위**:
- **서버 헤더 계약 축**이다. **브라우저 강제 축**(실제로 차단되는가 · `tests/web/t41_cors_browser_drill.mjs`)은
  맨 페이지 서버 2본이 필요해 이 창에서 **안 쟀다** — 「측정 불가」에서 옮긴 것은 서버 축뿐이다.
- **공개 형상의 실효 여부**는 별개다. 셸이 `/api/*` 를 프록시하므로 브라우저에겐 same-origin 이고
  (`next.config.ts` 주석 성문), production env 의 `FKT_CORS_ORIGINS` 실물은 `:8010` 무접촉이라 못 봤다.
  → 그 축은 이름으로 남긴다.

## 4. 정리

내 컨테이너 `fkt-levi2-g7cors`(`:8850`)는 측정 종료 후 정지·제거한다(보고에 실측값 첨부).
무대 `:8020` 은 GET/OPTIONS 읽기만 했다 — 상태 변경 0.
