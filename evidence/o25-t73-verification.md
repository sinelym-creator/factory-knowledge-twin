# O-25 · T7-3 검증 (리바이2 49대)

- **발주** 스자쿠 44대 wake 발주 ① · cap 0 · lane `levi2-o25v`
- **대상** PR #731 `lane/senku2-o25` `470f8c7`(3파일) · PR #732 `lane/senku2-t73` **`a181df4`**(옛 sha `bf35eb1` 도 함께 잼)
- **무대** worktree `_wt/levi2-o25v` · `apps/web-console` · `pnpm install --frozen-lockfile`(rc 0 · 28.5s)
- **판정** **#731 = PASS**(ⓔ 1축 미측정 · 이름으로 남김) / **#732 = PASS**(`a181df4` · 변이 대조군으로 검출력 유지 확인)

---

## 0. 전언 정정 2건 (착수 전 실측)

| 발주문 | 실측 | 처치 |
|---|---|---|
| `npm ci` 뒤 `npm run test:unit` | `apps/web-console` 는 **pnpm** 패키지(`pnpm-lock.yaml` · `packageManager: pnpm@10.32.1`) · `package-lock.json` **부재** | `pnpm install --frozen-lockfile` + `pnpm test:unit` 로 집행. 재개점 §2 의 `npm ci` 는 **`tests/web`** 축이지 이 패키지가 아니다 |
| #731 출발 `9f2c592` | 맞다. 다만 `origin/develop` 은 그 뒤 **8커밋** 앞섰고, 측정 중 #733 병합으로 tip = **`379e70e`** | 판정을 **PR head 열**과 **착지 상태 열**로 나눠 찍었다 |

🔴 **측정 중 develop 이 움직였다** — #733(계약 `sourceId` 이중 required 제거)이 병합되어 tip 이 `379e70e` 가 되었다. #732 판정은 **이 tip 기준**이다.

---

## 1. PR #731 (O-25) — 측정 4열

| 열 | 무엇 | 커밋 | `eslint .` rc | 결과 |
|---|---|---|---|---|
| **L0 대조군** | #731 **출발점** | `9f2c592` | 1 | **9 problems (6 errors, 3 warnings)** |
| **L1** | #731 **head** | `470f8c7` | 0 | **0 problems** |
| **L2 착지 상태** | `379e70e` + `470f8c7` 병합 | `ba8edcd` | 0 | **0 problems** · `pnpm test:unit` **4파일 28/28 초록**(rc 0) |
| **L3 역대조군** | L2 에서 `eslint-disable-next-line …set-state-in-effect` **4줄만 삭제** | (working tree) | 1 | **4 problems (4 errors, 0 warnings)** · 전건 `react-hooks/set-state-in-effect` |

🔴 **L0 이 이 판정의 판정력이다** — 9건이 실재했고(주장 「9 baseline findings」와 **건수·자리 일치**), head 에서 0 이 되었다.
🔴 **L3 이 「이 초록이 회피 때문인가」를 가른다** — 4줄을 지우자 **정확히 4건**이 돌아왔다(더도 덜도 아님). 따라서
① 규칙이 **살아 있고**(비활성 규칙에 건 no-op 이 아니다) ② 지시자 4개가 **전부 load-bearing** 이며
③ **줄 단위**라 옆 줄의 다른 위반을 함께 삼키지 않았다. 지시자를 둔 채 lint 0 인 것은 **미사용 지시자도 0**이라는 뜻이다.

### 9건 → 처방 1:1 대조 (L0 실측 자리)

| # | 파일:줄 | 규칙 | 처방 |
|---|---|---|---|
| 1 | `app-shell.tsx:1:8` | `no-unused-vars` (`Link`) | ⓓ import 삭제 |
| 2 | `app-shell.tsx:5:20` | `no-unused-vars` (`IconQuestion`) | ⓓ import 삭제 |
| 3 | `tour-overlay.tsx:147:7` | `set-state-in-effect` (`setRect(null)`) | ⓑ 지시자 |
| 4 | `tour-overlay.tsx:324:52` | `immutability` (선언 전 접근) | ⓒ `SETTLE_MS` 모듈 이동 |
| 5 | `tour-overlay.tsx:456:5` | `set-state-in-effect` (`setSettled(false)`) | ⓑ 지시자 |
| 6 | `tour-overlay.tsx:462:7` | `set-state-in-effect` (`setPlacement(null)`) | ⓑ 지시자 |
| 7 | `tour-overlay.tsx:465:43` | `immutability` (선언 전 접근) | ⓒ `style` 선언 이동 |
| 8 | `tour-provider.tsx:14:8` | `no-unused-vars` (`TourStatus`) | ⓓ import 삭제 |
| 9 | `tour-provider.tsx:73:7` | `set-state-in-effect` (`setState(resumed)`) | ⓑ 지시자 |

