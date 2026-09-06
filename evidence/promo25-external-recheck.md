# 승격 25 외부 재검 — 공개면(production)

- **대상**: main `99d3cab`(#895 MERGED 15:58:48) · production ai-api 재생성 07:03:47Z(센쿠2 53대) · 검증 좌석 리바이2 57대
- **창**: 2026-09-06 16:05:57 ~ 16:08:20 KST(`date` 실측) · **구독 0** · 배포·변경 행위 0(전부 GET)
- **측정 모델**: 대상 = 공개 엔드포인트 응답 status·본문·헤더(E1) · Vercel 배포 메타(E1 · API) · 코드 트리 grep(E1) · 옆 좌석 값은 E2 로 표기.
- **이해 상충**: 없음 — 이 배포 내용(#891 계약 스키마 포함)에 내 산출물이 들어 있으나, 여기서 재는 것은 **배포 표면**이지 그 내용의 옳음이 아니다.

## 0. 판정 요약

| 축 | 값 | 판정 |
|---|---|---|
| 밖 착지(양성 마커) | Vercel 엣지 3종 + 제3자 vantage | **PASS** |
| `/api/health build` 두 vantage | `99d3cab` / `99d3cab` | **PASS** |
| 문 생존(무차별 404 아님) | `/api/scenarios` 401 | **PASS** |
| D-87 공개면 4종 | 전건 404 | **PASS** |
| 공개 화면 SSR | 200 · 18827B · 제목 정상 | **PASS** |
| Vercel deployment 불변 | 🔴 **기대 거짓 — 새 production 배포 실재** | **회부** |
| `:8787 promptSha256` | 접근 권한 없음 | **미측** |

## 1. 밖에서 봤는가 — 착지 마커가 화면보다 먼저

「공개 URL 을 쳤다」는 증거가 아니다(tailnet self 로 붙어도 같은 200 이 난다). **양성 마커**로 판정한다.

| 마커 | 값 | 뜻 |
|---|---|---|
| `Server` | `Vercel` | 엣지 통과 |
| `X-Vercel-Id` | `icn1::iad1::qn9js-1788678357978-…` | 공개 엣지(icn1 진입 · iad1 처리) |
| `X-Matched-Path` | `/api/[...path]` | Vercel 라우팅이 실제로 물었다 |
| 제3자 vantage | `r.jina.ai` 경유 **같은 build** | 내 회선 밖 경로에서도 같은 것이 보인다 |

🔴 **발주문·선례가 든 `remote_ip` 마커는 이 빌드에 없다.** 트리 전수 grep = **0건**(`services/` 0 · `apps/` 0 · `remoteIp` 0). 교정으로 같은 매처가 `build` 8파일 · `health` 11파일을 무는 것을 확인했으므로 「훑은 0」이 아니다. 55대 문서(`promo23-external-recheck.md`)의 `remote_ip 64.29.17.67` 은 **재현할 수 없어 인용하지 않는다** — 전대의 값은 전언이다.

## 2. `/api/health` — 두 vantage

| vantage | 시각 | `build` | postgres | neo4j | embedding |
|---|---|---|---|---|---|
| 직접 회선 | 16:05:57 | **`99d3cab`** | ok(1ms) | ok(1ms) | ready |
| `r.jina.ai` 경유 | 16:06:00 | **`99d3cab`** | ok(1ms) | ok(1ms) | ready |

발주 기대 `99d3cab` 과 일치. 워밍업 문면 = `intfloat/multilingual-e5-small · warm-up 11.3s`.

## 3. D-87 공개면 — 갈래를 열로 나눈다

같은 404 라도 「처방이 막았다」·「엣지가 못 찾았다」·「앱이 죽었다」가 같은 숫자로 온다. 그래서 **같은 실행에** 주어를 정하는 열을 함께 둔다.

| 열 | 자극 | 결과 | 이 열이 정하는 것 |
|---|---|---|---|
| 1 | `/api/health` | **200** + build | ai-api 까지 **도달**한다(404 가 「앱 죽음」이 아님) |
| 2 | `/api/scenarios` | **401** `{"error":{"code":"session_required"}}` | 문이 살아 있다 — **전부 404 를 뱉는 문이 아니다** |
| 3 | `/api/docs` | **404** `http_404` | ← **D-87 종결선** |
| 3 | `/api/redoc` | **404** `http_404` | |
| 3 | `/api/openapi.json` | **404** `http_404` | |
| 3 | `/api/docs/oauth2-redirect` | **404** `http_404` | |
| 4 | 루트 `/docs`·`/redoc`·`/openapi.json`·`/docs/oauth2-redirect` | **307**(→ 홈) | **처방을 시험하지 «않는» 자극** — 셸 층에서 죽어 ai-api 에 안 닿는다(55대 판정선 정정 재확인) |
| 5 | `/api/levi2-not-a-route` | **404** `http_404` | 「없는 경로」의 404 기준선 모양 = 열 3 과 같다 |

🔴 열 5 가 말하는 것: 열 3 의 404 는 **「그 라우트가 없다」와 구별되지 않는다** — 그리고 그것이 정확히 D-87 처방의 형상이다(`docs_url`/`redoc_url`/`openapi_url` 을 `None` 으로 두어 **라우트를 애초에 달지 않는다**). 즉 이 404 는 「막았다」가 아니라 「없다」이고, 그게 옳다.

## 4. 공개 화면 — SSR 원문과 리더 출력을 갈라 읽는다

| 축 | 값 |
|---|---|
| 직접 SSR | **200** · `text/html` · **18827 B** · `<title>Factory Knowledge Twin — AI Operations Console</title>` · `X-Powered-By: Next.js` · `X-Matched-Path: /` |
| `r.jina.ai` | **546 B** · 제목 동일 · 본문 = 투어 안내 문면 |

| 문자열 | SSR | 리더 |
|---|---|---|
| `Factory Knowledge Twin` | 2 | 1 |
| `AI Operations Console` | 2 | 1 |
| `session-chip`(testid) | 2 | **0** |
| 교정(양쪽에 없어야 할 문자열) | 0 | 0 |

🔴 **리더 서비스는 문면을 접는다** — `session-chip` 은 SSR 원문에 있고 리더 출력에 없다. 그러므로 **r.jina.ai 에서 「안 보인다」는 부재의 근거가 될 수 없다**. 리더는 「밖에서 닿는가」만 답하고, 문면 판정은 SSR 원문이 한다.

## 5. 🔴 회부 — 발주 기대 「Vercel deployment 불변」이 거짓이다

발주문은 「Vercel 재배포 없음 확인(웹 콘솔 변경 0 = 기대 deployment 불변)」이었다. **실측은 반대다.**

| deployment | target | commit | state | 생성(KST) |
|---|---|---|---|---|
| `dpl_CAtmbzxXgbHNBUVTTgmtYeSFn7eC` | **production** | **`99d3cab`**(#895) | READY | **2026-09-06 15:58:49** |
| `dpl_7JWrgW2Tph1zK2UZiFW8SQdXziK8` | preview | `709e071`(`promote/25`) | READY | 2026-09-06 15:56:25 |
| `dpl_7e8qHMmPzuEKe6UnZuoEd4mMSYqn` | production | `5f17b54`(승격 24) | READY | 2026-09-06 09:39:49 |

- 새 production 배포가 **#895 병합(15:58:48) 1초 뒤**에 생성됐다. Vercel 프로젝트가 GitHub 저장소에 연동돼 있고 production 대상이 `main` 이므로, **main 병합은 그 자체로 웹 콘솔 배포다**.
- 이것이 결함인지 **발주 기대의 오기**인지는 오케 판정 사안이다. 다만 다음 승격부터 「웹 콘솔 변경 0 = deployment 불변」이라는 문장은 **성립하지 않는다**(변경 0 이어도 배포는 새로 난다).
- 함의: 화면 축 회귀를 잰다면 **「같은 배포」가 아니라 「새 배포」 위에서 재는 것**임을 전제로 해야 한다.

## 6. 미측 — 이름으로 남긴다

- **`:8787 /health promptSha256`** — 접근 권한 없음. 실측한 것은 **401 + `X-FKT-Gateway-Token 가 없거나 맞지 않는다`** 뿐이다(엔드포인트 생존은 증명 · 값은 못 얻음). 내 좌석 env 에 토큰 없음(전체 키 99 중 `FKT_*` 0 · 교정 = 같은 매처가 `PATH` 1건). **오케 결정(16:01)으로 「미측 · 접근 권한 없음」 확정** · promptSha 근거는 오케의 `promote-artifacts.ps1` 출력(E1)이 대신한다.
- **재생성 공백 시간** — 센쿠2 측정(0.36s · **E2**). 내가 안 쟀다.
- **브라우저 렌더·조작 축** — 이 발주 범위 밖.
- **`/api/docs` 축의 前 값** — 구 배포가 이미 교체돼 재현 불가(55대와 같은 한계).

## 7. 내 계측기 자수 1

트리 grep 교정에서 패턴을 `\"build\"` 로 이스케이프해 **매처를 죽였고 0 을 냈다**. 그 0 을 그대로 썼다면 「`build` 도 없다」는 헛소리가 판정문에 들어갔을 것이다. 이스케이프 없이 재실행해 `build` 8 · `health` 11 을 확인한 **뒤에야** `remote_ip` 0 을 판정값으로 썼다. 교정 칸이 없었으면 못 잡았다.
