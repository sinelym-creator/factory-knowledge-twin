# O-27 검증 — 「등록 세션 출처 통일 + 응답 무변경」 (리바이2 49대)

- **발주** 스자쿠 44대 ③ · cap 0 · 상한 15분 · lane `levi2-o27v`
- **대상** PR #734 `lane/senku2-o27` **`bc549ae`**(3파일 · 출발 `59eabb5`) · **착지 기준** `origin/develop` **`0de6201`**(출발 이후 **15커밋** 앞섬)
- **판정** 🟢 **PASS — 병합 가능.** 5축(ⓐ~ⓔ) 전건 충족.
- 🔴 **다만 ⓔ 에서 «회귀 그물이 CI 에 안 닿는다»를 실측했다** — 병합 저지 사유는 아니지만 **원장 등재감**이다(§4).

---

## 0. 전언 정정 1건

| 발주문 | 실측 | 처치 |
|---|---|---|
| 「前 = 신규 테스트만 얹은 `HEAD~1`」 | PR #734 는 **커밋 1본**(`bc549ae`)뿐이라 `HEAD~1` = **출발점 `59eabb5`**, 즉 **테스트가 없다** | 前 열을 **내가 만들었다**: `origin/develop 0de6201` 위에 **신규 테스트 파일만** 얹고 처방은 얹지 않았다 |

🔴 전 열이 **빨강이라야** 후 열 초록이 뜻을 갖는다. 前 열에 자극(테스트)이 없으면 그 초록은 아무것도 안 가른다.

---

## 1. ⓐ 단위 층 前後 — 🔴 **환경 축까지 열로 펼쳤다**(2×2)

| | **前** = `0de6201` + **테스트만**(처방 없음) | **後** = `0de6201` + `bc549ae` 병합(`e76cc49`) |
|---|---|---|
| **langgraph 있음** | **rc 1 · 1 failed / 21 passed** | **rc 0 · 22 passed** |
| **CI 환경**(langgraph 없음 · pytest+pydantic+fastapi+pydantic-settings 4개만) | **rc 0 · 20 passed / 2 skipped** | rc 0 · 20 passed / 2 skipped |

**前 열의 빨강 문면(자극 도달 증거)**

```
FAILED tests_unit/test_run_registration_session.py::test_registration_uses_the_guard_session_not_the_body
AssertionError: assert 'body-session-2' == 'guard-session-3'
```

⇒ 처방 없는 나무에서 **정확히 그 한 건**이 죽고, 처방을 얹으면 **22 전건 초록**. ⓐ **충족**.
값 `'body-session-2'` 가 나온 것이 결함의 실체다 — 등록이 **본문** 세션으로 갔었다.

## 2. ⓑ 본문 `sessionId` 잔존 — 🔴 **「9곳」을 내가 다시 셌다**

| 자리 | 前(`59eabb5`) | 後(`bc549ae`) |
|---|---|---|
| `routers/investigations.py` 내 `body.sessionId` | **10** | **1** |
| 그중 «다시 읽어 쓰는» 자리(등록·재사용·상한·강등·stamp·로그) | **9** | **0** |
| 남은 1건 | — | **`:191`** = `session_id.is_valid(body.sessionId)` 형식 검사(ⓓ 가 유지하라고 한 그 자리) |

⇒ 센쿠2 전언 「9곳」 = **실측 일치**. **쓰는 자리 잔존 0**. ⓑ **충족**.

🔵 **범위 밖 관측 1건** — 리포 전체로는 `retrieval/service.py:55` 가 아직 `body.sessionId` 를 읽는다.
다만 그것도 **형식 검사 전용**이고(`_SESSION_RE.match`), 그 라우트는 「세션 저장소와 결합하지 않는다」가
성문(주석 `오케 판정 08-30 ④-1 · 원장 Q-18`)이라 **O-27 의 구멍이 아니다**. 등록·소유권을 만지지 않는다.

## 3. ⓒ 404 응답 무변경 · ⓓ 422 유지

| 축 | 前 | 後 | 판정 |
|---|---|---|---|
| 문면 상수 | `RUN_NOT_FOUND = "run {run_id} 를 찾을 수 없다"` (`:24`) | **문자열 동일**(`:28` · 자리만 이동) | 동일 |
| 404 발생 | `contract_error(404, "not_found", RUN_NOT_FOUND.format(run_id=run_id))` (`:54`) | **동일**(`:72`) | 동일 |
| 「없음」과 「남의 것」 합치기 | `record is None or not visible(...)` 한 줄 | 세 갈래로 **나눠 로그만 남기고** 셋 다 `None` 반환 | **응답 동일** |
| 세션 `None` 일 때 | `visible(record, None)` → `False`(함수 정의상 `session is not None and ...`) → `None` | 명시 갈래로 `None` | **동일** |
| **로그에 주인 세션 id** | — | `log.info("run %s 미가시 — …", run_id)` **×3 · 인자는 `run_id` 뿐** | **0건** |
| ⓓ 422 `:191` | `if not session_id.is_valid(body.sessionId): raise _error(422, "invalid_session_id", …)` | **그 자리 그대로** | 유지 |

⇒ ⓒ·ⓓ **충족**. 사유는 로그에서만 갈리고 **호출자에게는 한 문장**이다 — 존재 은닉이 문장에서 안 깨진다.

