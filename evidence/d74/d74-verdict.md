# D-74 — e2e 기본 API 가 `:8000`(센쿠2 대역)이던 것을 제거

> 검증 좌석(리바이2 46대) · 발주 = 스자쿠 40대 23:20 · lane `levi2-d74d73` · 출발 sha `5894204`
> 측정 = 2026-09-04 23:24:33~23:25:06 KST · **cap 0**(공개면 자극 없음 · 로컬 무대만)

---

## 0. 판정 한 줄

**처방 착지 · 양 열 확인.** 미지정 실행은 브라우저가 뜨기 «전» globalSetup 에서 **즉시 실패 + 문면
1줄**로 죽고, `FKT_API_BASE` 를 지정한 실행은 **preflight 를 통과**한다.

---

## 1. 무대 (포트→PID 실측 · `/health.build` 는 로컬이라 `unknown` — 아래 대체 증인 사용)

| 역할 | 주소 | PID | 증인 |
|---|---|---|---|
| ai-api | `http://127.0.0.1:8190` | **35920** | `/api/live/status` 200 · `POST /api/sessions` **200** · `/openapi.json` paths **22**(preflight 하한 10) |
| 셸 | `http://127.0.0.1:8196` | **45368** | `/overview` **307**(쿠키 없는 가드 홉 — preflight 가 요구하는 값) |

🔴 로컬 빌드는 `/api/health.build` 가 **`unknown`** 이라 sha 귀속에 쓸 수 없다. 그래서 무대 증인을
**계약 표면 깊이(paths 22)** 와 **가드 홉(307)** 으로 대신 세웠다 — 얕은 스텁이면 둘 다 못 낸다.

---

## 2. 고친 것 — 기본값 5곳 + 안내 문면 3곳

**기본값 제거(`FKT_API_BASE ?? "http://127.0.0.1:8000"` → 미지정 시 즉시 실패):**

| 파일 | 줄(출발 sha 기준) |
|---|---|
| `tests/web/e2e/preflight.ts` | 11 |
| `tests/web/e2e/phase2-evidence.spec.ts` | 14 |
| `tests/web/e2e/session-guard.spec.ts` | 3 |
| `tests/web/e2e/t3-2-screens.spec.ts` | 19 |
| `tests/web/q39c_entry_drill.mjs` | 28 |

형태는 **리포 안 선례를 그대로 따랐다**(지어내지 않았다) — `d11_retry_observation.mjs:16-17` ·
`d21c_polling_probe.mjs:31,37`(「기본값 없음 · Q-62」). `.ts` 는 `throw`(globalSetup·collection 시점에
죽어야 브라우저가 안 뜬다), `.mjs` 는 `console.error` + `process.exit(2)`.

**안내 문면 `--port 8000` → `--port <내 포트>` + `FKT_API_BASE` 필수 표기:**
`tests/web/e2e/preflight.ts`(실패 안내) · `tests/web/playwright.config.ts:11`(주석) ·
`tests/web/README.md:44`.

---

## 3. 검증 2열

### 열① 대조군 — `FKT_API_BASE` 미지정 (**즉시 실패 · 빨강**)

```
Error: 🔴 측정 불가 — `FKT_API_BASE` 를 지정하라(기본값 없음 · D-74 · 무접촉 대역 `:8000`·`:8010`·`:8787` 금지).
   at preflight.ts:15
```
`npx playwright test e2e/session-guard.spec.ts` · rc **1** · **브라우저 0개 기동**(globalSetup 에서 죽는다) ·
문면 **1줄**. → 미지정 실행이 남의 서버를 조용히 재는 길이 **닫혔다**.

### 열② 대상 — `FKT_API_BASE=http://127.0.0.1:8190` (**preflight 통과**)

`t3-5-wo-screen.spec.ts` 실행이 preflight 를 지나 **7 케이스 전부 실행**됨(3 passed / 4 failed · 30.4s).
**preflight 통과 1건 = 확보.** (그 4 failed 는 D-74 축이 아니다 — §5 참조.)

---

