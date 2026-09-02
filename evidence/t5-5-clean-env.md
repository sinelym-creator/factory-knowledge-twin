# T5-5 clean environment 1회 — 타 경로 새 클론 재현 시도

> 🔴 **이 문서는 두 열을 «절대» 합치지 않는다.**
> **열 A =「README 만으로」** — 정본 축이다(§35.6 「clean seed·index·run 절차가 README만으로 재현된다」).
> **열 B =「우회」** — README 밖의 문서·관례·내 지식으로 메운 것. B 의 초록은 A 의 근거가 **되지 않는다.**
>
> 🔴 **나는 이 리포를 안다 — 그것이 이 측정의 최대 오염원이다.** 그래서 «내가 알아서 건너뛴
> 자리»는 전부 **막힌 자리로 먼저 적고** 나서 진행했다. 기억으로 메운 단계는 초록이 아니라 결함이다.
>
> 검증 좌석 리바이2 **25대** · 발주 = 스자쿠 18대(2026-09-02 · T5-5 축소판 잔여 축) ·
> 클론 = `<clean-clone>`(= 사용자 홈 아래 `_clean/fkt-0902` · 🔴 리포·`_wt` **밖** · 개인 절대경로는
> §15.2·D-15 규율대로 자리표시자로 적는다) · 기점 `origin/develop` **`d63498d`** ·
> compose project **`fkt-clean`** · `VOLUME_ROOT` = 리포 밖(D-13) · t15·deploy·8011 인스턴스 **무접촉**.

---

## §0 결론 (한 줄 먼저)

🔴 **열 A =「README 만으로」는 0단계에서 끝난다 — 출발선 자체가 없다.**
§35.6 「clean seed·index·run 절차가 README만으로 재현된다」 = **미충족**.

**열 B(우회)는 완주했다** — GS-01 연쇄 13행 끊긴 곳 0. 단 그 완주는 문서가 말하는 **4단이 아니라
5단**으로 이룬 것이고, 그 5단은 **네 곳에 흩어져 있어 한자리에 적힌 문서가 없다**.
길에서 **막힌 자리 5건 · 문서 drift 1건 · 주장-실측 불일치 1건**을 실측했다.

🔴 **가장 값진 한 줄**: 색인만 하고 투영을 빠뜨리면 GS-01 은 **`completed` 로 닫히지만 graph 경로가
0건**이다 — 「완주했다」가 「제대로 완주했다」가 아니다(§4-2). 그 상태를 그물이 정확히 빨강으로
잡았고(§4-3), 빠진 단계를 채우자 같은 그물이 초록이 됐다. **대상 결함이 아니라 절차 결함이다.**

---

## §1 열 A — 「README 만으로」 (E1 · `README.md` 144행 전문)

| 무엇을 찾았나 | 실측 | 판정 |
|---|---|---|
| 실행 명령 블록 | 코드블록 **3개 전부 `mermaid`** | 🔴 **0** |
| `npm`/`pnpm`/`python`/`docker`/`uv`/`make`/`cd` 인용 | `grep` **0건** | 🔴 **0** |
| 전제조건(Docker·Python·Node 버전) | 없음 | 🔴 **0** |
| 포트·환경변수 | 없음 | 🔴 **0** |
| seed·index·run·GS-01 실행법 | 없음 | 🔴 **0** |
| 다른 문서로 가는 링크 | **`LICENSE` 1개뿐** — `docs/deployment/runbook.md` 를 가리키지 않는다 | 🔴 체인 끊김 |
| 🔴 결정적 문면 | `README.md:138` = 「라이브 데모 링크, 측정된 성능 지표(KPI), **벤치마크 재현 방법은 배포 후 이 자리에 게시됩니다**」 | README 가 **재현 절차를 담지 않겠다고 스스로 선언**한 상태 |

⇒ **막힌 자리 #1 = 출발선 부재.** 이것은 「어느 명령이 실패했다」가 아니라 **「실행할 명령이 없다」**다.
새 클론을 받은 사람이 README 만 읽고 할 수 있는 일은 **0건**이며, 다음에 어디를 봐야 하는지도
README 가 말하지 않는다.

🔴 열 A 는 여기서 **종료**한다. 아래 §2 는 전부 열 B 다.

---

## §2 열 B — 우회 경로로 어디까지 가는가

### 2-0. 우회 경로를 어떻게 찾았나 (내 지식이 아니라 리포가 준 것만)

1. 루트 `ls` → `docker-compose.yml` 발견(관례적 추측 — README 가 시킨 것이 아니다)
2. 루트 `INDEX.md` → `docs/deployment/runbook.md` 지목 발견
3. runbook **§4 clean environment** = 🔴 **「1커맨드는 아직 없다」**고 스스로 적고 **4단**을 준다

