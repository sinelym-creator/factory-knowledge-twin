# indexer — chunk 분할 정책과 실측 (T1-4)

색인 파이프라인. chunk 분할(게이트 ①·②) · 임베딩 택일(③) · **pgvector 적재와 검증(④·⑤)** 까지
들어 있다. 원천은 `document_revision.body`(PostgreSQL = 권위 원본 · 스펙 §4)이고,
`data/documents/*.md` 를 직접 읽는 것은 probe 도구뿐이다.

> 🔴 **정책은 동결됐다** — `chunking_policy_version = 1` · `section_sentence` · 512 token ·
> overlap 0 (오케스트레이터 판정 2026-08-29 · 근거는 아래 실측). `chunking.FROZEN_POLICY`가
> 그 정본이다. 재개정은 오케스트레이터 몫이며, 임베더 확정 후 max ≤ 512 재실측에서 초과가
> 나오면 빌드를 멈추고 보고한다.

## 재현

```powershell
cd services/indexer
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ../..
$env:PYTHONUTF8 = '1'                                       # 🔴 없으면 CP949로 출력이 깨진다
services\indexer\.venv\Scripts\python.exe services\indexer\probe_chunking.py
```

`data/documents/*.md` 7건과 `data/generators/config.py`의 `EXPECTED_QUOTES` 9건을 읽어
후보안 18종(3 전략 × 3 크기 × overlap 0/15%)을 계수기 5종으로 잰다. DB를 켜지 않는다.

### 색인 빌드·검증 (게이트 ④·⑤ · DB 필요)

```powershell
# 전제: docker compose up -d  →  migrate.ps1  →  data/seed.ps1
$env:PYTHONUTF8 = '1'
$env:PGPORT     = '5535'    # 좌석별 격리 스택을 쓸 때만(dev-environment §4.2)
services\indexer\.venv\Scripts\python.exe services\indexer\build_index.py
services\indexer\.venv\Scripts\python.exe services\indexer\verify_index.py
```

`verify_index.py` 의 인자는 `--dsn` · `--dump` · **`--dump-ledger`** 셋이다(2026-09-04 `argparse` 확인 · `--dump-ledger` 는 이 문서 작성 «뒤»에 붙었다). `verify_index.py --dump` 는 `document_chunk` 전열(384차원 벡터 포함)을 정렬된 TSV로 낸다 —
두 번 빌드한 뒤 이 출력을 `diff` 하는 것이 멱등 판정이다.

## 전략 3종

| 전략 | 자르는 법 |
|---|---|
| `fixed` | 토큰 개수만 세어 자른다. 경계를 보지 않는다(전임 T1-3 표의 「고정」). |
| `section` | `##` 절을 먼저 자르고, 예산을 넘치는 절만 고정 분할로 재분할(전임 표의 「절 경계」). |
| `section_sentence` | `##` → `###` → 문장/줄로 계층 하강. **문장 아래로는 내려가지 않는다** — 문장 하나가 예산보다 길면 그대로 둔다(거기서 자르면 인용이 깨진다). |

## 실측 (E1 · 2026-08-29 · 계수기 `intfloat/multilingual-e5-small`)

### 🔴 토큰 환산 — 전임 인계의 `1 token ≈ 1.3자`(E3)는 실측과 어긋난다

| 계수기 | 자 / token | 근거 |
|---|---|---|
| `multilingual-e5-small` · `bge-m3` (XLM-R 250k vocab) | **1.64 ~ 1.98** | E1 |
| `tiktoken` cl100k | 1.07 ~ 1.17 | E1 |
| `all-MiniLM-L6-v2` (영어 30k vocab) | 0.67 ~ 0.91 | E1 |
| 전임 환산 | 1.30 | E3 |

같은 400 token이 전임 가정보다 **38% 많은 분량**을 담는다. 그래서 전임 예상표보다 chunk가
적게 나온다 — `DOC-MAN-0021@r1` 고정 400은 10개가 아니라 **8개**, 절 경계 400은 14개가 아니라
**11개**다. `DOC-SOP-0014@r2` 절 경계 400은 8개가 아니라 **4개**로, 예상이 2배 빗나갔다.
문서가 바뀐 게 아니라 **환산이 틀렸다**.