## 4. 안 고친 것 — «세기만» (판정문에 남긴다)

1. **`tests/api/*.py` — 27 파일 · 32 줄**이 `os.environ.get("FKT_API_BASE", "http://127.0.0.1:8000")`
   로 같은 계보다. **발주가 이 티켓 밖으로 정했으므로 수리하지 않았다.** 같은 오측정 장치가 python
   드릴 쪽에 그대로 남아 있다 — 별도 티켓 권고.
2. 🔴 **`tests/web/contract_surface_drill.mjs:96` 은 고치면 안 된다.** 그 `http://127.0.0.1:8000/api/...`
   는 대상 호출이 아니라 **「절대 URL 금지」 검사에 주입하는 위반 샘플**이다. 지우면 그 검사가 물 대상을
   잃고 **판정력 없는 초록**이 된다. 손대지 않았다.
3. **`FKT_WEB_BASE ?? "http://127.0.0.1:3101"` 3 곳**(`e2e/preflight.ts:10` · `e2e/mode-badge.spec.ts:110`
   · `e2e/shell.spec.ts:34`). 같은 «남을 가리키는 기본값» 계보지만 `:3101` 은 알려진 무접촉 대역
   (`:8000~8003`·`:8010`·`:835x`·`:836x`·`:8787`) **밖**이라 D-74 의 근거가 그대로 서지 않는다.
   발주도 API 축만 지목했다 — **세어서 회부**한다.
4. `benchmarks/**` 에는 같은 계보 **0 건**.

---

## 5. 🔴 D-74 축 밖에서 관측된 것 — D-73 대조군이 **전언과 다르다**

같은 실행에서 `t3-5-wo-screen.spec.ts` 의 빨강이 **4 건**이었다 — 발주가 인계한 **③④⑥ 3 건이 아니다.**

| 케이스 | 줄 | 결과 |
|---|---|---|
| ③ 잠금 | 328 | **FAIL** |
| ④ 반려 | 403 | **FAIL** |
| **⑤ 승인** | **455** | **FAIL** ← 인계 목록에 없던 건 |
| ⑥ 소유권 | 516 | **FAIL** |

그리고 ⑥ 의 실패 문면이 무대를 가리킨다:

```
Expected substring: "그런 작업지시 초안이 없다"
Received string:    "④ 작업지시서 · WOD-7225f83eee71·
                     요청한 항목을 찾을 수 없습니다.·
                     사유: 서버에 닿지 못했습니다.· …"
```

「**서버에 닿지 못했습니다**」는 **셸이 자기 API 에 못 닿았다**는 문면이다. 내 조합은 테스트가
`:8190` 에 초안을 만들고 화면은 **셸 `:8196` 이 보는 다른 API** 에 물은 것일 수 있다(그 셸은 내가
띄운 것이 아니다 — `/api/health` 의 의존 latency 가 `:8190`(77ms·7ms)과 셸들(2~3ms)로 갈린다).

🔴 **그러므로 이 4 건의 빨강으로 (a)스펙 낡음 / (b)자극 결함 / (c)대상 결함 을 가르면 안 된다.**
「대조군은 짝 통째로」 — 셸과 ai-api 를 **내 짝**으로 세운 뒤 다시 재야 한다. D-73 판정은 그 다음이다.

---

## 6. 잰 것 / 안 잰 것

- **잰 것**: 열①(미지정 즉시 실패 · 문면 1줄 · 브라우저 0) · 열②(preflight 통과) · 기본값 잔존 0 ·
  `--port 8000` 문면 잔존 0(`tests/web`) · 무대 포트→PID.
- **안 잰 것**: 고친 4 개 spec 중 `phase2-evidence`·`session-guard`·`t3-2-screens` 는 **열②를 각각
  돌리지 않았다**(preflight 는 globalSetup 이라 한 번 통과하면 전 스펙에 같다 — 그래도 「그 스펙이
  기존 초록을 유지하는가」는 **이 문서가 말하지 않는다**). `q39c_entry_drill.mjs` 도 실행하지 않았고
  **정적 치환만** 확인했다.
