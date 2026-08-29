---
asset_class: product
description: 개발 환경 기반 실측·골격 — 버전 실측표·compose·부팅 절차 (T1-0)
status: draft
lifecycle: S2 착수 시 참조 · 스택 선택 변경 시 즉시 갱신
size_limit: 12KB
---

# 개발 환경 (T1-0)

> **범위 = 환경·골격뿐이다.** 🔴 기능 코드 0 — 스키마·마이그레이션·조사 workflow·retrieval은 전부 S2 이후 티켓이다.
> 아래 표의 값은 **2026-08-28 이 개발 머신에서 실제로 실행해 얻은 값(E1)**이다. 추정치가 아니다.

## 1. 버전 실측표 (E1 · Windows 11)

| 도구 | 실측값 | S2 선택 | 근거 1줄 |
|---|---|---|---|
| Node.js | **v22.20.0** | 그대로 사용 | Next 16 요구(≥20)를 충족하며 LTS 계열이다. |
| npm | 10.9.3 | 미사용 | 아래 pnpm 선택으로 대체. |
| **pnpm** | **10.32.1** | ✅ **채택** | 이미 설치돼 있어 추가 도입 비용 0 · 워크스페이스가 필요해질 때(`apps/` + 추후 패키지) 전환 비용이 없다. |
| Python | **3.14.0** (머신에 이 버전 하나만 설치됨) | 그대로 사용 | 아래 §1.1의 의존성 실측을 모두 통과했다 — 별도 3.12 설치로 환경을 늘리지 않는다. |
| pip | 내장 | ✅ **채택** | `requirements.txt` 한 장으로 충분함을 실측했다. |
| uv | **미설치** | ❌ 미도입(S2 재검토) | 새 도구 도입의 이득이 지금은 «설치 속도»뿐이다. 의존성이 늘어 해결이 느려지면 그때 도입한다. |
| Docker | 29.1.3 | ✅ | |
| Docker Compose | v2.40.3-desktop.1 | ✅ | `docker compose`(v2 서브커맨드) 문법 사용. |
| Next.js | **16.3.3** (스캐폴드 결과) | ✅ | App Router·TypeScript·ESLint 포함 생성. |
| FastAPI / uvicorn | **0.115.6 / 0.34.0** | ✅ | Python 3.14에서 설치·import·기동 실측 완료. |
| PostgreSQL + pgvector | 이미지 `pgvector/pgvector:pg16` · **vector 0.8.2** | ✅ | 확장이 미리 빌드된 이미지라 별도 컴파일이 없다. |
| Neo4j | `neo4j:5-community` | ✅ | Community 판으로 P0 범위(고정 template 조회) 충족. |

### 1.1 S2 의존성 사전 해결 확인 (Python 3.14 · `pip --dry-run` E1)

가장 큰 환경 리스크였던 「3.14가 너무 최신이라 주요 패키지 wheel이 없을 것」은 **실측으로 소거**했다.

| 패키지 | 해결 결과 |
|---|---|
| asyncpg · sqlalchemy · pydantic-settings · httpx | ✅ 해결 |
| neo4j (드라이버) | ✅ 해결 |
| **langgraph 1.2.11** (+ langchain-core 1.6.1) | ✅ 해결 |
| **sentence-transformers 6.0.0 · transformers 5.16.1 · torch 2.13.0** | ✅ 해결 — 로컬 임베딩(P0) 경로가 막히지 않는다 |
| fastembed 0.8.0 (onnxruntime 기반 경량 대안) | ✅ 해결 — torch가 무거우면 대안 존재 |

🔴 **한계 명시**: `--dry-run`은 «의존성 해결과 wheel 존재»까지만 증명한다. **실제 설치·import·모델 로드 검증은 S2**에서 한다(근거 등급을 여기서 올리지 않는다).

## 2. 포트 (로컬 점유 실측 후 선택)