### 후보안별 (문서 7건 합계)

| 정책 | 전체 chunk | MAN-0021 | MAN-0022 | SOP-0014@r2 | MRP-0087 | tok min/중앙/max | 예산초과 | 절머리시작% | 인용파손 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `fixed/400` | 20 | 8 | 5 | 2 | 1 | 83/400/400 | 0 | 35 | 0 |
| `fixed/512` | 16 | 6 | 4 | 2 | 1 | 213/512/512 | 0 | 44 | 0 |
| `fixed/600` | 15 | 5 | 4 | 2 | 1 | 32/600/600 | 0 | 47 | 0 |
| `section/400` | 27 | 11 | 7 | 4 | 1 | 48/287/400 | 0 | 81 | 0 |
| `section/512` | 21 | 8 | 6 | 3 | 1 | 60/328/512 | 0 | 95 | 0 |
| `section/600` | 17 | 7 | 4 | 2 | 1 | 163/448/572 | 0 | 100 | 0 |
| `section_sentence/400` | 27 | 11 | 7 | 4 | 1 | 81/287/392 | 0 | 96 | 0 |
| **`section_sentence/512`** | **21** | **8** | **6** | **3** | **1** | **94/316/483** | **0** | **100** | **0** |
| `section_sentence/600` | 17 | 7 | 4 | 2 | 1 | 163/448/572 | 0 | 100 | 0 |

overlap 15%를 준 9종은 표에서 뺐다 — 전부 **예산을 넘는 chunk를 2~12개 만들고**(꼬리를 앞에
붙이므로) 절머리시작%가 26~44로 떨어진다. 겹침의 이득(경계 인용 구제)은 아래대로 이 문서
셋에서 이미 0이라, 손해만 남는다.

- **절머리시작%** = chunk가 마크다운 절 머리에서 시작하는 비율. 맥락 보존의 대리 지표다.
  `fixed`는 35~47%로 절 중간에서 잘리고, `section` 계열은 81~100%다.
- **예산초과** = 정책 예산을 넘긴 chunk 수. 임베딩 모델 입력 상한을 넘으면 **조용히 잘린다**.

### 🔴 인용 온전성은 400~600 구간에서 «포화»다 — 정책을 가르지 못한다

GS-01 S4·S7 기대 인용 9건이 18개 후보안 전부에서 파손 0이다(문장 기준·문단 기준 모두).
인용 문구가 짧고(최장 64자) 문서가 작아 400 token 경계와 겹칠 확률이 낮다.

**지표가 죽은 게 아니라 포화임을 대조군으로 확인했다**(E1 · `fixed` vs `section_sentence`,
문장파손/문단파손, 분모 9):

| 예산 | `fixed` | `section_sentence` |
|---:|---|---|
| 30 tok | 6 / 7 | 1 / 4 |
| 60 tok | 3 / 5 | 0 / 2 |
| 120 tok | 2 / 3 | 0 / 1 |
| 250 tok | 1 / 1 | 0 / 0 |
| 400 tok | 0 / 0 | 0 / 0 |

같은 예산에서 `section_sentence`가 언제나 파손이 적다 = **마진이 크다**. 400에서 둘 다 0이어도,
문서가 길어지거나 인용이 길어질 때 먼저 깨지는 쪽은 `fixed`다. 「지금 0이니 아무거나 좋다」로
읽지 않는다.

### 화면 앵커 — 🔴 어떤 후보안에서도 wireframes의 숫자에 도달하지 않는다

> 🔴 좌표 표기는 **0-based**다 — `#NNN`은 `document_chunk.chunk_index`와 **동치**이며
> `#000`이 첫 chunk다(오케 판정 2026-08-29). id와 index 사이에 변환 계층을 두지 않는 것이
> off-by-one을 구조적으로 막는 방법이다. 아래 값은 모두 이 규칙으로 적혀 있다.