### 2-1. 단계표

| 단 | 명령(문서 그대로) | 결과 | 소요 |
|---|---|---|---|
| 1 | `docker compose up -d` | **exit 0** — postgres·neo4j·ai-api 3본 생성 · 전건 `healthy` · 🔴 `docker build` **정상**(자격 헬퍼 stale 계보 발현 0) | 이미지 빌드 포함 ≈4분 |
| 2 | `pwsh services/ai-api/db/migrate.ps1` | 🔴 **exit 1 — 막힘 #2** (§2-2 ①) | — |
| 2′ | 〃 + `COMPOSE_PROJECT_NAME` 명시 | **exit 0** · 마이그레이션 **001~008 8본** 적용 | ≈6초 |
| 3 | `pwsh data/seed.ps1` | **exit 0** · D-5 ①②③ 대조군 전건 기대대로(미매핑 FM-TOOL-IMB 1행 · 매핑 경로 4-hop 종단 `SAF-LOTO-01`) | ≈1분 |
| 4 | `services\indexer\.venv\Scripts\python.exe build_index.py` | 🔴 **막힘 #3 — `.venv` 가 없다** (§2-2 ②) | — |
| 4′ | `services/indexer/README.md:16-17` 대로 venv 생성 + `pip install` | **(§4 결과)** | (§4) |

### 2-2. 막힌 자리 — 「어디서 · 무엇을 보고 · 무엇이 없어서」

| # | 어디서 | 무엇을 보고 | 무엇이 없어서 | 등급 |
|---|---|---|---|---|
| 1 | 열 A 출발 | `README.md` 전문 | **실행 절차 전부**(명령·전제·포트·env) · runbook 링크 | 🔴 **README 결함** |
| 2 | 2단 migrate | runbook §4 `pwsh services/ai-api/db/migrate.ps1` | **`COMPOSE_PROJECT_NAME` 지정 줄** — 기본 project 아닌 스택에서는 스크립트가 자기 DB 를 못 찾는다 | 🔴 **문서 결함 + 주장-실측 불일치**(아래) |
| 3 | 4단 색인 | runbook §4 `services\indexer\.venv\Scripts\python.exe …` | **그 `.venv` 를 «만드는» 절차** — runbook 에 `python -m venv`·`pip install` **grep 0건**. 실제 절차는 `services/indexer/README.md:16-17` 에만 있고 **runbook 도 README 도 그 파일을 가리키지 않는다** | 🔴 **문서 체인 끊김** |
| 4 | (포트) | README | **포트 지정 자체가 없다** — 「README 가 시키는 대로만」이라는 규율에서는 **포트를 고를 근거가 없는 것이 곧 막힌 자리**다. compose 기본값(5434·7474·7687·8000)으로 우회했고, 4개 전부 비어 있음을 먼저 실측했다 | 🔶 README 결함(경미) |
| 5 | 4단 뒤 | runbook §4 4단 목록 | 🔴 **그래프 투영 단계 전체**(`services/projector/**`) — 리포에 실재하고 `INDEX.md:31` 이 지목하는데 **clean env 절차만 부르지 않는다**. 그 결과 GS-01 이 «완주»하면서 graph 경로 0건이 된다(§4-2·§4-3) | 🔴 **문서 결함(최대)** |

🔴 **막힘 #2 의 진짜 내용 — 주석이 실측보다 넓게 주장한다.**
`migrate.ps1` 의 `param()` 주석은 이렇게 적혀 있다:
「D-1 구조 격리: 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다.
**container_name을 없앴으므로 프로젝트명이 달라도(좌석별 병렬 스택) 그대로 동작한다.**」
그런데 실측은 **exit 1**이었고, 그 순간 대상 postgres 는 **`healthy`** 였다. 오류 문면은
「compose 서비스 'postgres' 가 기동 중이 아닙니다」. 원인은 스크립트 `:50` 의
`docker compose ps --status running --services` 가 **project 를 모르면 compose 파일의 기본값
(`name: ${COMPOSE_PROJECT_NAME:-fkt}`)을 본다**는 것이다.
⇒ **D-1 격리는 «컨테이너 이름» 축만 풀었고 «project 선택» 축은 풀지 않았다.**
「프로젝트명이 달라도 그대로 동작한다」는 **그 축에 대해서는 참이 아니다.**

🔶 **문서 drift 1건(막힘 아님)**: runbook §4 는 스키마를 「**001~005** 순차」라 적었으나 실제 적용은
**008 까지 8본**이다. 절차는 통하지만 문면이 낡았다.

---

## §3 🔴 4단을 건너뛰면 무엇이 죽는가 — 색인 «전» 상태 대조군 (E1)

