# T7-6 — E2E 빈칸 3(E-11 · E-12 · E-13) (리바이2 49대)

- **발주** 스자쿠 44대 · cap 0 · 상한 40분 · lane `levi2-t76`
- **무대** 셸 **`:8820`**(pid 45120 · `_wt/levi2-t76` × `FKT_API_BASE=http://127.0.0.1:8190` **빌드 시점에 구움** · install rc 0 · build rc 0 · **좌석 트리 밖** `Win32_Process Create`) · 상류 `:8190`(정상 색인 + 정상 그래프)
  · E-12 0열 재사용 = **`:8815`** → `:8813`(정상 색인 + **빈** 그래프)
- **판정** **E-11 PASS(6/6 조합)** · **E-12 PASS(2열)** · **E-13 PASS(3축)**
- **그물** `tests/web/t76_e11_tour_walk.mjs` · `t76_e12_compare.mjs` · `t76_e13_document.mjs`

---

## 0. 발주 실물 대조 (전언을 내 눈으로 다시 읽었다)

`components/tour/tour-steps.ts:116~213` · `readAdvance():98` — **발주 문면과 일치**.

| # | id | route | target | advance |
|---|---|---|---|---|
| 1 | headline | `/overview` | **null**(환영 카드) | `"next"` |
| 2 | alarm | `/overview` | `alarm-card` | `"next"` |
| 3 | start | `/overview` | `start-from-alarm` | `{to: TOUR_REPLAY_HREF}` |
| 4 | timeline | `/incidents/` | `run-timeline` | `"next"` |
| 5 | candidate | `/incidents/` | `candidates` | `"next"` |
| 6 | evidence | `/incidents/` | `candidate` | **`{on:"click", of:"candidate"}`** |
| 7 | trust | **`/evidence/`** | `trust-header` | `"next"` |
| 8 | approval | `/evidence/` | null | `"next"` |
| 9 | done | `/evidence/` | null | `{to:"/overview"}` |

🔴 **그물에 이 표를 박지 않았다** — `t76_e11_tour_walk.mjs` 가 **정본 파일을 파싱해** 걸음 수·제목·대상·전이 방식을 읽는다.
「9걸음」도 내가 센 것이 아니라 정본이 준 수다. 투어가 바뀌면 그물은 정본을 따라간다(무대·이름·순서를 인자로).

---

## 1. E-11 — 9걸음 완주 · **6조합 전건 PASS**

| 엔진 | 뷰포트 | 걸음 | 제목=정본 | 스포트라이트=정본 | 대상 화면 실재 | `tour-target-missing` | **반증 열** | `/overview` 착지 | 재열기 배지 | console err | page err |
|---|---|---|---|---|---|---|---|---|---|---|---|
| chromium | 390×844 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | 0 |
| chromium | 1280×800 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | 0 |
| firefox | 390×844 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | 0 |
| firefox | 1280×800 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | 0 |
| webkit | 390×844 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | **1**(§4 관측) |
| webkit | 1280×800 | **9** | ✅ | ✅ | 6/6 | 0 | **전이 0** | ✅ | ✅ | 0 | **1**(§4 관측) |

**대기는 인자로 선언했다** — `--settle 1200`(오버레이가 대상 사각형을 렌더 «뒤»에 재고 `SETTLE_MS`=700ms 뒤 자리를 확정한다).

### 🔴 반증 열이 이 초록의 값이다

6번째 걸음(`{on:"click", of:"candidate"}`)에서 **후보가 아닌 곳**(말풍선 모서리)을 먼저 눌렀다 → **제목 불변 = 전이 0**.
그 다음에 후보 안의 근거 링크를 눌러 전이시켰다. 이 열이 없으면 **「아무 클릭에나 넘어가는 투어」도 같은 초록**을 낸다.

### 우회 0

내부 상태 주입·스텝 건너뛰기·`?step=` 조작 **없음**. 전이 수단은 화면의 셋뿐 —
`tour-next` 클릭 · `tour-goto` 이동 뒤 **URL 전이 실측**(시계가 아니라 사건) · **대상 요소 클릭**.

---

## 2. E-12 — `/compare` 화면이 **상류를 그대로 그리는가**

🔴 「열 3개가 그려졌다」는 판정선이 아니다. **전략별 화면 hit 수 = 그 실행의 `/compare` 응답 JSON 수**를 잰다.
응답을 **같은 실행에서 가로채** 두 수를 짝지어 본다(총계만 맞추면 열이 뒤바뀐 화면도 통과한다).

| 열 | 셸→상류 | 상류 JSON(v/h/g) | 화면 hits(v/h/g) | **짝별 일치** | 전략 집합 일치 | 근거 칩 합 | graphrag 「결과 없음」 문면 | console err |
|---|---|---|---|---|---|---|---|---|
| **CTRL** | `:8820`→`:8190` | **5 / 5 / 5** | **5 / 5 / 5** | ✅ | ✅ | **15** | 안 보임 | 0 |
| **ZERO**(X-23 B 열 재사용) | `:8815`→`:8813` | **5 / 5 / 0** | **5 / 5 / 0** | ✅ | ✅ | **10** | **보임** | 0 |

- 승인 질문은 **화면이 준 목록 10개**에서 골랐다(`Q-MULTIHOP-001` · 지어내지 않았다).
- ZERO 열이 **대조군**이다 — 0 인 열까지 상류를 그대로 따라가는 것을 보이며, 「화면이 늘 5를 그린다」와 구별한다.

