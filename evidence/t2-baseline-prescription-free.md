# T2 «처방 전» 기준선 — 재부팅 후 재확립 실측

> 리바이2 7대 · 2026-08-30 · develop `9809bdd` · 근거 등급 **E1(실측)**
>
> 🔴 **이 문서의 존재 이유**: T2 처방이 착지한 «후»에 잰 초록은 「지금 200이다」까지만 말한다.
> 회귀 판정은 처방 «전» 기준선이 있어야만 성립한다(6대 절차 ①). 여기 적힌 숫자가 그 기준선이다.

## 0. 측정 조건 — 이 초록이 무엇을 상대로 난 초록인가

| 축 | 실측값 |
|---|---|
| 리포 tip | `9809bdd` (pull 후 원격과 일치 확인) |
| 스택 | `fkt-levi2` — postgres `5534` · neo4j `7574`/`7587` · 2컨테이너 **Up · healthy** |
| 기동 경위 | 🔴 재부팅 후 **자동 기동**(`restart: unless-stopped`) · `StartedAt 2026-08-29T12:38:22Z` · `RestartCount=0` |
| 볼륨 마운트 | `{리포 루트}\.volumes-levi2\{postgres,neo4j}` — **주 체크아웃 정본** |
| 데이터 생존 | neo4j 노드 **309** · 관계 **448**(라벨 14종·관계 19종 합산 교차 검증) · pg public 테이블 32 |
| 짝 판정 | `v_graph_index_pairing` 2행 전부 **PAIRED** · ontology 지문 `84ca2b75…` |
| 서버 | web-console `3101`(재빌드) · ai-api `8000`(uvicorn) |
| 백엔드 상태 | `GET /api/live/status` → 200 `{"online":false}` · `POST /api/sessions` → **501** · 무쿠키 `/overview` → **307** |

🔴 **재부팅으로 소실된 것 = 빌드 산출물**(데이터가 아니다): `services/projector/.venv` ·
`apps/web-console/node_modules`·`.next` · `tests/web/node_modules`. 전건 재구축 후 측정했다.

## 1. 검증 자산 15종 — 실측 16축 전건 green

| # | 자산 | 실측 | 인계본 기대 | 판정 |
|---|---|---|---|---|
| 1 | `tests/schema/run-probes.ps1` | 6/6 · 어긋남 0 · exit 0 | 6/6 | 일치 |
| 2 | `tests/data/seed-integrity.sql` | **28/28** PASS · exit 0 | 28 | 일치 |
| 3 | `tests/data/net-liveness.sql` | **13/13** PASS · exit 0 | 13 | 일치 |
| 4 | `tests/data/transition-net.sql` | **27/27** PASS · INFO 0 · exit 0 | 27 | 일치 |
| 5 | `tests/data/eval-chunk-binding.sql` | **15/15** PASS · exit 0 | 15 | 일치 |
| 6 | `tests/data/selfcheck_mutation.py` | 주입 11 · 감지 **11** · 구멍 0 | 11 | 일치 |
| 7 | `tests/data/probe_binding_scope.py` | 20키 · 감지 **20** · 미감지 0 | 20 | 일치 |
| 8 | `tests/contract/run.js --strict-coverage` | **34/34** · 자기검증 15건 감지 · 커버리지 37/37 | 34 | 일치 |
| 9 | `tests/graph/graph_verify.py` | **18/18** PASS · exit 0 | 18/18 | 일치 |
| 10 | ↳ R-01 재현성 | 재투영 전후 덤프 지문 동일 `57E36748…` | R-01 | 일치 |
| 11 | `tests/graph/graph_drill.py` | **22/22** PASS · 되감기 D-0·D-0p·G-02 확인 | 22/22 | 일치 |
| 12 | `tests/web/e2e/` (playwright) | **37 passed** (10.8s) · retries 0 · fail 0 | 37 | 일치 |
| 13 | `tests/web/surface_scan.mjs` | 모집단 **22파일** · 계약 밖 **0** | 22 · 0 | 일치 |
| 14 | `tests/web/contract_surface_drill.mjs` | 주입 **17** · 갈림 **4**(의도 유지) | 17 · 4 | 일치 |
| 15 | `tests/web/token_layer_probe.mjs` | 토큰 표기 4종 대조 · exit 0 | 4종 | 일치 |
| 16 | `tests/web/route_matrix.sh` | 6라우트 + svg 기준선 + matcher 탐침 · exit 0 | 6라우트 | 일치 |

