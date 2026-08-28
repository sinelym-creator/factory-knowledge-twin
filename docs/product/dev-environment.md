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

전부 `.env`로 덮어쓸 수 있다(`docker-compose.yml`의 `${VAR:-기본값}`).

## 3. 구성 파일

| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | postgres(+pgvector)·neo4j 2서비스 · healthcheck · 볼륨 = `./.volumes/**`(gitignore) |
| `infra/postgres/init/01-extensions.sql` | 최초 기동 시 `CREATE EXTENSION IF NOT EXISTS vector` 1회 |
| `.env.example` | 🔴 **키 목록만 · 값 0** (baseline §34.6) — 키마다 1줄 설명 |
| `.gitignore` | `.volumes/` · `.env` · `.venv/` · `__pycache__/` 추가 |
| `services/ai-api/` | FastAPI 골격 — `/health` 하나뿐(계약의 자리표시자) |
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
pwsh services/ai-api/db/migrate.ps1                      # 기본 embedding_dim=768
pwsh services/ai-api/db/migrate.ps1 -EmbeddingDim 1024   # 차원을 바꿔 새로 만들 때
```

- DDL 정본 = `services/ai-api/db/migrations/001_core_schema.sql`
- **스펙 대조표**(T0-6 항목 ↔ DDL 위치 1:1) = `services/ai-api/db/README.md` — 검증 좌석은 이 표로 대조한다.
- 🔴 임베딩 차원은 파라미터이며 기본 768은 **자리표시자**다. 모델 확정 시 신규 마이그레이션으로 교체한다(기존 칼럼은 `IF NOT EXISTS` 때문에 재적용으로 바뀌지 않는다).

## 5. 부팅 실측 결과 (E1 · 전부 이 머신에서 실행한 출력)

| 대상 | 명령 | 결과 |
|---|---|---|
| compose | `docker compose up -d` | `fkt-postgres` **Up (healthy)** · `fkt-neo4j` **Up (healthy)** |
| pgvector | `psql -tAc "select extname\|\|' '\|\|extversion from pg_extension where extname='vector'"` | **`vector 0.8.2`** |
| Neo4j | `cypher-shell 'RETURN 1 AS ok'` | **`ok / 1`** |
| ai-api | `uvicorn app.main:app --port 8000` → `GET /health` | **HTTP 200** · `{"ok":true,"version":"0.0.1"}` · `GET /openapi.json` **200** |
| web-console | `next dev --port 3100` → `GET /` | **HTTP 200** · 15,428 bytes · Ready 5.5s |

## 6. 이 환경에서 걸린 함정 2건 (재현자에게 그대로 필요)

1. **`create-next-app`이 「path is not writable」로 실패한다** — 상위 `apps/` 디렉터리가 **존재하지 않을 때** 나는 오판이다. 권한 문제가 아니다(대조 실측: 같은 경로에 파일 생성은 정상). **먼저 `apps/`를 만들고 그 안에서 실행**하면 통과한다.
2. **Next 16이 dev 기동 시 앱 폴더에 `CLAUDE.md`·`AGENTS.md`를 자동 생성한다** — 생성 옵션에서 껐어도 dev에서 다시 만든다. 리포 파일 표준(CLAUDE.md = 루트 단일본)과 충돌하므로 `next.config.ts`에 **`agentRules: false`**를 넣고 두 파일을 지웠다. 재기동 후 재생성되지 않음을 확인했다.

## 7. 공개 경계 점검 (커밋 전 스캔)

- 시크릿·토큰·비밀번호 **커밋 0** — `.env.example`은 키 이름과 설명뿐이고, compose의 기본값은 «로컬 개발용 자리표시자」다(`fkt_local_dev`).
- 절대경로 커밋 **0** — compose·문서 모두 리포 상대경로만 쓴다.
- 실데이터 **0** — 데이터 파일 자체가 아직 없다.
- 볼륨(`.volumes/`)·`.env`·`.venv/`는 `.gitignore` 처리.

## 8. 미결 — S2 판정 필요

| # | 항목 | 내용 |
|---|---|---|
| E1 | **스타일링 스택 미선택** | Tailwind 없이 스캐폴드했다. A안(고밀도 다크 콘솔) 구현에 유틸리티 CSS가 유리하지만, **골격 티켓에서 스택을 선점하지 않았다.** S2 착수 시 오케 판정 요청. |
| E2 | ai-api 컨테이너화 시점 | S2에서 코드가 생긴 뒤 compose에 추가(§3 근거). |
| E3 | 임베딩 구현체 | `sentence-transformers`(torch) vs `fastembed`(onnxruntime) — 둘 다 3.14 해결 확인. 모델 크기·기동 시간 실측 후 S2에서 택일. |
| E4 | Neo4j 인증 정책 | 지금은 compose 기본값. 공개 배포 시 노트북 로컬 전용이므로 외부 노출 없음을 배포 티켓에서 재확인. |
