# O-28 검증 — 「라우터를 live 체인에서 풀되, 기동 축은 그대로」 (리바이2 49대)

- **발주** 스자쿠 44대 · cap 0 · 상한 10분(소폭 초과 · §5-1) · lane `levi2-o28v`
- **대상** PR #741 `lane/senku2-o28` **`8456e67`**(3파일 · merge-base `fb45c72`) · **착지** `origin/develop` `e0ae716` + #741 = **`178e2d6`**
- **판정** 🟢 **PASS — 병합 가능.** ⓐ~ⓓ 전건 충족.
- **이 티켓의 뜻** — O-27 검증에서 내가 낸 「**CI 열에서 前後가 동일 = 죽은 그물**」을 처방한 것이다. 그래서 판정선도 **그 열이 살아났는가**다.

---

## 1. 계측기부터 실측 (전언 아님)

| venv | `importlib.util.find_spec("langgraph")` | 용도 |
|---|---|---|
| **v-ci**(CI 설치 목록 4종: `pytest 9.1.1`·`pydantic 2.13.5`·`fastapi 0.141.1`·`pydantic-settings 2.15.0`) | **`None`** | ⓐⓑⓒ |
| **v-full**(위 4종 + `langgraph`) | FOUND | (ⓓ 에서 **부적격** 판명 · §5-2) |
| **실 런타임 venv**(`services/ai-api/.venv` · `:8190` 무대를 돌리는 그것) | FOUND | ⓓ |

## 2. ⓐ CI 패키지 집합에서 단위 층이 **전건 실행**되는가

```
v-ci × 178e2d6 :  python -m pytest tests_unit -q
->  rc 0 ·  22 passed, 12 subtests passed        (요약에 skipped 항목 없음 = 0 skipped)
```

**PASS.** O-27 때 같은 venv 에서 **20 passed / 2 skipped** 였다 — 건너뛰던 2건이 **이제 돈다**.

## 3. ⓑ 🔴 **그 열이 실제로 무는가**(처방 되돌림 대조군)

같은 무대(`178e2d6`)에서 **#734 처방 1줄만** 되돌렸다(`session_id=session` → `session_id=body.sessionId`).

```
v-ci × 되돌린 트리 :  rc 1 ·  1 failed, 21 passed
FAILED tests_unit/test_run_registration_session.py::test_registration_uses_the_guard_session_not_the_body
```

원복 즉시 실행 → `git status --porcelain` **0줄**.

⇒ **PASS.** O-27 검증에서 이 자리는 **CI 환경에서 초록**이었다(前後 동일). 지금은 **빨강**이다.
**「테스트가 있다」·「통과한다」와 «그 환경에서 문다»는 다른 사실**이고, 셋째가 회귀를 막는다.

| | O-27 시점(CI 집합) | **지금(#741 착지)** |
|---|---|---|
| 처방 있음 | 20 passed / **2 skipped** | **22 passed / 0 skipped** |
| 처방 되돌림 | 20 passed / **2 skipped**(**초록**) | **1 failed / 21 passed**(**빨강**) |

## 4. ⓒ 기동 축은 **여전히 먼저 죽는가** · ⓓ 라우터는 **같은 runner** 를 부르는가

### ⓒ 두 줄 재현 (v-ci · langgraph 없음)

```
python -c "from app.routers import investigations"           ->  OK
python -c "from app.main import create_app; create_app()"    ->  ModuleNotFoundError: No module named 'langgraph'
```

**PASS.** 라우터 모듈만 체인에서 풀렸고, **서버 기동은 그대로 그 자리에서 죽는다**(`app/main.py:178`
`from .investigation import runner as _live_runner  # noqa: F401` 실재 확인). 옮긴 것은 **시점**이지 **성질**이 아니다.

### ⓓ 실 런타임 venv

```
create_app()                                   ->  OK · routes = 28
inv._runner() is app.investigation.runner      ->  True     (사본이 아니라 «같은 모듈 객체»)
hasattr(start), hasattr(request_stop)          ->  True True
'langgraph' in sys.modules                     ->  True
```

**호출 자리 계수(착지 트리 소스)**

| 축 | 값 |
|---|---|
| `_runner().` 호출 | **2곳** — `:327 _runner().start(` · `:389 _runner().request_stop(` (= 발주 문면과 일치) |
| 모듈 최상위 `from ..investigation import runner` | **0** (지연 접근자 `_runner()` 안 `:83` 으로만 남음) |
| 코드에 남은 `runner.` 직접 참조 | **0** — grep 이 잡은 1건은 **주석**(`:276`)이다 |

**PASS.** 「지연으로 바꿨다」가 **호출 대상까지 같은 것**임을 객체 동일성으로 확인했다 —
`is` 로 묻지 않으면 「같은 이름의 다른 모듈」과 구별되지 않는다.

## 5. 자수

1. 상한 10분 소폭 초과 — ⓓ 에서 **내 venv 가 먼저 죽어**(§5-2) 대조군을 한 번 더 돌렸다.
2. 🔴 **ⓓ 를 v-full(4종+langgraph)로 재려다 「대상 결함」을 지어낼 뻔했다.**
   `create_app()` 이 `RuntimeError: 면제 목록의 라우트가 어긋났다 [documents/evidence/health/live-status/sessions]` 로 죽었다.
   **대조군으로 갈랐다** — **`develop`(#741 «없는» 트리)에서도 같은 예외**가 났고, 실 무대 `:8190` 은 `/api/health` **200** 이다.
   ⇒ **내 최소 venv 의 산물**(런타임 의존이 빠져 라우트 집합이 달라진다). 실 런타임 venv 로 갈아타 다시 쟀다.
   그대로 올렸으면 **#741 과 무관한 빨강**을 회부할 뻔했다.
3. ⓑ 의 되돌림은 **작업 트리에서만** 했고 즉시 원복해 `git status` 0줄을 실측했다(커밋에 안 섞였다).

## 6. 재현

```
git worktree add ../_wt/levi2-o28v -b lane/levi2-o28v origin/develop && git merge 8456e67   # 178e2d6
v-ci/Scripts/python -c "import importlib.util as u; print(u.find_spec('langgraph'))"        # None
cd services/ai-api
v-ci/…/python -m pytest tests_unit -q                                                        # 22 passed, 0 skipped
#   ⓑ: session_id=session -> session_id=body.sessionId 로 1줄 되돌린 뒤 같은 명령            # 1 failed / 21 passed
#       -> git checkout -- 로 즉시 원복
v-ci/…/python -c "from app.routers import investigations"                                    # OK
v-ci/…/python -c "from app.main import create_app; create_app()"                             # ModuleNotFoundError: langgraph
<실 런타임 venv>/python -c "from app.main import create_app; create_app()"                    # OK, routes=28
```