---

## 3. E-13 — `/documents/[docId]`

문서 id 는 **DB 에서 뽑았다**(지어내지 않는다):
`docker exec fkt-levi2-postgres-1 psql -U fkt -d fkt -c "select id from document order by id limit 3"` → `DOC-MAN-0021` 외 2건.

| 축 | 입력 | 측정 | 판정 |
|---|---|---|---|
| 있는 문서 | `DOC-MAN-0021` | HTTP **200** · `document-view` **있음** · 본문 **5045자** · id 문면 노출 | ✅ 렌더 |
| **없는 문서** | `DOC-NO-SUCH-999999` | `document-view` **없음** · `screen-unavailable` **있음** `data-kind="not-found"` · **지어낸 본문 0자** · 화면 전체 436자(안내문뿐) | ✅ 「없다」고 말하고 **안 지어낸다** |
| 근거→문서 링크(E-05 연결) | `/evidence/DOC-MAN-0021@r1#005` | 링크 **있음** `href=/documents/DOC-MAN-0021?highlight=DOC-MAN-0021%40r1%23005` → 클릭 → 그 URL 착지 · `document-view` **있음** | ✅ 착지 |

console error 0 · page error 0.

---

## 4. 🔴 관측 1건 — WebKit RSC 프리페치 오류 (**귀속 미완 · 이름으로 남긴다**)

```
Fetch API cannot load http://<host>:8820/overview?_rsc=<hash> due to access control checks.
```

- **6조합 중 webkit 2조합에서만** 뜬다. chromium·firefox 0건.
- **투어는 그래도 완주한다** — 9걸음·착지·배지·console error 0. 진행을 막지 않는다.
- **내가 배제한 것** — 호스트 표기 탓이 아니다. `127.0.0.1` 과 `localhost` **양쪽에서 재현**했다(같은 문면).
- **내가 못 한 것** — 다른 빌드/다른 셸에서도 나는지(= 이 트리의 성질인지 Next 16 × WebKit 의 성질인지)를 못 갈랐다.
  **그래서 결함으로 회부하지 않는다.** 재현 절차만 남긴다: `--engines webkit --sizes 1280x800` 로 E-11 을 돌리면 매회 나온다.
- 🔵 참고: `localhost` 회차에서는 page error **2** · console error 1 로 **수가 흔들렸다**(프리페치 회수 차이로 보인다) — 이것도 결론이 아니라 관측이다.

---

## 5. 자수 (내 계측기 · 전부 판정에 안 넣었다)

1. **첫 E-11 은 정착 전에 읽었다** — 걸음 2·3·7 이 「스포트라이트 없음」, `tour-target-missing` **2건**으로 나왔다.
   대상 사각형은 렌더 «뒤»에 재고 `SETTLE_MS`(700ms) 뒤 자리를 잡는다. `--settle 1200` 을 **인자로 선언**하고 다시 재니 warn **0**.
   🔴 이 빨강을 그대로 올렸으면 **없는 결함 3건**을 지어낼 뻔했다.
2. **후보 «카드»를 눌렀다가 걸음 7이 결함처럼 보였다.** 6번째 걸음의 본문은 「후보 카드 «안»의 근거 ID 를 누르라」이고,
   7번째 걸음의 route 는 **`/evidence/`** 다. 카드만 누르면 투어는 넘어가지만 화면은 `/incidents/` 에 남아
   `trust-header` 가 없다 — **내 그물이 사람보다 «덜» 한 것**이지 대상의 결함이 아니다. 안에 링크가 있으면 그 링크를 누르게 고쳤다.
3. **MSYS 경로 변환**이 `--evidence /evidence/...` 를 `C:/Program File...` 로 바꿔 E-13 이 죽었다 → `MSYS_NO_PATHCONV=1`.
4. **E-13 링크 축에 `MR-2025-0087`(정비 이력)을 썼다** — 문서 링크가 없는 종류다. `linkFound=false` 를 결함으로 옮기지 않고
   **doc-chunk 근거**(`DOC-MAN-0021@r1#005`)로 바꿔 다시 쟀다. 이 축은 «문서를 가진 근거»여야 성립한다.
5. WebKit 오류의 귀속을 끝내지 못했다(§4) — **모르는 것을 판정으로 적지 않는다.**

## 6. 재현

```
# 무대 — 목적지는 빌드 시점에 굽고, 서버는 좌석 트리 밖에서 띄운다
cd apps/web-console && pnpm install --frozen-lockfile && FKT_API_BASE=http://127.0.0.1:8190 pnpm build
#   Win32_Process Create 로 `next start -p 8820`

cd tests/web && npm ci
node t76_e11_tour_walk.mjs --base http://127.0.0.1:8820 \
     --canon ../../apps/web-console/components/tour/tour-steps.ts \
     --engines chromium,firefox,webkit --sizes 390x844,1280x800 --settle 1200
node t76_e12_compare.mjs --base http://127.0.0.1:8820 --label CTRL --needle "AL-20260826-0041"
node t76_e12_compare.mjs --base http://127.0.0.1:8815 --label ZERO --needle "AL-20260826-0041"
MSYS_NO_PATHCONV=1 node t76_e13_document.mjs --base http://127.0.0.1:8820 \
     --real DOC-MAN-0021 --fake DOC-NO-SUCH-999999 --evidence "/evidence/DOC-MAN-0021@r1%23005"
```
