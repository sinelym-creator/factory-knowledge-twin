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
「밖에서 되는가」는 밖에서만 갈린다. **이 함정은 실제로 밟혔다**: 첫 「외부 200」(2026-09-01 10:37 KST)은
노트북 자신의 요청이 tailnet 으로 붙은 것이었고, 아래 §3-5 의 판별로 되짚어서야 갈렸다.

#### 외부 vantage 를 «확보»하는 법 — 모바일 데이터가 없을 때

제3자 fetch 서비스(URL 을 대신 가져와 주는 공개 서비스)를 경유하면 요청이 **공인 인터넷에서**
출발한다. 그 요청의 클라이언트 IP 는 그 서비스의 것이지 우리 것이 아니므로, 「밖에서 되는가」는
성립한다(실측 2026-09-01: 구글 클라우드 대역에서 도달).

#### 🔴 §3-5. 「지금 이 응답이 밖에서 온 것인가」를 «응답 자체»로 판별한다

Funnel 과 tailnet 접속은 **되돌아오는 헤더가 다르다**. 시각으로도, 성공 여부로도 안 갈린다 —
이것으로 갈린다(E1 · 2026-09-01 10:47 KST · 같은 호스트·같은 서비스에 대한 두 접속 대조):

| | Funnel(밖) | tailnet(안) |
|---|---|---|
| `Tailscale-Funnel-Request` | **`?1`** | 없음 |
| `Tailscale-User-Login` · `-Name` · `-Profile-Pic` | **없음** | **3종 다 있음** |
| `X-Forwarded-For` | 공인 IP 1개 | tailnet IP(100.x) |

**판정 1줄: 응답에 `Tailscale-User-*` 가 보이면 그것은 «안»에서 온 것이다 — 외부 실측으로 세지 않는다.**
반대로 `Tailscale-Funnel-Request: ?1` 이 있으면 Funnel 을 지난 것이다.

🔴 `/api/health` 가 200 이라고 의존이 살아 있다는 뜻이 아니다(`docker-compose.yml` 의 ai-api `healthcheck:` 머리말 성문 · Q-52 계보).
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

## 5-bis. 게이트 3 실측 착지 (2026-09-01 10:47 KST · 외부 vantage = 공인 인터넷)

### 외부 도달 — E1

`https://<host>:8443/api/health` → **200** · 본문 `status = ok` ·
`postgres` ok(51ms) · `neo4j` ok · build sha `792470d` · embedding ready(warm-up 12.0s).
망 = 공인 인터넷(제3자 fetch 서비스 · 구글 클라우드 대역). §3-5 판별로 「밖」임을 확인했다.

🔴 이 줄은 **의존까지 초록**이라는 뜻이다 — 200 만 본 것이 아니라 `dependencies` 를 같이 읽었다.

### Funnel 이 붙이는 헤더 — E1 (원문)

```
X-Forwarded-For:            <요청자의 공인 IP>      ← 값 «하나» · 체인 없음
X-Forwarded-Proto:          https
X-Forwarded-Host:           <host>:<funnel port>
Tailscale-Funnel-Request:   ?1
Tailscale-User-*:           없음
```

**확정된 것**: Funnel 은 XFF 를 «자기가 채운다». 그 값은 실제로 접속해 온 쪽의 공인 IP 였고,
우리 코드가 보는 «첫 값»(`services/ai-api/app/protection.py` `_client_ip`)이 곧 그 주소다.
`X-Forwarded-Proto` 도 `https` 로 선다.

### 🔴 「덧붙이는가 / 갈아치우는가」 — **갈아치운다(replace)** · E2

XFF 값이 하나로 보이는 것만으로는 둘이 안 갈린다. «들어오는 XFF 가 없었다면» append 든 replace 든
결과가 같기 때문이다. 그래서 **합성 헤더를 실어서** 한 번 더 불렀다(2026-09-01 01:48:53Z):

| | 보낸 요청 | 되비친 값 |
|---|---|---|
| ① 대조군 | 헤더 없음 | `XFF: <프록시가 본 클라이언트>` · `XFP: https` · `XFH: <실 호스트>` |
| ② 자극 | `XFF: 203.0.113.7` · `XFP: http` · `XFH: evil.example` | **①과 바이트 동일** |

**지어낸 값이 하나도 살아남지 않았다.** 프록시는 들어온 `X-Forwarded-*` 를 전부 덮어쓴다.

| | 결과 |
|---|---|
| 위조 가능성 | **없다** — 클라이언트가 무엇을 보내도 버려진다 |
| 첫 값의 정체 | 언제나 «프록시가 본 직접 클라이언트» |
| 우리 코드(`_client_ip` = 첫 값) | 이 형상에서 **정당** |

