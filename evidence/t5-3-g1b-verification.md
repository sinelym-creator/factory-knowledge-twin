# T5-3 G1b 독립 검증 — `seed.ps1 -Direct` + CI job `seed-db` (PR #863)

- 검증 좌석 = 리바이2 56대 · 발주 = 스자쿠 51대(2026-09-06 09:54)
- 대상 = PR #863(MERGED · develop `8a42a67`) · 구판 `75d55cd` / 신판 `a294c9e`
- 좌표 = 신판 run **34002597378** job `seed-db`(job id 101404027749 · success) · 구판 run **34002477337** job `seed-db`(job id 101403696250 · success)
- 측정 모델: `claude-opus-5`(폴백 없음)
- **판정 = PASS** (미해결 결함 0 · 구판 결함 1건은 신판에서 해소 확증 · 안 본 축은 §6 에 이름으로)

> 🔴 이 초록의 범위: 「ubuntu 러너에서 libpq 직결로 **행이 들어갔다**」의 초록이다.
> 「Windows 에서 된다」·「검색이 된다」의 초록이 아니다(§6).

---

## 1. 축① — 로그 직독 + **내 독립 계수**

### 1-a. 회로가 실제로 직결로 돌았는가 (신판 로그 직독)

| 자리 | 로그 실측 |
|---|---|
| migrate | `Run pwsh -NoProfile -File services/ai-api/db/migrate.ps1 -Direct` |
| seed | `Run pwsh -NoProfile -File data/seed.ps1 -SkipGenerate -Direct` |
| staging | `-- staging /tmp/fkt-seed · csv 24개` |
| 완료 표지 | `== 완료 ==` |

🔴 staging 줄은 `seed.ps1` 의 **`if ($Direct)` 가지 안에만** 있다(compose 가지는 `docker compose cp`). 그 줄이 찍혔다는 것 자체가 **직결 가지를 탔다는 거동 증거**다 — 스텝 이름(자기 신고)에 기대지 않는다.

### 1-b. 계수 — 전언을 받지 않고 내가 다시 세었다

발주문·센쿠2 신고의 「60행/1967줄」은 **전언**이므로, 내 워크트리(`origin/develop` = `8a42a67`)에서 생성기를 직접 돌리고(`python -m data.generators.generate` rc=0) 내 파서(`csv.reader` 행수 / 줄수 각각)로 다시 세었다.

| 테이블 | 내 계수(행) | 내 계수(줄) | CI 신판 DB | CI 신판 CSV | 일치 |
|---|---|---|---|---|---|
| sensor_reading | 949,680 | 949,680 | 949,680 | 949,680 | ✔ |
| equipment | 12 | 12 | 12 | 12 | ✔ |
| **document_revision** | **60** | **1,967** | **60** | **60** | ✔ |
| alarm | 25 | 25 | 25 | 25 | ✔ |
| maintenance_record | 40 | 40 | 40 | 40 | ✔ |

- 생성기는 결정적이다(`config.py:38 RANDOM_SEED = 20260826` · `timeseries.py` 는 `Random(SEED ^ crc32(sensor_id))` 로 `PYTHONHASHSEED` 의존을 피한다) — 그래서 내 로컬 계수와 러너 계수를 비교하는 것이 성립한다.
- **`document_revision` 만 행수 ≠ 줄수**(60 ≠ 1967). 본문에 개행이 있는 CSV 라 **줄수로 세면 32.8배 틀린다**. CI 의 계수 스텝은 행수·줄수를 둘 다 찍고 다르면 주석을 붙인다 — 이 표는 「초록 ≠ 훑음」을 실제로 가르는 자리다.
- 교정: 없는 표를 세면 `FileNotFoundError` 로 죽는 것을 같은 실행에서 확인(내 계수기가 조용히 0을 반환하지 않는다).

### 1-c. staging 계수 24 의 3중 교차

| 근거 | 값 |
|---|---|
| CI 신판 로그 `csv N개` | 24 |
| 내 생성물 디렉터리 `*.csv` 파일 수 | 24 |
| `load.sql` 안 `\copy` 문 수 | 24 |

`load.sql` 안 `/tmp/fkt-seed` 문자열 출현 = **24**(= `\copy` 수) → 「구운 경로가 고정이라 정본을 안 고치고 경로를 실재하게 만든다」는 처방 전제가 실물에서 참이다.

