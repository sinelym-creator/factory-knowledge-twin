# Gate 7 ⑪ CORS — 브라우저 강제 축 (검증 좌석 · 리바이2 55대 · 마지막 이름 잔여)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 09:15~09:18 (`date` 실측)
- 무대: 내 스택 — ai-api 컨테이너 `127.0.0.1:8854`(`fkt-ai-api:dev-dd1a2e1` · `FKT_CORS_ORIGINS=http://127.0.0.1:8066`)
  + 맨 페이지 서버 2본(origin A `:8066` = allowlist · origin B `:8068` = 대조군) · playwright 1.62.1 chromium
- **구독 0** · develop `:8020`·production 무접촉
- 드릴: `tests/web/t41_cors_browser_drill.mjs`(rc 0) · **서버 헤더가 아니라 «브라우저가 집행하는가»를 잰다**

## 0. 이 축이 왜 마지막까지 남았나

⑪ CORS 서버 축(헤더 계약)은 55대가 이미 PASS(내 컨테이너·무대 O-47). 그러나 **헤더가 있다 ≠
브라우저가 그걸로 막는다** — curl 은 헤더를 보여 줄 뿐 읽기 금지를 «집행»하지 않는다. 집행자는
브라우저다(「닿는다 ≠ 읽힌다」). 그 축을 playwright chromium 으로 실측한다.

## 1. 무대 (한 변수 = origin)

- 페이지 서버 = CSP 없는 «맨» 페이지 2본(`_origin_page_server.mjs`). 🔴 셸(CSP `connect-src 'self'`)에서
  재면 CORS 이전에 CSP 가 막아 무엇이 막았는지 못 가른다 — 그래서 CSP 없는 두 origin 만 세운다.
- ai-api `FKT_CORS_ORIGINS = http://127.0.0.1:8066`(origin A 만 허용) · origin B(8068)는 대조군.
- 두 페이지의 유일한 차이 = origin. 대상 코드·API 는 하나다.

## 2. 축별 실측 (같은 실행)

### ①② 단순 GET — 읽힘 집행

| origin | 결과 |
|---|---|
| A(허용) `GET /api/health` credentials:include | **읽혔다** status 200 · 본문 264자 |
| B(비허용) 같은 fetch | **못 읽었다** `TypeError: Failed to fetch` |

허용 origin 은 응답을 스크립트가 읽고, 비허용 origin 은 브라우저가 읽기를 막았다(헤더가 아니라
브라우저의 집행).

### ③ preflight 게이트 — 비단순요청 거동 차분

비단순요청(`content-type: application/json` fetch)은 브라우저가 preflight(OPTIONS)를 먼저 보낸다.
method 를 손잡이로 둬 preflight 가 «게이트»함을 거동으로 증명한다(OPTIONS 를 눈으로 안 봐도):

| origin | method | 결과 | preflight 판정 |
|---|---|---|---|
| A(허용) | POST | **통과** 200 | preflight 200 → 실제 요청 진행 |
| B(비허용) | POST | **차단** `Failed to fetch` | preflight 400(origin) → 실제 요청 안 감 |
| A(허용) | DELETE | **차단** `Failed to fetch` | preflight 400(method) → 허용 origin 이라도 막힘 |

🔴 **허용 origin 에서 POST 는 통과하는데 DELETE 는 차단**(origin 같음 · method 만 다름) — 이 차분이
preflight 가 실제로 게이트한다는 거동 증거다.

### preflight OPTIONS 실계수 — 서버 접근 로그(정본)

playwright `page.on('request')` 로 센 OPTIONS = **0** 였다 — 🔴 **이는 대상 사실이 아니라 계측기
한계다**(playwright 는 CORS preflight OPTIONS 를 request 이벤트로 노출하지 않는다 · 55대 실측·자수).
정본 = ai-api(uvicorn) 접근 로그. 이 실행분(client port 43762) 3건:

```
OPTIONS /api/sessions HTTP/1.1  200 OK          ← A(허용)+POST
OPTIONS /api/sessions HTTP/1.1  400 Bad Request ← B(비허용)+POST (Disallowed origin)
OPTIONS /api/sessions HTTP/1.1  400 Bad Request ← A(허용)+DELETE (Disallowed method)
```

→ 브라우저는 비단순요청 3건 전부에 preflight 를 실제로 발신했고, 서버는 origin·method 로
각각 200/400 을 냈다. 드릴 판정(거동 차분)과 서버 로그(발신 실계수)가 같은 사실을 두 각도로 확증.

## 3. 판정

**⑪ 브라우저 강제 축 PASS** — 브라우저가 CORS 를 집행한다: 허용 origin 은 읽/통과, 비허용 origin 은
차단, preflight 가 origin·method 를 게이트(허용 POST 통과 vs 허용 DELETE 차단). 서버 로그가
preflight 실발신 3건을 확증. Gate 7 ⑪의 **마지막 이름 잔여가 값으로 닫혔다** — 서버 헤더 축(55대·
O-47) + 브라우저 강제 축(이 창) 둘 다 PASS.

🔴 계측기 자수 1건: playwright request 이벤트는 preflight 를 미노출(0) — 서버 로그로 정정해 3건
확정. 「0 을 대상 사실로 적지 않는다」.

## 4. 정리

- 내 컨테이너 `fkt-levi2-corsb`(:8854) 제거(무응답 실측) · 페이지 서버 2본(8066·8068) 정지(리스너 부재).
- `@playwright/test`(1.62.1)는 `tests/web/package.json` 에 이미 선언된 dep 을 설치(node_modules 는
  gitignore · 커밋 0) · chromium 은 로컬 캐시 재사용(다운로드 0).
- 무대·production 무접촉 · 구독 0.
