# D-85 재검 판정문 — GS-01 live run n=3 (리바이2 52대 · 2026-09-05)

> 대상 = #782 `b1d7a33`(D-85 처방 · graph 투영분을 인용 후보에 싣기) · 무대 = develop 스택 `:8020`
> 판정 = ✅ **PASS** — 판정선 「지표 7 `requiredHit` **≥1/2**」를 **3 run 전건** 충족(2/2 · 2/2 · 1/2)
> 구독 소비 **3발**(상한과 동일 · 재시도 0) · production 3면 호출 **0**

## 0. 전제 — 내 손 실측(전언 아님)

| 축 | 값 |
|---|---|
| `:8020 /api/health` `build` | **`b1d7a33`** = `origin/develop` tip |
| `/api/live/status` | `online: true` |
| 컨테이너 | `e9ca3925ac17` · `StartedAt 12:59:37Z` · `fkt-ai-api:dev-b1d7a33` |
| `:8797` 귀속 | `python.exe -u …/_wt/develop-stage/services/synthesis-gateway/gateway.py` (pid 45448) |
| 🔴 교정 게이트 | **15/15** 를 «쏘기 전»에(구독 0) — 새 2칸(`evidence_duplicates_counted`·`out_guard_both_sides`) 포함 |
| 채점기 | `benchmarks/run-eval-answer-v0.3.mjs` — develop 판 **수정 0** |

발사 run: `RUN-9bf3ec2d1012` · `RUN-6bcc7c84c747` · `RUN-f93a4169b5f8` (usable 3/3 · excluded 0).

## 1. 판정 표 — before(#778 O-33 raw 재채점) vs after(3 run @ `b1d7a33`)

| 축 | before | after | 판정 |
|---|---|---|---|
| 🔴 **지표 7 `requiredHit`** | **0/2 · 0/2 · 0/2** | **2/2 · 2/2 · 1/2** | ✅ **판정선(≥1/2) 3/3 충족** |
| 근거집합 uniq | 23 · 23 · 23 | 23 · 23 · 23 | ✅ 불변 |
| 근거 **중복**(그물이 잰 값) | raw 23 / uniq 23 → **0** | raw 23 / uniq 23 → **0** | ✅ **dup 0** |
| 자극 실재(두 id) | True | True | ✅ |
| 지표 6 `byId`/`byAlias` | 0 / 0 | 0 / 0 | ✅ 불변(O-33 에서 이미 0) |
| 지표 1 narrow/wide | False / False | False / False | ✅ 불변 |
| 지표 5 entry / 문장 | 0 / 0 | 0 / 0 | ✅ 불변 |
| 지표 8 총 ms(중앙) | 14310 | **13640** | 🔵 −0.67s |

**처방 실림 확인은 «1발»로 했다**(발주 절차대로): 첫 run 의 `citedEvidenceIds` 에
`DOC-SOP-0014@r2#001`·`DOC-SAF-0029@r3#000` 이 **둘 다** 들어왔다. 안 들어왔으면 거기서 멈추고
남은 2발을 태우지 않았을 것이다.

🔴 **「≥1/2 충족」과 「항상 둘 다」는 다른 사실이다.** 3 run 중 2건이 2/2, 1건(`RUN-f93a4169b5f8`)이
**1/2**(`DOC-SAF-0029@r3#000` 미인용). 판정선은 3/3 충족이지만 **인용은 아직 비결정적**이다 —
「항상 둘 다 인용한다」를 원하면 그것은 **별도의 판정선**이고, 이 창은 그것을 만족하지 않는다.

## 2. 채점기 교정(내 그물이 무뎌지지 않았는가)

`--baseline-raw`(#758 `02e186f` · O-33 «전» raw)로 같은 실행에서 재채점:
`before m6.byId = [1,1,1]` · `after = [0,0,0]` · **`baselineStable = true`** ⇒ 옛 raw 가 지금 채점기로도
옛 값을 그대로 낸다. 그래서 위 after 값은 **대상의 것**이지 채점기 변화가 아니다.

## 3. 🔴 회부 1 — 교정 열의 안정성 검사가 «옛 기준선의 값»을 박아 두었다

발주가 지정한 대조군(#778 O-33 raw)으로 `--baseline-raw` 를 돌리면 채점기가 **`exit 2`** 로 죽는다:

```
[calibration] before m6.byId=[0,0,0] after=[0,0,0] baselineStable=false
EXIT2: baseline drifted under the current scorer - after-values are NOT attributable to the target
```

원인은 `baselineStable_expect_all_1` — **「before 의 지표 6 은 전부 1이어야 한다」**를 상수로 박은 것이다.
그 1 은 **O-33 «전» 기준선의 사실**이었고, O-33 이 그 값을 0 으로 만든 뒤로는 **참이 아니다.**
즉 「기준선이 흔들렸다」가 아니라 **「기대가 낡았다」**인데 문면은 전자를 말한다.

**처방** = 상수 대신 **그 기준선이 만들어질 때 기록된 자기 값**(그 raw 의 report json)과 대조한다.
그러면 기준선이 정당하게 움직여도 교정 열이 살아 있고, 진짜 drift 만 잡는다.
이번 창에서는 **#758 을 교정용으로**(위 §2), **#778 을 비교용으로**(§1) 따로 돌려 두 사실을 모두 얻었다.

## 4. 근거 등급

- **E1(실측)** — §1·§2 표 전부 · 게이트 15/15 · 3 run raw · §3 의 `exit 2` 재현.
- **E3(소견)** — 인용 비결정성(1/2 가 나온 run)의 원인은 이 창 밖. 표본 3으로는 빈도를 말할 수 없다.

## 5. 산출물

| 파일 | 내용 |
|---|---|
| `benchmarks/eval-answer-raw-v0.5-d85.jsonl` | 3 run raw(이벤트 원문 · 발사 즉시 파일화) |
| `benchmarks/eval-answer-raw-v0.5-d85-report.json` | 채점 + `calibration`(#758 기준 · `baselineStable = true`) |
| `benchmarks/eval-answer-raw-v0.5-d85-gate.json` | 교정 게이트 15칸 |
