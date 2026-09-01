# T4-3 «Tunnel·Vercel 공개 RC» 독립 검증 — 🔴 **부분(C 칸 1절만)**

> 🔴 **이 문서는 T4-3 의 판정이 아니다.** 오늘 선 칸은 **AC ④(`docs/plan/tickets/T4-3.md:33`
> = 오케 호칭 「C 칸」) 중 「재부팅 1회 실측」 반쪽** 하나뿐이다. 나머지 AC 4행은 아래 §Z 에
> **Not measured + 좌표**로 남긴다. 「일부 축 통과」를 T4-3 합격이라 부르지 않는다.
>
> 검증 좌석 리바이2 **20대** · 기점 `origin/develop` `004804a` · lane `lane/levi2-d12-verify` ·
> 정본 = `docs/baseline/poc-baseline-v0.2.md` §14.4 · 티켓 `docs/plan/tickets/T4-3.md`.
> 발주 = 스자쿠 15대(2026-09-01 14:18) — 「13:54:53 재부팅(자비스 집행) 뒤 첫 실측」.

---

## §0 잰 범위 (1줄로 먼저)

**잰 것** = 재부팅 뒤 이 호스트에서 ⓐ health 계측기 1회 통과 여부 ⓑ 컨테이너 자동 복귀/미복귀 갈림
ⓒ §14.4 노트북 조건(절전·최대절전·Tailscale 서비스) 3행. **안 잰 것** = 외부 vantage 도달성 ·
Funnel 공개 경로 · 외부/모바일 UX · Gate 6 장애 축 · runbook 문서 자체의 적합성.

| 축 | 등급 | 값 |
|---|---|---|
| 재부팅 시각 | **E1** | `LastBootUpTime` = 2026-09-01 **13:54:53** (측정 14:20:26 · uptime 00:25:32) |
| health 계측기 | **E1** | `measured=17 (PASS 17 / FAIL 0) · SKIP 1` · **rc 0** (14:20:44~14:20:47) |
| 자동 복귀 갈림 | **E1** | 복귀 **3본**(전건 `restart=unless-stopped`) / 미복귀 **3본**(전건 `restart=no`) |
| 노트북 조건 | **E1** | STANDBYIDLE 0 · HIBERNATEIDLE 0 · Tailscale `Running · Automatic` |
| 계측기 결함 | **E1** | `-File` 호출에서 `-Containers a,b,c` 가 «한 이름»으로 묶여 위양성 FAIL · rc 1 (재현) |

🔴 **재부팅 시각은 전언으로 옮기지 않고 내가 다시 쟀다** — 발주문의 13:54:53 과 `Win32_OperatingSystem`
실측이 초 단위까지 일치한다. 이 절의 「재부팅 «뒤»」라는 말이 서는 근거가 이 한 행이다.

---

## §C 재부팅 1회 실측 (AC ④ · `T4-3.md:33`)

### C.1 계측 명령과 rc (원문)

```
pwsh 7.6.5 · 실행 위치 = C:/Users/sinel/repos/_wt/levi2-d12
             (infra/health-check.ps1 = 메인 체크아웃과 byte 동일 · diff 0 확인)

pwsh -NoProfile -Command
     & ./infra/health-check.ps1
       -Project    fkt-senku2-t15
       -Containers fkt-deploy-ai-api,fkt-senku2-t15-postgres-1,fkt-senku2-t15-neo4j-1
       -ApiBase    http://127.0.0.1:8010
       -PublicBase https://harry.tail488f52.ts.net:8443
       -WebBase    https://factory-knowledge-twin.vercel.app

시작 14:20:44 · 종료 14:20:47 · rc = 0
```