| wireframes 앵커 | 동결 정책에서 그 문서의 실재 좌표 범위 | 판정 |
|---|---|---|
| `DOC-MAN-0021#014` | `#000`~`#007` (8 chunk) | 도달 불가 |
| `DOC-MAN-0022#009` | `#000`~`#005` (6 chunk) | 도달 불가 |
| `DOC-SOP-0014@r2#007` | `#000`~`#002` (3 chunk) | 도달 불가 |
| `DOC-MRP-0087#003` | `#000` (1 chunk · 문서 전체가 512 token 미만) | 도달 불가 |

분량을 앵커에 역산하지 않는다(전임 인계 ⑶). **정책을 동결한 뒤 실값을 보고**하고,
`wireframes.md` 갱신은 오케스트레이터 scope다(티켓 게이트 ⑤).

동결 정책에서의 기대 인용 실좌표 — 게이트 ⑤ 보고분:

| 인용 | 실좌표 |
|---|---|
| `DOC-SOP-0014@r2` 진단 기준·필요 부품(Q1~Q3) | `#001` |
| `DOC-MAN-0021@r1` 「베어링 마모는 초기에 RMS가」·「진동 RMS가」 | `#004` |
| `DOC-MRP-0087@r1` 「베어링 교체」·「2025-02-11」 | `#000` |
| `DOC-SAF-0029@r3` LOTO · `DOC-SAF-0030@r3` PPE | 각 `#000` |

## 동결된 정책과 그 근거 (게이트 ② · 오케스트레이터 판정 2026-08-29)

**`chunking_policy_version = 1` — `section_sentence` · 512 token · overlap 0.**

결정 근거는 분량 취향이 아니라 **모델 입력 상한**이다. 다국어 임베딩 후보
`multilingual-e5-small`의 `max_seq_length`가 512다.

- 600 정책은 실측 max chunk가 572~690 token → 임베딩 단계에서 **잘린다**.
- `512+overlap15%`도 max 544로 초과.
- `overlap 0`의 512만 max 483으로 상한 안에 든다. 그러면서 절머리시작 100% · 예산초과 0.

512는 `e5-small`(max 512)과 `bge-m3`(max 8192) **양 후보에서 생존**한다 — 그래서 이 동결은
게이트 ③(임베딩 택일)에 종속되지 않고, ③보다 먼저 닫을 수 있었다.

## 게이트 ③ — 임베딩 런타임 실측 (E1 · 2026-08-29)

```powershell
services\indexer\.venv\Scripts\python.exe -m pip install sentence-transformers fastembed
$env:PYTHONUTF8 = '1'
services\indexer\.venv\Scripts\python.exe services\indexer\probe_embedding.py
```

입력은 **동결 정책으로 자른 실제 chunk 21건**이다. 합성 문자열로 재면 한국어 토큰 길이가
빠져 시간이 낙관적으로 나온다.

| | `sentence-transformers` / `multilingual-e5-small` | `fastembed` / `paraphrase-multilingual-MiniLM-L12-v2` |
|---|---|---|
| 차원 | 384 | 384 |
| `max_seq_length` | 512 | 🔴 **128** |
| 실 chunk 최대 토큰 / 초과 | **484 / 0건** | 담을 수 없어 대조 불가 |
| 모델 크기 | ~471MB | 0.22GB |
| 첫 로드(다운로드 포함) | 36.26s | 21.42s |
| 재로드(캐시) | 7.67s | 1.58s |
| 21 chunk 임베딩 | 1.462s (69.6 ms/건) | 2.979s (141.8 ms/건) |
| 900 chunk 외삽 | 62.6s | 127.7s |

**택일 권고: `sentence-transformers` + `intfloat/multilingual-e5-small`.**

- `fastembed`의 다국어 지원 목록은 3종뿐이고, 그중 512를 담는 것은 `multilingual-e5-large`
  (1024dim · 2.24GB)뿐이다. `paraphrase` 계열(max 128)은 동결 정책과 구조적으로 충돌한다 —
  fastembed를 택하면 2.24GB·1024dim을 강제당한다.
- 속도도 ST가 2배 빠르다. ⚠ 다만 표본이 21건이고 fastembed 첫 배치에 ONNX 세션 워밍업이
  섞였을 수 있다 — **이 수치는 택일을 뒤집을 근거로는 약하다**고 적어 둔다. 주근거는 상한이다.