| 포트 | 실측 | 결정 |
|---|---|---|
| 5432 · 5433 | **USED** (기존 프로세스 점유) | 회피 |
| **5434** | free | ✅ PostgreSQL 호스트 노출 |
| 7474 · 7687 | free | ✅ Neo4j Browser / Bolt |
| 3000 | **USED** | 회피 |
| **3100** | free | ✅ Next.js dev |
| 8000 | free | ✅ FastAPI |

전부 `.env`(또는 셸 env)로 덮어쓸 수 있다 — `docker-compose.yml`은 `${VAR:-기본값}` 형태로 `COMPOSE_PROJECT_NAME` · `POSTGRES_PORT` · `NEO4J_HTTP_PORT` · `NEO4J_BOLT_PORT` · `VOLUME_ROOT` · DB 계정 3종을 전부 파라미터로 받는다(D-1 구조 격리 · §4.2).

## 3. 구성 파일

| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | postgres(+pgvector)·neo4j 2서비스 · healthcheck · 볼륨 = `${VOLUME_ROOT:-./.volumes}/**`(gitignore) · 🔴 `container_name` 고정 없음(D-1) — 이름은 `name: ${COMPOSE_PROJECT_NAME:-fkt}`에서 파생 |
| `infra/postgres/init/01-extensions.sql` | 최초 기동 시 `CREATE EXTENSION IF NOT EXISTS vector` 1회 |
| `.env.example` | 🔴 **키 목록만 · 값 0** (baseline §34.6) — 키마다 1줄 설명 |
| `.gitignore` | `.volumes/` · `.env` · `.venv/` · `__pycache__/` 추가 |
| `services/ai-api/` | FastAPI async 골격 — 계약 v0.1 표면 23 라우트 · `/api/health`(status·dependencies 확장) · 미구현 호출 = 계약 오류 형상 501 (T1-8) |
| `apps/web-console/` | Next.js 스캐폴드 — 기본 페이지 그대로 |

🔴 **ai-api 컨테이너는 compose에 넣지 않았다.** 본 티켓 범위는 데이터 계층 2종이고, 앱 서비스의 컨테이너화는 코드가 생긴 뒤(S2)가 순서다. 지금 넣으면 매 코드 변경마다 재빌드만 하게 된다.

## 4. 재현 절차 (clone → 기동 · 3명령)

```powershell
# 0) 최초 1회 — 키 파일 준비 (값은 로컬에서 채운다)
Copy-Item .env.example .env

# 1) 데이터 계층
docker compose up -d                      # postgres(5434) + neo4j(7474/7687)

# 2) ai-api
cd services/ai-api
python -m venv .venv; .venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000

# 3) web console
cd apps/web-console
pnpm install
pnpm dev --port 3100
```

## 4.1 DB 스키마 적용 (T1-1)

compose 기동 후 **1명령**으로 적용한다. 재실행 멱등이라 몇 번 돌려도 안전하다.

```powershell
pwsh services/ai-api/db/migrate.ps1   # -EmbeddingDim(기본 768)은 001 자리표시자 전용 잔재
```

> 🔴 정정(08-29): `-EmbeddingDim`은 001 단독 적용(모델 미정 시절)의 잔재다 — **최종 차원은 003이 384로 못박으며**, 무엇을 주든 최종 상태는 384다(003 주석 정본). 위 옛 예시의 「기본 768」·「1024로 새로」 문구는 오해를 남겨 제거했다(Q-7b 판정 — 값이 아니라 «값의 뜻»이 바뀐 자리).

- DDL 정본 = `services/ai-api/db/migrations/001_core_schema.sql`
- **스펙 대조표**(T0-6 항목 ↔ DDL 위치 1:1) = `services/ai-api/db/README.md` — 검증 좌석은 이 표로 대조한다.
- 🔴 임베딩 차원은 파라미터이며 기본 768은 **자리표시자**다. 모델 확정 시 신규 마이그레이션으로 교체한다(기존 칼럼은 `IF NOT EXISTS` 때문에 재적용으로 바뀌지 않는다).

