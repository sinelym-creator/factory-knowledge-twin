# tests/graph — Neo4j 투영 «독립» 검증 자산 (T1-5 검증 좌석)

`services/projector/verify_projection.py`(구현 좌석의 자기 검사)와 **짝이 아니라 대조**다.
구현 검사기가 초록을 내는 것과 투영이 옳은 것은 다른 문장이므로, 여기 있는 기대는 전부
**다른 정본에서 따로 조립**한다.

| 무엇을 정본으로 삼는가 | 어떻게 |
|---|---|
| 스펙 §2 관계표(R01~R25 · 투영 ✅ 열) | 이 디렉터리의 파서가 마크다운을 **직접** 읽는다 |
| 스펙 §4 저장 분담표(라벨별 Neo4j 속성 키) | 〃 |
| 관계의 «원천»(어느 테이블·어느 열) | PostgreSQL `information_schema` **FK 그래프에서 도출**한다 — `manifest.py`의 SQL을 읽지 않는다 |
| `manifest.py`의 `NODES`·`RELATIONS` | **검증 대상**이라 읽는다. 그 검사 함수(`check_spec`·`selfcheck`)는 쓰지 않는다 |

## 실행

```powershell
$env:COMPOSE_PROJECT_NAME='fkt-levi2'; $env:POSTGRES_PORT='5534'
$env:PGPORT='5534'; $env:NEO4J_BOLT_PORT='7587'
pwsh tests/graph/run-graph-verify.ps1               # 3축 한 번에
pwsh tests/graph/run-graph-verify.ps1 -SkipRebuild  # 재현성 축만 건너뛴다
```

전제 = compose 스택 + `migrate.ps1`(001~006) + `data/seed.ps1` + 색인 1회 + projector venv
(`python -m venv services/projector/.venv` 후 `requirements.txt` 설치 · 실측 조합 `neo4j 6.3.0` ·
`psycopg 3.3.4` · py 3.14).

| 자산 | 무엇을 재는가 | 쓰는가 |
|---|---|---|
| `graph_verify.py` | 투영이 **스펙·PG와 같은 말을 하는가** — 노드 속성 값·관계 전량·P4 라벨 부재·S5 3종·원장 정합(18항) | 읽기 전용 |
| `graph_drill.py` | **그 검사가 실패를 낼 수 있는가** — 회귀 4관계 끊김·값 변조·관계 삭제·짝 판정 5상태·지문 가드(22항) | 쓴다(전건 되감기) |
| `run-graph-verify.ps1` | ① 독립 검증 ② 재현성(재투영 전후 덤프 지문) ③ 대조군 — 셋을 한 exit code로 | 재투영 1회 |

🔴 **`graph_drill.py`는 쓴다.** 세 층을 각각 되감는다 — Neo4j = 명시 트랜잭션 rollback ·
PostgreSQL = `savepoint` rollback · manifest = 메모리만(파일 무접촉). 마지막 `D-0`(그래프 지문)와
`D-0p`(원장 행수)가 되감김을 실측한다. 타 좌석 스택에 겨누지 마라.

## 판정 규칙

| exit | 뜻 |
|---:|---|
| 0 | 세 축 전건 통과 |
| 1 | 실패 1건 이상 — **두 방향으로 갈라 읽는다**: ①이 빨강이면 투영이 어긋난 것, ③이 빨강이면 **내 검사가 죽은 것** |
| 2 | 실행 오류(스택 미기동 · venv 없음) |

🔴 **③을 놓치면 ①의 초록이 증거가 아니게 된다.** 실제로 이 자산을 세우면서 드릴이 세 번 틀렸고
(주입이 엉뚱한 축을 건드렸다), 셋 다 「구현이 틀렸다」로 보고될 뻔했다 —
경위는 `evidence/t1-5-graph-projection-verification.md` §3.1.

## 사정거리 (여기서 «보지 않는» 것)

- 속성 «키»의 기대는 스펙 §4 문구에서 온다 — **스펙이 틀리면 검사와 구현이 같이 틀린다**.
- 관계 원천은 (출발, 도착) 쌍당 후보가 **유일**할 때만 채택하고, 둘 이상이면 예외로 세운다.
- 재현성은 「PG가 그대로일 때 다시 만들면 같다」까지다. **PG가 바뀐 뒤 그래프가 낡는 것**을 보는
  축은 여기에 없다(그 축 자체가 아직 없다 — evidence §6 회부 ④).
