# 승격 27 — 공개면 외부 재검 (리바이2 60대)

- 무대 = **production 공개면** `https://factory-knowledge-twin.vercel.app` (읽기만 · 배포·재생성 무접촉)
- 창 = `date 12:56:02` ~ `13:05` (기준선 1칸은 배포 «전», 나머지는 Vercel READY 12:58:08 «후»)
- 배포 = `dpl_2SEEEAu6jQzJPu9ewrsPc5Awemyr` · commit `e02d08e` · target production · alias `factory-knowledge-twin.vercel.app`
- 구독 = **0** (정적 재생 run `STATIC-GS-01` 만 사용 · 시나리오 run 생성 0)

## 0. 측정 모델

나를 잰 값(세션 ctx·내 러너의 진단 문자열)과 대상을 잰 값(status·SSR 문면·`data-testid` 계수)은 **다른 칸**이다.
아래 표의 got 은 전부 대상을 잰 값이고, 「내 계측기」 절의 값은 내 것이다.

## 1. 전이 축 — 무엇이 바뀌었다고 말할 수 있는가

| 축 | 前 | 後 | 판정 |
|---|---|---|---|
| Vercel 배포 commit | `30274ba` | **`e02d08e`** | PASS (오케 실측 · `get_deployment` 교차 확인) |
| `/api/health.build` | `30274ba` | `30274ba` | **불변이 정상** — ai-api 컨테이너 값이고 이번 승격은 web 2파일뿐 |
| 공개면 SSR `document-back` 마커 | **미측(구조적 소실)** | **2** | 後만 판정 칸 |

🔴 **前 칸은 내 12:56 기준선에 없다.** 그때 잰 것은 `/api/health` 한 칸뿐이고 문서 SSR 은 안 쟀다.
지금은 이미 `e02d08e` 가 떠 있어 공개 alias 로 前을 복원할 수 없다 — 「0 이었을 것」은 측정이 아니라 추정이므로 적지 않는다.

### 前 대체 열 2본

| 열 | 값 | 서는가 |
|---|---|---|
| ⓐ 직전 production 배포 고유 URL `factory-knowledge-twin-bj10h1qtz-…` | `302 → vercel.com/sso-api` (`_vercel_sso_nonce` 발급) | **못 섬** — Vercel 인증 문이 축 앞에 서 있다. 이 302 의 마커 0 은 「수리 전이라 없다」가 아니라 「화면을 받지도 못했다」 |
| ⓑ 로컬 대조군 `:8792`(수리 전 판) SSR, **같은 URL·같은 셀렉터** | `200` · `document-back` = **0** | 섬 — 단 **로컬 귀속**(공개면의 前이 아니다) |
| ⓒ 코드 축 `git grep -c document-back -- apps` | `30274ba` = 0건 · `e02d08e` = 1파일 1건 | 보조 |

대조 무대 `:8794`(수리본) 같은 URL = **2**. 공개면 = **2**. 같은 셀렉터로 0/2 가 갈린다.

## 2. 공개면 축 — `promo26_public_recheck.mjs` (3회)

`--base https://factory-knowledge-twin.vercel.app --sha 30274ba`
(🔴 `--sha` 에 `e02d08e` 를 넣지 않았다. 이 축은 ai-api build 를 읽으므로 `30274ba` 가 참값이다.
발주문의 전이 기대값을 그대로 넣었으면 **대상 결함이 아닌 빨강**을 내가 지어냈을 자리다.)

| 축 | 1회 13:00 | 2회 13:02 | 3회 13:03 | 판정 |
|---|---|---|---|---|
| screen | `/` ids=11 | `/overview` | `/overview` | PASS |
| build | 200 `30274ba` | 동 | 동 | PASS |
| guard (무세션 `/api/scenarios`) | **401** | 401 | 401 | PASS |
| D-87 `/openapi.json`·`/docs`·`/redoc`·`/api/docs` | 전건 **404 · ai-api (fix exercised)** | 동 | 동 | PASS (4칸) |
| E-5 home | `/overview` | 동 | 동 | PASS |
| E-2/E-4 tour walk | top=194 ≥16 | 동 | 동 | PASS |
| **E-1/E-3 reset** | FAIL (`tour=kept intro=0`) | PASS (`tour=null intro=1`) | FAIL (`tour=null intro=0`) | **미측 — 아래 3절** |

