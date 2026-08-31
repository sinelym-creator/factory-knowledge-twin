# T4-1 «공개 형상 골격» 독립 검증 — **미완(인계본)**

> 검증 좌석 리바이2 **12대** · lane `lane/levi2-t4-1-verify` @ `d588cb7`(구현 `57d58ed` 포함) ·
> 근거 **E1**. 🔴 **판정 없음** — 착수 10분 차에 교대가 걸렸다. 여기 있는 것은 **잰 것뿐**이고,
> 나머지 축은 손대지 않았다. 13대가 이어받는다.

## 0. 지금까지 잰 것 — AC① 「1커맨드 boot」

🔴 **내 조건에서 `docker compose up -d` 는 서지 않았다.**

| 무엇 | 실측 |
|---|---|
| 명령 | `docker compose up -d`(내 프로젝트 `fkt-levi2-t41` · pg **5544** · neo4j **7584/7597** · ai-api **8051** · `VOLUME_ROOT=./.volumes-levi2-t41`) |
| 결과 | **rc=1 · 181.1s** — `dependency failed to start: container …-postgres-1 is unhealthy` |
| ai-api | **Created**(한 번도 Start 안 됨) — 의존 게이트에서 막혔다 |
| postgres | `Up 6 minutes (unhealthy)` · healthcheck 로그 = `pg_isready` **`/var/run/postgresql:5432 - no response`** 반복 |
| postgres 컨테이너 로그 | `initdb` 가 **`performing post-bootstrap initialization ... ok`** 에서 6분 넘게 멈춰 있다(그 다음 줄이 안 나온다) |
| neo4j | `Up (unhealthy)` — 같은 게이트에서 함께 실패 처리 |

### 0.1 🔴 귀속 미결 — 이것은 아직 «대상의 빨강»이 아니다

두 갈래가 남아 있고, 이 실행만으로는 갈리지 않는다:

- ⓐ **내 조건** — Windows 호스트의 **bind mount** 위에서 첫 `initdb` 가 fsync 로 오래 끈다.
  compose 의 `start_period: 30s` + `interval 5s × retries 12` = 약 90초 예산이 그보다 짧다.
  (근거: 기존 좌석 스택 `fkt-levi2`·`fkt-senku2-*` 는 «이미 초기화된» 볼륨이라 이 구간이 없다 —
  즉 **아무도 이 경로를 «새 볼륨»으로 밟아 본 적이 없을 수 있다**.)
- ⓑ **대상** — 첫 부팅 예산이 실제로 부족하다면 AC①(1커맨드 boot)이 «빈 볼륨»에서 성립하지
  않는다는 뜻이고, 그것은 이 티켓의 결함이다.

🔴 **어느 쪽인지 «측정»으로 가르기 전에는 판정하지 않는다.** 13대가 가를 순서:

1. 컨테이너를 그대로 두고 **postgres 가 결국 healthy 가 되는지** 관찰(`docker ps` 상태 전이).
   된다면 갈래는 ⓐ 쪽으로 크게 기울고, 남는 질문은 「예산이 얼마여야 하나」다.
2. **named volume** 으로 같은 boot 를 한 번 더(= bind mount 만 바꾼 대조군). 그쪽이 예산 안에
   서면 원인이 bind mount 라는 것이 실측으로 확정된다.
3. 그때 비로소 ⓐ(환경 · 회부) / ⓑ(대상 · D-n)로 적는다.

## 1. 아직 «안 잰» 축 (전부)

②Q-37 부팅 실패 · ③CORS 두 축 · ④헤더·CSP 무해성 · ⑤`/live/status` 외부축 ·
⑥Q-44 콜드→ready · ⑦컨테이너 전용 결함(`replay.py` parents[4]) + `FKT_REPLAY_FIXTURE_DIR`
바인드에서 귀속 탐침 성립 · ⑧회귀 전부.

## 2. 인계 좌표

- 스택은 **존치**한다(내리지 않았다) — `fkt-levi2-t41` 3본. 위 상태 그대로가 다음 측정의 출발점이다.
- 내 다른 서버(`:3143` web · `:8043` ai-api · 스택 `fkt-levi2`)도 존치 — T3-4·Q-45 를 잰 자리다.
- 🔴 **환경 1행**: Docker Desktop 재시작 **미수행** · 자격 헬퍼 死 · `credsStore` 제거 상태
  (공개 이미지 pull·빌드는 통과 — 이번 build 도 통과했다).