## 4.2 좌석별 병렬 스택 (D-1 구조 격리)

`container_name`을 고정하지 않으므로 **프로젝트명·포트·볼륨 경로만 달리 주면 여러 좌석의 스택이 동시에** 뜬다. 검증 좌석이 구현 좌석의 스택을 끄지 않고 재현할 수 있다.

```powershell
$env:COMPOSE_PROJECT_NAME = 'fkt-levi2'      # 컨테이너 이름 접두 → fkt-levi2-postgres-1
$env:POSTGRES_PORT        = '5534'
$env:NEO4J_HTTP_PORT      = '7574'
$env:NEO4J_BOLT_PORT      = '7587'
$env:VOLUME_ROOT          = './.volumes-levi2'   # 🔴 같은 워크트리에서 띄울 때 «반드시» 분리
docker compose up -d
```

🔴 **`VOLUME_ROOT`를 빠뜨리면 두 스택이 같은 bind mount를 물어 데이터가 손상된다.** 서로 다른 워크트리에서 띄우면 경로가 이미 달라 자동으로 분리된다.

🔴 **컨테이너를 이름으로 지목하지 않는다** — 이름은 프로젝트명에 따라 바뀐다. 항상 **서비스명**으로 부른다:
`docker compose exec postgres ...` / `docker compose exec neo4j ...` (`migrate.ps1`도 이 방식이다).

## 5. 부팅 실측 결과 (E1 · 전부 이 머신에서 실행한 출력)

> 🔴 **명령은 축약 없이 그대로 적는다**(D-2) — 재현자가 복사해 붙이면 같은 결과가 나와야 한다.
> 전제: 리포 루트에서 실행 · `docker compose up -d` 완료 상태.

| # | 대상 | 실행한 전체 명령 | 결과 |
|---|---|---|---|
| 1 | compose | `docker compose up -d` | `fkt-postgres-1` **Up (healthy)** · `fkt-neo4j-1` **Up (healthy)** |
| 2 | 상태 확인 | `docker compose ps --format 'table {{.Name}}	{{.Service}}	{{.Status}}'` | 두 서비스 healthy |
| 3 | pgvector | `docker compose exec -T postgres psql -U fkt -d fkt -tAc "select extname\|\|' '\|\|extversion from pg_extension where extname='vector'"` | **`vector 0.8.2`** |
| 4 | Neo4j | `docker compose exec -T neo4j cypher-shell -u neo4j -p fkt_local_dev 'RETURN 1 AS ok'` | **`ok / 1`** |
| 5 | 스키마 적용 | `pwsh services/ai-api/db/migrate.ps1` | exit 0 · `schema_migration` 1행 (**3회 연속 재실행 오류 0**) |
| 6 | 테이블 수 | `docker compose exec -T postgres psql -U fkt -d fkt -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"` | **26** |
| 7 | ai-api | `cd services/ai-api; python -m venv .venv; .venv\Scripts\python.exe -m pip install -r requirements.txt; .venv\Scripts\python.exe -m uvicorn app.main:app --port 8000` → 다른 창에서 `Invoke-WebRequest http://localhost:8000/api/health -UseBasicParsing` | **HTTP 200** · `ok:true` + `status`=`ok`(의존 기동)/`degraded`(미기동 — boot는 성립) · `/openapi.json` **200** — 🔴 T1-8부터 루트 `/health`는 없다(계약 base=/api) |
| 8 | web-console | `cd apps/web-console; pnpm install; node node_modules/next/dist/bin/next dev --port 3100` → `Invoke-WebRequest http://localhost:3100 -UseBasicParsing` | **HTTP 200** · 15,428 bytes · Ready 5.5s |
| 9 | 병렬 격리(D-1) | 위 §4.2 env 5개 설정 후 `docker compose up -d` | `fkt-probe-postgres-1`(5534)·`fkt-probe-neo4j-1`(7574/7587)이 기본 스택과 **동시 기동** — 포트·이름 충돌 0 |