---

## 2. 축② — 대조군(문의 반대쪽)

### 2-a. CI 안의 대조군

```
경로 이동 후 rc=3 (0 이 아니어야 정상)
document_revision 前 60 → 後 60 (롤백되어 같아야 한다)
```

- 형태 = `set -uo pipefail` + `psql ... || rc=$?` → **실패를 삼키지 않고 rc 를 받아 판정**한다(`bash -e` 규약에서 실패가 실패로 남는 형태 ✔).
- `[ "$rc" -ne 0 ] || { echo "::error::..."; exit 1; }` → 「경로가 없는데 성공하면 이 검사는 아무것도 안 막는다」를 스스로 막는다.
- 前後 60 = 60 → 대조군이 데이터를 깨지 않았다(자극이 되돌려졌다).

### 2-b. 🔴 「그 실패가 **경로 축의 것**인가」 — 내 무대에서 rc 의미를 직접 물었다

CI 대조군은 `psql ... > /dev/null 2>&1` 라 **실패 사유 문면이 로그에 없다**. rc=3 만으로는 「경로 때문」이라 단정할 수 없어, 내 무대(`fkt-levi2-postgres-1`)에서 **손잡이 하나만 다른 두 열**을 같은 실행으로 돌렸다.

| 열 | 스크립트 | rc | 문면 |
|---|---|---|---|
| A (경로 없음) | `\copy ... FROM '/tmp/nope-missing/x.csv'` + `ON_ERROR_STOP=1` | **3** | `error: /tmp/nope-missing/x.csv: No such file or directory` |
| B (경로 있음 · 대조군) | 같은 스크립트, 실재 파일 | **0** | `COPY 2` · `loaded = 2` |

→ `ON_ERROR_STOP=1` 아래 **경로 부재의 rc 는 정확히 3**이고, 경로가 있으면 0 이다. CI 대조군의 `rc=3` 은 경로 축의 값과 일치한다.
**한계(정직)**: 위 문면은 내 무대의 것이고 러너의 것이 아니다. 러너에서 「rc=3 + 그 문면」을 함께 본 것은 아니다 — 러너에서 바뀐 손잡이가 `mv /tmp/fkt-seed` 하나뿐이라는 사실이 그 간극을 메운다.

---

## 3. 축③ — PR diff (정본이 둘이 되지 않았는가)

| 검사 | 실측 |
|---|---|
| 변경 파일 | `.github/workflows/ci.yml` (+109 −0) · `data/seed.ps1` (+61 −11) — **2본뿐** |
| `data/generated/load.sql` 변경 | **0** (`git diff 75d55cd~1 origin/develop -- data/generated/load.sql services/` = 0줄) |
| `services/**` 변경 | **0** (같은 명령) |
| psql 호출 자리 | **`Invoke-Psql` 1곳으로 수렴** — 적재 `-f` · 계수 `-c` · 검증 3건 stdin 이 전부 이 함수를 통과. 함수 밖 raw `psql` 문자열은 `[string] $PsqlBin = 'psql'` 기본값뿐 |
| compose 경로 보존 | `Invoke-Psql` 의 `else` 가지 = `docker @compose exec -T $Service psql ...` 원형 유지 · 적재도 `docker @compose cp` 가지 보존 |
| 병합 계보 | `a294c9e`·`75d55cd` 둘 다 `origin/develop` 조상(`merge-base --is-ancestor` 실측) · `8a42a67` = 병합 커밋 |

---

## 4. 구판 결함(센쿠2 자수)의 독립 확인과 **해소 확증**

| | 실측 |
|---|---|
| 구판 run 34002477337 | `-- staging /tmp/fkt-seed · csv ` ← **숫자 없음**(내 직독 · 자수 내용과 일치) |
| 신판 run 34002597378 | `-- staging /tmp/fkt-seed · csv 24개` ← **숫자 있음** |
| 코드 실물(develop) | `seed.ps1:133 Write-Host "-- staging $containerDir · csv ${staged}개"` |
| 가드 무결 | `seed.ps1:134 if ($staged -eq 0) { throw ... }` — `$staged` 를 그대로 쓰므로 구판에서도 **가드는 정상 동작**했다(잃은 것은 로그의 계수뿐) |

