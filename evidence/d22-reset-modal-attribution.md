# D-22 — `reset-modal` 「취소 → 아무 일도 없다」 빨강의 귀속

> 좌석: 검증(리바이2 28대) · 발주: 오케(스자쿠 23대 21:45 · 승인 22:31) · 회부 원본 =
> `evidence/t6-1-live-synthesis-verification.md` §7(27대) · 대상 develop **`61bdd13`**
> 근거 등급: E1 실측 / E2 출처 / E3 소견
> 🔴 **판정 = 대상 결함 아님 · 귀속 = «인스턴스 조건 `online=true`» · 진범 = 내 그물의 전제**
> T6-1 코드(#407·#409)는 이 빨강과 **무관**하다 — 옛 코드에서 `online` 하나만 바꿔 **6/1 을 그대로 재현**했다.

## §0 무엇을 못 갈랐나 (회부 시점의 상태)

27대의 두 열은 **코드**와 **ai-api 인스턴스** 두 축에서 동시에 달랐다.

| 열 | 셸 코드 | ai-api | 결과 |
|---|---|---|---|
| 자극 | T6-1(`7ca563d`) · 3012 | 내 인스턴스 8020 · 게이트웨이 붙음(`online:true`) | **6 통과 / 1 빨강** |
| 대조 | 옛 코드 · 3011 | 배포 8010 · 게이트웨이 없음(`online:false`) | **7 / 0** |

두 축이 함께 움직였으므로 어느 쪽의 빨강인지 서지 않는다.

## §1 코드축은 «정적으로» 먼저 닫혔다 (E1)

`git diff --name-only c5743dd 61bdd13 -- apps/web-console` = **2건뿐**:
`components/incident/run-panels.tsx` · `lib/run-events.ts`.

이 축이 타는 파일 — `components/reset-button.tsx` · `components/live-status.tsx` ·
`app/overview/**` · `lib/contract.ts` — 은 **diff 0**. **`tests/web/e2e/reset-modal.spec.ts` 자체도 diff 0**
(그물도 같은 바이트다). 두 변경 파일은 `/incidents/*` 런 화면 자산이라 `/overview` 의 이 축을 지나지 않는다.

🔴 그러나 **코드가 같다 ≠ 저 빨강이 코드의 것이 아니다** 는 정적으로 서지 않는다(계보:
「코드 동일 ≠ 귀속」). 그래서 열을 하나 더 세워 **동적으로** 잘랐다.

## §2 열 C 를 어떻게 세웠나 — 컨테이너 대신 «손잡이 하나»

발주의 재현법은 배포 이미지에 옛 `services/ai-api/app` 을 마운트하는 것이었다. 그런데 셸의
API base 는 **빌드 시점 고정**(`apps/web-console/next.config.ts` → `FKT_API_BASE_BUILD` ·
`lib/contract.ts:428`)이라, 새 인스턴스를 세워도 **셸을 다시 빌드해야** 그 인스턴스를 본다 —
그러면 셸 빌드라는 축이 또 하나 움직인다.

`LiveStatusProvider`(`components/live-status.tsx:31~`)는 `online` 을 **브라우저에서**
`/api/live/status` 폴링으로 받는다. 즉 「게이트웨이가 붙었다」가 이 화면에 닿는 **유일한 통로**가
그 응답 하나다. 그래서 **살아 있는 옛 코드 셸(3011) 앞에 얇은 리버스 프록시**를 두고
**그 응답 한 개만** 바꿨다(`tests/web/d22_live_axis_proxy.mjs`). 열 간 차이가 **1** 이 된다.

| 열 | 셸 | `/api/live/status` | 배지 | **원본 spec 무수정 결과** |
|---|---|---|---|---|
| ⓐ 직결 | 3011(옛 코드) | 상류 그대로 `online:false` | `replay` | **7 / 0** (27대 대조군 재현) |
| ⓑ 프록시 passthrough(3021) | 3011(옛 코드) | 상류 그대로 `online:false` | `replay` | **7 / 0** (프록시 무해 증명) |
| ⓒ 프록시 override(3022) | 3011(옛 코드) | **`online:true` 로 교체** | `live` | 🔴 **6 / 1** — 27대 자극 열과 **같은 칸**이 빨강 |

- 🔴 **ⓑ 가 없으면 ⓒ 의 빨강이 「online 때문」인지 「프록시 때문」인지 못 가른다.** 두 프록시는
  같은 코드·같은 상류이고 `--mode` 한 글자만 다르다.
- **자극 실재 계수**(프록시 자취 JSON · E1): ⓑ `liveAsked=9 · liveOverridden=0 · proxied=316` ·
  ⓒ `liveAsked=9 · **liveOverridden=9** · proxied=265`. 🔴 이 줄이 0이면 위 판정은 무효다.
- 빨강 칸 = `e2e/reset-modal.spec.ts:63` 「취소 → 모달만 닫히고 아무 일도 없다」 — **27대와 동일한 칸**.

⇒ **옛 코드에서 `online` 하나만 바꿔 6/1 이 재현됐다. 귀속은 «인스턴스 조건(`online=true`)» 이고,
T6-1 코드는 이 빨강의 주어가 아니다.**

## §3 그러면 대상이 틀렸나 — 아니다 (E1 · `tests/web/d22_reset_axis_probe.mjs`)

빨강의 문면은 대상의 오작동이 아니었다:

```
Error: expect(locator).not.toContainText(expected) failed
  Locator: getByRole('status')
  Expected substring: not "되돌렸습니다"
  Error: element(s) not found          ← 🔴 «되돌렸다고 말했다» 가 아니라 «리전이 없다»
```

기전(코드 · E1): `FallbackBanner`(`live-status.tsx:151~`)가 `role="status"` 를 다는데, 그 배너는
`mode` 가 `replay`/`unavailable`이거나 세션 미등록일 때**만** 선다. `online:true` ⇒ `mode=live` ⇒
`notice=null` ⇒ **배너 없음**. 리셋 자신의 `role="status"`(`reset-button.tsx:72`)는 결과 문구가
있을 때만 뜨므로, **취소 뒤에는 페이지에 `role=status` 가 0개**가 된다.

같은 항아리에서 **대상 거동을 직접 측정**했다:

| | ⓑ `replay`(3021) | ⓒ `live`(3022) |
|---|---|---|
| 취소 뒤 열린 dialog | 0 | 0 |
| 취소 뒤 `role=status` 개수 | **1**(fallback 배너) | **0** |
| 취소 뒤 «되돌렸습니다» 문자열 | **0** | **0** |
| 취소 뒤 나간 `/reset` 요청 | **0건** | **0건** |
| (대조군) 성공 응답 모킹 후 «되돌렸습니다» | **1** | **1** |

⇒ **두 열에서 대상은 똑같이 옳게 동작한다.** 취소했고, 아무 요청도 안 나갔고, 「되돌렸습니다」도
없다. 빨강은 **내 단언이 「라이브 리전이 존재한다」를 전제**했기 때문에 났다(계보: 「그물의 전제가
먼저 죽는다」 · 「기준선이 이미 참일 때」).

## §4 그물 수정안 (별 PR — 이 창에서 고치지 않는다)

`tests/web/e2e/reset-modal.spec.ts:72`

```diff
-    await expect(page.getByRole("status")).not.toContainText("되돌렸습니다");
+    // 🔴 재는 것은 «되돌림 문구가 없다» 이지 «라이브 리전이 있고 그 안에 없다» 가 아니다.
+    //    `role=status` 는 fallback 배너가 설 때만 존재한다(online:false 조건) — D-22.
+    await expect(page.getByText("되돌렸습니다")).toHaveCount(0);
```

🔴 **이 단언에 검출력이 있다는 것을 같은 창에서 실측했다**(§3 마지막 행): 성공 응답을 모킹해
실제로 되돌리면 두 열 모두 **1** 을 센다. 0만 셀 수 있는 그물이면 통과는 아무 뜻이 없다.

- 같은 병을 앓는 이웃 축(**미수정 · 이 창 밖**): `t6-1-…-verification.md` §5-2 의 빨강 ①`mode-badge`
  ②`shell` fallback 배너 — 27대가 이미 「내 스택 조건 ⇒ 못 잼」으로 분류했다. 이 둘은 **전제가
  `online:false` 인 축**이므로 «수정»이 아니라 **조건 표기**가 답이다(E3 소견).

## §5 잰 것 / 안 잰 것

- **잰 것**(E1): ⓐⓑⓒ 3열 × 원본 spec 7칸(무수정) · 각 열의 배지 `data-mode` · 프록시 자취
  (`liveAsked`/`liveOverridden`/`proxied`) · 취소 뒤 대상 거동 5항 · 제안 단언의 검출력 대조군 ·
  `c5743dd↔61bdd13` 코드/그물 diff.
- **안 잰 것**: 발주가 적은 **컨테이너 열**(옛 `services/ai-api/app` 마운트) — §2 사유로 셸 재빌드
  축이 딸려 오므로 «손잡이 하나» 열로 대체했다. 즉 **「진짜 게이트웨이가 붙은 ai-api 인스턴스」
  자체의 다른 부수 효과는 안 쟀다** — 이 축에 닿는 통로가 `/api/live/status` 하나임은 코드로만
  섰다(E1 코드 축 · `live-status.tsx`). · 8020 인스턴스 재기동 · 429 운영값 · 정적 replay 경로.
- 🔴 **접촉 고지**: 3011 의 API base 는 **배포 8010**이다. 따라서 3열 전부 8010 에 `POST /api/sessions`
  (+ 자기 세션 `/reset`) 트래픽을 냈다 — 27대 대조군과 **같은 성질**의 접촉이며, 배포 설정·컨테이너·
  8787 게이트웨이는 **무접촉**이다. 세션 범위 밖 상태는 건드리지 않았다.

## §6 🔴 내 계측기 자수 (대상 결함으로 세지 않는다)

| # | 무엇 | 진범 |
|---|---|---|
| ① | worktree 를 **리포 안**(`factory-knowledge-twin/apps/_wt/levi2-d22`)에 만들었다 | **내 손** — 앞 명령의 `cd apps/web-console` 가 셸 cwd 로 남아 `../_wt` 가 `apps/_wt` 로 풀렸다. D-13 마운트 대조(전 컨테이너 `Mounts.Source` grep = **히트 0**) 후 제거 · 형제 경로 재생성 · 메인 트리 `git status --porcelain` **청결** 확인 |
| ② | 상한 45분을 넘겼다(21:47 착수 → 판정 22:5x) | **내 손** — worktree 재생성과 프록시 설계에 쓴 시간. 산출은 상한 안에 못 넣었다고 적는다 |

## §7 원장 제안 (오케 판단)

- **D-22 = 종결(대상 결함 아님)** · 원인 = 그물 전제 · 조치 = §4 1줄 수정(별 PR).
- `t6-1-…-verification.md` §5-2 의 빨강 ③ 는 **「내 스택 조건 ⇒ 그물 전제 결함」** 으로 확정 표기.
