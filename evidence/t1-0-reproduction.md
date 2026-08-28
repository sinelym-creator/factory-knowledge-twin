---
artifact: t1-0-reproduction
ticket: T1-0 재현 검증
owner: 검증(리바이2)
status: 판정 제출 — 최종 판정권은 오케
version: 1.0.0
verified_at: 2026-08-28
verification_base: develop `5877e7d`
target: docs/product/dev-environment.md (T1-0)
size_limit: 12KB
---

# T1-0 재현 검증 — `dev-environment.md` 절차만으로 서는가

> 판정 축 = **「문서에 없는 지식을 쓰지 않고 재현되는가」.** 되면 PASS, 안 되면 **문서 결함**으로 FAIL(좌표 명시).
> 🔴 본 검증은 **다른 좌석의 스택이 가동 중인 상태**에서 수행했다 — 그 제약이 결과에 어떻게 걸렸는지 §1에 먼저 적는다.

## 0. 검증 조건 (먼저 밝힌다)

| 항목 | 실측 |
|---|---|
| base | `5877e7d` |
| 착수 시 머신 상태 | `fkt-postgres`·`fkt-neo4j` **이미 가동 중**(구현 좌석 T1-1 작업분 · Up 13분 · 둘 다 healthy) |
| 내가 하지 않은 것 | `docker compose down`·`stop`·`rm`·이미지 삭제 **전부 미실행**. 타 좌석 스택에 **일절 손대지 않았다** |
| 내가 띄운 것 | uvicorn(8000) · next dev(3100) — **둘 다 검증 후 종료**, 포트 반납 확인 |
| 종료 후 확인 | 타 좌석 스택 **Up 25분 · healthy 유지**(내 작업으로 끊기지 않았음) |

## 1. 🔴 ① `docker compose up -d` — **실행하지 않았다** (실행 불가 · 문서 결함 아님)

**측정한 사실**

```
docker-compose.yml  container_name: fkt-postgres / fkt-neo4j   ← 고정 이름
포트 실측           5434 USED · 7474 USED   (타 좌석 스택이 점유)
```

`container_name`이 고정이므로 내 worktree에서 `docker compose up -d`를 돌리면 **같은 이름의 컨테이너를 건드리게 된다**(충돌 또는 인수). 발주의 「그의 스택을 내리지 말라」와 정면 충돌하므로 **실행하지 않았다.**

> **없는 실행을 있었던 것처럼 적지 않는다.** 절차 ①은 «미실행»이고, 아래는 **절차가 만들어낸 결과가 문서 §5의 주장과 일치하는지**를 읽기 전용으로 확인한 것이다.

**§5 주장 대조 (읽기 전용 · E1)**

| 문서 §5 주장 | 실측 | 판정 |
|---|---|---|
| `fkt-postgres` Up (healthy) | `docker inspect` → **healthy** | ✅ 일치 |
| `fkt-neo4j` Up (healthy) | `docker inspect` → **healthy** | ✅ 일치 |
| pgvector `vector 0.8.2` | `select extname\|\|' '\|\|extversion …` → **`vector 0.8.2`** | ✅ 일치 |
| Neo4j `ok / 1` | `cypher-shell 'RETURN 1 AS ok'` → **`ok` / `1`** | ✅ 일치 |

### 1.1 ◻ D-1 — 한 머신에서 두 좌석이 동시에 스택을 띄울 수 없다

`container_name` 고정 + 포트 고정이라 **두 번째 좌석은 기동 자체가 막힌다.** 이번에 실제로 발생했다(가설이 아니다). 3좌석이 한 머신을 쓰는 현 구조에서 재발한다.

→ **고치면 PASS**: §4에 **「스택은 1좌석만 띄운다(선점자 우선) · 동시 필요 시 `COMPOSE_PROJECT_NAME` + 포트 env 분리」** 1절 추가. `container_name` 제거만으로도 project name 격리가 살아난다.
→ 🔴 단 이건 **문서보다 운영 규율 쪽 결정**이라 판단을 넘긴다 — 격리 기동을 표준으로 삼을지, 1좌석 선점으로 갈지는 통합 담당 몫이다.

### 1.2 절차 0(`Copy-Item .env.example .env`) 미실행 — 사실만 기록

본 세션은 `.env` 계열 파일 조작이 **보안 훅으로 차단**되어 절차 0을 실행하지 않았다. 그럼에도 ②③은 **전부 성공**했다 → **②③에는 `.env`가 필요 없다.** ①에 필요한지는 **미검증**(compose가 `${VAR:-기본값}`을 쓰므로 불필요할 가능성이 높으나, 추정을 판정으로 올리지 않는다).