🔵 **새 갈래 1건(관측)** — `start_run` 에 `session is None → 401 session_required` 가 새로 생겼다(`# pragma: no cover`).
쓰기 라우트는 가드가 세션 없이 통과시키지 않으므로 **도달 불가**라는 것이 저자 주장이고, 소스상 그 주장은 성립한다
(`session_guard` 가 「쿠키≠본문 = 422 · 본문 단독 = 401」로 앞에서 끊는다). **도달 불가 갈래라 시험하지 않았다 — 못 잰 것으로 적는다.**

## 4. ⓔ CI skip 2 — 🔴 **수로는 남는다. 그런데 그 2개가 O-27 의 판정선이다**

- `pytest -q` 요약에 **`20 passed, 2 skipped`** 로 **수가 남는다**. `-rs` 로 이유도 나온다:
  `SKIPPED [2] tests_unit/test_run_registration_session.py:79: 라우터 import 체인이 요구 — CI 설치 목록에 없다`
  ⇒ 발주 문면 그대로의 ⓔ 는 **충족**(침묵하지 않는다).
- 🔴 **그런데 §1 표의 아랫줄을 보라 — CI 환경에서는 前後가 «완전히 같다»(둘 다 rc 0 · 20 passed / 2 skipped).**
  건너뛴 2개가 하필 **`test_registration_uses_the_guard_session_not_the_body`** 와 그 짝이다.
  ⇒ **CI 초록은 O-27 에 대해 아무 말도 하지 않는다.** 처방을 되돌려도 CI 는 초록이다(실측 = 前 열 CI 행 rc 0).
- **왜** — `.github/workflows/ci.yml:123` 이 `pytest·pydantic·fastapi·pydantic-settings` **4개만** 설치하고,
  테스트는 `pytest.importorskip("langgraph")`(`:79`)로 라우터 import 체인을 요구한다.
- **이것은 #734 의 결함이 아니다**(테스트는 정직하게 건너뛴다고 말한다). **CI 설치 목록의 범위 문제**다.
- **처치 후보(오케 판단)** — ⓐ CI 설치 목록에 `langgraph` 추가 ⓑ 라우터 import 없이 등록 경로만 부르게 테스트를 낮추기
  ⓒ 「skip 이 0이어야 하는 파일」 목록을 CI 게이트로 두기. **원장 등재 권고**(회귀 그물이 지키지 못하는 처방 1건).

## 5. 판정

| 축 | 결과 |
|---|---|
| ⓐ 단위 前後 | 🟢 前 1 failed(자극 도달) → 後 22 passed |
| ⓑ 본문 세션 재독 0 | 🟢 10 → 1(그 1 = ⓓ 가 유지하라는 형식 검사) · 쓰는 자리 **0** |
| ⓒ 404 문면·코드 무변경 · 로그에 주인 세션 id 0 | 🟢 문자열·발생 자리 동일 · 로그 인자는 `run_id` 뿐 |
| ⓓ 422 `:191` 유지 | 🟢 그 자리 그대로 |
| ⓔ CI skip 2 가 수로 남는가 | 🟢 남는다 — **다만 그 2개가 판정선이라 CI 는 이 처방을 못 지킨다**(§4 · 원장 권고) |

**⇒ PR #734 = PASS. 병합 가능.**

## 6. 자수 (내 계측기)

1. 메인 체크아웃 venv(`services/ai-api/.venv`)에 **pytest 가 없었다** — 런타임 전용이다. 「No module named pytest」를 대상 결함으로 옮기지 않고 내 venv 를 만들었다.
2. `requirements.txt` 전체 설치가 **실패**했다(`torch==2.13.0` 이 이 파이썬에 없다). 필요한 것은 4+1 패키지뿐이라 **CI 목록 그대로의 최소 venv 2본**(langgraph 유/무)으로 갈아탔다 — 결과적으로 **환경 축을 열로 펼치는** 더 나은 그물이 됐다.
3. 발주문의 「`HEAD~1` = 테스트만」이 틀렸다(커밋 1본) — 前 열을 **내가 조립**해 자극을 심었다. 그냥 `HEAD~1` 을 돌렸으면 **테스트 없는 초록**을 「前 열」이라 적을 뻔했다.
4. 前 열 측정 뒤 워크트리를 되돌릴 때 스테이징이 남아 있었다 — `checkout -- / reset / rm` 로 **dirty 0** 을 확인하고 後 열을 세웠다(`git status --porcelain` = 0줄 실측).

## 7. 재현

```
git worktree add ../_wt/levi2-o27v -b lane/levi2-o27v origin/develop     # 0de6201
python -m venv v-ci   && v-ci/Scripts/pip   install pytest==9.1.1 pydantic==2.13.5 fastapi==0.141.1 pydantic-settings==2.15.0
python -m venv v-full && v-full/Scripts/pip install (위 4개) langgraph

# 前 열 = develop + «테스트 파일만»
git checkout bc549ae -- services/ai-api/tests_unit/test_run_registration_session.py
cd services/ai-api && v-full/…/python -m pytest tests_unit -q   # 1 failed / 21 passed
                      v-ci/…/python   -m pytest tests_unit -q   # 20 passed / 2 skipped  <- CI 는 못 잡는다

# 後 열 = develop + #734
git checkout 0de6201 && git merge bc549ae                        # e76cc49
cd services/ai-api && v-full/…/python -m pytest tests_unit -q   # 22 passed
                      v-ci/…/python   -m pytest tests_unit -q -rs # 20 passed / 2 skipped (이유 문면 출력)
```
