# T7-8b 판정문 — 대상 크기(2.5.8 / 2.5.5)의 **아직 안 잰 열**: 화면 · 상태 · 높이

> 검증 좌석 리바이2 **37대** · 2026-09-04 01:0x KST · lane `lane/levi2-t78b`
> 그물 = `tests/web/t78b_target_size_states.mjs` + `tests/web/_target_size_lib.mjs`
> 원장 = `evidence/t78b-run*.json` · 실행 로그 = `evidence/t78b-runlog*.txt`

---

## 0. 판정선 (두 열 · 정본 문면)

| 축 | **AA = 합격선** | AAA = 목표 |
|---|---|---|
| 대상 크기 | **2.5.8** = 24×24 CSS px **+ Spacing 예외** | **2.5.5** = 44×44 · **예외 없음** |

- **Spacing 예외 문면** — *"if a 24 CSS pixel diameter circle is centered on the bounding box of each
  [undersized target], the circles do not intersect another target or the circle for another
  undersized target."*
- 🔴 **기계가 판정하는 예외는 Spacing 하나뿐**이다. Equivalent · Inline · User agent control ·
  Essential 은 의미 판단이라 기계가 못 정한다 ⇒ **이 문서의 빨강은 「AA 위반」이 아니라
  「AA 위반 «후보»」**다.
- 🔴 **모집단의 주어** — 2.5.8 의 target = *"region of the display that will **accept a pointer
  action**"*. HTML `inert` 서브트리는 **pointer event 를 받지 않는다** ⇒ **inert 아래는 target 이
  아니다.** 그래서 표에 **`nonInert`(판정 열)** 과 **`all`(참고 열)** 을 나란히 싣는다.
  (오케 판정 09-04 00:50 — `nonInert` 를 판정 열로 확정 · 규격 §⑧-1 에 성문 예정.)
- 🔴 **「보이는데 안 눌린다」는 이 SC 가 아니다** — 그것은 규격 §⑧-4 합격조건 ③의 반대편 축이다.

## 1. 잰 열 (범위를 맨 앞에)

| 열 | 값 |
|---|---|
| 무대 | **`:3115`**(앱면 = `fb1a0c5`. 실측: `_wt/levi2-t76` HEAD `804f382` · `git diff fb1a0c5 804f382 -- apps/` **빈 diff**) · **`:3116`**(앱면 = **`origin/develop` 과 동일** · 실측: `git diff a8cd74a origin/develop -- apps/` **빈 diff** · `_wt/levi2-target-ee3daab`) |
| 엔진 | Chromium(Playwright 번들) **1종** — 🔴 **타 엔진은 안 쟀다** |
| 빌드 | `next start`(prod 빌드) — 🔴 **dev 는 안 쟀다** |
| pointer | `fine` · `coarse`(`hasTouch`) 두 열 |
| 폭 | 390 / 768 / 1440 |
| 높이 | 900 / 640 / 480 |
| 화면 | `/overview` · `/compare` · `/work-orders/WO-2025-0087` · `/documents/DOC-MAN-0021` · `/incidents/INC-2026-014?run=STATIC-GS-01` |
| 상태 | `base` · `modal`(세션 리셋 확인) · `tour`(투어 열린 상태) |
| live | `/api/live/status` 를 `{online:false}` 로 **고정**(값을 고정할 뿐 뒤집지 않는다) · 🔴 배포 `:8010` **무접촉** |

🔴 **안 잰 것을 「0」으로 쓰지 않는다** — 아래 §6 미측 목록이 그 자리다.

## 2. 🔴 발주문 전제 정정 3건 (측정 전에 실물과 대조)

1. **`/enter` 는 화면이 아니다** — `app/enter/route.ts` = **POST 전용 API 라우트**. 페이지가 없으니
   **2.5.8 모집단이 0**이다 ⇒ **「위반 0」이 아니라 «해당 없음»**. (GET 405 는 「정상」이 아니라
   「잴 대상이 없다」는 뜻이었다.)
2. **`/work-orders`·`/documents` 는 동적 세그먼트만 있다**(`[woId]`·`[docId]`). 맨 경로는 **404**(실측).
   ⇒ id 를 그물에 박지 않고 **화면에서 주웠다**. 🔴 작업지시는 정적 재생본에서 **링크가 아니라
   «적힌 글자»**로만 나와서, `a[href]` 뿐 아니라 **본문 텍스트**에서도 id 를 줍게 했다.
3. **바텀 시트는 별도 상태가 아니다** — 같은 투어 오버레이가 `<md` 에서 시트로 뜬다
   (`components/tour/tour-overlay.tsx`) ⇒ **「투어 상태 × 좁은 폭」**으로 가른다. 별도로 세면
   같은 것을 두 번 세는 것이다.

## 3. 계측기 자기 검사 (이 표를 믿어도 되는 이유)

- **교정 열** — 떼어낸 산식이 36대가 이미 낸 칸을 **글자까지 재현**했다:
  `fine · 1440×900 · base` 에서 `/overview` **16** · `/incidents/…` **41** · `/evidence/…` **8**
  (36대 착지값과 동일). **매 회차 앞에 다시 돈다.**
- **대조군** — 칸마다 **뷰포트 상대**로 심고 두 물음을 **갈라서** 잰다:
  ① **도달성**(심은 3개가 실페이지 스캔에 잡히는가 — 없으면 `exit 2` = 「소실 = 전제 죽음」)
  ② **판정력**(심은 3개«만»의 격리 모집단에서 12×12/18px 쌍은 **위반**, 60×60 단독은 **통과**)
  🔴 **왜 갈랐나** — 36대 그물은 대조군을 페이지 전체 모집단에서 판정했다. 상태를 열면 화면이
  붐벼서 **「내 산식이 틀렸다」와 「이웃이 가까웠다」가 한 색으로 접힌다.**
- **가시성 필터**(D-41) — `checkVisibility({checkOpacity,checkVisibilityCSS,contentVisibilityAuto})`
  + `offsetParent` 폴백. 🔴 참이어도 **사람 눈에 보임은 아니다**(덮인 것·밀린 것을 못 가른다).
- **히트 상자** — `.fkt-hit::before` 확장을 `getBoundingClientRect` 가 못 보므로 `elementFromPoint`
  1px 격자로 훑고 **관대한 상한(span+2)** 으로 판정한다(위반을 과다 신고하지 않는 쪽).

### 🔴 이 측정이 사람보다 «유리/불리»한 점 (고정 항목)

- **유리** — 소수점 경계 상자와 «실제 눌리는 상자»를 직접 읽는다. 사람은 그 상자를 볼 수 없고
  「눌러 봐서 빗나가는지」로만 안다. 36칸·60칸을 같은 자로 잰다.
- **불리** — 🔴 **무엇이 «하나의 대상»인지 사람처럼 못 가른다.** 시각적으로 한 덩어리인 것을 둘로
  세면 원이 교차하고 하나로 세면 안 한다. **Spacing 예외 판정의 뿌리에 닿는 한계**다.
  그리고 `checkVisibility` 가 참인 «덮인 요소»를 사람은 「없는 것」으로 본다.

---

## 4. 결과 — (아래 §4.x 는 회차 회수 뒤 채운다)

## 5. 자수

## 6. 안 잰 것 (🔴 「위반 0」이 아니다)
