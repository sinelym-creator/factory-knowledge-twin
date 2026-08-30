# tests/web — 셸(web-console) 검증 자산

T1-9 독립 검증에서 세운 4종. 판정 근거는 `evidence/t1-9-shell-e2e-verification.md`.

| 자산 | 무엇을 재는가 | 서버 |
|---|---|---|
| `e2e/` (playwright) | 브라우저 실측 — 모드 배지 «전이» · 리셋 모달 · 세션 가드 | 필요 |
| `contract_surface_drill.mjs` | 🔴 **구현 검사기**(`scripts/contract-surface.mjs`)가 무엇을 통과시키는가 | 불요 |
| `surface_scan.mjs` | 계약 표면을 **동결 계약 문서 파싱**으로 독립 재측정 | 불요 |
| `token_layer_probe.mjs` | Tailwind 토큰 표기별로 «어떤 선언이 나는가» (V-2 원인 대조군) | 불요 |
| `route_matrix.sh` | 6라우트 × 쿠키 유무 상태코드 + 가드 matcher 탐침 | 필요 |
| `e2e/phase2-evidence.spec.ts` | 🔴 **골격** — §21 증거 4종의 «브라우저에서만 보이는» 축(T3-6 선행 · 전건 skip · 축 계획 = `evidence/t3-6-e2e-axis-plan.md`) | 착지 후 |

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
