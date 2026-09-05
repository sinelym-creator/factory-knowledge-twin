# 운영 runbook — 재부팅 · 자동 시작 · 장애 대응 · clean environment

> T5-4 · baseline §14.4 · §32.7(Gate 6) · 발주 = 스자쿠 16대(2026-09-01)
>
> 🔴 **이 문서는 «실측된 것»만 절차로 적는다.** 안 잰 칸은 초록도 빨강도 아니고 **「미실측」**이다.
>    안 재고 적은 절차는 데모 당일에 처음 실행되고 처음 틀린다. 모든 행에 근거 등급을 붙인다 —
>    **E1** 이 호스트에서 잰 값 · **E2** 출처 있는 문면 · **E3** 소견 · **E4** 가설.
>
> 🔴 **주소 표기**: 개인 절대경로는 `<worktree>`, tailnet 호스트는 `<tailnet-host>` 로 쓴다
>    (§15.2 · D-15 — 게이트가 구분자 두 형태를 다 본다).

---

## 1. 재부팅 후 절차

### 1-1. 🔴 되살아나는 것을 가르는 손잡이 = `restart` 정책

**「compose 로 띄웠나 `docker run` 으로 띄웠나」가 아니다.** 2026-09-01 재부팅 1회에서 6본의
정책과 결과가 **1:1 로 붙었다**(예외 0 · E1 · `evidence/t4-3-public-rc-verification.md` §C.2):

| 컨테이너 | `restart` | 재부팅 후 | 부팅 기준 | 형상 |
|---|---|---|---|---|
| `fkt-deploy-ai-api` | `unless-stopped` | **running** | +63.5s | **`docker run`** |
| `fkt-senku2-t15-postgres-1` | `unless-stopped` | **running**(healthy) | +63.5s | compose |
| `fkt-senku2-t15-neo4j-1` | `unless-stopped` | **running**(healthy) | +63.5s | compose |
| 검증 좌석 존치물 3본 | `no` | **Exited** | 부팅 «전» 종료 | compose |

`docker run` 으로 띄운 배포 ai-api 가 **복귀했다** — 「compose 만 되살아난다」는 읽기로는 이 행을
설명할 수 없다. 정책이 정본이고, 그 정책은 **파일이 선언한다**: `docker-compose.yml` 의
`restart: ${FKT_RESTART_POLICY:-no}` 는 기본이 «안 되살림»이라, 되살리려면 배포 셸에서 명시한다.

```powershell
$env:FKT_RESTART_POLICY = "unless-stopped"   # 배포 셸에서만
```

🔴 **마지막으로 돌린 `docker update` 는 정본이 아니다.** `docker compose up` 한 번이면 파일이
선언한 값으로 되감긴다. 확인은 **계수로** 한다 — `unless-stopped` 개수가 배포 3본과 **정확히
같아야** 통과이고, 0 도 초과도 실패다(`infra/laptop-operating-conditions.md` §1-3).

### 1-2. 순서

| # | 무엇 | 왜 |
|---|---|---|
| 0 | **Windows 로그온** | Docker Desktop 은 서비스가 아니라 «로그온 앱»이다(§2). 로그온 전에는 컨테이너가 한 본도 없다 |
| 1 | `docker ps -a` 전수 — 상태와 `restart` 정책을 **함께** 읽는다 | 물음은 「몇 개 떴나」가 아니라 「떠야 할 것이 떴나」다 |
| 2 | 미복귀분만 `docker start <이름>` | 🔴 씨앗 스택에 `docker compose up` 을 쓰지 않는다 — recreate 가 볼륨 자리를 바꿔 «빈 자리»를 보게 만든 사건이 있다 |
| 3 | `infra/health-check.ps1` (§1-3) | **컨테이너가 떴다 ≠ 서비스가 답한다** |

### 1-3. `infra/health-check.ps1` — 층을 «따로» 센다

```powershell
pwsh -NoProfile -Command "& ./infra/health-check.ps1 `
  -Project    fkt-senku2-t15 `
  -Containers @('fkt-deploy-ai-api','fkt-senku2-t15-postgres-1','fkt-senku2-t15-neo4j-1') `
  -ApiBase    http://127.0.0.1:8010 `
  -PublicBase https://<tailnet-host>:8443 `
  -WebBase    https://factory-knowledge-twin.vercel.app"