= **4 지시자 + 2 이동 + 3 삭제 = 9**. 발주 문면과 **건수·종류 일치**.

### ⓑ 지시자 4건 심사 (diff 정독)

- 전건 **`eslint-disable-next-line`** — 파일 단위 `/* eslint-disable */` **0건**. 전건 규칙명 **`react-hooks/set-state-in-effect`** 명시(포괄 억제 0).
- 전건 **사유 주석 실재** — 「외부 저장소(localStorage)를 React 상태로 들여오는 자리」(provider) ·
  「여기서 재는 것은 브라우저 레이아웃이라 렌더 중에 알 수 없다」(overlay rect) ·
  「렌더 중 파생으로 옮기면 정착 시점의 결정성이 깨진다」(settled) · placement 초기화.
- **호출 위치 무변경** — `setState(resumed)` · `setRect(null)` · `setSettled(false)` · `setPlacement(null)` 네 줄 모두
  diff 에서 **context 줄**이다(`-` 없음). 추가된 것은 위의 주석/지시자뿐.
- 🔵 기존 `// eslint-disable-next-line react-hooks/exhaustive-deps`(overlay ~526)는 **이번 PR 산물이 아니다**(context 줄) — 4건 계수에서 제외.

### ⓒ 이동 2건 — 「읽는 값 동일」 심사

1. **`SETTLE_MS`** — 컴포넌트 본문 → **모듈 스코프**(`tour-overlay.tsx:52`). 값은 리터럴 `700`, 클로저 의존 0.
   소비처 2곳(`:333` 초점 정착 타이머 · `:489` `settled` 타이머) 모두 같은 700 을 읽는다.
   옛 코드에서 `:324` 가 «선언보다 위»에서 읽던 자리가 L0 #4 인데, 효과 콜백은 렌더가 끝난 뒤 도므로
   **런타임 값은 옛 코드에서도 700 이었다**(TDZ 오류가 아니라 정적 규칙 위반이었다). ⇒ 거동 무변경.
2. **`style`** — placement 계산 `useLayoutEffect` **뒤** → `holeKey` **바로 뒤**(`:454`).
   산식은 **한 글자도 안 바뀌었다**(diff 의 삭제 블록과 추가 블록이 동일 · 추가분은 이유 주석뿐).
   - 입력 전부(`hole` `targetFillsViewport` `calloutH` `fitsBelow` `below` `placement` `clampLeft`)가 **새 자리보다 위**에 선언돼 있다(`placement` = `:448`). 아니었다면 TDZ 로 죽는다.
   - 옛 자리와 새 자리 **사이**에는 `useState`·`useEffect`·`useLayoutEffect` 선언만 있다 — **렌더 중 재대입이 0**이라
     같은 렌더에서 읽는 값이 동일하다(효과 콜백은 렌더 뒤에 돈다).
   - ⇒ 거동 무변경. 이동을 되돌리지 않고도 L2 lint 0 / L3 4건이 성립한 것이 방증이다.

### ⓓ import 삭제 3건 — 참조 0 실측

head `470f8c7` 각 파일 본문 grep: `Link` **0** · `IconQuestion` **0** · `TourStatus` **0**.

### ⓔ 콘솔 실오류 0 — 🔴 **못 잰 축(이름으로 남긴다)**

- `:8371`(pid 30424)·`:8370`(pid 33252)이 떠 있으나 **어느 트리·어느 커밋을 굽는지 귀속시키지 못했다** —
  `next start` 는 argv 에 경로가 없고, O-25 는 **거동 무변경 리팩터라 「처방이 실렸는가」를 물을 새 심볼·새 문면이 없다**.
  남의 무대의 초록을 이 PR 의 초록으로 옮기지 않는다.
- 대신 같은 착지 상태에서 **프로덕션 빌드**를 대체 축으로 찍었다(§3).
- **브라우저 콘솔 축은 미측정**이다. 필요하면 별건으로 무대 1본을 세워 잰다(cap 0 로 가능).

---

## 2. PR #732 (T7-3 U-06·U-07) — **PASS** (검증 중 sha 1회 갱신)

🔴 **측정 중 대상이 두 번 움직였다** — 판정 열을 sha 별로 분리해 찍었다.

