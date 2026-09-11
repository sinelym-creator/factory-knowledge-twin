# D-96b — 입장 바운스가 목적지를 보존한다 (센쿠2 55대)

base = `origin/develop` **81b2e26385cc19e4bf1b4cde6ed084c5f5f20a41**(실측) · lane `lane/senku2-d96b`
정본 = `docs/design/d96-entry-bounce-next.md` §2·§3 (값은 거기서 읽었다) · 구독 **0**

## 1. 한 것 (설계 §2 그대로 · 새 화면 0 · 새 라우트 0)

| 자리 | 무엇 |
|---|---|
| `lib/session.ts` | **`resolveNext(raw): string \| null`** — 규칙의 유일한 정의 |
| `proxy.ts` | 307 이 `?next=` 를 **들고** 간다(허용 통과분만) |
| `app/enter/route.ts` | 303 `Location` = `resolveNext(폼 next ?? 쿼리 next) ?? ENTRY_DESTINATION` |
| `components/enter-form.tsx` | hidden input `next` + 성공 시 **같은 함수**로 목적지 결정 |
| `components/tour/tour-reopen.tsx` | #959 앵커 처방 **재작성 동봉**(`<a href>` + 수화 뒤 `preventDefault`) |

🔴 **`resolveNext` 가 `null` 이면 전 거동이 앞판과 같다** — 이 처방은 「되살릴 수 있는 것만 되살린다」.

🔴 **설계에 없던 한 줄을 좁혔다(오케 채택)**: `/overview`(쿼리 없음)는 통과하지만 그 값은 입장이
원래 가는 자리다. 실으면 **아무것도 바꾸지 않는 파라미터**가 모든 바운스에 붙어 대조군 바이트가
이유 없이 달라진다 ⇒ **기본 목적지와 같으면 싣지 않는다**.

## 2. 열린 리다이렉트 — 거절을 먼저 세웠다 (§4 ③)

「목적지를 살린다」는 기능은 잘못 만들면 그대로 열린 리다이렉트다. 그래서 단위 그물의 **12/17 이
거절 케이스**다: 절대 URL · 프로토콜 상대(`//`) · 스킴(`javascript:`) · 역슬래시 · 허용 밖 경로 ·
**대문자 경로** · 상대 경로 · 빈 문자열 · 인코딩 탈출(`%2e%2e`) · **개행 주입** · 512 초과 · null/undefined.

통과 5건은 **출력 문자열까지** 본다(재조립이 도는가): 키 순서 고정 · 허용 밖 키 **제거**(거부 아님) ·
값 불일치 키 제외 · 🔴 **중복 키는 첫 값으로 판정**(`?intro=2&intro=1` → `/overview`) · 쿼리 없는 통과.

## 3. 실측

| 축 | 값 |
|---|---|
| `pnpm lint` | **0** |
| `pnpm test:unit` | **60 passed**(신규 **17**) |
| `pnpm build` | **0** |
| `npx tsc --noEmit`(build 뒤) | **0** |

### 3.1 홉 사슬(`curl -D-` · 무대 `:8811`)

| 요청 | 307 Location |
|---|---|
| `/overview?intro=1&tour=1` | `/?next=%2Foverview%3Fintro%3D1%26tour%3D1` |
| `/overview` | **`/`**(前과 동일) |
| `/incidents/INC-2026-014?intro=1` | **`/`**(허용 밖 경로) |
| `/overview?run=STATIC-GS-01&intro=1` | `/?next=%2Foverview%3Fintro%3D1`(허용 밖 키 제거) |

### 3.2 판정선 ① — 느린 조건 × fresh × **early 클릭**

| | 前(#959 · 앵커만) | 後(이 lane) |
|---|---|---|
| 말풍선 | **0/3** | **3/3**(5,104 · 5,211 · 4,980ms) |
| 최종 URL | `/overview`(쿼리 없음) | **`/overview?intro=1&tour=1`** |
| `fkt:tour-open` 이벤트 | 0건 | **0건** |

🔴 **이벤트 0건인데 열린 것이 이 처방의 모양이다.** 클릭은 여전히 수화 «전»이라 JS 핸들러는
돌지 않는다 — 대신 브라우저 기본 이동이 살아 있고, 그 목적지가 이제 사슬을 **살아서** 통과해
서버가 `?tour=1` 을 읽는다. 5초는 그 느린 무대의 로드 시간이지 이 처방이 더한 지연이 아니다
(같은 무대 前 열도 본문이 4.8~5.7초에 섰다).

## 4. 안 잰 것

②(late 3/3)·④(빠른 6/6·D-95 8칸)·⑥(D-71 형태)는 **리바이2 독검 몫**(발주 ⓓ 분담).
실기기 느린 회선·공개면은 이 lane 밖.
