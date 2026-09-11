# E-7v — 승인 종단 수리 독검 (리바이2 60대)

- 창 = `date 15:21:20` ~ `15:33:18` · 구독 **0** · production 무접촉 · 팀 공용 `:8020` 무접촉
- 🔴 **내가 검증한 sha = `6eafdc7`**(발주문의 `3797b1b` 가 아니다 — 센쿠2가 hygiene 을 고쳐 올린 수정 sha · 15:25 멘션)

## 0. 무대 — 포트 ↔ 좌석 ↔ 워크트리 (두 열이 같은 ai-api 를 본다)

| 포트 | 열 | 워크트리 | 빌드 |
|---|---|---|---|
| `:8196` | **前** | `_wt/levi2-load` | develop(수리 없음) |
| `:8197` | **後** | `_wt/levi2-e7v` | `lane/senku2-e7` **`6eafdc7`** |
| `:8850` | 공통 | 컨테이너 `fkt-levi2-stub-api` | 전용 ai-api(게이트웨이 = hold 스텁 `:8858`) |

🔴 **바뀐 손잡이는 «셸 빌드» 하나**다 — 두 열이 **같은 ai-api·같은 DB·같은 스텁**을 본다. 그래서 차이는 화면의 것이다.

## 1. 前後 (412×600 · 각 축 1회)

| 축 | 前(`:8196`) | 後(`:8197`) |
|---|---|---|
| 승인 POST | 200 `AUD-f851ef244ab0` | 200 `AUD-1d16576ca7d5` |
| 승인 후 `wo-approve` / `wo-reject` count | **1 / 1**(disabled) | **0 / 0** |
| `wo-final` | **0** | **1** — 문면 **`✅ 승인됨 AUD-1d16576ca7d5`** |
| `wo-exit` | **0** | **1** |
| 출구 클릭 착지 | — | **`/incidents/INC-2026-014` ids=75** (2회 모두) |
| 반려 POST | 200 `AUD-b06293b70eac` | 200 `AUD-85b5e0ca1593` |
| 반려 후 버튼 / final / exit | 1 / 1 · 0 · 0 | **0 / 0** · **1**(`⛔ 반려됨 AUD-85b5e0ca1593`) · **1** |
| `wo-save-state` 문면 | 「최종 상태라 편집할 수 없습니다.」 | 동일(유지) |
| **pending 대조군** | 버튼 **1 / 1** · final 0 · exit 0 | **버튼 1 / 1 · final 0 · exit 0**(무변) |
| pageerror | 0 | 0 |

→ **바뀐 것은 종단뿐이고 pending 은 그대로다.** 발주 ⓑ ①②③④ 전부 섰다.

## 2. 스펙 패치(ⓒ) — `_handoff/senku2-e7.md` §4 적용

`t3-5-wo-screen.spec.ts` **2곳**(승인·반려 종단):

```diff
-    await expect(page.getByTestId("wo-approve")).toBeDisabled();
-    await expect(page.getByTestId("wo-reject")).toBeDisabled();
+    await expect(page.getByTestId("wo-approve")).toHaveCount(0);
+    await expect(page.getByTestId("wo-reject")).toHaveCount(0);
+    await expect(page.getByTestId("wo-final")).toBeVisible();
+    await expect(page.getByTestId("wo-exit")).toHaveAttribute("href", /\/incidents\//);
```

🔴 「없다」만 확인하면 **빈 화면도 통과**한다 — 그래서 **결과와 출구가 선 것까지** 같은 자리에서 묻는다.

| 실행 | 무대 | 결과 |
|---|---|---|
| `t3-5-wo-screen.spec.ts` 파일 전수 | **後 `:8197`** | **7 passed**(7.8m) · **새 빨강 0** |
| **교정 1본** — 같은 패치 스펙을 **前 `:8196`** 에 | 前 | **1 failed** — `toHaveCount` Expected **0** / Received **1** |

→ 이 초록은 **수리가 있을 때만** 난다. 되돌린 무대에서 빨강이 서는 것으로 검출력을 보였다.

## 3. 판정

**PASS** — 대상 결함 0. 수리는 폐하 증상(「승인하고 왜 멈춰있는지 모르겠네」)의 자리를 정확히 덮는다:
누를 것이 사라지고, 무슨 일이 있었는지(`✅ 승인됨 · AUD-…`)와 **다음 한 걸음**(조사로 돌아가기)이 그 자리에 선다.

## 4. 내 계측기 자수

1. **발주문의 sha(`3797b1b`)로 검증하지 않았다.** 그 sha 는 hygiene 빨강이 있던 판이고, 내가 받은 건 `6eafdc7` 이다 — **내가 무엇을 쟀는지 sha 로 적는다**(라벨이 아니라).
2. **前 열은 「지금 무대가 그대로 前」이라는 사실에 기댔다.** `:8196` 은 E-7 재현 때 세운 develop 빌드다 — 그 사이 develop 이 움직였으면 前 열의 시대가 어긋난다. 이번엔 두 열의 차이가 `wo-screen.tsx` 1파일이라 위험이 낮지만, **재사용한 열이라는 사실**을 적어 둔다.
3. **교정은 파일 전수가 아니라 `⑤ 승인` 1건**으로 했다(상한 압박). 전수 교정은 하지 않았다 — 「안 한 것」으로 남긴다.
4. M-1 §2.5(`t3-2-screens` 앵커) 패치는 **이 lane 에 넣지 않았다** — D-95v 발주의 러너 축과 묶여 있어 그 창에서 함께 다룬다.
