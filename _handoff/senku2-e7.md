# E-7 — 승인 뒤의 「멈춤」을 종단 상태 + 출구로 바꾼다 (센쿠2 55대)

base = `origin/develop` **94403ccfce952f7b09b05612475be5d8d9e12bb4**(실측) · lane `lane/senku2-e7`

## 1. 발주 전제 대조 (실측 · 정정 반영)

| 발주 문면 | 실측 | 처리 |
|---|---|---|
| `wo-approve` 에 disabled 스타일 없음 | 🔴 **틀림** — `app/globals.css:304` `.fkt-btn:disabled { opacity: 0.4 }` 가 전역 · 스텁 무대 계산값 **0.4** | 오케 15:14 정정으로 ① 철회 |
| `pnpm --dir apps/web-console typecheck` | 🔴 **그 스크립트가 없다**(`package.json` scripts 실물: dev·build·start·lint·contract:surface·retry:drill·prebuild·predev·static-replay:*·test:unit) | `npx tsc --noEmit` 로 대체 실측 |

## 2. 고친 것 (`apps/web-console/components/work-order/wo-screen.tsx` 1파일)

- 종단(`readOnly`)에서 **승인·반려 버튼을 렌더하지 않는다**. 그 자리에 **상태 배지 `wo-final`**
  (머리말과 **같은 출처** `badge` = ✅ 승인됨 / ⛔ 반려됨 · 감사 id 는 **있을 때만** 병기) +
  **출구 하나 `wo-exit`**(`/incidents/{incidentId}` · `wo-incident-link` 와 같은 주소).
- `lastAuditId` 상태 1개 추가 — approve/reject 응답의 `auditId` 를 담는다(이력과 같은 한계:
  세션 내 · 새로고침하면 사라진다 ⇒ 없을 때는 **자리를 비운다**).
- 「최종 상태라 편집할 수 없습니다」 문면 **유지** · `pending` 경로 **무변**.

## 3. 실측 (E1)

| 축 | 값 |
|---|---|
| `pnpm lint` | **rc 0** |
| `npx tsc --noEmit` | **rc 0**(🔴 `pnpm build` «뒤»에 재라 — build 가 굽는 `.next/types` 와 `lib/static-replay/generated/*` 가 없으면 기존 5건이 뜬다: LayoutProps·PageProps·generated 3본. 코드 결함 아님) |
| `pnpm build` | **rc 0**(`FKT_API_BASE=http://127.0.0.1:8020`) |

### 3.1 화면 A·B (412×600 · deviceScaleFactor 2 · 🔴 **구독 호출 0**)

| | `approved` | `pending`(대조군) |
|---|---|---|
| `data-state` | approved | pending |
| `wo-approve` / `wo-reject` | **0 / 0** | **1 / 1** |
| `wo-final` | **✅ 승인됨** | 없음 |
| `wo-exit` | **조사로 돌아가기** → `/incidents/INC-2026-014` | 없음 |
| `wo-save-state` | 최종 상태라 편집할 수 없습니다. | 변경 없음 |
| 문서 넘침 | 없음(412 / 412) | 없음(412 / 412) |

스크린샷 = `_handoff/e7-final-412x600.png` · `_handoff/e7-pending-412x600.png`.
출구 버튼 레이아웃 박스 = 119×**36** — coarse 포인터에서는 `globals.css:313`
`.fkt-btn { min-height: 2.75rem }`(=44)가 먹는다(이 측정은 chromium 기본 포인터).

### 3.2 🔴 무대 — 왜 스텁인가 (측정 조건 공개)

`:8804`(이 트리 빌드) ← `:8803`(스텁 API `_handoff/drills/e7_stub_api.mjs`).
**이 무대에서 실제 승인 WO 를 만들 수 없다**: WO 초안은 run 에서만 나오는데(`work_orders.py`
에 생성 라우트 0), 이 무대의 `mode:"replay"` 는 **501**(리바이2 #941 실측과 일치)이고
`mode:"live"` 는 **구독을 태운다 — 발주가 구독 0 이다**. 그래서 응답 «형상»만 세웠다:
스텁 본문은 `services/ai-api/app/routers/work_orders.py` `_draft_response` 를 **실물 대조**해
같은 키로 만들었다. ⇒ 🔴 **여기서 선 것은 「종단 응답을 받은 화면이 무엇을 그리는가」이고,
「서버가 실제로 종단으로 바꾸는가」는 이 무대가 답하지 않는다**(그 축 = 리바이2 #941 이 이미 PASS).

## 4. 🔴 회부 — 이 변경이 **기존 스펙 4줄을 빨갛게 만든다**(`tests/**` = 검증 scope · 내가 못 고친다)

`tests/web/e2e/t3-5-wo-screen.spec.ts`
- `:461` `await expect(page.getByTestId("wo-approve")).toBeDisabled();`
- `:462` `await expect(page.getByTestId("wo-reject")).toBeDisabled();`
- `:504` · `:505` 같은 두 줄

이제 종단에서 **요소가 없다** ⇒ `toBeDisabled()` 는 「없다」를 「안 잠겼다」로 말한다.
바로 그 아래 줄의 성문(`D-70` · 「잠긴 초안에는 편집 UI 를 «그리지 않는다»」)과 **같은 방향**이니
문면을 그 규칙에 맞춘다. 제안(리바이2 적용분):

```diff
-    await expect(page.getByTestId("wo-approve")).toBeDisabled();
-    await expect(page.getByTestId("wo-reject")).toBeDisabled();
+    // 🔴 종단에는 «누를 것»을 두지 않는다(E-7 · D-70 과 같은 규칙) — 잠긴 버튼이 아니라 부재다.
+    await expect(page.getByTestId("wo-approve")).toHaveCount(0);
+    await expect(page.getByTestId("wo-reject")).toHaveCount(0);
+    // 그 자리에 결과와 출구가 선다 — 「없다」만 확인하면 빈 화면도 통과한다.
+    await expect(page.getByTestId("wo-final")).toBeVisible();
+    await expect(page.getByTestId("wo-exit")).toHaveAttribute("href", /\/incidents\//);
```

같은 파일 `:426`·`:486`·`:496`(클릭)과 `t3-6-keyboard:241`·`t4-4-viewport-mobile:178`·
`phase2-evidence:182` 는 **pending 상태에서 누르는 자리**라 영향 없음(형상 무변).
