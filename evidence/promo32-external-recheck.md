# 승격 32 — 공개면 외부 재검 (검증 좌석 리바이2 63대 · 2026-09-11)

> **측정 모델** — 대상을 잰 값만 적는다. 읽기 전용 GET 뿐이고 **쓰기·배포·구독 0**, 게이트웨이 무접촉.
> 🔴 **이 창의 판정선은 「전이」가 아니라 「불변」이다.** 승격 32 의 변경은 docs·benchmarks·evidence·compose 이고
> 서버·화면 코드 변경 0 이라, 후 열에서 값이 **바뀌면** 그것이 이상이다.

| | |
|---|---|
| 승격 대상 | main `c35377d`(#1006) · Vercel production `dpl_FR6perMNif5AhcoUUuFwYXgESfX6` READY |
| 前 칸 | `date 23:06:27~23:07:00`(main 병합 «전» · 오케 허가 후 촬영) |
| 後 칸 | `date 23:16:06~23:16:12`(오케 READY 신고 직후) |
| 명령 | 두 칸 **같은 명령·같은 지문**(아래 §4) |

## 1. 판정 축 — 前 vs 後

| 축 | 前 | 後 | 판정 |
|---|---|---|---|
| production ai-api `:8010` `/api/health` | 200 · `build=509f625` | 200 · `build=509f625` | 🟢 **불변** |
| 〃 의존성 | postgres ok · neo4j ok · embedding ready | postgres ok · neo4j ok · embedding ready | 🟢 불변 |
| 공개 `/` 상태·크기 | 200 · 18,839B | 200 · 18,839B | 🟢 불변 |
| 공개 `/` `<title>` | `Factory Knowledge Twin — AI Operations Console` | 동일 | 🟢 불변 |
| 공개 `/` **가시 문면**(태그·스크립트 제거 후) | 241자 · sha `0d2fe0901aef7cd0` | 241자 · sha `0d2fe0901aef7cd0` | 🟢 **불변(문자 단위 동일)** |
| `/overview`·`/incidents`·`/compare` | 각 307 → `Location: /` · 본문 sha `7c040f8633b8823d` | 동일 | 🟢 불변 |

**판정 = PASS.** 승격 32 는 공개면의 문면과 production 빌드를 바꾸지 않았다. 발주 문면의 기대와 일치한다.

## 2. 관측(결함 아님) — 바뀐 것 둘, 둘 다 재배포의 표지

| 축 | 前 | 後 | 뜻 |
|---|---|---|---|
| 공개 `/` 원본 sha256 | `e34f4aee86eab8e4` | `9da93f0a20f1fdac` | 아래 두 줄이 원인의 전부 |
| `/_next` script 집합 sha256(각 10본) | `e3c94d5ab49e52be` | `c59abbd80204bf7e` | 번들 파일명 해시 — 재빌드마다 바뀐다 |
| Next `buildId` | `pOaAvI3jzo-u64jUz9tH9` | `9EVV_dJWzeeR8WAHJ8rBV` | **새 배포가 실제로 서빙된다는 증거** |

🔴 **자산 경로를 정규화한 뒤 남은 차이는 `buildId` 한 곳뿐**이고, 태그를 걷어낸 가시 문면은 **문자 단위로 동일**하다
(차이 opcode 3건 전부 `buildId`·번들 해시 자리). 前 칸 보고에서 미리 못 박은 대로 script 집합 sha 변화는
판정선이 아니라 관측으로 적는다.

🔴 `buildId` 변화는 이 창에서 **필요한** 값이다 — 그것이 그대로였다면 「캐시된 옛 배포를 보고 불변이라 적었다」는
위양성 초록이 됐다. 즉 이 창은 **새 배포를 보고 있음이 확인된 상태에서** 문면 불변을 말한다.

## 3. 안 잰 것 (이름으로 남긴다)

- **브라우저 축 0** — 전 구간 `curl`(SSR 원문)이다. 렌더 후 화면·클라이언트 라우팅은 재지 않았다.
- **세션 뒤 화면** — `/overview` 등은 세션이 없어 307 로 되돌려진다. 로그인 뒤 경로의 문면은 이 창 밖
  (승격 27 재검 그물 `tests/web/promo27_operator_path.mjs` 소관).
- **前 칸의 Vercel 직전 배포 고유 URL** — 인증 302 라 서지 않는다. 그래서 前은 **공개 도메인으로만** 찍었다.
- **착지 edge IP**(`216.198.79.195` → `216.198.79.67`)는 Vercel 엣지 노드 차이다. **판정 근거가 아니다.**
- **게이트웨이 `:8797`·develop `:8020`** — 이 창에서 무접촉.

## 4. 재현

```
curl -s http://127.0.0.1:8010/api/health
for p in / /overview /incidents /compare; do curl -s -o out$p.html -w "%{http_code} %{size_download} %{remote_ip}\n" https://factory-knowledge-twin.vercel.app$p; done
# 문면 비교 = 태그·script 제거 후 sha256 · 자산 경로는 /_next/<asset> 로 정규화한 뒤 diff
```
