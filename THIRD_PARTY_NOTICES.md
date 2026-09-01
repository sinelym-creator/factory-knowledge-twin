# THIRD-PARTY NOTICES — Factory Knowledge Twin

> 이 파일은 **실측 인벤토리에서 생성**한다. 손으로 옮겨 적은 표가 아니다 — 옮겨 적은 표는
> 원천이 움직여도 자기가 낡은 줄 모른다.
>
> **측정 시점** 2026-09-02 · **측정 대상** = 리포에 «선언된» 의존(lockfile · requirements)이지
> 배포 이미지의 실물이 아니다. 컨테이너에 실제로 무엇이 들어갔는지는 이 파일이 답하지 않는다.

## 계측 방법 (재현 절차)

| 축 | 명령 | 모집단 |
|---|---|---|
| JS | `pnpm licenses list --json` (`apps/web-console`) | prod+dev **341** 패키지 (이름 기준 · 같은 이름의 여러 버전은 한 행) |
| JS(prod) | `pnpm licenses list --json --prod` | **59** 패키지 |
| Python | 일회용 venv 에 `requirements.txt` 전량 설치 후 `pip-licenses --format=json --with-urls --with-system` | **80** 패키지 |

🔴 **계측기를 모집단에서 뺐다.** Python 축에서 `pip-licenses`·`prettytable`·`wcwidth` 3본은
도구가 자기를 세는 것이라 제외했다 — `Required-by` 사슬로 런타임 의존 중 아무도 이들을
요구하지 않음을 확인했다. venv 기본(`pip`·`setuptools`)도 뺐다. 원시 85행 → 모집단 80행.

🔴 **리포에 의존성을 더하지 않았다** — `pip-licenses` 는 버리는 venv 안에서만 살았고,
`requirements.txt` 는 이 작업으로 한 줄도 바뀌지 않았다.

## 라이선스 계열별 계수

계열로 접는 규칙을 먼저 적는다 — **규칙이 답을 정하기 때문이다**:

- 단일 표기(`MIT`·`MIT License`·`BSD-3-Clause`·`Apache Software License` …)만 계열로 접는다.
- `AND`/`OR`/`WITH`/`;` 가 든 표기는 접지 않고 **「복합 표기」**로 따로 센다 — 접는 순간
  어느 조건이 적용되는지가 계수에서 지워진다.
- **copyleft 축은 계수와 무관하게 전수 정규식(`GPL|AGPL|LGPL|MPL`)으로 다시 훑는다** —
  복합 표기 안에 숨은 copyleft 를 계열 계수는 못 보기 때문이다.

| 계열 | JS (prod+dev, n=341) | Python (n=80) |
|---|---|---|
| MIT | 291 | 29 |
| BSD | 10 | 28 |
| Apache | 19 | 12 |
| ISC | 13 | 1 |
| MPL | 3 | 1 |
| PSF/Python | 1 | 1 |
| CC | 2 | 0 |
| BlueOak | 1 | 0 |
| 복합 표기 | 1 | 8 |
| **합계** | **341** | **80** |

## 🔴 copyleft(GPL · AGPL · LGPL · MPL) 히트

**JS — 4건 / 계수 341 중**

| 패키지 | 버전 | 라이선스 | 범위 | 출처 |
|---|---|---|---|---|
| `@img/sharp-win32-x64` | 0.35.4 | Apache-2.0 AND LGPL-3.0-or-later | **prod** | https://sharp.pixelplumbing.com |
| `axe-core` | 4.13.0 | MPL-2.0 | **dev 전용** | https://www.deque.com/axe/ |
| `lightningcss` | 1.32.0 | MPL-2.0 | **dev 전용** | https://github.com/parcel-bundler/lightningcss#readme |
| `lightningcss-win32-x64-msvc` | 1.32.0 | MPL-2.0 | **dev 전용** | https://github.com/parcel-bundler/lightningcss#readme |

🔴 **범위 칸을 따로 둔 이유**: 같은 라이선스라도 배포물에 들어가는 것과 개발 도구로만
쓰이는 것은 표기·배포 의무가 다르다. `--prod` 실행을 따로 돌려 이름 대조로 갈랐다.

**Python — 3건 / 계수 80 중**

| 패키지 | 버전 | 라이선스 | 출처 |
|---|---|---|---|
| `certifi` | 2026.7.22 | Mozilla Public License 2.0 (MPL 2.0) | https://github.com/certifi/python-certifi |
| `orjson` | 3.12.0 | MPL-2.0 AND (Apache-2.0 OR MIT) | https://github.com/ijl/orjson |
| `tqdm` | 4.70.0 | MPL-2.0 AND MIT | https://tqdm.github.io |