```
Layer              Check                     Verdict Detail
-----              -----                     ------- ------
container          fkt-senku2-t15-postgres-1 PASS    running · restart=unless-stopped
container-health   fkt-senku2-t15-postgres-1 PASS    healthy
container          fkt-senku2-t15-neo4j-1    PASS    running · restart=unless-stopped
container-health   fkt-senku2-t15-neo4j-1    PASS    healthy
container          fkt-deploy-ai-api         PASS    running · restart=unless-stopped
container-health   fkt-deploy-ai-api         SKIP    healthcheck 정의 없음 — 잴 대상이 없다
ai-api(local)      http 200                  PASS    http://127.0.0.1:8010/api/health
ai-api(local)      status                    PASS    status=ok
ai-api(local)-dep  postgres                  PASS    state=ok
ai-api(local)-dep  neo4j                     PASS    state=ok
ai-api(funnel)     http 200                  PASS    https://harry.tail488f52.ts.net:8443/api/health
ai-api(funnel)     status                    PASS    status=ok
ai-api(funnel)-dep postgres                  PASS    state=ok
ai-api(funnel)-dep neo4j                     PASS    state=ok
web                http 200                  PASS    https://factory-knowledge-twin.vercel.app
laptop             sleep(STANDBYIDLE)        PASS    0 = 안 함(Never)
laptop             hibernate(HIBERNATEIDLE)  PASS    0 = 안 함(Never)
laptop             Tailscale service         PASS    Running · StartType=Automatic

measured=17 (PASS 17 / FAIL 0) · SKIP 1
VERDICT: PASS
```

### C.2 자동 복귀 갈림 (`docker ps -a` 실물 · 판정의 알맹이)

🔴 **가른 손잡이는 「compose 냐 docker run 이냐」가 아니라 `restart` 정책이다.** 아래 6본에서
정책과 결과가 **1:1 로 붙는다**(unless-stopped 3본 전건 복귀 · no 3본 전건 미복귀 · 예외 0).

| 컨테이너 | restart | 재부팅 후 | StartedAt(UTC) | 부팅 기준 | 형상 |
|---|---|---|---|---|---|
| `fkt-deploy-ai-api` | `unless-stopped` | **running** | 04:55:56.510 | **+63.5s** | `docker run`(§C.3) |
| `fkt-senku2-t15-postgres-1` | `unless-stopped` | **running** (healthy) | 04:55:56.512 | **+63.5s** | compose `fkt-senku2-t15` |
| `fkt-senku2-t15-neo4j-1` | `unless-stopped` | **running** (healthy) | 04:55:56.511 | **+63.5s** | compose `fkt-senku2-t15` |
| `fkt-levi2-t35-seeded` | `no` | **Exited (137)** | — (Finished 02:58:01) | 부팅 «전» | 검증 좌석 존치물 |
| `fkt-levi2-postgres-1` | `no` | **Exited (0)** | — (Finished 03:12:13) | 부팅 «전» | 검증 좌석 존치물 |
| `fkt-levi2-neo4j-1` | `no` | **Exited (137)** | — (Finished 03:12:14) | 부팅 «전» | 검증 좌석 존치물 |

```
NAMES                       STATE     STATUS                     PORTS
fkt-deploy-ai-api           running   Up 24 minutes              0.0.0.0:8010->8000/tcp
fkt-senku2-t15-postgres-1   running   Up 24 minutes (healthy)    0.0.0.0:5536->5432/tcp
fkt-senku2-t15-neo4j-1      running   Up 24 minutes (healthy)    0.0.0.0:7576->7474/tcp, 0.0.0.0:7589->7687/tcp
fkt-levi2-t35-seeded        exited    Exited (137) 2 hours ago
fkt-levi2-postgres-1        exited    Exited (0) 2 hours ago
fkt-levi2-neo4j-1           exited    Exited (137) 2 hours ago
(그 밖 10본 = 타 프로젝트 잔존물 · 전건 exited/created · 이 판정과 무관)
```

🔵 **검증 좌석은 컨테이너를 만지지 않았다** — 이 절의 명령은 `docker ps -a` / `docker inspect` /
`docker image inspect` 뿐이다(start·run·exec·stop **0회**). 미복귀 3본은 발주 지시대로 Exited 유지.

### C.3 배포 형상의 ai-api 는 `docker run` 이다 — 그런데 «라벨은 있다» (E1)