```

| 층 | 무엇을 묻는가 |
|---|---|
| `container` | 그 이름의 컨테이너가 **running** 인가 · `restart` 정책은 무엇인가 |
| `container-health` | 컨테이너 **healthcheck** 가 healthy 인가 |
| `ai-api(local)` | 호스트 포트로 `/api/health` 200 · `status` · 의존 2종 |
| `ai-api(funnel)` | **로컬과 다른 축**이다 — 로컬 200 + Funnel 실패 = 터널 문제 · 둘 다 실패 = 서비스 문제 |
| `web` | 공개 셸 200 |
| `retrieval` | 🔴 **pgvector 색인이 비어 있지 않은가**(D-16) — chunk 전건 임베딩 · 단일 모델. `-PgContainer` 를 줘야 잰다 |
| `laptop` | 절전·최대절전 진입값 · Tailscale 서비스 |

**종료 코드** — 「안 쟀다」와 「재 봤더니 나쁘다」를 같은 칸에 쓰지 않는다:

| rc | 뜻 |
|---|---|
| 0 | 잰 행이 1개 이상이고 **전부 PASS** |
| 1 | FAIL 1건 이상 |
| 2 | **잰 행이 0개**(계측기가 없다 — 「통과」가 아니다) 또는 `-Containers` 정규화 결과 0본(인자가 오다 부서졌다 · Q-66) |

🔴 **`-Containers` 를 반드시 준다.** `-Project` 라벨 필터는 «이미지에 구워진» 라벨을 보므로,
compose 이미지를 `docker run` 으로 띄운 컨테이너가 **태어난 프로젝트 이름으로** 잡힌다. 위험의
모양은 「0건」이 아니라 **«엉뚱한 건수»**다 — 2건이 잡혀 「0건 = FAIL」 가드가 안 울리는 사이
배포 ai-api 가 조용히 빠진다. 이름으로 못 박는 자리가 `-Containers` 다.

🔴 **부르는 방식마다 인자 «모양»이 다르다(Q-66)**: `-File` 은 인자가 전부 문자열이라 **공백 없이
콤마**로 잇고, `-Command` 는 pwsh 가 파싱하므로 **진짜 배열**을 준다. 한 번 이 차이로 계측기가
거짓 초록을 냈다.

**실측 1회 (E1 · 2026-09-01)** — 재부팅 `13:54:53`(`LastBootUpTime`) → 계측 `14:20:44~47` ·
**`measured=17` (PASS 17 / FAIL 0) · SKIP 1 · rc 0**.
SKIP 1 = `fkt-deploy-ai-api` 의 **healthcheck 미정의** — 🔴 PASS 가 아니라 «잴 대상이 없다»이고,
`docker run` 형상인 한 계속 SKIP 이다.

🔴 **17 PASS 는 「재부팅이 아무것도 안 깨뜨렸다」가 아니다.** 이 계측기가 재는 층만 초록이다.

🔴 **그 문장이 D-16 에서 실제로 값을 치렀다**(E1 · 2026-09-01 16:26~19:11). 위 17 PASS 에는
`retrieval` 행이 **없었다** — D-13 재구성이 seed 는 되살렸는데 T1-4 색인을 다시 돌리지 않아
`document_chunk` 임베딩이 **0 건**이었고, 컨테이너·healthcheck·`/api/health` 200·seed 계수·
neo4j 대조가 전부 초록인 채로 공개 Live 경로만 죽었다(`retrieval/vector.py:67`). 그래서
`retrieval` 층을 계측기에 넣었다. **`-PgContainer` 를 안 주면 이 층은 SKIP 이고, SKIP 은
`measured` 에 안 들어간다 — 안 준 채로 난 rc 0 은 「색인이 성하다」는 뜻이 아니다.**

`retrieval` 행의 판정은 **기대 «건수»를 박지 않는다**(오늘의 59 는 seed 가 늘면 낡는다).
검색이 요구하는 불변식만 본다 — `임베딩 > 0` · `임베딩 = chunk` · `모델 1종`. 이 셋이
`vector.py:67`(0건)·`:70`(모델 섞임)이 우는 조건과 **같다**.

---

## 2. 자동 시작 — 두 축을 «따로» 센다

| 대상 | 확인법 | 실측 | 등급 |
|---|---|---|---|
| Tailscale 데몬 | `Get-Service Tailscale` 의 Status·StartType | `Running` · **`StartType=Automatic`** | E1 |
| Docker Desktop 자동 시작 | `settings-store.json` 의 `AutoStart` | **`True`** | E1 |
| Docker Desktop 시작 항목 | `HKCU:\...\CurrentVersion\Run` 의 `Docker Desktop` | **있다**(활성) | E1 |
| `com.docker.service` | `Get-Service` | `StartType=Manual` — 🔴 **결함이 아니다**(설계상 앱이 띄운다) | E1 |
| **Funnel «설정» 복원** | 재부팅 «후» `tailscale funnel status` | 🔴 **미실측** (복원된다는 것은 E4) | — |
| 절전 / 최대절전 진입 | `STANDBYIDLE` / `HIBERNATEIDLE` | **0 = 안 함** (AC·DC 전부) | E1 |

🔴 **「데몬이 자동 시작한다」 ≠ 「노출이 복원된다」.** Tailscale 은 서비스라 로그온과 무관하게 뜨고,
Docker 는 로그온 앱이다. 그래서 **재부팅 후 Tunnel 만 살고 Docker 가 죽은 상태**가 성립한다 —
가장 헷갈리는 형상이다(터널은 살아 있는데 200 이 안 나오므로 터널을 의심하게 된다).

### 2-1. 🔴 Funnel 을 내렸다 올릴 때 (E1 · 자비스 실측 2026-09-01 17:27)

`tailscale funnel --https=8443 off` 는 **AllowFunnel 만 끄는 것이 아니라 8443 핸들러
(→ `127.0.0.1:8010`)까지 제거한다.** 그래서 복원은 둘을 한 번에 세우는 형태여야 한다:

```
tailscale funnel --bg --https=8443 8010      # 핸들러 + Funnel 둘 다
tailscale funnel status                      # 8443 = Funnel on · 기존 :3000 항목 생존 확인
```

- 🔴 `tailscale funnel reset` **금지** — 443 tailnet-only 설정까지 전부 지운다.
- 🔴 `--bg` 없이 실행하면 포그라운드다. 터미널을 닫는 순간 노출이 끊긴다.
- 복원 검증 = **설정 JSON 바이트 대조**. 「켰다」가 아니라 「**전과 같은 것**이 섰다」를 본다.
- 🔴 **창(OFF→ON) 집행은 「대기」와 「집행」을 한 덩어리로 두지 않는다 — ON 집행 «직전»에 채널을 1회 다시 본다**(09-02 12:05 실측: 「3분 뒤 ON」 예약이 돌던 사이 「완료 중계 뒤 ON」 개정 지시가 왔고, 집행자는 그것을 «모른 채» 켰다. 결과가 조건에 맞은 것은 우연이었다 · 같은 날 아침 좌석 킬이 140초 묵은 확인값으로 집행된 사고와 같은 뿌리). 재확인 나이 60초 초과 = 집행 보류.
- 창의 표본 귀속 = 계측기의 `startedAt`(요청 시각)을 집행자의 OFF·ON **실측 시각**과 맞댄다. ON 시각 «뒤»에 시작한 표본은 창 안으로 세지 않는다(전파 지연·앱 자체 5xx 와 구분 불가).

---

## 3. 장애 대응 — Gate 6 (§32.7 8행)

정본 판정 = `evidence/t4-4-external-gate6-verification.md`(검증 좌석). **외부 축에서 실제로 선 행은
2 이고 나머지 6 은 미실측이다.** 🔴 로컬 관측은 참고 열이며 **판정이 아니다** — 외부는 공개 URL·
다른 망·터널을 지난다. 같은 행이라도 **경로가 다르면 다른 사실**이다.

| 장애 | 외부 실측 | 대응 절차 | 등급 |
|---|---|---|---|
| **노트북 OFF** | **PASS** — `/api` 전건 차단에도 정적 replay 완주 · 지표가 무자극과 동일 | 데모를 **정적 replay 로 계속 진행**한다. 「지금 도는 화면」이 아니라 「녹화본」임을 말한다. 복구는 §1 | **E1** |
| **WebSocket 중단** | **PASS** — 끊긴 뒤 **상태 재조회 발생**(1011 events 1 ↔ 1000 events 0 · 재연결 1회 관측) | 조작 불요 — **화면이 스스로 재조회한다**. 30초 넘게 정지면 새로고침 1회 | **E1** |
| FastAPI OFF | **미실측** — 관측자 축 치환 불발(기준선이 이미 「미연결」이라 자극이 아무것도 안 가른다) | 절차 없음. 로컬 관측(참고): Offline 표시 ○ · Replay 전환 ○ | 미실측 |
| PostgreSQL OFF | **미실측** — 외부 대상 파괴 불가 · 관측자 축 설계 미정 | 절차 없음. 로컬 관측(참고): `200 mode=replay` | 미실측 |
| Neo4j OFF | **미실측** — 동상 | 절차 없음. 로컬 관측(참고): `200 mode=replay` · graph 근거 5→5(**강등**으로 통과) | 미실측 |
| Tunnel OFF | **미실측** — 「상한이 있다」와 「화면이 그 상한을 쓴다」는 다른 사실이라 따로 재야 한다 | 절차 없음. 복원 명령만 §2-1 | 미실측 |
| Model timeout | **미실측** — 외부에서 모델 지연을 만들 손잡이가 없다 | 절차 없음. 로컬 관측(참고): `stopped` · `reason=timeout` · replay 경로 200 | 미실측 |
| 동시 요청 초과 | **미실측** — 앞 회차 보고의 근거를 리포에서 찾지 못했다 | 절차 없음. 로컬 관측(참고): 200 ×2 · 503 ×2 · `run.queued` ×2 | 미실측 |

🔴 **여섯 행에 대응 절차를 «지어내지» 않았다.** 안 잰 행에 절차를 적으면 데모 당일 그 절차가
처음 실행되고 처음 틀린다. 재는 순서는 검증 좌석의 재측정 좌표(같은 문서 §4.4)를 따른다.

### 3-1. 먼저 「어느 층이 답했는가」를 가른다

| 관측 | 읽는 법 |
|---|---|
| 로컬 200 · Funnel 실패 | **터널** 문제 → §2-1 |
| 로컬·Funnel 둘 다 실패 | **서비스** 문제 → §1 |
| `/api/health` 200 인데 `status != ok` | 프로세스는 살아 있고 **의존**이 죽었다 — `dependencies` 를 읽는다. 🔴 `/health` 의 200 은 「이 프로세스가 답하는가」만 말한다 |
| 셸 200 · `/api/**` 만 간헐 실패 | **엣지 층** 의심(D-11 계보) — 같은 요청이 회차마다 갈리는지 «센다» |

---

## 4. clean environment — 새 클론에서 세우기

### 4-1. 「1커맨드」 = `infra/bootstrap.ps1` (2026-09-04 실측 · #561) — 손순서 5단은 그 아래

```powershell
pwsh infra/bootstrap.ps1 -ProjectName fkt-<이름> [-Volumes <리포·_wt 밖 경로>]   # 기본 = ~/.fkt-volumes/<이름>
```

한 명령이 아래 5단(compose → `COMPOSE_PROJECT_NAME` → migrate → seed → 색인(venv 포함) → 투영)을
순서대로 돌리고, 단마다 rc 를 «그 자리»에서 보며(파이프 없음), 끝에 **검산 3층**(`health-check.ps1`
두 층 · 벡터 청크 행 ≥1(D-16) · 노드·관계 수)을 낸다. 포트는 프로젝트명에서 **결정적으로 파생**한다
(자유 탐색이면 2회차가 다른 포트를 잡아 컨테이너를 «재생성»하고, 그러면 멱등 판정선 자체가 무너진다).
볼륨 경로가 리포·`_wt/` 안으로 해석되면 실행 «전»에 거부한다(D-13). 파이썬 단 앞에서
`PYTHONIOENCODING=utf-8` 을 고정한다(D-47 경로 완화 · 뿌리는 #560).

**실측(E1 · 2026-09-04 · 센쿠2 39대 · 값의 출처 = PR #561 본문)**

| 회차 | 출발 | rc | 경과 | 검산 | 청크·노드·관계 |
|---|---|---|---|---|---|
| 콜드(수리 전) | 새 클론 `_clean/fkt-0904-0921` | **1** | — | 6단 정지 | **D-47**(투영은 «들어간 뒤» 보고하다 죽음 → #560) |
| Exited(255) 출발 | `fkt-clean-0927`(재부팅 뒤 사용자가 겪는 경로) | 0 | 82.3 s | 3/3 | 59 · 309 · 448 |
| 같은 조건 재실행(멱등) | 같은 스택 | 0 | 63.3 s | 3/3 | 59 · 309 · 448 **불변** |
| 🔴 **콜드 완주(수리본)** | 새 클론 `_clean/fkt-0904-0942` · `git clone` 부터 | **0** | **256.3 s** | **3/3** | 59 · 309 · 448 |

- 🔴 **세 스택(0927 ×2 · 0942)에서 같은 세 수** — 시드·색인·투영이 클론에 의존하지 않는다는 뜻이다(「같은 스택 두 번」보다 한 단계 넓은 재현).
- 콜드 256 초 중 색인 154 초는 **venv 생성 + requirements 설치**다(웜 회차 21.6 초). 모델 다운로드가 아니다 — HF 캐시 증가 0 MB.
- 🔴 **안 잰 것 둘 — 「됩니다」로 쓰지 않는다**: ① **4단 네트워크 축** — 실행 «전» HF 캐시 488 MB 가 선재해, 증가분 0 은 「네트워크 없이 된다」가 아니라 **「캐시 적중이라 안 재졌다」**다(§4-1c 그대로 유효). ② 이 값은 **「이 값에서 섰다」**이지 요구사항이 아니다(Python 3.14 · Docker Desktop · Windows CP949 콘솔 · **1머신 · 다른 머신 0회**).
- 멱등 판정선 = **세 수의 불변**이다. 「오류가 안 났다」가 아니다.

**손순서 5단** — 1커맨드가 안에서 도는 순서와 같고, 손으로 돌 때도 순서가 규칙이다(migrate 가 seed 보다 «먼저», seed 가 색인보다
«먼저», 색인과 투영은 서로 다른 파생이라 **둘 다** 돌아야 한다):

```powershell
docker compose up -d                          # 1) 스택
$env:COMPOSE_PROJECT_NAME='<project>'         # 🔴 기본 project 가 아니면 «필수» — 아래 4-1a
pwsh services/ai-api/db/migrate.ps1           # 2) 스키마 (001~008 순차 · 실물 8본)
pwsh data/seed.ps1                            # 3) synthetic seed 생성 → 적재 → 검증

# 4) 🔴 파생 색인 (T1-4) — seed 가 만들지 «않는다». 이 단이 빠지면 검색·Live 경로가 죽는다
#    🔴 venv 부터 만든다. 이 두 줄이 없으면 아래 .venv 경로가 존재하지 않는다
#       (출처: services/indexer/README.md:16-17)
python -m venv services/indexer/.venv
services\indexer\.venv\Scripts\python.exe -m pip install -r services/indexer/requirements.txt
$env:PYTHONUTF8='1'
$env:FKT_POSTGRES_DSN='host=127.0.0.1 port=<이 스택의 게시 포트> user=fkt password=fkt_local_dev dbname=fkt'   # 🔴 아래 「대상 명시 의무」(D-72)
services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py
services\indexer\.venv\Scripts\python.exe services\indexer\verify_index.py

# 5) 🔴 그래프 투영 (T1-5) — 색인과 «다른» 파생이다. 이 단이 빠지면 GS-01 이 completed 로
#    닫히면서 graph 경로만 0건이 된다(아래 4-1b)
python -m venv services/projector/.venv
services\projector\.venv\Scripts\python.exe -m pip install -r services/projector/requirements.txt
services\projector\.venv\Scripts\python.exe services\projector\build_projection.py
services\projector\.venv\Scripts\python.exe services\projector\verify_projection.py
```

🔴 **조사 화면의 WS 는 «어디로 붙느냐»에 따라 갈린다(D-21)**: 같은 세션·같은 조사로 Funnel 직결
에서는 핸드셰이크가 `101` 로 서고, **공개 셸을 경유하는 구간**에서는 서지 않는다(E1 ·
`evidence/d21-ws-layer-split.md`). 🔴 **그 구간 «안»의 어느 단계가 끊는지는 소견이다** — 좁혀서
잰 값이 아니다. 여기서 세운 clean env 는 직결 축이라 영향이 없다.

#### 4-1a. 🔴 `COMPOSE_PROJECT_NAME` — 안 주면 «다른 스택을 본다» (D-18)

`docker compose` 는 project 를 안 주면 **기본 project(디렉토리명)** 를 본다. 병렬 스택을 다른
이름으로 띄워 놓고 이 값을 빠뜨리면, `migrate.ps1` 은 postgres 가 **healthy 인데도**
「기동 중이 아닙니다」로 죽는다 — 2026-09-02 에 실제로 그랬다(E1 · `evidence/t5-5-clean-env.md`
막힘 #2). 그 실패 문면은 이제 «지정 방법과 지금 떠 있는 project 목록»을 함께 낸다.

```powershell
$env:COMPOSE_PROJECT_NAME='fkt-<좌석>'        # ① 환경변수 (compose 자신도 이 값을 읽는다)
pwsh services/ai-api/db/migrate.ps1 -Project 'fkt-<좌석>'   # ② 인자로 직접 (env 없이도 된다)
```

- 🔴 **스크립트 안의 `docker compose` 호출 «전부»가 이 값을 받는다**(E1 · D-18). 조회 한 곳만
  고치면 그다음 `exec` 가 같은 이유로 죽는다 — project 를 모르면 컨테이너를 고를 수 없다.
- 실측(2026-09-02 · E1): 비기본 project(`fkt-senku2-d18`) 스택에서 ①·② 두 경로 모두
  **exit 0 · 001~008 전건 적용** · 재실행 **exit 0 · 전건 skip**. 미지정 실행은 **exit 1** 이고
  문면이 지정 방법과 후보 project 목록을 낸다.

#### 4-1b. 🔴 5단(투영)이 빠지면 «빈 초록»이 난다 (D-18 · E1)

색인까지만 하고 GS-01 을 돌리면 run 은 **`completed`** 로 닫힌다. 그런데 `graph` 단계만
**경로 0건 · 종단 `[]`** 이고 Neo4j 는 `count(n) = 0` 이다. GraphRAG 주장의 핵심(4-hop)이
**비어 있는 채로 초록이 된다.** 같은 그물을 투영 «전/후»로 한 손잡이만 바꿔 돌린 대조군
(`evidence/t5-5-clean-env.md` §4-3):

| 판정 행 | 투영 **전** | 투영 **후** |
|---|---|---|
| P-GRA graph 0건 통과 금지 | **FAIL · 0건** | **PASS · 5건** |
| P-05 근거 0건인 채 완료된 검색 단계 없음 | **FAIL · `['graph']`** | **PASS · `[]`** |
| exit | **1** | **0** |

**투영 PASS 기준**(`verify_projection.py` · E1): 노드 **309** · 관계 **448** · 짝 판정
**`PAIRED`** · 데이터 지문 일치. 🔴 이 수는 «오늘의 seed» 값이지 불변식이 아니다 —
판정으로 삼을 것은 스크립트의 exit 0 과 짝 판정이고, 수는 그 실행에서 나온 값이다.

#### 4-1c. 🔴 4단은 **네트워크가 필요하다** (E1)

`build_index.py` 는 임베딩 모델(`intfloat/multilingual-e5-small`)을 **Hugging Face Hub 에서
내려받는다**(실측 로그: `You are sending unauthenticated requests to the HF Hub`). 오프라인
머신에서 이 단이 선다는 보장은 **없고, 아직 재보지 않았다** — 「미실측」이지 「된다」가 아니다.

- **멱등**: `migrate.ps1` 은 `schema_migration` 이력을 읽어 적용분을 **건너뛴다**. 🔴 「전부 다시
  돌리기」 스위치는 **일부러 두지 않았다** — 객체를 «교체»하는 마이그레이션이 있어 앞 파일이 뒤
  파일의 결과를 되감고 죽는다(실측 exit 1). 처음부터 세우려면 **DB 를 새로 만들고** 돌린다.
- `seed.ps1` 은 seed 테이블 24종을 **TRUNCATE 후 재적재**한다 — 손으로 넣은 데이터는 사라진다.
  생성분은 random seed·기준 시각이 고정이라 같은 CSV 가 나온다(`data/generated/manifest.sha256`).

#### 4-1d. 🔴 문서를 고쳤으면 4단(색인)을 «다시» 돌린다 — 안 돌리면 조사가 «멈춘다» (Q-72 · E1)

`document_chunk` 는 조각마다 색인 시점의 본문 해시 `chunk_sha256` 을 쥐고 있다(`001_core_schema.sql:234`). 조각 본문(DB 의 `document_chunk.text` · 또는 문서를 다시 seed 한 결과)이 바뀌었는데 4단을 다시 돌리지 않으면 그 조각은 색인과 어긋나고, 조사는 어긋난 조각을 근거에서 **배제**한 뒤 `status=failed` · `code=step_failed:vector` 로 **전면 중단**한다(`app/investigation/runner.py:199` · D-16 과 같은 코드). T5-2 ③ 실측(2026-09-02 · 리바이2 25대): 한 문서 8조각 중 **3조각만** 어긋나도 GS-01 전체가 `failed` 로 끝났다.

- 이것은 설계된 기본값이다(fail-closed · Q-72 · 폐하 승인 09-02 10:40). 어긋난 근거를 안고 «완료»를 내지 않는다.
- 🔴 운영 규칙: **문서 편집 → 4단 재실행(`build_index.py`) → `verify_index.py` PASS** 까지가 «한 동작»이다. 재색인 없이 문서만 바뀐 상태를 두지 않는다. 배포 데모의 문서는 seed 로 고정돼 있어 저절로 어긋날 경로는 없다 — 어긋남은 사람이 만든다.
- 「어긋난 조각만 빼고 경고 이벤트를 남기며 계속」(부분 저하)은 **릴리스 뒤 개선 항목**이다(Q-72 · 코드 변경 + GS-01 회귀 1회). 이 문서는 그것이 «아직 없다»고 적는다.

#### 4단이 «왜» 따로 서 있는가 (D-16)

`document_chunk.embedding` 은 seed 가 적재하는 **권위 원본이 아니라 파생 색인**이다(스펙 §4:
PostgreSQL = 권위 원본 · pgvector = 파생). 그래서 `seed.ps1` 이 아무리 초록이어도 벡터는 0 일
수 있고, **2026-09-01 에 실제로 그랬다**(D-13 재구성 뒤 16:26~19:11 공개 Live 경로 실패).
「seed 계수 · neo4j 대조 · health ok」 **셋 다 벡터 0 을 못 본다** — 원본을 세는 축과 파생을
세는 축이 다르기 때문이다.

- 🔴 **대상 명시 의무(D-72 · 09-04).** `build_index.py`·`verify_index.py`·`build_projection.py` 는 대상을
  **`FKT_POSTGRES_DSN`(env) 또는 `--dsn`** 로만 정한다 — **기본 포트는 없다**(옛 기본 5434 와
  `PGHOST`/`PGPORT` 조각 조립은 제거됨 · 둘 다 없으면 DB 를 건드리기 «전» rc 2 +
  「대상 DSN 이 없다 — FKT_POSTGRES_DSN 또는 --dsn 을 주라」). 사유 = 파생 색인을 통째로 지우고
  다시 만드는 명령의 «대상»이 기본값에 맡겨져 있으면 병렬 스택에서 **다른 스택을 지운다**(리바이2 45대
  실측 · 5434 가 비어 있어 무사). compose 는 여전히 `"${POSTGRES_PORT:-5434}:5432"` 이므로 DSN 의
  port 는 `docker port <postgres 컨테이너>` 로 **실측해서** 넣는다. 집행 사례: `port=5536`.
- 🔴 **호스트에서 돈다.** ai-api 이미지에는 indexer 소스가 없다(`Dockerfile` 은 `COPY app ./app`
  뿐) — 컨테이너 안 `python -m …` 형태는 **없다**. 호스트의 `services/indexer/.venv` 를 쓴다.
- **부작용**: `DELETE FROM document_chunk` → 전량 INSERT 를 **단일 트랜잭션**으로 한다(UPDATE 아님).
  중복 위험 0 · 커밋 전까지 옛 상태가 보이므로 추가 다운타임 없음. `index_build` 원장만 실행마다
  append 된다(감사 기록이라 정상). 벡터 인덱스는 HNSW 라 재빌드 뒤 별도 작업이 필요 없다.
- **검증 SQL 1줄** — 실행 «전후» 같은 줄을 돌려 값이 바뀌는지 본다:

  ```sql
  SELECT count(*) chunks, count(embedding) embedded, count(DISTINCT embedding_model) models FROM document_chunk;
  ```

  | | 기대 |
  |---|---|
  | 색인 전(재구성 직후) | `0 · 0 · 0` |
  | 색인 후 | **`59 · 59 · 1`** (2026-09-01 집행 실측: 59/59 · success 45 · skipped 15 · 23s) |

  🔴 **59 는 오늘의 seed 값이지 불변식이 아니다.** 판정으로 삼을 것은 숫자가 아니라
  `embedded > 0` · `embedded = chunks` · `models = 1` 이다(`verify_index.py` 와
  `infra/health-check.ps1` 의 `retrieval` 행이 그 형태로 본다).

### 4-2. 볼륨 자리 — 🔴 워크트리 «안»에 두지 않는다 (D-13)

`VOLUME_ROOT` 는 **리포·`_wt/` 밖의 고정 경로**여야 한다. 워크트리 안에 두면 `git worktree remove`
가 gitignored 볼륨까지 디렉토리째 지운다 — **`git status` 가 깨끗한 것은 「지워도 되는 게 없다」는
뜻이 아니다.** 워크트리를 지우기 전에 `docker ps -a` 전수의 `Mounts.Source` 를 대조한다.

병렬 스택은 프로젝트명·포트·볼륨 자리를 **함께** 달리 준다:

```
COMPOSE_PROJECT_NAME=fkt-<좌석>  POSTGRES_PORT=55xx  NEO4J_HTTP_PORT=75xx
VOLUME_ROOT=<리포 밖 고정 경로>/.volumes-<좌석>
```

🔴 postgres 는 **named volume** 이라 `COMPOSE_PROJECT_NAME` 만 달라도 자동 분리된다. **neo4j·models 는
아직 bind** 라 `VOLUME_ROOT` 를 빠뜨리면 두 스택이 같은 데이터를 문다.

#### 재구성(D-13 형) 게이트 — 🔴 **벡터 계수 행을 반드시 센다** (D-16)

볼륨을 잃고 다시 세운 뒤에는 아래를 **행으로** 확인한다. 앞 세 줄이 전부 초록이어도 넷째 줄이
빨강일 수 있다 — 2026-09-01 이 그 실증이다.

| # | 무엇을 센다 | 이 행이 «못» 보는 것 |
|---|---|---|
| 1 | seed 계수 | 파생 색인 — seed 는 `document_chunk.embedding` 을 만들지 않는다 |
| 2 | neo4j 대조 | 같음 (그래프 축이라 벡터를 안 본다) |
| 3 | `/api/health` 200 · health-check rc 0 | `-PgContainer` 를 안 줬으면 색인 층이 **SKIP** 이라 역시 못 본다 |
| 4 | 🔴 **벡터 계수** — `SELECT count(*), count(embedding), count(DISTINCT embedding_model) FROM document_chunk` | — (이 행이 그 축이다) |

**🔴 「seed 계수 · neo4j 대조 · health ok」 셋은 벡터 0 을 못 본다.** 재구성 뒤 4단(§4-1)을
돌리지 않으면 위 1~3 이 초록인 채로 검색·Live 경로만 죽는다(16:26~19:11 공개 Live 실패 · E1).

### 4-3. 초기화

| 대상 | 방법 |
|---|---|
| **postgres** | `docker compose down -v` — 🔴 **폴더를 지워도 초기화되지 않는다**(named volume) |
| neo4j · models | `VOLUME_ROOT` 폴더 삭제 또는 `down -v` |
| 전부 한 번에 | `docker compose down -v` |

---

## 5. 운영 주의

### 5-1. Vercel 일일 배포 상한 (D-14 · E1)

Hobby 계정은 **일일 배포 수 상한**이 있고, 소진되면 모든 PR 의 Vercel check 가
`Deployment rate limited — retry in 24 hours` 로 떨어진다(같은 날 앞선 PR 들은 pass 였다 =
코드 축이 아니다). 상한을 먹는 주범은 **lane 브랜치 preview 빌드**였고, 지금은 꺼져 있다:

```json
// apps/web-console/vercel.json — Root Directory(apps/web-console) 기준으로 읽힌다
"git": { "deploymentEnabled": { "lane/*": false } }
```

**두 원인은 흔적으로 갈린다(E1)**: 상한은 배포를 만들고 **실패 status 를 남기고**, 이 설정은
**아예 만들지 않는다**(같은 상한 구간에서 commit statuses 1 ↔ 0). 🔴 **상한에 걸리면 24시간 동안
main 승격도 못 한다** — 데모 전날에 배포를 몰아 쓰지 않는다.

### 5-2. 열쇠 창

좌석 계보 전파 창(«열쇠 창») 동안에는 좌석 킬·교대가 금지되고, 데모 중 대응 인력이 갈릴 수
있다. 🔴 **창의 좌표는 이 문서가 정하지 않는다** — 정본은 자비스 공지다. 데모 시각을 잡을 때 그
창을 먼저 확인한다. (이 리포에서 잰 값 없음 — **미실측**)

---

## 6. 이 문서가 «안 적은» 것 — 「안 잰 것」과 「못 재는 것」을 가른다

| 축 | 상태 | 막는 것 |
|---|---|---|
| Gate 6 6행(FastAPI·PG·Neo4j·Tunnel OFF · Model timeout · 동시 요청 초과) | **미실측** | 외부 대상 파괴 불가 · 관측자 축 설계 미정 · 앞 회차 근거 미확인 |
| 재부팅 후 **Funnel 설정 복원** | **미실측** | 재부팅 «후» `funnel status` 를 확인한 적이 없다 |
| 재부팅 실측 횟수 | **1회** | 1회는 «되더라»이지 «된다»가 아니다 |
| 「새 클론 → 1커맨드」 | **실측 1회** (E1 · 2026-09-04 · #561) | `infra/bootstrap.ps1` — 진짜 새 클론에서 `git clone` 부터 검산까지 rc 0 · 256.3 s · 검산 3/3 · 세 스택 같은 세 수(§4-1 표). 🔴 남은 것 = 네트워크 축(캐시 적중이라 안 재짐) · **다른 머신 0회** |
| `retrieval` 행을 **실제 컨테이너에 대고** 울려 본 것 | **미실측** | 이 개정은 컨테이너 무접촉 조건에서 썼다 — `docker exec` 를 한 번도 하지 않았다. 판정식은 «참»(`59\|59\|1`→PASS)과 «거짓»(`59\|0\|0`·`0\|0\|0`·`59\|58\|1`·`59\|59\|2`→FAIL)·«계측 실패»(빈 문자열·psql 오류→SKIP)로 따로 울려 확인했고 파일은 parse OK 다. 남은 것은 실환경 1회 |
| 5단을 **새 클론에서 처음부터** 돌린 실측 | **실측 1회** (E1 · 2026-09-02 · #361) | `evidence/t5-5-clean-env.md` §4-4 — 타 경로 새 클론에서 **5단 완주**(GS-01 연쇄 13행 끊긴 곳 0). 🔴 그 완주는 **우회 경로**로 이룬 것이고 「README 만으로」가 아니다(아래 줄) |
| clean environment 를 **다른 경로**에서 실제로 세운 실측 | **실측 1회** (E1 · 2026-09-02 · #361) | `evidence/t5-5-clean-env.md` §1 — 🔴 단 「README 만으로」 열은 **0단계에서 끝났다**(실행 명령 블록 0 · 코드블록 3개 전부 mermaid · 다음 문서 링크 없음). 세워진 것은 **우회 경로**이고, §35.6 「README 만으로 재현」은 **여전히 미충족**이다 |
| ai-api 컨테이너 healthcheck | **정의 없음** | `docker run` 형상이라 계측기가 SKIP 을 낸다 — 「초록」이 아니다 |

---

## 7. Live 합성 게이트웨이 — ON/OFF 와 이미지 교체 (T6-2 · E1 센쿠2 32대 2026-09-03)

### 7-1. ON/OFF 는 «소유자 PC 의 프로세스»다

배포 컨테이너는 재기동하지 않는다. 게이트웨이를 켜고 끄는 것이 곧 Live 합성의 ON/OFF 다.

```powershell
pwsh -File services/synthesis-gateway/switch.ps1 on|status|off       # 로컬 전용(루프백)
# 배포 컨테이너(8010)가 닿아야 할 때 — 🔴 비루프백 bind 는 토큰이 없으면 «기동을 거부»한다
pwsh -File services/synthesis-gateway/run.ps1 -Bind 0.0.0.0 -Token <값> -Model opus -Effort medium
```

| env(게이트웨이) | 기본 | 무엇 |
|---|---|---|
| `SYNTHESIS_GATEWAY_BIND` | `127.0.0.1` | 비루프백 + 토큰 없음 = 기동 거부(소리 내어) |
| `SYNTHESIS_GATEWAY_PORT` | `8787` | |
| `SYNTHESIS_GATEWAY_TOKEN` | (없음) | 설정하면 `/health` 를 포함한 **모든** 경로가 `X-FKT-Gateway-Token` 을 요구한다 |
| `SYNTHESIS_GATEWAY_TIMEOUT_MS` | `60000` | 🔴 클라이언트 예산(`SYNTHESIS_TIMEOUT_MS`)과 **다른 이름**이다 |
| `SYNTHESIS_MODEL` / `SYNTHESIS_EFFORT` | `opus` / `medium` | 빈 문자열을 «명시»하면 CLI 기본 |

🔴 **타임아웃 불변식 = 「게이트웨이 상한 < 클라이언트 예산」**(예산 = 상한 + 5s margin). 게이트웨이가
먼저 504 로 «사유»를 내고 클라이언트는 그 답을 받을 만큼만 더 기다린다. 예전에는 두 층이 **같은
이름**을 읽어서, 한 셸에서 값을 키우면 두 상한이 함께 올라가고 「어느 쪽이 끊었나」가 사라졌다
(09-02 지연 드릴 0/4 무효의 진범 후보). 구 이름만 준 채로 뜨면 게이트웨이가 경고 1줄을 낸다.

확인: `curl -H "X-FKT-Gateway-Token: <값>" http://127.0.0.1:8787/health` →
`{"ok":true,"timeoutMs":...,"model":"opus","effort":"medium"}`.

**OFF 로 내리면** `/api/live/status` 가 캐시(5s) 만료 뒤 `online:false` 로 바뀌고 화면이 REPLAY 축 +
「Live AI 합성이 꺼져 있습니다(소유자 게이트웨이 미도달)」 문면으로 내려간다. 🔴 `online:false` 는
**결함이 아니라 참**이다(공개 배포의 정상 상태 = REPLAY 축 · baseline §15.2).

### 7-2. 배포 컨테이너에 Live 를 붙일 때 더하는 env 2개

| env(ai-api) | 값 | 주의 |
|---|---|---|
| `FKT_LOCAL_SYNTHESIS_GATEWAY` | `http://host.docker.internal:8787` | **없으면** live 모듈이 import 조차 되지 않는다(공개 배포의 기본 상태) |
| `FKT_SYNTHESIS_GATEWAY_TOKEN` | 게이트웨이와 **같은 값** | 합성 요청과 도달 프로브 **양쪽** 헤더에 실린다 |

선택: `FKT_RUN_CAP_PER_SESSION`(기본 3 · 세션당 시간당 Live 조사 상한 · 0 이하 = 상한 없음 ·
초과 시 `429 session_run_cap_exceeded` + `Retry-After` · **replay 는 막지 않는다**) ·
`SYNTHESIS_TIMEOUT_MS`(클라이언트 예산 · 기본 60000 → 실제 대기 65s).

### 7-3. 이미지 교체 — 현 컨테이너 형상은 `docker inspect` 원문이 정본

```
이미지     fkt-deploy-ai-api:<sha>
포트       8000/tcp -> 8010
네트워크   fkt-senku2-t15_default
재시작     unless-stopped
Cmd        python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers
바인드(2)  <repo>/data/replay             -> /srv/data/replay  (ro)
           <repo>/.volumes-deploy/models -> /models
env(9)     FKT_TRUST_FORWARDED_FOR · FKT_CORS_ORIGINS · FKT_POSTGRES_DSN · FKT_NEO4J_URI ·
           FKT_NEO4J_USER · FKT_NEO4J_PASSWORD · FKT_WARMUP_EMBEDDING ·
           FKT_REPLAY_FIXTURE_DIR=/srv/data/replay · FKT_BUILD_SHA=<sha>
```

🔴 **바인드 원본 2본은 «메인 체크아웃 안»이지 워크트리 안이 아니다.** D-13(§4-2)의 대상이 정확히 이
축이니, 워크트리를 지우기 전에 `docker ps -a` 전수의 `Mounts.Source` 를 대조한다.

순서(고정):

1. **실행 전 1줄 보고** + D-13 볼륨 대조 → 오케 「가」.
2. `docker build -t fkt-deploy-ai-api:<새sha> services/ai-api`
3. 🔴 **구 컨테이너를 지우지 않고 «세대 이름»으로 보존**:
   `docker rename fkt-deploy-ai-api fkt-deploy-ai-api-<구sha>` → `docker stop fkt-deploy-ai-api-<구sha>`
   🔴 **`-prev` 를 쓰지 않는다.** 「직전」은 상대 표현이라 두 번째 교체에서 반드시 이름이 충돌하고,
   충돌한 자리에서 사람은 「어차피 낡았으니 지우자」로 간다 — 그 순간 되돌릴 자리가 사라진다.
   실제로 09-03 07:5x 실측에서 `fkt-deploy-ai-api-prev` 는 **이미 점유돼 있었다**(09-01 생성 ·
   `fkt-senku2-q3-ai-api:latest` · Exited). sha 를 붙이면 충돌이 구조적으로 없고 이름만 보고
   어느 세대인지 안다. 🔴 **낡은 세대의 정리(삭제)는 destructive 라 운영자·오케 회귀 사안**이다.
4. 위 형상 그대로 새 컨테이너 기동(포트·네트워크·바인드 2 · env 9 + 필요 시 7-2 의 env 2 · `FKT_BUILD_SHA=<새sha>`).
   🔴 **`FKT_BUILD_SHA` 는 «승계하지 않는다» — 새 이미지의 값을 쓴다.** 구 컨테이너의 env 를
   기계적으로 옮기는 방식(`docker inspect` → `-e` 재부여)은 이 키까지 옮기는데, 구 이미지는
   `FKT_BUILD_SHA=unknown` 으로 구워져 있어 sha 의 «정본이 런타임 `-e`» 였다. 실측(09-03 09:19 ·
   센쿠2 33대 1차 시도): 새 컨테이너의 이미지 env 는 `ad788d3` 인데 `/api/health.build` 는
   **`4685d80`** — 새 코드가 낡은 sha 로 자기를 소개했다. 「이미지에 이미 있던 env 는 빼고
   런타임에 추가된 것만 옮긴다」는 정확한 필터가 바로 이 도장을 통과시킨다. 자기 정체를 말하는
   값은 승계 목록에서 «명시적으로» 제외한다(그래서 5단의 완료 조건이 있다).
5. **완료 조건 = `GET /api/health` 의 `build` 가 «새 sha»**. 컨테이너가 떴다는 것과 새 코드가 답한다는 것은 다른 사실이다.
6. 되돌리기: 새 컨테이너 stop/rm → `docker rename fkt-deploy-ai-api-<구sha> fkt-deploy-ai-api` → start
   → 🔴 `/api/health.build` 가 **구 sha** 로 돌아온 것까지 확인해야 되돌리기가 끝난다.

### 7-4. 이 절이 «안 적은» 것

- 게이트웨이를 **상시 가동**하는 형상(현 규율은 실측·시연 때만 켠다).
- 토큰 회전 절차(현재는 프로세스 재기동이 곧 회전).
- `host.docker.internal` 이 **없는** 런타임(Docker Desktop 이 아닌 환경)의 대체 주소 — **미실측**.
  🔴 이 호스트(Docker Desktop · Windows)에서의 도달 «자체»는 아래 7-5 에서 실측됐다 — 두 문장을
  가른다. 「이 형상에서 닿았다」는 「어느 형상에서나 닿는다」가 아니다.
- 배포 축에서 **합성 1회 실왕복** — 미실행(구독을 쓰는 자극이라 검증 발주 시 집행).

### 7-5. 배포 축 ON/OFF 실측 (E1 · 2026-09-03 07:51~07:53 · 센쿠2 32대 · 구독 소모 0)

이미지 `fkt-deploy-ai-api:4685d80` 교체 직후, 같은 컨테이너에 대고 잰 값이다. 프로브는
게이트웨이 `GET /health` 만 두드리므로 **합성 호출은 0회**다.

| 축 | 관측 | 시각 |
|---|---|---|
| 게이트웨이 OFF | `/api/live/status` → `{"online":false}` | 07:52:01 |
| ON(`-Bind 0.0.0.0` + 토큰) · 토큰 동봉 | 게이트웨이 `/health` **200** `model=opus effort=medium` | 07:53:0x |
| ON · **무토큰** | **401** — 사유에 토큰을 싣지 않는다 | 07:53:0x |
| ON · **컨테이너에서** | `/api/live/status` → `{"online":true}` | 07:53:09 |
| OFF 후 7초(캐시 5s) | `{"online":false}` 복귀 | 07:53:36 |

- 🔴 **교체 «전»에 이미지 내부를 먼저 열어 봤다** — `/srv` 에서 새 파일·새 상수 6/6 실재를 확인한
  뒤 교체했다. 「빌드했다」와 「새 코드가 이미지 안에 있다」는 다른 사실이고, 뒤의 것이 거짓인 채로
  교체하면 `/api/health.build` 만 새 sha 로 바뀐 «껍데기»가 선다.
- 🔴 **`-prev` 슬롯은 이미 점유돼 있었다**(09-01 · `fkt-senku2-q3-ai-api:latest` · Exited). 7-3 의
  sha 이름 규칙은 그 실측에서 나왔다.

## 8. develop 환경 ≠ production 환경 (T7-42 · 폐하 하명 2026-09-05 20:03~20:07)

**production 3면** = ai-api `:8010`(`fkt-deploy-ai-api`) · 게이트웨이 `:8787`(호스트 프로세스) · Vercel production(`main`). 실제 사용자 운영 환경이며 **검증 무대가 아니다**. 변경은 `CLAUDE.md §5` 5단(develop 병합 → develop 환경 검증 → 승격 청구 → 허가 → 집행) 안에서만.

### 8-1. production 은 «승격 산출물»만 읽는다

| 자리 | 읽는 것 | 만드는 명령 |
|---|---|---|
| 게이트웨이 프롬프트·코드 | `~/.fkt/prod/gateway/`(`gateway.py`·`system_prompt.txt`·`requirements.txt`·`run.ps1`) · env `SYNTHESIS_GATEWAY_PROMPT_FILE` | `pwsh -File infra/promote-artifacts.ps1 -Sha <main sha>` — `git archive <sha>` 로 내보낸다(워킹트리 복사 0 · 해시 대조 rc) |
| replay 픽스처 | `~/.fkt/prod/data/replay/`(컨테이너 `-v` 소스) | 같은 명령 |
| 승격 sha 정본 | `~/.fkt/prod/BUILD_SHA`(`gateway/BUILD_SHA` 는 같은 실행의 같은 값 · 사본) | 같은 명령 |
| 자동 시작 | 예약 작업 `FKT-Gateway-On` → `~/.fkt/gw-autostart.ps1` = 리포 `infra/gw-autostart.ps1` 의 사본 · 산출물 `run.ps1` 을 띄운다 · 산출물 아닌 프롬프트로 떠 있으면 `exit 3`(죽이지도 축복하지도 않는다) | 호스트 파일 교체 = 승격 집행 항목 |

「어느 프롬프트로 도는가」는 `:8787 /health` 의 `promptPath`·`promptSha256`(호출마다 재독 · 캐시 없음)이 자기 입으로 말한다. 메인 체크아웃 `services/synthesis-gateway/system_prompt.txt` 를 바꿔도 production 은 변하지 않아야 한다(T7-42 게이트 1).

### 8-2. develop 환경 = §5 ②의 무대

| 축 | 값 |
|---|---|
| 워크트리 | `../_wt/develop-stage`(`origin/develop` detach · 좌석 것이 아님) |
| ai-api | `fkt-dev-ai-api` · `:8020` · 이미지 `fkt-ai-api:dev-<sha>` · 재시작 정책 없음(재부팅 자동 복귀 대상 아님) · DSN/neo4j = 검증 스택 `:5534`/`:7587` |
| 게이트웨이 | `:8797` · loopback · 토큰 없음 · 프롬프트 = 그 워크트리 파일 |
| 명령 | `pwsh -File infra/develop-stage.ps1 up|down|status|refresh`(멱등 · production 좌표를 주면 실행 전 `exit 4`) |
| Vercel | develop preview **없음**(`apps/web-console/vercel.json` `git.deploymentEnabled.develop=false` · `FKT_API_BASE` 없으면 빌드 실패) → 화면 축은 로컬 빌드 · API 축은 `:8020`(갈래 ⓑ · preview 를 켜는 것은 외부 노출 판단 = 운영자) |

승격 청구문에는 **이 무대에서 잰 값**을 적는다. 좌석 워크트리 임시 무대(`:8090`…)는 처방 전/후 비교 같은 실험용이다.