### 🔴 동결의 재확인

임베더의 실 토크나이저로 잰 chunk 최대 토큰이 **484**(초과 0건)다. 게이트 ① 실측 483에
특수 토큰 1이 붙은 값으로, 두 계측이 독립적으로 맞물린다. **512 동결은 잘림 없이 성립한다.**

## 없는 것과 그 이유

| 없는 것 | 이유 |
|---|---|
| `MaintenanceRecord.note`·`FailureMode.description` 임베딩 | 스펙 §4는 이 둘도 pgvector 대상으로 둔다. 본 티켓 AC는 «문서 chunk 색인»이고, 두 열은 chunk가 아니라 단문이라 정책·저장 형상이 따로 필요하다 — 범위를 넘겨 만들지 않았다(후속 발주 대상). |
| 재랭킹·하이브리드 검색 | 벡터 단독 검색까지가 T1-4다. BM25 결합·rerank는 retrieval 품질 티켓의 몫이다. |
| `/api/evidence`·`/api/documents` 501 해제 | 🔴 티켓 「범위 밖」 명시 — `services/ai-api/` 라우트를 손대지 않았다. |
| `wireframes.md` 앵커 수정 | docs = 오케 scope. 실값만 보고한다(게이트 ⑤). |
| graph projection version 값 | T1-5 미착수라 **NULL이 참**이다. 자리표시자를 넣으면 「투영이 있었다」는 거짓이 원장에 남는다. |

## 부수 실측 — Python 3.14 wheel (E1 · 2026-08-29)

`tiktoken 0.14.0` · `tokenizers 0.23.1` · `transformers 5.16.1` 전건 설치(소스 빌드 없음).

🔴 `all-MiniLM-L6-v2`는 후보에서 뺀다. 영어 30k vocab이 한국어를 0.75자/token으로 쪼개
4,991자 문서가 6,700 token이 되는데 모델 `max_length`가 128이라 **문서 한 건도 담지 못한다**.
덧붙여 이 토크나이저는 기본 truncation이 켜져 있어, `no_truncation()`을 부르지 않으면
자/token이 39.6으로 잘못 측정된다(1차 실측이 그랬다 — 해제 후 값이 정본이다).

## 게이트 ④ — 색인 빌드 (E1 · 2026-08-29 · `build_index.py`)

| 항목 | 실측 |
|---|---|
| 원천 | `document_revision` 60행 → **approved 45건 색인** · 15건 건너뜀 |
| chunk | **59건** · token 70~468 · 전건 `chunking_policy_version=1` |
| 벡터 | 59/59 · `vector(384)` · L2 노름 1.000000 (정규화 임베딩) |
| 모델 | `intfloat/multilingual-e5-small` · 로드 18~32s · 임베딩 49~54 ms/chunk |
| 신선도 | `FRESH 45` · `SKIPPED 15` · STALE 0 · 미색인 0 |

### 무엇을 색인하지 «않는가», 그리고 왜

`approval_state='approved'` 가 아닌 revision 15건은 색인하지 않는다. 스펙 §3.3이 인용 가능을
approved로 한정하므로, 이것을 색인하면 검색이 **인용해서는 안 되는 문장**을 꺼낸다.
다만 «조용히» 빼지 않는다 — 원장(`index_build`)에 `status='skipped'` 와 사유를 남긴다.
「왜 이 문서는 검색되지 않는가」에 원장이 답하지 못하면, 빠진 것과 없는 것이 구별되지 않는다.

### 🔴 동결 재확인 — 상한은 «접두를 붙인 뒤» 다시 재야 한다

e5 계열은 문서에 `passage: `, 질의에 `query: ` 접두를 붙여 학습됐다. 접두를 빼면 오류 없이
유사도만 나빠지므로 실행 중에는 보이지 않는다. 그런데 접두는 **입력 토큰을 늘린다** — chunk
예산 512를 지켜도 임베딩 입력이 모델 상한을 넘으면 모델이 말없이 끝을 자른다.

