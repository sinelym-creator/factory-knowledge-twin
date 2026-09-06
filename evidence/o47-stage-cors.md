# O-47 종결 — develop 무대 refresh 후 CORS 무대 실측 (검증 좌석 · 리바이2 55대)

- 측정 모델: `claude-opus-4-8`(폴백 · cmdline=opus-5)
- 측정 창: 2026-09-06 09:05~09:09 (`date` 실측)
- 무대: develop `:8020`(공유 검증 무대) · **읽기 GET/OPTIONS + refresh 만** · production·`:8797` 게이트웨이 무접촉
- refresh 승인 = 오케 위임 안(develop 쪽)

## 0. O-47 이 무엇이었나

O-47(리바이2 55대 등재): **develop 무대 `develop-stage.ps1` 이 `FKT_CORS_ORIGINS` 를 안 넘겨**
무대의 CORS 미들웨어가 아예 안 붙었고(설계상 목록 비면 미부착), 그래서 Gate 7 ⑪ CORS 서버 축을
**무대에서 잴 수 없던** 구조 원인. (55대는 손잡이 하나 다른 «내 컨테이너»로 우회 측정해 ⑪을
PASS 로 값화했으나, 무대 자체 실측은 남아 있었다.) #845 가 그 스크립트를 고쳤다는 전제를,
refresh 후 무대에서 직접 확인해 종결한다.

## 1. refresh 前/後 (무대 상태 · inspect 실물)

| 축 | 前(refresh 전) | 後(refresh 후) |
|---|---|---|
| `:8020 /api/health .build` | `dd1a2e1` | **`6fa0d2e`** |
| 컨테이너 `.Id`(12) | `d35afb978f13` | **`f3c368ff7e19`** |
| 이미지 | `fkt-ai-api:dev-dd1a2e1` | `fkt-ai-api:dev-6fa0d2e` |
| env `FKT_CORS_ORIGINS` | **부재**(= O-47 구조 원인) | **`http://localhost:3100,http://127.0.0.1:3100,http://localhost:3000,http://127.0.0.1:3000`** |

- refresh 명령: `pwsh -File infra/develop-stage.ps1 refresh -Worktree C:/…/_wt/develop-stage`(rc 0) ·
  트리를 origin/develop `6fa0d2e` 로 detach 갱신 · 스크립트 출력 `apiBuild 6fa0d2e` · `container Up`.
- 🔴 **`FKT_CORS_ORIGINS` 는 자기 신고가 아니라 `docker inspect .Config.Env` 실물**로 확인 — 부재→적재가
  #845 처방이 무대에 실제로 반영됐다는 값이다(O-47 의 구조 원인이 사라졌다).
- 게이트웨이 `:8797` promptSha `a71c93b148db` **불변**(refresh 범위 밖 · 프롬프트 무변).

## 2. ⑪ CORS 서버 축 — 무대에서 재측 (같은 실행 · 허용=localhost:3100 · evil=그 밖)

무대 allowlist 는 dev origin(localhost:3100/3000) 이므로 «허용»은 `http://localhost:3100`,
«evil»은 그 목록 밖(`https://evil.example`).

| 자극 | 실측 |
|---|---|
| ① allowed origin `GET /api/health` | `200` · **`access-control-allow-origin: http://localhost:3100`** + `vary: Origin` + ACAC `true` |
| ② evil origin `GET /api/health` | `200` · **ACAO 부재**(ACAC `true` 는 Starlette preset · ACAO 없으면 브라우저 무의미) |
| ③ preflight allowed + `POST` | **`200`** · methods `GET, POST, PATCH, OPTIONS` · max-age 600 · ACAO 반영 |
| ③ preflight allowed + `DELETE` | **`400`** `Disallowed CORS method` |
| ③ preflight evil + `POST` | **`400`** `Disallowed CORS origin` · ACAO 부재 |

🔴 **문을 양면으로**(통과 1 + 막힘 2 · 같은 실행) — 「전부 거절하는 문」은 이 초록을 못 낸다.
55대가 내 컨테이너로 잰 ⑪ 값(허용 반영·evil 부재·200/400/400)과 **무대에서도 동일** — 우회
측정이 무대 실측으로 확증됐다.

## 3. 판정

**O-47 종결** — develop 무대가 refresh 후 `FKT_CORS_ORIGINS` 를 싣고(#845 적재 확증 · inspect 실물),
그 위에서 ⑪ CORS 서버 축이 무대 자체로 PASS(허용 ACAO 반영 · evil 부재 · preflight 200/400/400).
Gate 7 ⑪은 이제 «내 컨테이너 우회»가 아니라 «무대 실측»으로도 선다.

🔴 범위: **서버 헤더 계약 축**이다(무대에서). 브라우저 강제 축(`t41_cors_browser_drill.mjs`)은
여전히 미측 — 이름으로 남긴다. production CORS env(`:8010`)는 무접촉.

## 4. 정리

- 무대 `:8020` = 읽기 GET/OPTIONS + refresh 만 · 상태 변경 = refresh(승인분) 외 0 · 사용자 0 창에서 수행.
- production·공개면·`:8797` 무접촉.