`fkt-deploy-ai-api` 의 `.Config.Labels` 는 **3개뿐**이고, 그 3개가 이미지
`fkt-senku2-q3-ai-api:latest` 에 구워진 라벨 집합과 **완전히 같다**. compose 가 «컨테이너에» 붙이는
`config-hash`·`container-number`·`oneoff`·`project.config_files`·`project.working_dir`·`image` 가
**한 개도 없다**(같은 호스트의 compose 산물 `fkt-senku2-t15-postgres-1` 은 10개 전부 가진다).

```
fkt-deploy-ai-api          project=fkt-senku2-q3 · service=ai-api · version=2.40.3        ← 3개 (= 이미지 라벨과 동일)
fkt-senku2-t15-postgres-1  config-hash · container-number · depends_on · image · oneoff=False
                           · project=fkt-senku2-t15 · project.config_files · project.working_dir
                           · service=postgres · version=2.40.3                             ← 10개
image fkt-senku2-q3-ai-api:latest
                           project=fkt-senku2-q3 · service=ai-api · version=2.40.3        ← 구워진 3개
```

⇒ **`docker run` 컨테이너가 이미지에서 compose 라벨을 «상속»했다.** 실제 형상도 교차다 —
이미지는 `fkt-senku2-q3` 산이고, 네트워크는 `fkt-senku2-t15_default` 에 붙어 있다
(cmd = `uvicorn app.main:app --host 0.0.0.0 --port 8000 --no-proxy-headers`).

🔴 **그래서 `-Project` 만으로는 이 배포 형상을 못 잰다. 그런데 그 이유가 스크립트 주석과 다르다.**
`infra/health-check.ps1` 의 param 주석은 「`docker run` 으로 띄운 컨테이너는 여기에 «한 건도»
안 잡힌다」고 적어 뒀는데, **라벨 필터는 상속 라벨도 문다**(실측):

```
docker ps -a --filter label=com.docker.compose.project=fkt-senku2-q3   → fkt-deploy-ai-api      ← 잡힌다
docker ps -a --filter label=com.docker.compose.project=fkt-senku2-t15  → postgres-1 · neo4j-1
docker ps -a --filter label=com.docker.compose.project=fkt-levi2-t41   → fkt-levi2-t35-seeded   ← 잡힌다
```

즉 「안 잡힌다」가 아니라 **「자기가 도는 프로젝트가 아니라, 이미지가 태어난 프로젝트 이름으로
잡힌다」**이다. 결론(`-Containers` 가 따로 있어야 한다)은 그대로 서지만 **위험의 모양이 다르다** —
`-Project fkt-senku2-t15` 로 재면 컨테이너가 **2건** 잡혀 스크립트의 「0건 = FAIL」 방어선이
울리지 않은 채 ai-api 한 본이 **조용히 안 세어진다**. 0건 가드는 이 구멍을 못 막는다.
⇒ **소견(E1 · 등급 하 · 주석 정확성)** — 픽스는 구현 scope. 판정 차단 아님.

### C.4 대조군 (같은 대상 · 손잡이 하나만 다르게 3행)

| # | 호출 형태 | 결과 | rc | 무엇을 가르는가 |
|---|---|---|---|---|
| ① | `-Command "& ./…"` + `-Containers a,b,c` | 17 PASS / 0 FAIL / SKIP 1 | **0** | 정상 배선(§C.1) |
| ② | `-File ./…` + `-Containers a,b,c` | 16 PASS / **1 FAIL** / SKIP 0 | **1** | 세 이름이 «한 이름»으로 묶임 |
| ③ | `-File ./…` + `-Containers <이름 1개>` | 12 PASS / 0 FAIL / SKIP 3 | **0** | 🔴 **결함은 «콤마 목록»에 한정** |

②의 FAIL 행 원문 — 이름 세 개가 통째로 한 칸에 들어와 있다:

```
container  fkt-deploy-ai-api,fkt-senku2-t15-postgres-1,fkt-senku2-t15-neo4j-1  FAIL  있어야 한다고 선언된 컨테이너가 없다
measured=17 (PASS 16 / FAIL 1) · SKIP 0
```