runbook §4 는 「4단이 빠지면 **검색·Live 경로만** 죽는다」고 적는다(D-16 계보). 그 주장을 이 clean
스택에서 **직접 쟀다** — 3단까지만 끝낸 상태에서 GS-01 을 live 로 돌렸다.

| 축 | 실측 |
|---|---|
| `/api/health` | `ok` · postgres `ok` · neo4j `ok` · embedding `ready`(warm-up 45.0s) · `build "unknown"` |
| 세션 발급 | 200 |
| GS-01 live run 생성 | 200 · `RUN-011c194830a8` |
| run 결말 | 🔴 **`failed`** |
| 이벤트 | **15건** — `structured` 단계는 `step.completed`(equipment 1·sensor 3·alarm 1…) |
| 실패 지점 | 🔴 **`run.failed` · `code = "step_failed:vector"`** |

⇒ **주장 검증**: 「4단 없이도 스택은 `healthy` 로 보이고 structured 단계까지는 간다. 죽는 것은
vector 단계부터다」 — runbook 문면과 **일치**. 이는 배포에서 났던 **D-16 사고(배포 DB
`document_chunk` 0행 → 공개 Live `step_failed:vector`)의 clean env 재현**이다.

🔴 이 대조군이 말하는 것: **`healthy` 는 「색인이 있다」를 뜻하지 않는다.** health 4축(postgres·
neo4j·embedding·build)이 전부 초록이어도 파생 색인은 비어 있을 수 있고, 그 사실은 **run 을
돌려야만** 드러난다.

---

## §4 4단 이후 — 🔴 **runbook §4 는 4단이 아니라 5단이어야 한다**

### 4-1. 4′단 색인 (우회 = `services/indexer/README.md:16-17`)

| 단계 | 명령 | 결과 |
|---|---|---|
| venv + 의존 | `python -m venv .venv` · `pip install -r requirements.txt` | **exit 0** — torch 2.13.0·sentence-transformers 6.0.0 포함 **127 패키지** |
| 색인 빌드 | `PYTHONUTF8=1 PGPORT=5434 … build_index.py` | **exit 0** — revision 60행(approved 45·건너뜀 15) · **chunk 59건** · 모델 `intfloat/multilingual-e5-small`(384d) · 모델 로드 41.8s · 임베딩 3.3s · NFC·`content_sha256` 정규화 대조 통과 |
| 색인 검증 | `verify_index.py` | **exit 0 · 색인 판정 PASS** — 실질의 「스핀들 베어링 마모 진동」 상위 3 = `DOC-MAN-0021@r1#004`(0.8885)·`DOC-MRP-0087@r1#000`·`DOC-SOP-0014@r2#001` |

🔶 **부수 실측**: `build_index.py` 가 **HF Hub 에서 모델을 내려받는다**(`Warning: You are sending
unauthenticated requests to the HF Hub`). ⇒ **오프라인 머신에서는 이 단이 선다는 보장이 없고,
문서 어디에도 「네트워크가 필요하다」는 문장이 없다.** 이 호스트에서는 성공했다.

### 4-2. 🔴 막힌 자리 #5 — 그래프 투영 단계가 절차에 **없다**

색인까지 끝내고 GS-01 을 다시 돌렸다. run 은 **`completed`** 로 닫혔다. 그런데:

| 축 | 실측 |
|---|---|
| 이벤트 | 27건 |
| `structured` | `step.completed` — equipment 1·sensor 3·alarm 1·maintenance_record 4 |
| `vector` | `step.completed` — 인용 후보 **5건** |
| 🔴 `graph` | `step.completed` — **경로 0건 · 종단 `[]`** |
| `synthesize` | `step.completed` — 후보 2건 · 1순위 `FM-BRG-WEAR` |
| `draft_work_order` | `step.completed` — 초안 1건 · 안전 조치 2건 |
| Neo4j 실측 | `MATCH (n) RETURN count(n)` = 🔴 **0** |

⇒ **「완주했다」가 「제대로 완주했다」가 아니다.** GraphRAG 주장의 핵심(설비→고장모드→절차→
안전 규정 4-hop)이 **비어 있는 채로** run 이 초록으로 닫힌다.
원인 = **runbook §4 의 4단에 `services/projector/build_projection.py` 가 없다.**
그 스크립트는 리포에 실재하고(`INDEX.md:31` 이 지목), 자기 README 에 절차도 있다 —
**clean env 절차만 그것을 부르지 않는다.**

### 4-3. 🔴 대조군 — 같은 그물, 투영 «전»과 «후»

같은 그물(`tests/api/scenario_script_drill.py`)을 **한 손잡이(그래프 투영)만 바꿔** 두 번 돌렸다.

