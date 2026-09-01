# Tailscale Funnel runbook — 노트북 ai-api 를 HTTPS 로 공개 (T4-3 ⓑ · baseline §14.2·§14.3)

> 갈래 = **(b) Tailscale Funnel**(폐하 확정 08-31 10:05 · Cloudflare 계정·도메인 없음).
> Cloudflare Named Tunnel 로의 전환은 도메인이 생길 때 별 티켓이다(§14.3 「최종 공개 Live endpoint」).
>
> 🔴 **이 문서는 절차서다. 여기 적힌 `tailscale funnel` 실행은 게이트 3(오케 · 폐하 재가분)의 몫이고,
> 구현 좌석은 실행하지 않았다.** 아래 「실측」 표기가 붙은 값만 실제로 잰 것이고, 나머지는
> 실행 시점에 채워야 할 빈 칸이다 — 빈 칸을 「됐다」로 읽지 않게 등급을 함께 적는다.

## 0. 무엇을 노출하고 무엇을 노출하지 않는가 (§15.2·§16·§34.6)

| | |
|---|---|
| 노출 대상 | 노트북 ai-api **한 프로세스**의 HTTP 포트 하나 |
| 노출 «안» 하는 것 | postgres(5434 계열) · neo4j(7474/7687) · Docker API · 파일 공유 · SSH · 셸 dev 서버 |
| 데이터 | synthetic 뿐(§34.6). Funnel 은 «인터넷 전체»에 여는 것이므로, 열기 전에 이 줄이 참인지 다시 본다 |
| 인증 | 없다. ai-api 자체 보호장치(rate limit·body limit·세션)가 유일한 방어선이다 — Funnel 은 인증을 «주지 않는다» |

## 1. 전제 상태 — 확인법과 실측치

```powershell
tailscale version                      # CLI·데몬 버전
tailscale status --json | ConvertFrom-Json | % { $_.BackendState; $_.Self.DNSName }
tailscale status --json | ConvertFrom-Json | % { $_.Self.CapMap.PSObject.Properties.Name }
```

| 항목 | 확인법 | 실측(E1 · 2026-09-01 01:0x UTC) |
|---|---|---|
| Tailscale 버전 | `tailscale version` | **1.102.2** |
| 데몬 상태 | `BackendState` | `Running` · `Online=true` |
| 노드 이름 | `Self.DNSName` | `<machine>.<tailnet>.ts.net` 4-segment 형태 · 실값은 채팅/운영자 화면에서만 다룬다(리포에 박지 않는다) |
| **Funnel 권한** | CapMap 에 `funnel` | **있다** |
| **HTTPS 인증서** | CapMap 에 `https` | **있다** |
| Funnel 허용 포트 | CapMap 의 `.../cap/funnel-ports?ports=…` | **`443,8443,10000`** — 이 셋 밖은 Funnel 로 열 수 없다 |

🔴 위 두 줄(`funnel`·`https` cap)이 **이미 참**이므로, T4-3 ③의 「Tailscale Funnel 활성(HTTPS certificates · Funnel ACL)」 운영자 청구는
**추가로 할 일이 없을 가능성이 높다**. 다만 cap 보유는 「ACL 이 허용한다」는 뜻이고 「실제로 붙는다」는 뜻이 아니다 —
확정은 §3 을 1회 실행해 URL 이 밖에서 200 을 답하는 순간이다.

## 2. 🔴 선점 확인 — 먼저 «남의 것»이 있는지 본다

```powershell
tailscale serve status      # 전체 serve/funnel 설정
tailscale funnel status     # 같은 설정을 Funnel 관점으로
```

**실측(E1 · 2026-09-01 01:0x UTC)** — 이미 설정이 하나 있다:

```
https://<machine>.<tailnet>.ts.net (tailnet only)
|-- / proxy http://127.0.0.1:3000
```

- `(tailnet only)` = **Funnel 이 아니다**(`serve`). 즉 지금 인터넷에 열려 있는 것은 없다.
- 이 항목은 **이 리포의 것이 아니다**(:3000 · 다른 작업). 🔴 **덮지 않는다.**
- 그래서 이 리포의 노출은 **443 을 건드리지 않고 별 포트(8443 또는 10000)** 로 낸다.
  `tailscale funnel 8000` 처럼 포트를 생략하면 기본이 **443** 이고, 그 순간 위 `/ → :3000` 항목을 덮는다.

## 3. 기동 절차 (게이트 3 · 실행 = 오케)

### 3-1. ai-api 의 «호스트» 포트를 먼저 읽는다 — 8000 이라고 가정하지 않는다

Funnel 이 붙는 것은 컨테이너 안의 8000 이 아니라 **호스트에 게시된 포트**다.

```powershell
docker inspect <ai-api 컨테이너> --format '{{json .HostConfig.PortBindings}}'
```

**실측(E1 · 2026-09-01)** — 현재 배포 후보 컨테이너 `fkt-senku2-t43-ai-api` 의 게시 포트는
`8000/tcp -> 8010` 이다. compose 기본값(`AI_API_PORT:-8000`)과 **다르다**.
이 자리를 틀리면 Funnel 은 초록인데 502 만 답한다 — 「주장하는 그 경로에서 재라」.

### 3-2. Funnel 을 «배경»으로 건다

```powershell
# <LOCAL> = 3-1 에서 읽은 호스트 포트 (예: 8010)
tailscale funnel --bg --https=8443 http://127.0.0.1:<LOCAL>
tailscale funnel status
```