**거동 대조(자기 신고 아님)** — 같은 pwsh 실행에서 두 형태를 나란히:

| 열 | 식 | 출력 |
|---|---|---|
| A (옛 형태) | `"csv $staged개"` (`$staged = 7`) | `csv ` — 빈 값 |
| B (처방 형태) | `"csv ${staged}개"` | `csv 7개` |

→ PowerShell 은 한글을 식별자에 허용하므로 `$staged개` 가 **없는 변수 하나**로 파싱된다. 처방이 그 파싱을 끊는 것이 맞다.

### 4-a. 🔴 센쿠2가 「안 본 축」으로 둔 전수 검색을 내가 닫는다

센쿠2는 셸 인코딩 위양성 때문에 `$변수한글` 전수 확인을 주장하지 않겠다고 자수했다. 나는 그 축을 **파일을 UTF-8 로 직독하는 파서**로 다시 돌렸다.

- 대상 = 리포 전체 `.ps1` **17본**(`.git`·`node_modules` 제외) · 읽기 실패 0본
- 정규식 = `\$[A-Za-z_][A-Za-z0-9_]*[가-힣]`
- **hit = 0**
- 교정(같은 실행): 심은 위반 `Write-Host "csv $staged개"` → **문다(True)** · 처방 형태 `"csv ${staged}개"` → 안 문다(True)

→ 그물이 살아 있는 상태에서 0 이므로, 이 0 은 **훑은 0 이 아니다**. `.ps1` 축은 닫힌다(`.psm1`·인라인 PowerShell 은 §6).

---

## 5. 근거 등급

| 축 | 등급 |
|---|---|
| 계수 5줄 · staging 24 · 대조군 rc=3/롤백 (러너) | E1(로그 직독) |
| 내 생성기 실행 + 내 파서 계수 | E1(내 실측) |
| rc=3 = 경로 부재 의미 | E1(내 무대 A/B 두 열) |
| `.ps1` 전수 0 hit | E1(내 파서 + 교정) |
| 「신판·구판 다른 축 동일」 | 내가 두 로그를 각각 직독해 **E1 로 승격**(전언으로 두지 않았다) |

---

## 6. 🔴 이 판정이 **안 본 축** (이름으로 남긴다 — 값이 아니다)

1. **Windows 에서의 `-Direct`** — `/tmp/fkt-seed` 해석이 다르다. 러너는 ubuntu 뿐이고 나도 Windows 경로로는 안 돌렸다.
2. **색인**(`services/indexer/build_index.py` · e5-small) · **ai-api 기동** · **retrieval 품질** — 전부 미실행. 이 초록은 「행이 들어갔다」의 것이지 「검색이 된다」의 것이 아니다. (= G1c)
3. **`benchmark-smoke` 활성** — 이 PR 밖(별건 · `--gate` off 유지).
4. **`.psm1` / yml·md 안에 인라인으로 적힌 PowerShell** — §4-a 의 전수는 `.ps1` 확장자에 한정된다.
5. **CI 대조군의 실패 «문면»** — 러너 로그에는 없다(§2-b 한계).
6. **멱등성** — 같은 job 에서 seed 를 두 번 돌렸을 때의 거동(중복·충돌)은 이 회로가 묻지 않는다.

---

## 7. 자수 (내 손·내 계측기)

1. 처음에 축③ 을 **구판 `75d55cd` diff** 로 열었다. 그 사이 `a294c9e` 가 푸시되고 #863 이 병합되어 좌표가 죽었다 — 병합 실물(`origin/develop` = `8a42a67`)로 다시 읽고, 계보를 `merge-base --is-ancestor` 로 확인한 뒤에야 표를 적었다. 「발주의 전제가 그 사이에 죽는다」의 재발이다.
2. §4 의 pwsh 거동 대조에서 **내 콘솔이 cp949 라 한글이 깨져 출력**됐다(`csv 7??`). 판정에 쓴 것은 「숫자 `7` 이 나왔는가 / 빈칸인가」뿐이고, 깨진 글자는 내 콘솔의 것이지 대상의 것이 아니다.
3. §2-b 는 **내 무대**의 psql 이다. 러너 psql 버전과 같다고 확인하지 않았다 — rc 규약이 psql 공통이라는 전제에 기대고 있고, 그 전제는 이 문서 안에서 실측되지 않았다.