| 판정 행 | 투영 **전** | 투영 **후** |
|---|---|---|
| P-VEC vector 0건 통과 금지 | PASS 5건 | PASS 5건 |
| 🔴 **P-GRA graph 0건 통과 금지** | **FAIL · 0건** | **PASS · 5건** |
| 🔴 **P-05 근거 0건인 채 완료된 검색 단계 없음** | **FAIL · `['graph']`** | **PASS · `[]`** |
| P-08 `graph-path` → `?byRun` | PASS(0건) | PASS **5건** |
| **exit** | 🔴 **1** | **0** |

⇒ 두 가지가 동시에 선다.
① **대상 거동은 정상이다** — 서버가 0건 단계를 통과시키는 것은 **데이터 부재**의 결과이고,
   그물은 그 상황을 **정확히 빨강으로 잡도록** 설계돼 있다(T2-3 축⑤ 계보). **대상 결함 아님.**
② **절차가 결함이다** — 빠진 단계를 채우자 같은 그물이 초록이 됐다. 회부는 **문서**로 간다.

### 4-4. 5단(투영) 실행 + clean env 완주

| 단계 | 명령 | 결과 |
|---|---|---|
| projector venv + 의존 | `services/projector/README.md:48-49` | **exit 0**(neo4j 6.3.0 · psycopg 3.3.4 — 가볍다) |
| 투영 빌드 | `build_projection.py` | **exit 0** — 관계 R14~R24 적재 · `graph_build` 원장 1행 |
| 투영 검증 | `verify_projection.py` | **exit 0 · 투영 판정 PASS** — 노드 **309** · 관계 **448** · 데이터 지문 일치 · 🔴 **짝 판정 `{'PAIRED': 1}`** |
| **GS-01 연쇄** | `tests/api/gs01_integration_drill.py` | 🔴 **exit 0 · 13행 끊긴 곳 0** — 귀속 증명 통과 · S7 그래프 경로 **5건** · S9 승인 `AUD-…` · S10 재생본 초안 501 · S11 3전략 각 5건 |

⇒ **열 B 완주.** 단 그 완주는 **5단 절차**(compose → migrate → seed → 색인 → **투영**)로 이룬 것이고,
그 5단은 **어느 문서에도 한자리에 적혀 있지 않다** — 네 곳(runbook §4 · indexer README · projector
README · 관례)에서 모아야 한다.

### 4-5. 🔴 clean env 5단 — 이 문서가 실측한 순서 (문서 반영 권고)

```powershell
docker compose up -d                                    # 1) 스택
$env:COMPOSE_PROJECT_NAME='<project>'                   # 🔴 기본 project 가 아니면 필수(막힘 #2)
pwsh services/ai-api/db/migrate.ps1                     # 2) 스키마 (실제 001~008)
pwsh data/seed.ps1                                      # 3) synthetic seed
python -m venv services/indexer/.venv                   # 🔴 4′) runbook 에 없다(막힘 #3)
services\indexer\.venv\Scripts\python.exe -m pip install -r services/indexer/requirements.txt
$env:PYTHONUTF8='1'; $env:PGPORT='<게시 포트>'
services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py     # 4) 벡터 색인 (HF 네트워크 필요)
services\indexer\.venv\Scripts\python.exe services\indexer\verify_index.py
python -m venv services/projector/.venv                 # 🔴 5) 절차에 통째로 빠져 있다(막힘 #5)
services\projector\.venv\Scripts\python.exe -m pip install -r services/projector/requirements.txt
services\projector\.venv\Scripts\python.exe services\projector\build_projection.py
services\projector\.venv\Scripts\python.exe services\projector\verify_projection.py
```

---

## §5 소요·범위

| 축 | 값 |
|---|---|
| 클론 | `git clone` + `develop` 체크아웃 |
| 1단 compose(빌드 포함) | ≈4분 |
| 2′단 migrate | ≈6초 |
| 3단 seed | ≈1분 |
| 4′단 indexer 의존 설치 | ≈13분(torch 포함 127 패키지 · 이 호스트 캐시 상태 의존) |
| 4단 색인 build+verify | ≈2분(모델 로드 41.8s ×2 · 임베딩 3.3s) |
| 5단 투영 의존+build+verify | ≈1분 |
| GS-01 연쇄 확인 | ≈1분 |
| **합(열 B)** | **≈22분** — 🔴 열 A 는 0단계이므로 소요를 적지 않는다 |

🔴 **결론 범위**: 이 문서는 **한 대의 Windows 호스트에서 1회** 실행한 결과다. 다른 OS·다른
네트워크·의존 캐시가 없는 머신은 재지 않았다. 열 A 의 판정(출발선 부재)만이 호스트와 무관한
**문서 사실**이고, 열 B 의 소요·성공 여부는 이 호스트의 캐시 상태에 의존한다.