## 2. ✅ ② FastAPI `/health` — 문서만으로 재현됨

문서 §4 2단계를 **그대로**(PowerShell 경유) 실행했다.

| 단계 | 결과 |
|---|---|
| `python -m venv .venv` | 성공 |
| `pip install -r requirements.txt` | exit 0 |
| `import fastapi, uvicorn` | **0.115.6 / 0.34.0** — §1 버전 실측표와 **일치** |
| `uvicorn app.main:app --port 8000` | 기동 |
| `GET /health` | **HTTP 200** · `{"ok":true,"version":"0.0.1"}` — §5와 **일치** |
| `GET /openapi.json` | **HTTP 200** — §5와 일치 |

**문서 밖 지식 사용 = 0.** §4 명령만으로 섰다.

## 3. ✅ ③ Next.js `/` — 문서만으로 재현됨 (바이트 단위 일치)

| 단계 | 결과 |
|---|---|
| `pnpm install` | Done in 7.5s · **pnpm 10.32.1**(§1 표와 일치) |
| `pnpm dev --port 3100` | Ready |
| `GET /` | **HTTP 200** · **15,428 bytes** |

🔴 문서 §5는 「200 · **15,428 bytes**」라 적었고 실측이 **바이트 단위로 같다.** 실측을 적어 둔 문서만 이런 대조가 가능하다 — 「정상 동작」이라고만 적혀 있었으면 이 확인은 불가능했다.

### 3.1 ✅ §6 함정 2 재현 확인

문서는 「Next 16이 dev 기동 시 `CLAUDE.md`·`AGENTS.md`를 자동 생성하므로 `agentRules: false`로 껐고, 재기동 후 재생성되지 않음을 확인했다」고 주장한다.

- 기동 **전**: 두 파일 없음
- `pnpm dev` 기동 **후**: 두 파일 **여전히 없음** → **주장 유효 확인**

함정을 적어 둔 것이 실제로 재현자를 구했다 — 이 절이 없었으면 나는 「왜 앱 폴더에 CLAUDE.md가 생기지?」에서 시간을 썼을 것이다.

## 4. ◻ D-2 — §5 결과표의 검증 명령이 «그대로 실행 불가»

§5는 검증 명령을 이렇게 적었다.

```
psql -tAc "select extname||' '||extversion from pg_extension where extname='vector'"
cypher-shell 'RETURN 1 AS ok'
```

**그대로는 돌지 않는다.** 두 바이너리는 호스트에 없고 컨테이너 안에 있다. 재현자는 스스로 이렇게 조립해야 한다:

```
docker exec fkt-postgres psql -U fkt -d fkt -tAc "…"
docker exec fkt-neo4j cypher-shell -u neo4j -p <비밀번호> 'RETURN 1 AS ok'
```

그리고 **`-U fkt -d fkt`와 neo4j 자격은 문서 어디에도 없다** — `docker-compose.yml`의 `${POSTGRES_USER:-fkt}`를 열어봐야 안다. 즉 **문서 밖 지식을 요구한다**(판정 축 위반).

→ **고치면 PASS**: §5 결과표의 「명령」 칸에 **`docker exec …` 전체 명령**을 적는다. 값 자체는 이미 §7이 「로컬 개발용 자리표시자」로 공개를 허용한 범위다.

## 5. 판정

| 대상 | 판정 | 근거 |
|---|---|---|
| ① compose 기동 | ⚠️ **절차 미실행**(환경 충돌 · 내 판단으로 우회 안 함) · **결과 주장 4건은 전부 일치** | §1 |
| ② FastAPI `/health` 200 | ✅ **PASS** — 문서 밖 지식 0 | §2 |
| ③ Next.js `/` 200 | ✅ **PASS** — 바이트 단위 일치 | §3 |
| §6 함정 2 | ✅ **PASS** — 주장 재현됨 | §3.1 |
| 문서 밖 지식 요구 | 🔴 **1건 발견(D-2)** — §5 검증 명령 | §4 |

**총평**: `dev-environment.md`는 **재현 가능한 문서**다. 버전·바이트 수까지 실측으로 적어 둔 덕에 대조 판정이 성립했고, 함정 2건을 적어 둔 것이 실제로 재현자의 시간을 아꼈다. 결함은 **D-1(운영 규율 공백) · D-2(검증 명령 불완전)** 2건이며 **둘 다 문서 1~2줄로 닫힌다.**

🔴 **①의 «clean 상태 compose up»은 여전히 미검증이다.** 스택을 내릴 수 있는 시점에 1회 실행해야 완결된다 — 그 시점 판단은 통합 담당 몫이다. **미검증을 통과로 계수하지 않는다.**
