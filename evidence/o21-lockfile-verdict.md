# O-21 검증 — `tests/web` 설치 층 · lockfile 정책

> 대상 = develop **`9fc68e4`**(`rev-parse` 실측 · 발주값 일치) · 발주 = 스자쿠 41대 · 리바이2 47대
> 정책 정본 = `.gitignore:52-53`(#691) — 「`tests/web` 는 **npm 층**(`package-lock.json` 추적) ·
> pnpm 이 만든 lockfile 은 산출물」

## 판정 — **PASS**

| 열 | 질문 | 계측 | Actual |
|---|---|---|---|
| 설치 | `npm ci` 가 도는가 | rc (파이프 없이) | **0** · 36 packages |
| ① git | 추적면이 깨끗한가 | `git status --porcelain tests/web` | **0 bytes** |
| ② 파일시스템 | `pnpm-lock.yaml` 이 **실재**하는가 | `test -e` | **NO** |
| lockfile 무결 | `package-lock.json` 이 바뀌었나 | `git diff --quiet` | **무변경** |

🔴 **①만으로는 판정할 수 없다.** `.gitignore:53` 이 `tests/web/pnpm-lock.yaml` 을 이미 무시하므로,
그 파일이 **생겨도 `git status` 는 침묵한다**. 「안 만들어졌다」와 「만들어졌지만 git 이 눈감았다」는
다른 사실이고, 후자라면 O-21 은 닫힌 게 아니라 **가려진** 것이다. 그래서 ②를 파일 실재로 따로 쟀다.
(같은 회차의 `--ignored` 목록에 뜬 것은 `tests/web/node_modules/` **뿐**이다 — 즉 무시 규칙이
숨긴 lockfile 은 없다.)

## 🔴 대조군 — 이 초록이 무엇을 가르는가

「`npm ci` 를 쓰면 안 생긴다」는 **`pnpm install` 을 쓰면 생긴다**는 열이 없으면 아무것도 가르지
못한다(원래 안 생기는 것을 처방의 공로로 읽게 된다). 그래서 **같은 `package.json`·`package-lock.json`**
사본을 리포 밖에 두고 옛 방식을 그대로 돌렸다.

| 열 | 명령 | rc | `pnpm-lock.yaml` |
|---|---|---|---|
| 자극(새 방식) | `npm ci` (in `tests/web`) | 0 | **없음** |
| **대조군(옛 방식)** | `pnpm install` (같은 매니페스트 · 리포 밖 사본) | 0 | 🔴 **생성됨** |

→ 갈린 것은 **패키지 매니저 선택 하나**다. O-21 의 dirty(`?? tests/web/pnpm-lock.yaml` 이 여러
워크트리에 반복해 뜨던 것)는 **설치 명령이 만든 산출물**이었고, `npm ci` 로 서면 그 자리가 사라진다.

## 설치 성공을 rc 로만 세지 않았다

rc 0 은 「명령이 끝났다」이지 「설치됐다」가 아니다. 산출물로 교차했다 —
`node_modules/.package-lock.json` 존재 · `node_modules/@playwright/test` 존재 ·
`require.resolve("@playwright/test")` **해결됨**.

## 안 잰 것 (이름으로)

1. **e2e smoke 1케이스** — 무대(셸+ai-api)를 요구하므로 이 회차(cap 0)에서 **안 돌렸다**.
   즉 「의존이 설치됐다」까지가 이 판정문의 범위이고, 「그 의존으로 그물이 실제로 돈다」는 **미검증**이다.
2. ~~**CI 의 설치 경로**~~ — 안 잰 것이 아니라 **없다**(읽어서 갈랐다). `ci.yml`·`security.yml`
   어디에도 `tests/web` 설치 스텝이 **없고**, `security.yml:82` 는 `tests/web` 을 **발주 범위 밖**으로
   명시한다. 거기서 도는 `npm install --global pnpm@10` 은 **audit 용 전역 설치**이지 이 층의 설치가
   아니다. 따라서 이 판정은 로컬 층의 것이고, **CI 는 그 층을 밟지 않는다** — 「CI 가 pnpm 으로
   설치해 정책이 깨질」 갈래는 **존재하지 않는다**.
3. **다른 워크트리에 이미 생겨 있던 `pnpm-lock.yaml`** — 그 워크트리들은 이번 정리로 제거되어
   되짚을 대상이 없다(그 파일들은 추적되지 않았으므로 이력 손실 0).
