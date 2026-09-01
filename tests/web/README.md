# tests/web — 셸(web-console) 검증 자산

T1-9 독립 검증에서 세운 4종. 판정 근거는 `evidence/t1-9-shell-e2e-verification.md`.

| 자산 | 무엇을 재는가 | 서버 |
|---|---|---|
| `e2e/` (playwright) | 브라우저 실측 — 모드 배지 «전이» · 리셋 모달 · 세션 가드 | 필요 |
| `contract_surface_drill.mjs` | 🔴 **구현 검사기**(`scripts/contract-surface.mjs`)가 무엇을 통과시키는가 | 불요 |
| `surface_scan.mjs` | 계약 표면을 **동결 계약 문서 파싱**으로 독립 재측정 | 불요 |
| `token_layer_probe.mjs` | Tailwind 토큰 표기별로 «어떤 선언이 나는가» (V-2 원인 대조군) | 불요 |
| `route_matrix.sh` | 6라우트 × 쿠키 유무 상태코드 + 가드 matcher 탐침 | 필요 |
| `q39c_entry_drill.mjs` | 입장 층이 «클라이언트 실행»이 된 뒤에도 v0.1.6 이 서는가 — 🔴 자극 강제 + 세션을 **네 곳에서** 따로(쿠키·Set-Cookie·**ai-api 발급**·`/api/*` 200) | 필요(+ `FKT_API_LOG`) |
| `e2e/phase2-evidence.spec.ts` | 🔴 **골격** — §21 증거 4종의 «브라우저에서만 보이는» 축(T3-6 선행 · 전건 skip · 축 계획 = `evidence/t3-6-e2e-axis-plan.md`) | 착지 후 |
| `t41_csp_walk.mjs` | 🔴 **CSP 무해성 전 동선**(T4-1 ④) — 3층 수집(DOM 위반·콘솔 `Refused`·requestfailed) + 자극 계수기 · 일부러 어긴 2절을 못 잡으면 `exit 2` | 필요 |
| `t41_live_status_timeout.mjs` | 🔴 **상한과 «화면이 말한 시각»을 따로**(T4-1 ⑤ · D-3) — 답하지 않는 API 를 세우고 셸을 그쪽으로 «빌드»해야 성립한다 | 필요(블랙홀 빌드) |
| `t41_cors_browser_drill.mjs` + `_origin_page_server.mjs` | 🔴 **브라우저가 CORS 를 집행하는가**(T4-1 ③) — 셸에서 재면 CSP 가 먼저 막아 못 가른다 · CSP 없는 맨 origin 2벌 | 필요(allowlist 주입) |

## 세 가지 규율

**① 대상의 의존을 빌려 쓰지 않는다.** `apps/web-console/node_modules` 를 참조하지 않고 자기
`package.json` 을 갖는다 — 검사 도구가 대상 안에 결합하면 대상이 바뀔 때 도구가 함께 죽는다.
단 `tailwindcss` 는 앱이 실측으로 쓰는 버전(4.3.3)에 **정확히 고정**한다: 대조군의 값은
「같은 버전이 같은 토큰에 무엇을 내는가」에 있으므로 버전이 흐르면 대조가 아니라 다른 실험이 된다.

**② 서버를 검사기가 띄우지 않는다.** `playwright.config.ts` 에 `webServer` 를 두지 않았다.
무엇을 상대로 쟀는지가 판정의 절반이라, `e2e/preflight.ts` 가 실제 응답(`/live/status` 본문·
`POST /sessions` 상태코드)을 **출력에 남긴다**. 서버가 없으면 timeout 빨강 대신 그 사실로 죽는다.

**③ 재시도 0.** `retries: 0`. 초록을 «다시 돌려서» 만들지 않는다.

## 🔴 `test.fail()` 로 표시된 행이 있다

`session-guard.spec.ts` 3행(V-1) · `shell.spec.ts` 1행(V-2)은 **정본이 요구하는 결과**를 적고
「지금은 실패한다」로 표시해 둔 것이다. 지금 초록으로 덮지 않으면서, **처방이 착지하면
「예상된 실패인데 통과했다」로 빨강이 되어 알린다** — 조용히 사라지는 표시를 두지 않는다.

빨강이 나면 결함이 «되살아난» 것이 아니라 «고쳐진» 것이다. 그때 이 표시를 지우고 평범한 초록으로 바꾼다.

## 실행

```
cd apps/web-console && pnpm install && pnpm build && pnpm exec next start -p 3101
cd services/ai-api  && uvicorn app.main:app --host 127.0.0.1 --port 8000

cd tests/web && npm install && npx playwright install chromium
npm run e2e        # 34행
npm run tokens     # 토큰 표기 대조군
node ../../tests/web/surface_scan.mjs           # 리포 루트에서 실행
node ../../tests/web/contract_surface_drill.mjs # 리포 루트에서 실행
```

포트는 `FKT_WEB_BASE` · `FKT_API_BASE` 로 바꾼다.

## T4-1 세 그물의 «준비»가 다르다

세 드릴은 평범한 스펙과 달리 **측정 조건을 손으로 세워야** 성립한다. 조건 없이 돌리면
초록도 빨강도 대상의 것이 아니다:

```
# ④ CSP 무해성 — 씨앗 DB 를 보는 ai-api 와 그것으로 «빌드»된 셸이 필요하다
FKT_WEB_BASE=http://127.0.0.1:3151 node t41_csp_walk.mjs

# ⑤ /live/status 상한 — 「받기만 하고 답하지 않는」 서버가 있어야 상한이 드러난다
#    (연결 거부는 즉시 실패라 상한을 재지 못한다)
node _blackhole_server.mjs 8064
cd apps/web-console && FKT_API_BASE=http://127.0.0.1:8064 pnpm build && pnpm start -p 3155
FKT_WEB_BASE=http://127.0.0.1:3155 node t41_live_status_timeout.mjs

# ③ 브라우저 CORS — origin 두 벌 + ai-api 에 allowlist 주입
node _origin_page_server.mjs 8066 &   ;   node _origin_page_server.mjs 8068 &
FKT_CORS_ORIGINS=http://127.0.0.1:8066 docker compose up -d ai-api
node t41_cors_browser_drill.mjs
```

🔴 **이 머신에서 회귀를 돌릴 때(13대 실측)**: `PYTHONIOENCODING=utf-8`(cp949 stdout 이
드릴의 성공 인쇄에서 죽인다) · `FKT_PYTHON=<정본 리포>/services/ai-api/.venv/Scripts/python.exe`
(`replay_fixture_drill` 이 자기 uvicorn 을 띄운다) · playwright 는 `FKT_WEB_BASE`·`FKT_API_BASE`
를 **둘 다** 실을 것 · 브라우저 suite 는 **`--workers=1`**(병렬에서는 실행마다 다른 1~2건이
부하 timeout 으로 죽었고 단건은 3/3 초록이었다 — 대상의 빨강이 아니다).