🔴 **7번의 `pnpm dev`·`next dev`를 `Start-Process`로 띄울 때 주의**: `pnpm`은 `.cmd` 셸 스크립트라 `Start-Process -FilePath 'pnpm'`이 「올바른 Win32 응용 프로그램이 아닙니다」로 실패한다. `node node_modules/next/dist/bin/next` 를 직접 부르거나 `cmd /c` 를 거쳐야 한다.

## 6. 이 환경에서 걸린 함정 2건 (재현자에게 그대로 필요)

1. **`create-next-app`이 「path is not writable」로 실패한다** — 상위 `apps/` 디렉터리가 **존재하지 않을 때** 나는 오판이다. 권한 문제가 아니다(대조 실측: 같은 경로에 파일 생성은 정상). **먼저 `apps/`를 만들고 그 안에서 실행**하면 통과한다.
2. **Next 16이 dev 기동 시 앱 폴더에 `CLAUDE.md`·`AGENTS.md`를 자동 생성한다** — 생성 옵션에서 껐어도 dev에서 다시 만든다. 리포 파일 표준(CLAUDE.md = 루트 단일본)과 충돌하므로 `next.config.ts`에 **`agentRules: false`**를 넣고 두 파일을 지웠다. 재기동 후 재생성되지 않음을 확인했다.

## 7. 공개 경계 점검 (커밋 전 스캔)

- 시크릿·토큰·비밀번호 **커밋 0** — `.env.example`은 키 이름과 설명뿐이고, compose의 기본값은 «로컬 개발용 자리표시자」다(`fkt_local_dev`).
- 절대경로 커밋 **0** — compose·문서 모두 리포 상대경로만 쓴다.
- 실데이터 **0** — 데이터 파일 자체가 아직 없다.
- 볼륨(`.volumes/`)·`.env`·`.venv/`는 `.gitignore` 처리.

## 8. 미결 — S2 판정 필요 (🔴 재검토 08-29 · 오케 — 전건 판정 완료, 잔존 미결 0)

| # | 항목 | 내용 | 판정 (08-29) |
|---|---|---|---|
| E1 | 스타일링 스택 | Tailwind 없이 스캐폴드 — S2 착수 시 오케 판정 요청 | ✅ **해소 — Tailwind 확정**(T1-9 티켓 · 근거 3종 성문 · 설치 실측은 T1-9 구현 몫) |
| E2 | ai-api 컨테이너화 시점 | S2에서 코드가 생긴 뒤 compose에 추가(§3 근거) | 🔴 **재이연 — Phase 4(Live 연결) 진입 시점으로 결속.** 근거: ⓐ Phase 2~3은 도메인 코드 대량 유입 구간 — 매 변경 재빌드는 §3이 피하려던 비용 그대로 ⓑ dev 루프는 venv+uvicorn(reload)이 빠르고 재현 실측 완비(T1-8) ⓒ 배포 형상은 Phase 4의 Tunnel·재시작 복구·동시 요청 제한과 «한 번에» 확정하는 것이 재작업 0. **indexer는 컨테이너화 비대상 확정** — 상시 서비스가 아니라 «도구»이고 torch+HF 캐시로 이미지만 수 GB가 된다 |
| E3 | 임베딩 구현체 | ST vs fastembed — 실측 후 택일 | ✅ **해소 — sentence-transformers + multilingual-e5-small(384d) 승인**(T1-4 게이트 ③ · 정오표 E-3 계보) |
| E4 | Neo4j 인증 정책 | compose 기본값 — 배포 티켓에서 재확인 | **유지 — Phase 4/5 배포·보안 티켓에 재확인 축으로 결속**(외부 노출 없음 전제 재검증 · baseline §22.5) |
