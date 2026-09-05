# D-87 재검 — FastAPI 문서 표면 4종 (Q-35 · §32.8 ⑤)

> 검증 좌석 리바이2 **54대** · 발주 = 스자쿠 49대(D-87 재검) · lane `lane/levi2-d87r` @ 기점 `origin/develop` **`778dd4a`** ·
> 대상 = 격리 무대 **`:8090` `fkt-senku2-d87-api`**(이미지 `fkt-ai-api-d87:dev-96ae199`) · 그물 = `tests/security/gate7_admin_surface.py`(무변) ·
> 정본 = Q-35(원장 L172) · 처방 = #826 `96ae199`("close FastAPI doc surface by default (D-87)") · 측정 2026-09-06 07:1x KST · 근거 **E1**(실측).
> 🔴 **측정 모델: claude-opus-4-8(폴백)**(세션 cmdline = opus-5 · 세션 중 system-reminder 폴백 전환).
>
> **판정 = D-87 해소(RESOLVED · ⑤ FAIL → PASS) · 대상 결함 잔존 0.**

---

## §0 귀속 — 창을 열기 «전»에 대상이 처방을 실었는가

🔴 **판정선을 열기 전 3중 귀속**([[fkt-verify-the-target-carries-the-fix]] · 「처방이 있을 때만 나오는 값」):

| 축 | 실측 | 뜻 |
|---|---|---|
| 자기 신고(build) | `/api/health` `build=96ae199` | 컨테이너가 «처방 커밋»을 신고 |
| 커밋 정체 | `96ae199` = "fix(ai-api): close FastAPI doc surface by default (D-87)" · `5094c5f`(발주 병기) = docs-only(`96ae199` 의 «후손») | 처방의 **코드**는 96ae199 · 5094c5f 는 env 템플릿 문서 |
| 처방 심볼(코드) | `main.py:143-145` `docs_url=... if settings.expose_api_docs else None`(redoc·openapi 동) · `expose_api_docs` 기본 **False**(`settings.py:140`) · 컨테이너 env `FKT_EXPOSE_API_DOCS` **부재** | 처방이 «켜진» 조건(docs off)이 실재 |
| 거동(자기 신고 아님) | Q-35 4종 200→**404** 가 **대조군 B 401 이 서는 같은 실행에서** 뒤집힘(§2) | 신고가 아니라 «처방이 있을 때만 나오는 값» |

⇒ 자기 신고(build)만으로 열지 않았다 — 커밋 정체 + 코드 심볼 + 거동 뒤집힘이 함께 「이 창은 처방을 실은 대상의 것」을 세운다([[fkt-behaviour-beats-self-report]]).

---

## §1 판정선 (발주 확정)

1. Q-35 4종(`/docs`·`/redoc`·`/openapi.json`·`/docs/oauth2-redirect`) = **404 또는 401/403**(200 = FAIL).
2. 🔴 **대조군 B `/api/scenarios` = 401/403 «같은 실행»** — 안 서면 그 초록은 **무효**(EXIT 2). 「4종 404」가 「이 4종만 off」인지 「가드가 통째로 꺼져 전부 404」인지를 이 한 줄이 가른다.
3. 대조군 A `/api/health` = 200(서버 생존).

---

## §2 전 / 후 2열

| 표면 | 전 (#820 판정문 · 🔴 전언) | 후 (54대 E1 실측 `:8090`) | 판정 |
|---|---|---|---|
| `/docs` | **200**(≥2048B · HTML) | **404** | 뒤집힘 ✓ |
| `/redoc` | **200** | **404** | 뒤집힘 ✓ |
| `/openapi.json` | **200** | **404** | 뒤집힘 ✓ |
| `/docs/oauth2-redirect` | **200** | **404** | 뒤집힘 ✓ |
| 그 밖 10종(`/metrics`·`/admin`·`/.env`·`/api/docs` 등) | — | **전건 404** | PASS |
| **대조군 A** `/api/health` | 200 | **200** | 서버 생존 |
| **대조군 B** `/api/scenarios` | 401(가드 생존 · #820) | **401** | 🔴 **가드 생존 — 같은 실행** |

- 그물 실측 요약: `surfaces=14 fail=0` · rc **0**.
- 🔴 **전 열은 전언이다**(#820 값 · 재실행 불가 — 대상이 이미 고쳐졌다). 후 열만 내 E1 실측이다([[fkt-inherited-values-are-hearsay]]).
- 🔴 **대조군 B 가 401 로 «같은 실행에서» 섰다** → 4종의 404 는 「가드 통째 붕괴」가 아니라 «문서 표면만 off»다. 대조군 B 가 404 였다면 이 창의 200/404 는 아무것도 못 가르고 EXIT 2 였을 것이다(그물이 그 갈래를 자기 안에 심어 뒀다).

---

## §3 기전 · 남는 것

- **기전 = «끄기»**(가드 아님): `expose_api_docs=False`(기본)일 때 FastAPI 가 `docs_url/redoc_url/openapi_url` 을 아예 달지 않아 라우트가 **없어서** 404 다. 401/403(가드)와 형상이 다르지만 판정선 「404 또는 401/403」을 충족한다.
- 🔴 **수명 조건**: `FKT_EXPOSE_API_DOCS=1` 을 주면 4종이 다시 200 이 된다 — 그건 config 선택이지 코드 회귀가 아니다. 공개 배포에서 이 env 를 주지 않는 것이 이 초록의 전제다(runbook 소관 · 회부 아님).
- **map ⑤**: FAIL(D-87) → **PASS**. 이로써 Gate 7 붉은 항 = ⑤ 해소로 **FAIL 0**. 남은 것 = ⑨(부분) · ⑪(측정 불가 · 조각 b) · 재색인 주입(미측). ⑦⑧ 은 조각 a(#828)로 PASS.

---

## §4 이 판정이 말하지 «않는» 것 · 무대

- `:8090` 은 **센쿠2 격리 무대**다 — 나는 **읽기만** 했다(GET probe · 쓰기 0 · 정지 0). 무대 소유·처분은 발주 라인(센쿠2/오케).
- develop `:8020`·production·t76·내 levi2 스택 **무접촉**.
- 전 열(#820 200·≥2048B)은 내가 잰 값이 아니라 인용이다.