🔴 **②는 「같은 측정의 다른 판정」이 아니다 — «다른 집합»을 잰 것이다.** ①은 18행(측정 17 + SKIP 1),
②는 17행(측정 17 + SKIP 0). ②에서는 `fkt-deploy-ai-api` 의 **state 행과 healthcheck 행이 통째로
사라졌다**. 그러므로 ②의 「16 PASS」를 근거로 「ai-api 도 살아 있음이 확인됐다」고 읽으면 안 된다 —
그 회차에 ai-api 는 **한 번도 안 세어졌다**. ③이 갈림을 확정한다: 이름이 하나면 `-File` 로도
PASS · rc 0 이다.

**오케 대조군(14:15 `-File` 16 PASS/1 FAIL · 14:17 배열 17 PASS/0 FAIL/SKIP 1 · rc 0)과
내 ①②가 계수까지 일치한다** — 보고를 옮겨 적은 것이 아니라 두 형태를 직접 재현해 맞춘 값이다.

### C.5 🔴 이 초록이 «아닌» 것 (초록의 주어)

1. **`ai-api(funnel)` 4행은 외부 도달성의 증거가 아니다.** `harry.tail488f52.ts.net` 은 이 호스트에서
   **100.87.3.33**(Tailscale CGNAT)으로 풀리고, 실제 TCP 연결의 **remote 와 local 이 둘 다
   `100.87.3.33`** 이다 — tailnet self 로 붙었다. 공개 Funnel 경로를 지난 적이 없다.
   ⇒ 이 4행이 지키는 사실 = 「이 호스트에서 8443 리스너가 서 있고 `/api/health` 가 ok 를 낸다」.
   외부 vantage 판정은 **§Z 에 Not measured 로 남는다.**
2. **`SKIP 1` 은 초록도 빨강도 아니다.** `fkt-deploy-ai-api` 에 healthcheck 정의가 없다
   (`.State.Health` 부재). 「물어볼 데가 없다」이지 「건강하다」가 아니다. compose 산
   postgres/neo4j 2본만 `healthy` 를 자기 신고했다.
3. **`web` 200 은 셸이 뜬다는 것뿐이다.** `https://factory-knowledge-twin.vercel.app` 루트 200 이지
   `/enter` 세션 발급(D-12) 축과 무관하다 — 그 축은 `evidence/d12-enter-retry-verification.md`.
4. **17 PASS 는 「재부팅이 아무것도 안 깨뜨렸다」가 아니다.** 이 계측기가 재는 층은
   컨테이너 6행 · ai-api 2경로 8행 · 셸 1행 · 노트북 3행뿐이다. Gate 6 장애 축 · 외부 UX ·
   WS · 모바일은 이 rc 0 안에 **없다**.

### C.6 그물 결함 (계측기 측 · 픽스 = 구현 scope)

> **G-1 · `infra/health-check.ps1` · 등급 중 · 위양성 FAIL + 조용한 미계측** — 파일 머리 「사용:」
> 블록이 `pwsh -File infra/health-check.ps1 …` 형태를 정본으로 제시하는데, 그 형태로
> `[string[]] $Containers` 에 콤마 목록을 주면 PowerShell 이 **문자열 1개로 바인딩**해 존재하지 않는
> 이름 1건 FAIL(rc 1)을 내고 **선언된 컨테이너 중 첫 본이 아예 안 세어진다**. 단일 이름은 정상(§C.4 ③).
> 🔴 **검증 좌석은 고치지 않는다** — `infra/**` = 구현 write scope. 회부만 한다.

부수 소견 **G-2 · 등급 하** = §C.3 의 param 주석 문장(「`docker run` 은 한 건도 안 잡힌다」)이
실측과 다르다(상속 라벨로, 다른 프로젝트 이름으로 잡힌다). 결론은 유효.