| 열 | 무엇 | 커밋 | `pnpm test:unit` |
|---|---|---|---|
| **T0 대조군** | #732 **옛 sha** 를 **자기 출발점**(`59eabb5`) 위에서 | `bf35eb1` | rc 0 · **5파일 39/39 초록** |
| **T1 옛 sha × 착지 상태** | `379e70e`(**#733 포함**) + `bf35eb1` | `7a69f46` | **rc 1 · 1 failed / 38 passed** |
| **T2 새 sha** | `a181df4`(`379e70e` 를 **조상으로 품은** 리베이스본) | `a181df4` | **rc 0 · 5파일 39/39 초록** |
| **T3 변이 대조군** | T2 트리에서 `evidenceRef.required` 의 `sourceId` **1개만 제거** | (working tree) | **rc 1 · 2 failed / 37 passed** |

### T1 의 빨강 — 무엇이었나 (기록 보존)

```
FAIL lib/contract-validator.test.ts > U-07 중첩 > doc-chunk 는 같은 누락을 두 번 말한다 …
AssertionError: expected [ Array(1) ] to have a length of 2 but got 1
```

**귀속** — 검증기의 결함도 내 계측기의 결함도 아니었다. #733 이 정본 스키마의
`allOf.if(kind=doc-chunk).then.required` 를 `["evidenceId","kind","sourceId",…]` → `["revisionId","contentHash","stale"]`
로 줄이며 **`sourceId` 중복을 걷어냈고**, 그래서 그 누락이 **두 규칙 → 한 규칙**으로 줄었다.
T0 이 39 초록인 것이 「테스트가 원래 옳았다」를, T1 이 1 빨강인 것이 「계약이 그 사이에 바뀌었다」를 갈랐다.
🔵 그물이 제 일을 한 것이다 — 그 테스트의 주석이 스스로 「건수가 1로 바뀌면 이 테스트가 그 사실을 알린다」고 적어 두었다.

### T2 — 새 sha `a181df4` 는 그 자리를 어떻게 고쳤나

```
-  it("doc-chunk 는 같은 누락을 두 번 말한다 …")       -  expect(errors).toHaveLength(2);
+  it("doc-chunk 갈래도 한 문면·한 경로로 말한다(규칙이 몇 번 걸리든)")
+                                                     +  expect(errors.length).toBeGreaterThan(0);
```

**건수 리터럴을 걷어내고** 「말은 한 가지(`new Set(errors).size === 1`)·전부 그 중첩 경로(`.payload.evidence:`)」만 남겼다.
계약의 형상(한 결함이 몇 규칙에 걸리는가)은 움직이지만 **호출자가 읽는 사실**은 안 움직인다 — 판정선을 그 불변량에 옮긴 것이 옳다.

### T3 — 🔴 **느슨해진 그물이 아직 무는가**(검출력을 팔지 않았는가)

`toHaveLength(2)` → `toBeGreaterThan(0)` 은 **전부 통과시키는 쪽**으로 가는 수정이라, 초록만 보고 받으면 안 된다.
그래서 같은 트리에 **평범한 계약 위반 1건**을 심었다 — `evidenceRef.required` 에서 `sourceId` **하나만** 뺐다(= 계약이 그 키를 더는 요구하지 않는 상태).

- 결과: **2 failed / 37 passed** — 그중 하나가 **문제의 그 테스트**(`doc-chunk 갈래도 한 문면·한 경로로…`)다.
- ⇒ 느슨해진 뒤에도 **「누락을 아무도 잡지 않는다」를 여전히 빨강으로 만든다.** 검출력은 팔리지 않았다.
- 함께 죽은 다른 하나(`payload.evidence 안의 필수 누락은 중첩 경로로 나온다`)는 같은 자극의 정당한 사망이다.

### `-s ours` 병합 커밋 — 되돌림 위험 실측

`a181df4` 는 리베이스본(`bfa751a`)에 **옛 tip `bf35eb1` 을 `-s ours` 로 물린** 커밋이다. `-s ours` 는 상대편 트리를 통째로 버리므로
**「develop 의 변경을 조용히 되돌리는」 고전적 함정**이 있다. 실측으로 배제했다.

- `git merge-base --is-ancestor 379e70e a181df4` → **YES**(develop tip 이 조상 · develop 으로는 **fast-forward**).
- `a181df4:packages/contracts/agent-events-v0.1.schema.json` 의 doc-chunk 분기 = `["revisionId","contentHash","stale"]`
  ⇒ **#733 의 처방이 그대로 실려 있다.** 버려진 쪽은 옛 lane tip 이지 develop 이 아니다. **되돌림 0.**

### 심사(설계 논리) — 타당

동일 봉투에서 **손잡이 하나씩만** 어긋내 세 갈래(필수 누락·타입 불일치·여분 키)를 만들고,
`new Set(said).size === 3` 으로 **셋이 서로 구별되는가**를, `startsWith(".payload.evidence:")` ·
`".payload.candidates[0]:"` 로 **경로**를 잰다. 정상 봉투 자신을 **대조군 열**로 같은 실행에 두었고(`check(base)` = 0),
인용 라벨 4개의 **실재를 첫 테스트에서 계수**해 「케이스가 사라져 0건 실행이 초록으로 보이는」 길을 막았다.
문면 전체를 박지 않고 건수·경로·구별만 판정선으로 삼은 것도 옳다.
발주 문면의 `payload.evidence[0]` 가 정본에 없다는 것을 저자가 찾아내 `runCompleted.candidates[]` 로 옮긴 것도 맞다(정본 대조 확인).

---

## 3. 부가 축 — 프로덕션 빌드(착지 상태 `ba8edcd` = `379e70e` + #731)

| 축 | 명령 | rc | 결과 |
|---|---|---|---|
| 1차 (내 과실) | `pnpm build` (env 없음) | **1** | `next.config.ts` 가 `FKT_API_BASE` 부재를 거부 — **대상 결함이 아니다**(§5-4) |
| 2차 | `FKT_API_BASE=http://127.0.0.1:8813 pnpm build` | **0** | `Compiled successfully in 2.9s` |

⇒ 착지 상태가 **컴파일·타입 체크 초록**이다. 다만 이것은 ⓔ(브라우저 콘솔 실오류)의 **대체 축이지 같은 축이 아니다** —
`tour-overlay` 는 클라이언트 전용이라 빌드가 그 런타임 콘솔을 대신 재 주지 않는다.

---

## 4. 판정

| PR | 판정 | 근거 |
|---|---|---|
| **#731 (O-25)** | 🟢 **PASS** — 병합 가능 | L0 9 → L1 0 → L2(착지) 0 · L3 역대조군 4 · 단위 28/28 · 지시자 4 전건 줄 단위+사유+규칙 명시·호출 위치 무변경 · 이동 2 산식 동일·선언 순서 적법 · 삭제 3 참조 0 · **ⓔ 브라우저 콘솔 축만 미측정(이름으로 남김)** |
| **#732 (T7-3)** | 🟢 **PASS** — 병합 가능(`a181df4`) | T2 39/39 초록 · **T3 변이 대조군 2 failed** 로 느슨해진 뒤에도 무는 것을 확인 · develop 으로 **fast-forward** · `-s ours` 되돌림 **0**(#733 처방 실려 있음). 🔵 옛 sha `bf35eb1` 은 착지 상태에서 1 빨강이었고(T1) 그 자리가 `a181df4` 에서 고쳐졌다 |

## 5. 자수 (내 계측기)

1. `eslint -f compact` 를 먼저 썼다가 **rc 2** 로 죽었다(ESLint 9 에서 core 이탈). 기본 포매터로 재측정 — **rc 2 를 「빨강」으로 옮기지 않았다.**
2. 발주문의 `npm ci` 를 그대로 집행했으면 `package-lock.json` 부재로 죽어 「대상 결함」처럼 보였을 것이다 — 착수 전 lockfile 실측이 막았다(전언은 전언).
3. `git worktree add` 시점의 `origin/develop`(`59eabb5`)과 판정 시점의 tip(`379e70e`)이 달랐다 — 판정 직전 `git fetch` 로 tip 을 다시 찍고 착지 열을 그 위에 세웠다.
4. 첫 `pnpm build` 가 **rc 1** 로 죽었다 — 원인은 대상이 아니라 **내가 `FKT_API_BASE` 를 안 굽고 돌린 것**(`next.config.ts` 가 기본값을 거부한다). env 를 박아 재측정했고, **이 rc 1 은 판정에 넣지 않았다.**
5. **옛 sha 로 판정문을 먼저 쓸 뻔했다** — `bf35eb1` 로 FAIL 을 적어 두었는데 그 사이 `a181df4` 가 나왔다(오케 갱신 착신). 보고 «전»에 재측정해 T2·T3 열을 세웠고, T1 은 지우지 않고 «옛 sha 열»로 남겼다.
6. 배경 작업 래퍼가 `[exited with code 0]` 로 끝났는데 **안쪽 빌드는 rc 1** 이었다 — 래퍼 rc 가 아니라 본문 `build rc=` 줄로 판정했다.

## 6. 재현

```
git worktree add ../_wt/levi2-o25v -b lane/levi2-o25v origin/develop
cd apps/web-console && pnpm install --frozen-lockfile
git checkout 9f2c592 && pnpm exec eslint .                  # L0: 9 problems (6E/3W)
git checkout 470f8c7 && pnpm exec eslint .                  # L1: 0
git checkout 379e70e && git merge 470f8c7
pnpm exec eslint . && pnpm test:unit                        # L2: 0 / 28 passed
# L3 역대조군: set-state-in-effect 지시자 4줄만 삭제 후 eslint . -> 4 problems
git checkout bf35eb1 && pnpm test:unit                      # T0: 39/39
git checkout 379e70e && git merge bf35eb1 && pnpm test:unit # T1: 1 failed / 38 passed
git checkout a181df4 && pnpm test:unit                      # T2: 39/39 (새 sha)
# T3 변이 대조군: schema 의 evidenceRef.required 에서 sourceId 1개만 제거 후 pnpm test:unit -> 2 failed
```
