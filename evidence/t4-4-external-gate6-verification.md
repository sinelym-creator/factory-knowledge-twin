# T4-4 «외부 축 · Gate 6» 독립 검증 — 🔴 **골격(판정 아님)**

> 🔴 **이 문서는 판정이 아니다.** T4-3(공개 RC)이 서기 «전»에, 오늘 로컬에서 잰 값을 리포 안으로
> 옮겨 두고 남은 칸의 red 정의를 정본 인용으로 박아 둔 **골격**이다. 본 판정은 T4-4 본 발주에서
> 이 골격 위에 실측을 채워 낸다.
>
> 검증 좌석 리바이2 **16대** · 골격 기점 `ae6215f` · 정본 = `docs/baseline/poc-baseline-v0.2.md`
> **§32.7**(Gate 6 8행) · §0.2(값 표 서식) · :528·:529(폭별 대응 범위) · 티켓 `docs/plan/tickets/T4-4.md`.
>
> 🔴 **로컬 초록을 외부 초록으로 옮겨 적지 않는다.** 오늘 값은 «로컬 조건의» 값이다 — 외부판은
> 자극도 경로도 다르다. 아래 표의 **Actual 칸은 외부 실측이 채운다**. 오늘 값은 «로컬(참고)» 열에만 산다.

---

## §0 이 골격이 서 있는 조건

| 무엇 | 값 |
|---|---|
| 그물 | `tests/api/gate6_failure_drill.py` · `tests/web/gate6_offline_probe.mjs` · `tests/web/e2e/t4-4-viewport-mobile.spec.ts` · 공용 검출기 `tests/web/e2e/_layout-probes.ts` |
| 🔴 안전장치 | **Q-62 2단**(`tests/api/_ownership.py`) — 파괴 행은 `FKT_OWNER_PREFIX` 선언 없이 서지 않는다. **재검의 1착은 이 문의 `self_check()` 통과다** |
| 외부판 전환 | 🔴 **같은 그물에 URL 만 바꾼다** — `FKT_GATE6_API_BASE` · `FKT_GATE6_WEB_BASE` · 하네스는 `FKT_WEB_BASE`. 그물이 두 벌이 되면 두 벌이 갈라진다 |
| 파괴 자극 경계 | 내 스택만(`FKT_OWNER_PREFIX=fkt-levi2-`). 🔴 **외부 대상은 «부수지 않는다»** — 외부판에서 stop 계열 행은 서지 않는다(아래 §1 비고) |

---

## §1 Gate 6 — §32.7 8행 (Target 열 = 정본 원문)

| 장애 | Target(§32.7 원문) | **Actual(외부 · 채울 칸)** | 판정 | 로컬(참고 · 2026-09-01) |
|---|---|---|---|---|
| 노트북 OFF | Public UX와 Replay 정상 | *Not measured* | — | **Not measured** — 공개 경로가 없어 로컬에서 성립하지 않음 |
| FastAPI OFF | Offline 표시와 Replay 전환 | *Not measured* | — | Offline 표시 ○ · Replay 전환 ○ (자극 = ai-api 컨테이너 stop) |
| PostgreSQL OFF | Live 원인 표시, Public UX 유지 | *Not measured* | — | live→200 `mode=replay` · 셸 200 |
| Neo4j OFF | Graph 단계 제한 또는 명확한 실패 | *Not measured* | — | 200 `mode=replay` · graph 근거 5→5 · **강등** 쪽으로 통과 |
| Tunnel OFF | bounded timeout 후 Offline 판정 | *Not measured* | — | **Not measured** — 터널 자체가 없음 |
| WebSocket 중단 | 재연결 또는 상태 재조회 | *Not measured* | — | **Not measured** — PR-2 ⓕ 재연결 축 미착지 |
| Model timeout | 안전 종료와 Replay 안내 | *Not measured* | — | `stopped` · `reason=timeout` · replay 경로 200 |
| 동시 요청 초과 | queue 또는 Replay 안내 | *Not measured* | — | 200 2 · 503 2 · `run.queued` 2 · 안내 ○ |

🔴 **로컬 열을 판정으로 읽지 마라.** 다섯 행은 «내 스택·내 자극»에서 잰 것이고, 외부판은
공개 URL·다른 망·터널을 지난다 — 같은 행이라도 **경로가 다르면 다른 사실**이다.