🔵 **내 계측기 자수 1건** — ②③ 회차를 `-File` 로 돌리면서 `[Console]::OutputEncoding` 을 UTF-8 로
세우지 않아 한국어 Detail 이 리다이렉트 파일에서 깨졌다(`??`). **대상의 성질이 아니라 내 캡처의
결함**이다. 위 §C.4 인용문의 한국어는 ① 회차(UTF-8 지정)의 같은 행에서 옮겼다.

### C.7 판정

| AC ④ 반쪽 | 판정 | 근거 |
|---|---|---|
| **재부팅 1회 실측 · 자동 복귀/미복귀 갈림 성문** | **PASS** | §C.2 — 정책·결과 1:1(예외 0) · 부팅 +63.5s 복귀 |
| **재부팅 후 health 스크립트가 실제로 선다** | **PASS** | §C.1 — `measured=17 · FAIL 0 · rc 0` |
| **§14.4 절전 끔 «확인 방법»이 초록을 낸다** | **PASS** | §C.1 laptop 3행 |
| 계측기 자체 | **결함 1건(G-1 · 중)** | §C.6 — 판정 비차단(정상 배선으로 재측 성립) |

⇒ **C 칸(재부팅 1회 실측) = PASS.** 🔴 단 이것은 **T4-3 의 한 칸**이다. AC ④의 나머지 반쪽
(runbook 문서 §14.4 적합성 — 자산은 `infra/laptop-operating-conditions.md` 에 실재)과 AC ①②③⑤ 는
**안 쟀다**(§Z).

---

## §Z 안 잰 칸 (Not measured + 좌표 · 「안 쟀다」와 「재 봤더니 나쁘다」를 같은 칸에 안 쓴다)

| AC | 상태 | 좌표 / 막는 것 |
|---|---|---|
| ① Public RC URL + README boundary 성문 | **Not measured** | `README.md` §34.7 문면 대조 미실시 |
| ② 외부 네트워크+모바일 접속 · 첫 화면 ≤3s | **Not measured** | 🔴 외부 vantage 필요 — 이 호스트에서 재면 tailnet self 로 붙는다(§C.5-1) |
| ③ Live 조사 외부 완주 · 노트북/ai-api/Tunnel OFF 3축 | **Not measured** | 본 판정 = T4-4 · 잔여 ⓐⓑ 는 **D-12 종결 뒤**(발주 ③ · 표본 오염 방지) |
| ④ runbook 문서 반쪽 | **Not measured** | 자산 실재 = `infra/laptop-operating-conditions.md`(§14.4) · 문면 대조 미실시 |
| ⑤ 공개 경계 §15.2·§16·§34.6 스캔 green | **Not measured** | `credential_leak_drill`·`ci_hygiene_drill` 미실행 |

---

## §부록 재현 명령 (이 절 전량)

```
pwsh -NoProfile -Command "(Get-CimInstance Win32_OperatingSystem).LastBootUpTime"
pwsh -NoProfile -Command "[Console]::OutputEncoding=[Text.Encoding]::UTF8; & ./infra/health-check.ps1 -Project fkt-senku2-t15 -Containers fkt-deploy-ai-api,fkt-senku2-t15-postgres-1,fkt-senku2-t15-neo4j-1 -ApiBase http://127.0.0.1:8010 -PublicBase https://harry.tail488f52.ts.net:8443 -WebBase https://factory-knowledge-twin.vercel.app; exit $LASTEXITCODE"
docker ps -a --format "table {{.Names}}\t{{.State}}\t{{.Status}}\t{{.Ports}}"
docker inspect <name> --format "{{.State.Status}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.StartedAt}}|{{.State.FinishedAt}}"
docker inspect <name> --format "{{range $k,$v := .Config.Labels}}{{$k}}={{$v}} {{end}}"
docker image inspect fkt-senku2-q3-ai-api:latest --format "{{json .Config.Labels}}"
docker ps -a --filter "label=com.docker.compose.project=<proj>" --format "{{.Names}}"
pwsh -NoProfile -Command "Resolve-DnsName harry.tail488f52.ts.net; $c=New-Object Net.Sockets.TcpClient; $c.Connect('harry.tail488f52.ts.net',8443); $c.Client.RemoteEndPoint; $c.Close()"
```