| 측정 지점 | 값 |
|---|---|
| chunk 최대 (정책 예산 512) | **468** |
| 임베딩 입력 최대 (`passage: ` 포함 · 모델 상한 512) | **473** — 여유 39 |

🔴 게이트 ③의 «484»와 다른 이유는 오차가 아니라 **모집단이 다르기 때문**이다. 484는
`data/documents/*.md` 7건 기준이고 그 최댓값은 `DOC-SOP-0014@r1`(483+특수토큰)에서 나왔다.
r1은 `superseded` — 인용 불가라 색인 집합에 없다. 색인되는 것 중 최대는 `DOC-SOP-0014@r2`의
468이다. 두 숫자는 **둘 다 참이고, 서로 다른 집합의 값**이다. 숫자만 옮겨 적으면 어긋나 보인다.
(참고: superseded까지 색인하더라도 483+5=488 ≤ 512로 동결은 유지된다.)

### 멱등 — seed→색인 재생성 «연속 2회 diff 0» (원장 AC)

`pwsh data/seed.ps1` → `build_index.py` → `verify_index.py --dump` 를 두 번 돌려 TSV를 비교했다.

```
run1-chunks.tsv  sha256 03c674202938bae4badd7aaa9e56a60305d851e7c4099d52d861edb0321c638d
run2-chunks.tsv  sha256 03c674202938bae4badd7aaa9e56a60305d851e7c4099d52d861edb0321c638d
diff 0 — 59행 × 9열(384차원 벡터 전량 포함) 완전 일치 · 이후 3·4회째도 동일
```

🔴 **「diff 0」은 그 자체로 증거가 아니다** — 덤프가 실제로 무엇을 담았는지, 그리고 그 비교가
실패를 낼 수 있는지를 먼저 봤다(대조군 · E1):

| 확인 | 결과 |
|---|---|
| 덤프 적재량 | 행당 9열 · embedding 열의 원소 **384개**(잘림 없음) |
| 대조군 — 22,656개 float 중 **1개**만 변조 | diff가 **2행 차이로 감지** · `verify_index.py`도 노름 이상으로 FAIL |

`index_build`는 이 멱등의 예외다. 원장은 실행마다 60행이 쌓이는 것이 정상이고, 그것이 감사
기록이다. 대신 **내용열**(`build_id`·`built_at` 제외)은 두 실행이 완전히 같음을 따로 확인했다.

### STALE 판정이 «불이 켜지는가» (스펙 §3.3 · GS-01 S6 · 대조군 E1)

원문 sha만 바꾸고 재색인하지 않자 `v_index_freshness` 가 그 revision 1건을 `STALE`로 집었다
(`FRESH 44 · STALE 1 · SKIPPED 15`). 판정이 «항상 FRESH를 말하는 장식»이 아님을 확인한 것이다.

## 게이트 ⑤ — 앵커 실값 «보고» (wireframes 수정은 오케 scope · 손대지 않았다)

### GS-01 S4·S7 기대 인용 9건 — 색인 후 DB에서 재도출한 실좌표

| 인용 | chunk 좌표(0-based) | 화면 |
|---|---|---|
| 진동 RMS가 기준치의 150%를 3일 이상… | `DOC-SOP-0014@r2#001` | ③ 문서 원문 탭 |
| `### 3.2 진단 기준` | `DOC-SOP-0014@r2#001` | ③·⑤ · ④ 근거 패널 |
| `### 3.3 필요 부품` | `DOC-SOP-0014@r2#001` | ④ 근거 패널 |
| 베어링 마모는 초기에 RMS가… | `DOC-MAN-0021@r1#004` | ② evidence 카드 |
| 진동 RMS가… | `DOC-MAN-0021@r1#004` | ⑤ Vector-only 1위 |
| 베어링 교체… | `DOC-MRP-0087@r1#000` | ② evidence 카드 |
| 2025-02-11 | `DOC-MRP-0087@r1#000` | ② evidence 카드 작업일 |
| 전원 차단 후 잠금·표시(LOTO) 시행 | `DOC-SAF-0029@r3#000` | ④ 안전 조치 |
| 보호장갑·보안경 | `DOC-SAF-0030@r3#000` | ④ 안전 조치 PPE |