🔴 **이 표는 관측이지 법적 판단이 아니다.** 각 항목이 이 프로젝트의 배포 형태에서 어떤 의무를
지우는지(소스 제공·표기·링크 형태)는 여기서 판정하지 않는다 — 그 판단은 baseline §34.2 의
공개 경계 결정과 함께 별도로 이뤄져야 한다.

## unknown / 라이선스 표기 없음

**0건** — JS 계수 341 중 0 · Python 계수 80 중 0.
두 도구 모두 모든 항목에 라이선스 문자열을 냈다. 「0」이 「아무것도 안 봤다」가 아님은
위 모집단 수가 말한다.

## 직접 의존 — JS (`apps/web-console/package.json`)

| 패키지 | 실측 버전 | 라이선스 | 출처 | 선언 |
|---|---|---|---|---|
| `next` | 16.3.3 | MIT | https://nextjs.org | dependencies |
| `react` | 19.2.8 | MIT | https://react.dev/ | dependencies |
| `react-dom` | 19.2.8 | MIT | https://react.dev/ | dependencies |
| `undici` | 8.10.1 | MIT | https://undici.nodejs.org | dependencies |
| `@tailwindcss/postcss` | 4.3.3 | MIT | https://tailwindcss.com | devDependencies |
| `@types/node` | 20.19.43 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node | devDependencies |
| `@types/react` | 19.2.18 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react | devDependencies |
| `@types/react-dom` | 19.2.5 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom | devDependencies |
| `eslint` | 9.39.5 | MIT | https://eslint.org | devDependencies |
| `eslint-config-next` | 16.3.3 | MIT | https://nextjs.org/docs/app/api-reference/config/eslint | devDependencies |
| `tailwindcss` | 4.3.3 | MIT | https://tailwindcss.com | devDependencies |
| `typescript` | 5.9.3 | Apache-2.0 | https://www.typescriptlang.org/ | devDependencies |

## 직접 의존 — Python (`services/ai-api/requirements.txt`)

| 패키지 | 실측 버전 | 라이선스 | 출처 |
|---|---|---|---|
| `fastapi` | 0.133.0 | MIT | https://github.com/fastapi/fastapi |
| `uvicorn[standard]` | 0.34.0 | BSD License | https://www.uvicorn.org/ |
| `starlette` | 1.3.1 | BSD-3-Clause | https://github.com/Kludex/starlette |
| `pydantic-settings` | 2.7.1 | MIT | https://github.com/pydantic/pydantic-settings |
| `asyncpg` | 0.31.0 | Apache-2.0 | _(패키지 메타데이터에 URL 표기 없음)_ |
| `neo4j` | 5.27.0 | Apache Software License | https://neo4j.com/ |
| `sentence-transformers` | 6.0.0 | Apache-2.0 | https://www.SBERT.net |
| `torch` | 2.13.0 | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT | https://pytorch.org |
| `langgraph` | 1.2.11 | MIT | https://docs.langchain.com/oss/python/langgraph/overview |

## 모델

| 자산 | 라이선스 | 근거 |
|---|---|---|
| `intfloat/multilingual-e5-small` | **MIT** | Hugging Face 모델 API 실측 — `cardData.license = mit` · 태그 `license:mit` (2026-09-02 · sha `614241f`) |

🔴 근거의 등급을 밝힌다: 이 값은 **모델 카드 메타데이터**(E2)지 모델 리포지토리에 담긴
LICENSE 파일이 아니다 — 그 리포에는 라이선스 파일이 실물로 없다(API `siblings` 에 0건).

## 데이터

이 프로젝트가 다루는 공장 데이터는 **전부 synthetic — 자체 생성물**이다(baseline §15.2·§16).
제3자 데이터셋을 들여오지 않았으므로 데이터 축에는 third-party 표기 대상이 없다. 실데이터·
고객 데이터는 리포에 들어오지 않는다.

## 이 파일이 «보지 않는» 것

- **배포 이미지의 실물 목록** — 위 수는 선언(lockfile·requirements)에서 왔다. 컨테이너
  이미지의 OS 패키지·베이스 이미지 계층은 세지 않았다.
- **`services/indexer`·`services/projector`·`requirements-dev.txt`·`tests/web`** — 이 인벤토리의
  대상은 web-console + ai-api 런타임이다(의존성 감사 게이트와 같은 경계).
- **라이선스 원문 전문** — 이 파일은 표기와 출처를 모은다. 각 라이선스의 전문은 해당 패키지
  배포물에 동봉된 것이 정본이다.