- `--bg` 없이 실행하면 **포그라운드**다 — 터미널을 닫는 순간 노출이 끊긴다. 배포에는 반드시 `--bg`.
- `--https=8443` 로 포트를 명시해 §2 의 443 항목을 보존한다. 8443 이 막히면 `10000`.
- 결과 공개 URL 은 **포트가 붙는다**: `https://<machine>.<tailnet>.ts.net:8443`
  🔴 이 문자열이 그대로 셸의 `FKT_API_BASE` 다(포트 생략 금지 · `infra/vercel-deploy.md` §2).

### 3-3. 확인 (3층을 따로 센다)

| 층 | 명령 | 통과 기준 |
|---|---|---|
| ① 로컬 | `curl -s -o NUL -w "%{http_code}" http://127.0.0.1:<LOCAL>/api/health` | `200` |
| ② Funnel 설정 | `tailscale funnel status` | 8443 행이 `Funnel on` 으로 보이고 `/ → :3000` 행이 **그대로 남아 있다** |
| ③ 외부 | 노트북과 **다른 망**(모바일 데이터)에서 `https://<host>:8443/api/health` | `200` + 본문 `status` 확인 |

🔴 ③ 을 노트북 자신에서 재면 안 된다 — 같은 tailnet 안에서는 Funnel 이 아니어도 붙는다(§2 의 `serve` 가 그 증거다).
「밖에서 되는가」는 밖에서만 갈린다.

🔴 `/api/health` 가 200 이라고 의존이 살아 있다는 뜻이 아니다(`docker-compose.yml:151` 성문(ai-api `healthcheck:` 머리말) · Q-52 계보).
응답 본문의 `status`·`dependencies` 를 함께 읽는다 — **「health 초록 ≠ 데이터 있음」**.

### 3-4. 되돌리기

```powershell
tailscale funnel --https=8443 off     # 이 항목만 내린다
tailscale funnel status               # 🔴 :3000 항목이 살아 있는지 반드시 재확인
```

`tailscale funnel reset` 은 **전부** 지운다 — §2 의 남의 항목까지 지운다. 쓰지 않는다.

## 4. ts.net 호스트명 고정성

- 이름은 `<machine>.<tailnet>.ts.net` 이고 **머신 이름과 tailnet 이름에서 파생**된다.
  둘 다 사람이 바꾸지 않는 한 바뀌지 않는다 — 임시 URL(Cloudflare Quick Tunnel)과 다른 점이 이것이다(§14.3).
- 🔴 **바뀌는 조건**(= 재빌드가 필요한 조건): 관리 콘솔에서 머신 이름 변경 · 노드 삭제 후 재가입 · tailnet 이름 변경(조직 도메인 연결 등).
- 셸은 `FKT_API_BASE` 를 **빌드 시점에 굽는다**(`apps/web-console/next.config.ts:23`). 따라서
  **호스트명이 바뀌면 Vercel 재배포 없이는 절대 따라오지 않는다.** 「목적지 변경 = 재빌드」(T4-1 Q-37).
- 등급: 위 규칙은 Tailscale 의 문서화된 성질이고 **이 배치에서 재부팅을 건너 재확인한 값은 아직 없다**(E3) —
  §6 의 재부팅 1회 실측이 이 줄을 E1 로 올린다.

## 5. 자동 시작

| 대상 | 확인법 | 실측(E1 · 2026-09-01) |
|---|---|---|
| Tailscale 데몬 | `Get-Service Tailscale \| Select Name,Status,StartType` | `Running` · **`StartType=Automatic`** → 재부팅 시 자동 기동 ✅ |
| Funnel «설정» | `tailscale funnel status`(재부팅 «후») | 🔴 **미실측** — `--bg` 설정은 tailscaled 상태에 저장되어 재기동 시 복원되는 것으로 «알려져» 있으나(E4), 이 노트북에서 확인한 적이 없다 |
| ai-api 컨테이너 | `infra/laptop-operating-conditions.md` §2 | 별 문서 |

🔴 **데몬이 자동 시작한다 ≠ 노출이 복원된다.** 두 축은 따로 세고, 두 번째 축은 §6 이 채운다.

## 6. 못 잰 것 (「안 잰 것」이 아니라 「이 좌석이 잴 수 없었던 것」을 구분해 적는다)

| 항목 | 왜 못 쟀는가 | 무엇이 채우는가 |
|---|---|---|
| Funnel 실제 외부 도달 | 실행 = 게이트 3(오케·재가분) · 구현 좌석은 실행 금지 | 게이트 3 직후 §3-3 ③ |
| 재부팅 후 Funnel 설정 복원 | 재부팅은 운영자 영역(destructive) | T4-3 AC 「재부팅 1회 실측」 |
| Funnel 이 붙이는 헤더(`X-Forwarded-For`·`X-Forwarded-Proto`) 의 실제 값 | Funnel 미기동 | 게이트 3 직후 1줄: 외부에서 `/api/health` 호출 → ai-api 로그의 client ip 대조. 🔴 이 값이 **`FKT_TRUST_FORWARDED_FOR` 를 켤지 말지의 유일한 근거**다(`docker-compose.yml:123` = `FKT_TRUST_FORWARDED_FOR` 줄 · D-8) — 「프록시가 XFF 를 준다」는 문장은 **재기 전에는 가설(E4)** 이다 |
| 대역폭·동시 접속 한도 | 실측 자극 없음 | T4-4 Gate 6 |
