# T4-4 §3-2 — 자극 등가 대조군 (판정 아님 · 설계 근거)

> 🔴 **이 문서는 Gate 6 판정이 아니다.** 외부판에서 서지 않는 「FastAPI OFF」 행을 **관측자 쪽
> 자극**으로 치환할 수 있는가 — 그 하나를 묻는 대조군의 실측이다. 본 판정은 배포 URL 이 선 뒤
> `t4-4-external-gate6-verification.md` 에서 낸다.
>
> 검증 좌석 리바이2 **17대** · 2026-09-01 08:2x~08:4x · 그물 `tests/web/_ctrl_stimulus_equivalence.mjs`
> · `tests/web/_ctrl_ssr_reach.mjs` · 발주·승인 = 팀 채널(스자쿠 10·11대).

---

## §0 왜 이 대조군이 필요했나

외부 대상의 의존을 부수는 것은 파괴 경계 밖이라, 외부판에서 「FastAPI OFF」 행은 서지 않는다.
그래서 자극을 **대상 쪽이 아니라 관측자 쪽**에 두는 치환을 제안했다.

🔴 **첫 초안은 틀렸다.** 「브라우저에서 ai-api 오리진을 막는다」로 적었는데,
`apps/web-console/lib/contract.ts:486` 의 `liveStatus(base = "")` 는 **상대 경로**를 부른다 —
브라우저는 ai-api 를 **한 번도 직접 부르지 않고** 셸 자기 오리진을 부르며, ai-api 로는 셸
«서버»가 프록시로 간다. 그 자극은 아무 데도 닿지 않았을 것이다. **자극 지점 = 셸 자신의 `/api/**`** 로 정정했다.

## §1 조건

| 무엇 | 값 |
|---|---|
| ai-api | 컨테이너 `fkt-levi2-t35-seeded` · **8061** · health = postgres ok · neo4j ok · embedding ready · build `a4f0a18` |
| 셸 | **3221**(pid 637280) · `_wt/levi2-t35v` 의 기존 production 빌드 재사용 · 런타임 `FKT_API_BASE=8061` 로 boot-check 통과 |
| 🔴 빌드 성문 | 그 빌드의 트리 = `b328726` — **develop tip 아님**. `live-status.tsx` 는 tip 과 동일, `contract.ts` 는 다르나 차이가 «`retryAfterSec` 추가»뿐이고 **기대는 두 실패 분기(`!res.ok` / `catch`)는 무변**. 이 대조군은 «자극 등가»를 묻지 «릴리스 거동»을 묻지 않으므로 성립한다 |
| 소유 | `FKT_OWNER_PREFIX=fkt-levi2-` 선언 후 접두 대조 통과분만 stop/start(Q-62) |
| 🔴 같은 셸 한 본 | 두 자극이 **같은 셸 프로세스**를 때린다 — 셸이 두 벌이면 표지가 아니라 셸이 갈린다 |

## §2 착수 «전»에 적은 예측

값을 보고 판정선을 옮기면 무엇이든 초록이 된다. 그래서 먼저 적었다.

1. mode 축 — A·B 둘 다 `unavailable` (같을 것)
2. 제안 유무 축 — A·B 둘 다 뜸 (트리거 = 응답 실패뿐)
3. 🔴 why 문면 축 — **다를 것** (HTTP 5xx ↔ 브라우저 abort 이름)
4. 기준선 — `replay` · 제안 없음 (`online:false` 는 **참**이라 제안하지 않는다)

**4/4 적중.**

## §3 실측 — 클라이언트 폴링 축

| 관측 | mode | 제안 | 가로챈 요청 | 컨테이너 | why |
|---|---|---|---|---|---|
| 기준선(무자극) | `replay` | 0 | 0 | running | — |
| **B** 브라우저에서 셸 `/api` 차단 | `unavailable` | 1 | **14** | running | `TypeError` |
| **B′** 살아 있다 → 차단 → 재적재 | `unavailable` | 1 | **13** | running | `TypeError` |
| **A1** 컨테이너 stop · 새 적재 | `unavailable` | 1 | 0 | **exited** | `HTTP 500` |
| A3 되살린 뒤 기준선 복귀 | `replay` | 0 | 0 | running | — |
| **A4** 살아 있다 → stop → 재적재 | `unavailable` | 1 | 0 | **exited** | `HTTP 500` |
| 되감기 확인(원복 후) | `replay` | 0 | 0 | running | — |

- **자극 도달 증명** — B 는 가로챈 요청 수(0이면 안 막은 것), A 는 컨테이너 상태를 실측한다.
  자극이 닿았는지를 따로 세지 않으면 표지가 아니라 배선을 잰다.
- **되감기** — 2회 전건 `replay` 복귀. 되돌아온 것까지가 측정이다.
- **기준선이 자극과 구분된다** — 이게 아니었으면 이 대조군은 아무것도 못 갈랐다.

## §4 실측 — 서버 렌더 층 (사정거리)

「SSR 층은 치환 밖」을 소견으로 두지 않고 셌다.

| 관측 | kpi-strip | equipment-card | alarm-card | hierarchy-tree | headline |
|---|---|---|---|---|---|
| 기준선 | 1 | 12 | 1 | 1 | 1 |
| **B** 브라우저 차단 | 1 | 12 | 1 | 1 | 1 |
| **A** 컨테이너 stop | **0** | **0** | **0** | **0** | **0** |
| 되감기 확인 | 1 | 12 | 1 | 1 | 1 |

🔴 B 는 브라우저만 막고 셸 «서버»는 멀쩡하다. A 는 그 층까지 죽인다.
**두 자극은 클라이언트 폴링 축에서만 같고, 서버가 그리는 층에서는 완전히 갈린다.**

## §5 판정 — 치환 «조건부 성립»

**성립** — Gate 6 §32.7 「FastAPI OFF」의 Target 원문은 「Offline 표시와 Replay 전환」이고
**둘 다 클라이언트 축**이다. 그 행에 한해 관측자 쪽 자극으로 잰다.

🔴 **금지 범위** — ① `why` 문면을 값으로 쓰는 자리 ② 서버가 그리는 데이터 층.
외부 칸 문면에 **「클라이언트 축 한정」을 명시**하고, 서버 층은 **컨테이너 축**(이미지
`fkt-levi2-integ-ai-api:9ea7bb5` + exited 컨테이너)의 몫으로 남긴다.

🔴 이 구분 없이 「A ≡ B」로 적었으면, 외부에서 FastAPI OFF 를 «다 재봤다»는 거짓 초록이 났다.

## §6 재현

```
FKT_OWNER_PREFIX=fkt-levi2-  FKT_CTRL_WEB=<셸>  FKT_CTRL_API=<ai-api>
FKT_CTRL_CONTAINER=<내 접두 컨테이너>   node tests/web/_ctrl_stimulus_equivalence.mjs
                                        node tests/web/_ctrl_ssr_reach.mjs
```

🔴 대상은 **기본값을 두지 않는다** — 미지정·소유 미확인은 `exit 2`(측정 불가)다.