- **자산 파일 수 = 15**(e2e 4스펙 = 1자산 · graph 2파일). 위 표는 실행축 16개로 폈다.
- 🔴 **exit 0을 판정으로 쓰지 않았다** — 자산마다 «건수»를 로그에서 읽어 인계본 기대와 대조했다.
  검사가 조용히 사라져도 exit 0은 난다(4대 계보).

## 2. 인계본과 갈린 값 1건 — 해소

전임 6대 인계본의 「PAIRED×2」를 Neo4j 관계 타입으로 읽어 `PAIRED_WITH = 0`을 측정했고,
관계 타입 19종에 PAIRED 계열이 없음을 확인했다. **오독은 내 쪽이었다.**

실체는 pg측 `v_graph_index_pairing`의 **짝 판정 상태값**이다 — 2행(`levi2-run1`·`levi2-run2`)
전부 `PAIRED`, 양쪽 ontology 지문 `84ca2b75…` 일치. 「원장은 관측 사실만 · 짝 판정은 view」
규범 계열이며, `graph_drill` P-00~P-06이 이 축을 대조군까지 덮는다.

🔴 교훈: **갈린 값을 만나면 「둘이 같은 것을 봤는가」부터 묻는다.** 여기서 바로 결함으로
보고했으면 멀쩡한 짝 판정을 red로 낙인찍었을 것이다.

## 3. 🔴 이 초록들이 «무엇 때문에» 초록인가 — T2가 흔들 전제

기준선의 절반은 숫자가 아니라 **전제**다. 아래는 T2가 착지하면 «자동으로 유지되지 않는» 초록들이다.

| 초록 | 지금 초록인 이유 | T2에서 깨지는 조건 |
|---|---|---|
| e2e `mode-badge` REPLAY | `/api/live/status` `online:false` | live 경로가 실값을 내기 시작하면 |
| e2e `session-guard` 「세션 미발급을 숨기지 않는다」 | `POST /sessions` **501** | 세션 저장소 결합 시(Q-18) |
| `surface_scan` 계약 밖 0 | 모집단 22파일 · 감시 목록 = **손으로 적은 2건** | 표면이 자라는데 목록이 안 자라면 |
| `graph_verify` 18/18 | 투영이 **방금** 재생성됐다(R-01 rebuild) | 쓰기 경로가 열려 원장만 갱신되면 |

---
**측정자**: 리바이2 7대(검증 좌석) · **write scope**: `benchmarks/`·`tests/`·`evidence/`
**미접촉**: SSOT(checkpoint·PROGRESS·INDEX·docs) · T2-1 구현물(독립성 유지)

## 4. 측정 후 tip 이동 — 기준선 유효성 실측

측정 «중» develop tip 이 `9809bdd → 4f9bc98`(#99 · T2-1 gate1 판정 append)로 이동했다.

- diff 실측: `docs/plan/ticket-ledger.md` · `docs/plan/tickets/T2-1.md` **2파일 전부 docs** — 코드·테스트 **0줄**.
- 따라서 `9809bdd` 에서 잰 16축 기준선은 `4f9bc98` 에서도 **그대로 유효**하다(E1). 재측정 불요.
- 🔴 T2-1 구현이 착지한 `4bc3290` 부터는 이야기가 다르다 — 이 기준선은 **그 처방 «전»** 의 값이며,
  착지 후 측정은 **재빌드부터** 해야 한다(낡은 빌드 위의 초록은 착지분의 초록이 아니다).
