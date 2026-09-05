# 승격 23 외부 재검 — 공개면 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-5`
- 측정 창: 2026-09-06 07:55:27 ~ 07:58:07 (`date` 실측 · 로컬)
- 대상: 공개 도메인 `factory-knowledge-twin.vercel.app` — **GET 만** · `:8787` **무접촉**(요청 0)
- 기준선(발주 인용 · 전언): production 재생성 완료 07:53:38 · 첫 200 = 07:53:13 · main `2cd75f4` · promote rc 0 · promptSha `a71c93b148db`
- 판정 lane: `lane/levi2-promo23ext`

## 0. 귀속 — 「밖에서 쟀는가」 (공개 URL 을 친 사실은 증거가 아니다)

| 마커 | 값 | 뜻 |
|---|---|---|
| `remote_ip` | **64.29.17.67** (전 요청 동일) | Vercel 공개 엣지 · tailnet self 아님 |
| `Server` | `Vercel` | 엣지 통과 |
| `X-Vercel-Id` | `icn1::iad1::8r4ln-…` / `…g9c8z-…` | icn1 엣지 → iad1 리전 |
| `Tailscale-User-*` | **부재** | tailnet 경유 아님 |
| 제3자 vantage | `r.jina.ai` 경유 동일 값 | 내 회선 밖에서도 같은 것이 보인다 |

🔴 부재(Tailscale 헤더)는 그 자체로 색을 못 낸다 — 판정은 **양성 마커**(remote_ip·Server·X-Vercel-Id)가 낸다.

## 1. 축별 판정

### ① 외부 vantage `/api/health` — **PASS**

두 vantage · 같은 값(E1):

| 경로 | 시각 | build | postgres | neo4j | embedding |
|---|---|---|---|---|---|
| 직접 GET (엣지 64.29.17.67) | 07:55:27 | **`2cd75f4`** | ok (1ms) | ok (1ms) | ready |
| `r.jina.ai` 경유 | 07:56:02 | **`2cd75f4`** | ok (1ms) | ok (0ms) | ready |

`build == 2cd75f4` = 승격 23 대상 sha 와 일치. 리더 서비스가 문면을 접을 수 있으므로 **직접 GET 원문과 대조**했고 둘이 같다.

### ② 문서 표면 — **조건부 PASS** (판정선 정정 회부 동반)

같은 실행 · `07:55:51` / `07:57:14`:

| 경로 | 코드 | 최종 |
|---|---|---|
| `/docs` | **307** | `Location: /` → 200 (홈) |
| `/redoc` | **307** | `Location: /` → 200 (홈) |
| `/openapi.json` | **307** | `Location: /` → 200 (홈) |
| `/docs/oauth2-redirect` | **307** | `Location: /` → 200 (홈) |
| **`/api/docs`** | **404** | — |
| **`/api/redoc`** | **404** | — |
| **`/api/openapi.json`** | **404** | — |
| **`/api/docs/oauth2-redirect`** | **404** | — |
| 대조군 `/api/scenarios` | **401** | 같은 실행 · 서버는 살아서 라우팅 |
| 살아있음 확인 `/api/health` | 200 | 같은 통로가 정상 응답 |

**노출 축 판정**: 공개면에서 OpenAPI 스펙·Swagger·ReDoc UI **어느 것도 나오지 않는다**. baseline 공개 경계(§15.2·§16) 만족.

🔴 **발주 판정선 정정 회부** — 발주 축 ②는 루트 `/docs` 4종의 **404** 를 판정선으로 잡았으나, 실측은 **307→홈**이다.
그 이유가 판정의 핵심이다:

- 공개면에서 **ai-api 에 닿는 통로는 `/api/*` 하나**다(`apps/web-console/next.config.ts` — `beforeFiles` 는 `/api/ws/:path*` 뿐이고 `/api/*` 는 셸의 프록시 라우트가 받는다). 루트 `/docs` 는 **ai-api 에 도달하지 않는다**.
- 그러므로 루트 4종의 307 은 **셸/엣지 층**이 내는 값이고, D-87 처방(ai-api 문서 표면 차단)은 그 자극으로 **시험되지 않는다** — 자극이 방어보다 앞선 층에서 죽는 자리다.
- **처방이 사는 층에 놓은 자극 = `/api/docs` 4종 → 전건 404.** 이것이 D-87 의 공개면 종결선이고, 같은 실행의 `/api/scenarios` 401 + `/api/health` 200 이 「그 통로가 살아 있음」을 증명한다(전부 404 를 뱉는 문이 아니다).

**미규명 1건(이름으로 남긴다)**: 루트 4종의 307 을 **누가** 내는지 — `vercel.json` 에 redirects 없음 · `middleware.*` 부재 확인. 셸 층으로 좁혔을 뿐 코드 지점은 이 창에서 못 짚었다. **ai-api 는 아니다**(같은 build 가 무대 `:8020` 에서 404 · 오케 `:8010` 직접 실측도 404). 노출 축 판정에는 영향 없음.

### ③ 루트 화면 — **PASS**

`07:56:07` · `GET /` → **200** · `X-Matched-Path: /` · `Cache-Control: private, no-store` · HSTS `max-age=31536000; includeSubDomains` · CSP·`X-Content-Type-Options: nosniff`·`Referrer-Policy: no-referrer`·`Permissions-Policy` 부착 확인.

**Vercel production deployment sha = 못 쟀다.** 공개면 GET 만으로는 노출되지 않는다(HTML 에 `buildId` 미노출 · 응답 헤더에 deployment 식별자 없음 · `X-Vercel-Id` 는 **요청** id 이지 배포 sha 가 아니다). 「화면 변경 0 승격」이라는 발주 진술은 **전언**이므로 값으로 옮기지 않는다 — 필요하면 Vercel 대시보드/API 축으로 별건 측정.

### ④ 게이트웨이 `:8787` — **무접촉**

이 창에서 `:8787` 로 나간 요청 **0**. promptSha `a71c93b148db` 불변은 promote 출력값 **인용(전언)** 이고 내 실측이 아니다.

### ⑤ 前 열 — **인용**

재생성 «전» 공개면 `/docs` = **200**(49대 07:2x · 센쿠2 前 열 · 전언).
後 = **307→홈**(내 실측 07:55:51). 두 열이 갈렸으므로 승격이 공개면 문서 표면의 거동을 바꾼 것은 관측된다.
다만 前 열이 `/docs` **루트** 축이므로, 이 대조는 「루트 축이 200 에서 307 로 바뀌었다」까지만 말한다 —
`/api/docs` 축의 前 값은 이 창에 없다(재현 불가 · 구 배포 교체됨).

## 2. 결론

**외부 재검 PASS** — 공개면에서 문서 표면 노출 **0** · build `2cd75f4` 확인 · 의존 2종 ok · 루트 200 · `:8787` 무접촉.

동반 사항 3건:
1. 발주 판정선 정정 — D-87 공개면 종결선은 `/api/docs` 4종(404)이다. 루트 `/docs`(307)는 ai-api 에 닿지 않아 그 처방을 시험하지 못한다.
2. 미규명 — 루트 4종 307 의 발신 지점(셸 층으로 좁힘 · 코드 지점 미확인).
3. 못 잰 축 — Vercel production deployment sha(공개면 GET 으로 미노출).

🔴 이 초록의 범위: **공개면 GET 표면**이다. 내부 `:8010` 컨테이너 축·`:8787`·화면 상호작용은 이 창에서 재지 않았다.
