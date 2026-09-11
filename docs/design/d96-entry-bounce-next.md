# D-96 설계 — 입장 바운스가 목적지 쿼리를 보존한다(`next`)

> 오케 스자쿠 57대 · 09-11 16:5x · 근거 = 센쿠2 #955(진범 1층 = 수화 «전» 클릭 유실) · #959(진범 2층 = 입장 바운스가 쿼리 폐기 · early 前後 0/3) · 코드 실물 `apps/web-console/proxy.ts:134` · `app/enter/route.ts:77~80` · `lib/session.ts:23` · `components/enter-form.tsx:70·96`. 구현 = 센쿠2 · 독립 검증 = 리바이2. 승격 후보(별 승격).

## 1. 결함의 모양(실측)

```
/overview?intro=1&tour=1 → 307 /            (proxy.ts:134 · 쿼리 폐기)
/  → 입장 → POST /enter → 303 /overview     (route.ts:77~80 · ENTRY_DESTINATION 고정)
```
두 요청의 끝이 같다. 수화 «전» 클릭의 브라우저 기본 이동(#959 앵커)은 정확히 이 사슬을 타므로, 앵커·`<form get>` 어느 쪽도 ②가 없으면 못 고친다(센쿠2 1안-B 판단과 일치).

## 2. 처방(3파일 · 새 화면 0 · 새 라우트 0)

| 자리 | 지금 | 뒤 |
|---|---|---|
| `proxy.ts:134` 세션 없는 앱 화면 → `/` | `redirect("/")` | **`redirect("/?next=" + encode(path + search))`** — 단 `path` 가 **허용 목록**(§3)에 들 때만. 아니면 지금처럼 `/` |
| `app/enter/route.ts:77~80` 303 | `Location: ENTRY_DESTINATION` | **`Location: resolveNext(form.next ?? query.next) ?? ENTRY_DESTINATION`** |
| `components/enter-form.tsx` | `router.push(ENTRY_DESTINATION)` · `action="/enter"` | `next` 를 `useSearchParams` 로 읽어 **hidden input `next`** 로 싣고, 성공 시 `router.push(resolveNext(next) ?? ENTRY_DESTINATION)` |
| `lib/session.ts` | `ENTRY_DESTINATION` | **`resolveNext(raw): string | null`** 순수 함수 하나(§3) — 세 자리가 같은 함수를 쓴다(정본 하나) |

🔴 `ENTRY_DESTINATION` 은 남는다(기본값). `resolveNext` 가 `null` 이면 지금과 «바이트 동일» 거동.

## 3. `resolveNext` — 열린 리다이렉트를 만들지 않는 규칙(허용 목록 · 부정형이 아니라 긍정형)

- 입력은 **상대 경로 문자열**만: `^/` 로 시작 · `//` 로 시작하지 않음 · 스킴(`:`) 없음 · `\` 없음 · 길이 ≤ 512.
- **경로 허용 목록 = `/overview` 하나**(지금 결함이 그 자리이고, 늘릴 이유가 생기면 그때 한 줄 추가 · 「모든 앱 화면」으로 열지 않는다).
- **쿼리 허용 키 = `intro` · `tour`**(값 = `1` 만) — 그 밖의 키는 **버린다**(거부가 아니라 제거 · `?run=` 등은 D-71/E-5 의 「주소에 실린 상태」 축이라 이 처방이 되살리지 않는다).
- 결과는 **재조립**한 문자열(`/overview?intro=1&tour=1`)이지 입력 그대로가 아니다 — 통과한 입력이 곧 출력이 되면 검사와 출력 사이에 «해석 차»가 생긴다.
- 실패 = `null`(로그 0 · 방문자에게 말하지 않음 · 기본 목적지로).

## 4. 판정선(리바이2 · 前 = develop · 後 = 처방 · 같은 무대·같은 드릴)

1. **느린 조건(CDP 400kbps·RTT 400·CPU×4) × fresh × early 클릭 → 말풍선 3/3**(前 0/3 · #959 드릴 재사용 · 실체 = `?intro=1&tour=1` 이 303 뒤에도 살아 있음 = 홉 사슬 실측).
2. late 3/3 · 빠른 조건 6/6 · D-95 8칸 유지(회귀).
3. **열린 리다이렉트 0** — 단위 케이스: `https://x`, `//x`, `/x`(허용 밖 경로), `/overview?run=STATIC-GS-01`(키 제거 → `/overview`), `/overview?intro=1&tour=1`(통과 · 재조립), `\` 포함, 512 초과 → 기대값 표.
4. D-71 형태 회귀(overview 반복 클릭 이동) · `tests/web/d71_tour_reopen.mjs:70~77` ⑰ = 「button && anchors 0」 문면을 **뜻**(prefetch 캐시 흡수 0 = `<Link>` 아님)으로 재기술(리바이2 lane).
5. `/enter` 홉 사슬 前後 표(`curl -I` · 303 Location 값) · 세션 없는 `/overview?intro=1&tour=1` → `307 /?next=%2Foverview%3Fintro%3D1%26tour%3D1`.
6. 안 잰 것 이름으로: 실기기 느린 회선(폐하 축) · 공개면(승격 뒤 외부 재검).

## 5. 안 하는 것

- `/enter` 에 `next` 를 **쿠키**로 남기지 않는다(상태 축 신설 0 · 요청 안에서 끝난다).
- `pending` 세션 경로(`proxy.ts:112`)는 건드리지 않는다 — 그 갈래는 이미 `/overview` 로 가고, 쿼리 보존은 §2 첫 행이 담당한다(`pending` 방문자가 `/?next=` 로 서면 같은 `resolveNext` 가 답).