9건 전부 **한 chunk 안에 온전**하며 각각 **정확히 하나의** chunk에만 있다(중복 0 · 절단 0).
게이트 ⑤ 예고 좌표와 전건 일치한다 — 예고는 파일에서, 이 표는 적재된 DB에서 나왔다.

🔴 포함 검사에 `LIKE`를 쓰지 않는다. 인용문 「기준치의 **150%**를」의 `%`가 와일드카드가 되어
원문에 없는 문장까지 통과시킨다. 리터럴 포함은 `strpos`다 — 1차 구현에서 실제로 밟은 자리다.

### V-1 화면 4좌표 — 🔴 색인 후에도 **4건 전부 부재**

| 화면 표기 | 실제 chunk id | 실재 범위 | 판정 |
|---|---|---|---|
| `DOC-MAN-0021#014` | `DOC-MAN-0021@r1#014` | `#000~#007` (8건) | 🔴 부재 |
| `DOC-MAN-0022#009` | `DOC-MAN-0022@r1#009` | `#000~#005` (6건) | 🔴 부재 |
| `DOC-SOP-0014@r2#007` | `DOC-SOP-0014@r2#007` | `#000~#002` (3건) | 🔴 부재 |
| `DOC-MRP-0087#003` | `DOC-MRP-0087@r1#003` | `#000` (1건) | 🔴 부재 |

**원인은 색인이 아니다.** 색인은 문서가 가진 만큼만 chunk를 만든다 — 화면이 없는 번호를
가리키고 있다. 그래서 `verify_index.py`는 이 4건을 exit code로 삼지 않고 «이월»로 보고한다.
좌표가 해소되면 같은 도구가 ✅로 바뀐다.

🔴 **두 번째 어긋남 — 표기 규칙이 4건 안에서 이미 갈라져 있다.** `DOC-SOP-0014@r2#007`은
revision을 달고 있는데 나머지 3건은 `@rN`이 없다. 스펙 §3.1의 chunk id는 `{revision_id}#{NNN}`
이므로 `DOC-MAN-0021#014`는 **형식상 chunk id가 아니다**. 그리고 revision을 떼면 D-2(r1≠r2가
서로 다른 값을 말하는 문서)에서 «어느 판을 인용했는가»가 사라진다 — 인용 가능성을 revision에
묶은 §3.3의 전제가 화면 표기에서 풀린다. 값 치환이 아니라 참조 구조의 문제다(오케 선판정과 동일).

## 문서 커밋 이후 바뀐 것 (2026-09-04 대조 · 이 파일의 마지막 갱신 = 2026-08-29 `74697f9`)

위 실측표는 **2026-08-29 의 기록 그대로** 둔다(그때 잰 값이다). 그 뒤 코드에서 바뀐 것만 아래에 적는다 — 확인한 것만.

| 무엇 | 실물 | 문서에 준 영향 |
|---|---|---|
| 🔴 **rc 가 «보고» 때문에 바뀌지 않는다**(D-47 · `d03b38d` 2026-09-04) | `build_index.py`·`verify_index.py` 가 진입에서 `sys.stdout`·`sys.stderr` 를 `utf-8`/`errors="replace"` 로 고정한다 | 위 재현 블록의 `$env:PYTHONUTF8 = '1'` 은 **그대로 권장**이다(출력 가독성). 다만 이제 이 두 스크립트는 **요약 출력의 인코딩 오류로 rc 1 이 되지 않는다** — 「일은 끝났는데 빨강」 형태가 이 축에서 사라졌다 |
| 온톨로지 버전 축이 신선도에 들어왔다(Q-3·Q-4 · `7435f0b`) | `verify_index.py` 가 `v_index_freshness` 의 `current_ontology_version` 을 읽어 `[2] 신선도 … DB 거울 ontology_version = …` 을 찍는다 | 이 파일에는 그 축의 설명이 **없다**. 판정 기준의 정본은 코드와 마이그레이션이다 |
| 미검증 상태에 이름을 주고 manifest 순서를 못 박았다(`b1e13bb`) | `verify_index.py` | 위 게이트 ④·⑤ 절의 서술 범위 밖 |
