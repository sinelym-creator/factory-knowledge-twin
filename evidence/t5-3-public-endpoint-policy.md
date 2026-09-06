# §34.3 public endpoint policy 드릴 — 실측 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 08:55 (`date` 실측)
- 드릴: `tests/security/public_endpoint_policy_drill.py` (rc=0 · **서버 불요**)
- 대상: 워크트리 `services/ai-api/app` (origin/develop) · **DB·컨테이너 무접촉**(FastAPI `app.routes` 만 import)

## 0. 정본을 손으로 적지 않는다

공개 예외 목록·분류 규칙·「가드가 닿는가」 판정은 전부 `app/session_guard.py` 실물에서 읽는다:
`GUARD_EXEMPT`·`READ_ONLY_EXCEPTIONS`·`FRAMEWORK_UNGUARDED`·`_mode`·`_guard_reaches`·
`route_keys`·`audit_guard_coverage`. 손 목록을 판정선에 넣으면 정본보다 낡는다(allowlist 는
여집합/정본으로 확증 · 리바이2 계보).

## 1. 라우트 전수 분류 (형상 `expose_api_docs=False` = 기본/공개 형상)

| 분류 | 계수 |
|---|---|
| 전수 라우트 | **24** |
| 세션 가드 뒤 | 19 |
| 명시 공개/예외 | 5 (exempt 3 · read-only 2 · framework 0) |
| **미분류** | **0** ← 판정선 |

**명시 공개/예외 5종**(실물 목록에서 읽음):

| mode | method | path | 사유(정본) |
|---|---|---|---|
| exempt | POST | `/api/sessions` | 세션을 만드는 자리 |
| exempt | GET | `/api/health` | 모니터·배포가 세션 없이 |
| exempt | GET | `/api/live/status` | 모드 배지·fallback |
| read-only | GET | `/api/evidence/{evidenceId}` | 딥링크 · 세션 스코프 자원 아님 |
| read-only | GET | `/api/documents/{docId}` | 딥링크 · 세션 스코프 자원 아님 |

framework(docs 표면 4종)은 이 형상에서 **0**(docs off = 기본) — `expected_framework_routes(app)`
가 앱 형상에서 읽으므로, 끈 형상에서 4종은 실재하지 않는 것이 정상.

**세션 가드 도달 확증**: `audit_guard_coverage(app)` = **PASS**(예외 목록 ↔ 실재 라우트 1:1 ·
가드가 닿지 못하는 라우트 0 · stale 0 · overlap 0). 「예외에 없으니 가드된다」는 추론이 아니라
`_guard_reaches` 로 라우트 의존 체인에 `session_guard` 가 실제로 매달렸는지 읽은 값이다.

## 2. 대조군 — 그물이 미분류를 무는가 (판정력)

가짜 «비가드» 라우트(`GET /api/__fake_open__` · Starlette Route 로 직접 주입 = 앱 레벨 의존
체인 밖, 실제 위험 형태) 를 **새 app 인스턴스**에 심었다:
- 미분류 **1건** · 가짜 검출 **True**
- `audit_guard_coverage` = **RAISED**(정상 · 그물이 물었다)

→ 미분류 0(§1)이 「검사가 늘 초록」이라서가 아니라, 그물이 실제로 구멍을 검출한다는 것을
같은 실행에서 확증. (본 판정은 무손 app 에서 · 대조군은 별 인스턴스에서 — 판정 오염 없음.)

## 3. 공개면 통로 대조

`apps/web-console/next.config.ts` rewrites source(/api*) = `['/api/ws/:path*']`(WS 만 명시 rewrite ·
그 밖 `/api/*` 는 셸의 라우트 핸들러가 프록시). 공개면에서 ai-api 에 닿는 `/api/*` 집합 중 명시
예외가 아닌 것 = 19건이고, §1 의 **미분류 0** 이 성립하므로 그 19건은 전부 세션 가드 뒤다 —
즉 **공개 도달 집합 ⊆ (가드 ∪ 명시 공개/예외)**.

## 4. 이 드릴이 안 보는 것 (이름으로)

- **런타임 미들웨어 순서**(CORS→rate limit→body limit) — 라우트 의존 체인만 본다. 순서 축은
  `main.py` 주석/별 드릴 소관.
- **합성 게이트웨이 `:8787` 라우트** — ai-api 앱 밖(별 프로세스). 이 드릴 범위 아님.
- **Vercel 셸 층 307**(루트 `/docs` 등) — 셸 rewrite/redirect 는 ai-api 라우트가 아니다
  (승격 23 외부 재검에서 별도 실측).

## 5. 판정

**PASS** — ai-api 전 라우트(24)가 «세션 가드 뒤»(19) 또는 «명시 공개/예외»(5)로 분류되고,
**미분류 0**(판정선 충족) · 대조군이 주입한 구멍을 검출(판정력 확증) · `audit_guard_coverage`
정본 검사 PASS. 서버·DB 무접촉.

🔴 범위: **ai-api 라우트 정책 분류 축**이다. §4 의 세 축(미들웨어 순서·게이트웨이·셸 307)은
이 창 밖 — 이름으로 남긴다.