🔴 **외부판에서 stop 계열은 서지 않는다.** 공개 대상의 의존을 부수는 것은 파괴 경계 밖이다.
그 세 행(FastAPI·PostgreSQL·Neo4j OFF)은 외부에서 **관측 가능한 형태**로 다시 설계해야 하고,
그 설계 자체가 본 발주의 물음이다 — 여기서 미리 셀렉터를 적지 않는다.

### 1.1 남은 세 행의 red 정의 (정본 인용만 · 셀렉터 예언 없음)

- **노트북 OFF** = 「Public UX와 Replay 정상」 — 공개 URL 이 서고, ai-api 없이도 replay 가 완주한다.
- **Tunnel OFF** = 「bounded timeout 후 Offline 판정」 — 🔴 **상한이 있다**와 **화면이 그 상한을 쓴다**는
  다른 사실이다(13대 계보). 둘 다 재야 한다.
- **WebSocket 중단** = 「재연결 또는 상태 재조회」 — PR-2 ⓕ 착지 후. 「끊겼다」가 아니라
  «끊긴 뒤 무엇을 하는가»가 red 다.

---

## §2 폭별 하네스 — 정본 :528 · :529

🔴 **폭마다 판정선이 다르다.** :528 「1440 desktop 핵심 · **tablet 까지 대응**」 /
:529 「모바일은 **overview alert 와 승인 확인을 우선 제공**하고 복잡한 것은 **제외할 수 있다**」.

| 축 | 판정선(정본) | **Actual(외부)** | 로컬(참고) |
|---|---|---|---|
| tablet × 5화면 | 데스크톱과 같은 「문서 가로 밀림 0 · 겹침 0 · 색만 구분 0」 | *Not measured* | **5/5 통과** |
| 전화 폭 ① | overview alert 가 «닿는다» | *Not measured* | 2/2 통과(도크·카드 각각) |
| 전화 폭 ② | 승인 확인이 «닿는다» | *Not measured* | 2/2 통과(스크롤 뒤 hit-test 가 버튼 자신) |

### 2.1 관측값 — 판정에 섞지 않는다

| 무엇 | 로컬 실측 |
|---|---|
| 전화 폭 layout viewport | **565px**(device 412/390px 보다 넓다 — 페이지가 폭을 밀어낸다) |
| 문서 가로 밀림 | 약 **150px** |
| work-order 문서 높이 / 승인 버튼 자리 | **3,019px** / y ≈ **2,964px** |

🔴 **왜 판정이 아닌가**: :529 는 전화 폭에서 **범위 축소를 명시로 허용**한다. 「5화면 전부
들어맞아야 한다」는 축은 **정본보다 넓다** — 나는 한 번 그 축을 걸어 10행을 전건 빨강으로
만들었고, 값은 참이지만 판정선이 내 것이었다. 「우선 제공」의 «우선»을 어디까지 볼지는
**정본 개정의 몫**이라 값만 남긴다.

### 2.2 🔴 계측기 한계 — 대상 결함으로 만들지 않는다

전화 에뮬레이션에서 layout viewport 가 device 폭보다 넓으면 **합성 클릭 좌표가 visual viewport
밖으로 나가** 이벤트가 안 꽂힌다 — 요소는 보이고 hit-test 도 자기 자신인데 `click()` 만 안 끝난다.
그래서 red 를 **«hit-test 로 닿는가»**로 두고, 클릭 실패는 **측정 불가로 인쇄**한다.

---

## §3 본 발주에서 채울 것

1. 외부 URL 로 위 두 표의 **Actual 칸**을 채운다(같은 그물 · URL 만 교체).
2. 서지 않던 3행을 **외부에서 관측 가능한 형태로** 설계 — 그 설계가 본 발주의 물음이다.
3. 🔴 **1착 = Q-62 `self_check()` 통과**(파괴 행이 남의 스택을 못 흔든다는 것부터).
4. 🔴 파괴 자극 뒤에는 **공유 의존을 쓰는 서버 전수** 되감기 확인(옛 빌드 이웃은 판정 제외 + 인쇄).
5. §0.2 서식 유지 — 못 잰 칸은 **`Not measured` 고정**. 로컬 값을 외부 칸으로 옮겨 적지 않는다.