🔴 **등급이 E1 이 아니라 E2 인 이유(vantage 한계 · 그대로 적는다)**: ②는 임의 헤더를 실어야 해서
**tailnet 경로**(같은 tailscaled 프록시)로 쟀다 — 외부 fetch 서비스로는 임의 요청 헤더를 못 싣는다.
`serve` 와 `funnel` 은 같은 프록시 코드를 지나고, Funnel 외부 표본(위 §5-bis 첫 표 · XFF 단일 공인 IP)과
정합하지만, **「Funnel 경로에서 직접 잰 replace」는 아니다.** 외부에서 임의 헤더를 실을 수단이 생기면
그때 E1 로 올린다.

### 🔴 그래서 무엇이 켜지고 무엇이 안 켜지는가

`FKT_TRUST_FORWARDED_FOR=1` 은 **유지한다** — 위조 경로가 0 이므로 켜서 나빠지는 것이 없다.
다만 **켠다고 「방문자별 IP 축」이 서는 것은 아니다.** 배포 사슬이 그것을 막는다:

```
브라우저 → Vercel 셸(rewrite = 셸 «서버»가 새로 부른다) → Funnel → ai-api
                                    ↑ 여기서 XFF 가 «덮어써진다»
```

프록시가 보는 직접 클라이언트는 브라우저가 아니라 **셸의 egress** 다. 그리고 replace 이므로
셸이 실어 보낸 방문자 IP 는 **거기서 사라진다**.

| 경로 | ai-api 가 보는 첫 값 | IP 축의 성질 |
|---|---|---|
| 셸(Vercel) 경유 = **공개 트래픽 본류** | 셸 egress | «몇 통» — 켜나 끄나 방문자별이 아니다 |
| `:8443` 직접 타격(curl · 외부 드릴) | 그 클라이언트 | 방문자별로 선다 |

🔴 **한계 성문**: 이 배치에서 「셸 경유 방문자별 IP rate limit」은 **구조적으로 불가능**하다.
설정을 잘못한 것이 아니라 형상이 그렇다 — 방문자별 방어는 **세션 축**이 맡는다(Q-60 성문의 발현).
바꾸려면 「첫 값」이 아니라 「끝에서 n번째」를 보도록 코드를 고쳐야 하고, 그것은 별 티켓이다.

### 미리 적어 두는 예측 (B⑦ · 아직 안 쟀다)

배포 URL 이 서면 셸 경유로 `/api/health` 를 1회 부르고 ai-api 로그를 본다. **예측을 먼저 적는다** —
맞으면 위 표가 확증되고, 다르면 그 자체가 회부 사유다(재고 나서 이유를 만들지 않기 위함이다):

- `scope["client"]` = 도커 브리지 peer(`172.22.0.1` 류)
- `X-Forwarded-For` 첫 값 = Vercel egress 대역(`76.76.x` 류)

## 6. 못 잰 것 (「안 잰 것」이 아니라 「이 좌석이 잴 수 없었던 것」을 구분해 적는다)

| 항목 | 왜 못 쟀는가 | 무엇이 채우는가 |
|---|---|---|
| 🔴 **셸(Vercel) 경유일 때 ai-api 가 보는 client ip** | 배포 URL 부재 | **이 축이 스위치의 최종 판정이다.** 배포 사슬은 `브라우저 → 셸 서버(rewrite 가 «새로» 부른다) → Funnel → ai-api` 다. Funnel 이 XFF 를 자기가 채우므로, 그 자리에 서는 「접속자」는 브라우저가 아니라 **셸의 egress** 일 수 있다 — 그러면 `=1` 을 켜도 방문자별이 아니라 **한 통**이다(Q-60 이 성문한 「IP 축 = 총량 차단기」가 배포에서도 그대로). 확인 = 배포 셸 경유로 `/api/health` 1회 → ai-api 로그의 client ip 가 브라우저 IP 인가 셸 IP 인가 |
| Funnel «경로에서 직접» 잰 replace | 외부 fetch 서비스로는 임의 요청 헤더를 못 싣는다 | §5-bis 는 tailnet 경로 실측(E2)이다. 외부에서 임의 헤더를 실을 수단이 생기면 그때 E1 |
| 재부팅 후 Funnel 설정 복원 | 재부팅은 운영자 영역(destructive) | T4-3 AC 「재부팅 1회 실측」 |
| 대역폭·동시 접속 한도 | 실측 자극 없음 | T4-4 Gate 6 |