## 3. 폐하 경로 — `promo27_operator_path.mjs` (412×600 · 1회)

개요 → 조사 → 근거 → 문서 → 「← 조사로 돌아가기」

| 축 | got | 판정 |
|---|---|---|
| 1 개요 | 화면 렌더 (ids>0) | PASS |
| 2 조사 | `/incidents/INC-2026-014?run=STATIC-GS-01` ids=76 | PASS |
| 3 근거 | `/evidence/MR-2025-0087` ids=19 (링크는 **조사 화면이 고르게** 했다) | PASS |
| 4 문서 | `/documents/DOC-MAN-0021?run=…&highlight=MR-2025-0087` | PASS |
| 5 되돌아갈 길 | `document-back` count=**1** | PASS |
| 5a 라벨·href | **`← 조사로 돌아가기`** · `/incidents/INC-2026-014?run=STATIC-GS-01` | 기록값(분기는 세션 의존) |
| 5b 히트 | `elementFromPoint` inside=**true** (상자 높이 24 · 중심 101,133) | PASS — 상자로 재면 없는 결함을 짓는다 |
| 6 착지 | `/documents/DOC-MAN-0021` → `/incidents/INC-2026-014?run=STATIC-GS-01` ids=76 | PASS |

**교정 칸(같은 그물, 수리 전 무대 `:8792`)** = 5 back control **count=0 → FAIL**, 5a/5b/6 UNMEASURED.
→ 이 초록은 검출력이 있다. 「전부 통과시키는 문」이 아니다.

**두 번째 vantage** = Vercel 자체 fetcher(`web_fetch_vercel_url`) · 같은 URL SSR.
`x-vercel-id` = `iad1:iad1::…` (내 브라우저 열은 `icn1::iad1::…`) — **다른 입구**로 들어갔고,
원문에 `data-testid="document-back"` + `href="/incidents/INC-2026-014?run=STATIC-GS-01"` + 문면 `조사로 돌아가기` 가 그대로 있다.

**기록값(결함 아님)**: 이 문서 화면은 `screen-unavailable` — 「이 정적 재생본에는 담기지 않은 자리」.
정적 재생본의 데이터 범위 문제이지 D-91(돌아갈 길)의 축이 아니다. 되돌아갈 길은 그 화면에서도 있다.

## 4. 내 계측기 자수

1. **E-1/E-3 reset 3회 = FAIL·PASS·FAIL.** 세 값이 갈렸다 — 「초기화 키가 지워졌다」(1회만 kept)와 「첫 방문 카드가 돌아왔다」(1/3)가 한 축에 접혀 있다. 내 그물은 키가 null 이 된 뒤 **고정 600ms** 만 기다리고 카드를 센다. 공개면은 네트워크 한 홉 건너에 있으니 이 창이 짧을 수 있다. **이 축은 FAIL 이 아니라 미측**으로 남긴다 — 대상 결함이라 말할 근거가 없다. 승격 27 의 변경(web 2파일 = 문서 back)과도 다른 자리다.
2. **1회차 screen 열이 `/` 였다.** 2·3회차는 `/overview`. 첫 진입이 셸 가드에 걸린 것으로 보이나 축 자체는 PASS 라 파고들지 않았다 — 「안 팠다」를 적어 둔다.
3. **첫 폐하 경로 시도에서 내가 틀린 조사를 골랐다.** 개요의 첫 incident 링크(`INC-2025-019`)를 쓰는 바람에 run 이 안 실린 경로를 걸었고, 라벨이 `개요로 돌아가기`(3분기)로 나왔다. 발주가 지목한 경로는 1분기다. 정적 재생 run 이 속한 조사(`INC-2026-014`, `lib/static-replay` 에서 읽음)로 고쳐 다시 걸었다. **지어낸 좌표가 아니라 코드가 말한 좌표**다.
4. ⓐ 열의 302 를 「前 = 0」으로 셀 뻔했다. 문이 축 앞에 서 있으면 그 0 은 어떤 색도 아니다.

## 5. 판정

**승격 27 공개면 = PASS** (전이 축 1 + 공개면 축 9 + 폐하 경로 8 · 교정 칸으로 검출력 입증)
- 미측 1 = E-1/E-3 reset(내 그물의 시점 문제 · 이번 승격 범위 밖)
- 前 칸 1 = 구조적 소실(공개면) · 로컬 대조군 + 코드 축으로 대체, **로컬 귀속 명기**
