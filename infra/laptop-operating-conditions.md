# 노트북 운영 조건 — 자동 시작 · 재부팅 후 health · 절전 (T4-3 ⓒ · baseline §14.4)

> §14.4 는 일곱 줄이다. 그중 **이미 다른 자리에 선 두 줄**(Live 동시 실행 수 제한 · 노트북 offline 시
> 공개 UX 의 Replay 자동 전환)은 여기서 다시 쓰지 않는다. 이 문서는 **남아 있던 넷**을 채운다.

| §14.4 항목 | 어디에 서 있는가 |
|---|---|
| 전원 연결 상태 유지 | 운영자 기기 조작(§4) — 이 문서는 «확인법»만 |
| sleep·hibernate 비활성화 | **§4**(확인법 + 실측치) |
| Docker·Tunnel service 자동 시작 | **§2** · Tunnel 쪽 상세는 `infra/tailscale-funnel-runbook.md` §5 |
| 배터리·온도·디스크 monitoring | 🔴 **이 문서 범위 아님** — T5-4 회부(감시 대상이지 부팅 조건이 아니다) |
| 재부팅 후 health check | **§3**(`infra/health-check.ps1`) |
| Live 동시 실행 수 제한 | 이미 선 것(ai-api 보호장치 · T4-2b) |
| Notebook offline → Replay 전환 | 이미 선 것(T4-2a 정적 replay 경로) |

---

## 1. 🔴 컨테이너 재시작 정책 — 「필요한 셋만 되살아난다」

### 1-1. 왜 이 절이 맨 앞인가

이 노트북에는 이 리포와 무관한 스택을 포함해 컨테이너가 수십 본 있다. 전부 되살아나면
재부팅 한 번에 포트·메모리·디스크가 서로를 밀어낸다. 그래서 규칙은 **「기본은 안 되살린다,
배포 3본만 명시적으로 되살린다」** 이다.

앞판은 `docker-compose.yml` 이 세 서비스 전부에 `restart: unless-stopped` 를 **선언**하고 있었다.
그래서 「지금 전건 `restart=no` 로 돌려 놓았다」는 상태가 **`docker compose up` 한 번에 되감겼다** —
정본은 마지막으로 돌린 `docker update` 가 아니라 «파일이 선언한 값»이기 때문이다.
지금은 기본값이 `no` 이고, 되살리는 것은 한 줄의 «명시»다.

### 1-2. 배포 3본 = t15 pg · t15 neo4j · ai-api

되살릴 대상은 갈래가 둘이고, **경로가 서로 다르다**. 하나로 적으면 반드시 한쪽이 샌다.

| 대상 | 어떻게 떴는가 | 정책을 어떻게 붙이는가 |
|---|---|---|
| t15 postgres · t15 neo4j | compose(씨앗 스택 · **데이터가 들어 있다**) | 🔴 `docker compose up` 금지 → **`docker update`** |
| ai-api | `docker run --network <씨앗 스택 네트워크>` | **`docker run --restart=unless-stopped`**(기동할 때 붙인다) |
| 새로 만드는 스택(clean env · T5-4) | compose create | **`$env:FKT_RESTART_POLICY = "unless-stopped"`** 뒤 compose |

```powershell
# ① 씨앗 스택 2본 — 컨테이너를 다시 만들지 않고 정책만 바꾼다(데이터 무접촉)
docker update --restart=unless-stopped fkt-senku2-t15-postgres-1 fkt-senku2-t15-neo4j-1

# ② ai-api — 기동 명령에 붙인다 (포트·네트워크는 runbook 의 값)
#    docker run -d --restart=unless-stopped --network <씨앗 네트워크> ... <이미지>

# ③ 새 스택을 compose 로 만들 때만
$env:FKT_RESTART_POLICY = "unless-stopped"
```

🔴 **`.env` 에 넣지 않는다.** 이 리포는 `.env` 를 읽지 않고(`services/ai-api/app/settings.py` 머리말),
`.env.example` 은 값 없는 키 목록이다. 이 값은 **배포하는 셸에서 한 줄로 선언**한다 — 그래야
「누가 언제 켰는가」가 그 셸 기록에 남는다.

### 1-3. 확인법 — 계수로 판정한다

```powershell
docker inspect $(docker ps -aq) --format '{{.HostConfig.RestartPolicy.Name}}' |
  Group-Object | Select-Object Name, Count
```

| 판정 | 뜻 |
|---|---|
| `unless-stopped` = **정확히 3** | 통과 |
| `unless-stopped` = 0 | 🔴 실패 — 재부팅해도 아무것도 안 돌아온다(§1-2 를 안 돌렸다) |
| `unless-stopped` > 3 | 🔴 실패 — 배포 대상이 아닌 것이 함께 살아난다(어느 것인지 이름으로 찾아 `docker update --restart=no`) |

「0 도 초과도 실패」다. **계수를 안 세고 「돌렸다」로 넘기지 않는다.**

### 1-4. 되돌리기 (데모가 끝나면)

```powershell
docker update --restart=no $(docker ps -aq)      # 전건 원위치
```

---

## 2. 자동 시작 — 두 축을 «따로» 센다

| 축 | 확인법 | 실측(E1 · 2026-09-01 01:1x UTC) |
|---|---|---|
| Tailscale 데몬 | `Get-Service Tailscale \| Select Status,StartType` | `Running` · **`StartType=Automatic`** ✅ |
| Docker Desktop | `(Get-ItemProperty "$env:APPDATA\Docker\settings-store.json"...)` 의 `AutoStart` | **`True`** |
| Docker Desktop 시작 항목 | `HKCU:\...\CurrentVersion\Run` 에 `Docker Desktop` | **있다** · `StartupApproved\Run` 값 = 활성 |
| 🔴 자동 로그온 | `HKLM:\...\Winlogon` 의 `AutoAdminLogon` | **`1`** |

### 🔴 여기서 갈리는 것 — 「서비스」와 「로그온」은 다른 축이다

- `com.docker.service` 는 `StartType=Manual` 이다. **이것은 결함이 아니다** — Docker Desktop 설계상
  이 서비스는 앱이 띄운다. 이 줄을 「자동 시작이 꺼져 있다」로 읽으면 없는 결함을 고치게 된다.
- 실제 의존은 이것이다: **Docker 엔진은 «사용자 로그온»이 있어야 뜬다.** 그래서
  `AutoAdminLogon=1` 이 §14.4 「Docker 자동 시작」의 진짜 전제다.
- 🔴 `AutoAdminLogon=1` «만»으로 자동 로그온이 성립한다고 단정하지 않는다(저장된 자격이 함께
  있어야 한다 — 그 값은 읽지 않았고 읽지 않는다). **이 줄의 확정은 재부팅 1회뿐**이다(§5).
- Tailscale 은 서비스라서 로그온과 무관하게 뜬다. 그래서 **재부팅 후 Tunnel 만 살고 Docker 가 죽은
  형상**이 가능하다 — 그때 밖에서 보이는 것은 502 다. §3 이 이 갈림을 분리해서 잰다.

---

## 3. 재부팅 후 health check — `infra/health-check.ps1`

```powershell
pwsh -File infra/health-check.ps1 `
     -Project    fkt-senku2-t15 `
     -Containers fkt-senku2-t43-ai-api `
     -ApiBase    http://127.0.0.1:8010 `
     -PublicBase https://<host>.ts.net:8443 `
     -WebBase    https://<app>.vercel.app
```

### 이 스크립트가 «따로» 세는 것

| 층 | 왜 따로 세는가 |
|---|---|
| 컨테이너 state | 「떴는가」 |
| 컨테이너 healthcheck | 「떠서 정상인가」 — 🔴 healthcheck 가 **없는** 컨테이너는 `SKIP` 이다. 없는 계측기를 빨강으로 적으면 대상의 성질처럼 읽힌다 |
| ai-api HTTP 200 | 「이 프로세스가 답하는가」 |
| ai-api `status`·`dependencies` | 「의존이 사는가」 — 🔴 **200 은 의존을 보증하지 않는다**(Q-52 계보 · compose ai-api healthcheck 머리말). 이 두 줄을 한 칸에 쓰면 pg 가 죽은 채로 초록이 난다 |
| Funnel 경유 ai-api | 로컬과 «다른 축»이다. 로컬 200 · Funnel 실패 = 터널 문제, 둘 다 실패 = 서비스 문제 |
| 셸(Vercel) | 노트북이 죽어도 살아 있어야 하는 층 |
| 노트북 절전·Tailscale 서비스 | §2·§4 |

### 🔴 판정 규약 — 초록의 뜻을 좁게 잡는다

- `SKIP` 은 **초록이 아니다.** 주소를 안 줘서 안 잰 행은 PASS 로 세지 않는다.
- 잰 행이 **0개면 `rc 2`**(`NO-MEASUREMENT`) — 「아무 문제 없음」이 아니라 「계측 실패」다.
- `-Containers` 로 «이름을 대고» 요구한 컨테이너가 없으면 **FAIL** 이다(SKIP 아니다).
  🔴 이 인자가 따로 있는 이유가 실측이다: `-Project` 필터는 **compose 라벨**을 보므로
  `docker run` 으로 띄운 컨테이너를 **한 건도 못 본다**. 배포 형상의 ai-api 가 정확히 그 경우여서,
  이 인자 없이는 「pg·neo4j 초록, ai-api 실종」이 통째로 PASS 로 나온다.

### 계측기 자체를 «참»으로 한 번 울려 본 기록 (E1 · 2026-09-01 01:2x UTC)

| 상황 | 결과 | rc |
|---|---|---|
| 스택 없음 + 죽은 주소 | `measured=4 (PASS 3 / FAIL 1)` | **1** |
| t15 씨앗(존재하나 정지) | FAIL 행 발생 | **1** |
| levi2 스택 running(healthy 2본) | `measured=7 (PASS 7 / FAIL 0)` | **0** |
| 이름 3종 혼합(running / exited / 부재) | 각각 PASS · FAIL · FAIL | **1** |

세 상황이 서로 다른 답을 냈다 = 이 계측기는 「항상 초록」도 「항상 빨강」도 아니다.

---

## 4. 절전 끔 — 확인법과 실측치

```powershell
powercfg /getactivescheme
powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE
powercfg /query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE
```

🔴 출력 문구는 시스템 언어를 탄다. 로캘을 안 타는 것은 `AC`/`DC` 와 16진 인덱스뿐이라
`health-check.ps1` 의 `Get-PowerIndex` 는 그 둘로만 고른다(한국어 Windows 에서 실측 확인).

| 설정 | 요구 | 실측(E1 · 2026-09-01) |
|---|---|---|
| 활성 전원 구성 | — | `27fa6203-…` (Performance) |
| `STANDBYIDLE`(대기 모드 진입) | `0`(안 함) | **AC 0 · DC 0** ✅ |
| `HIBERNATEIDLE`(최대 절전 진입) | `0`(안 함) | **AC 0 · DC 0** ✅ |
| `VIDEOIDLE`(화면 끄기) | 무관 | AC 0 · DC 0 |

값 `0` = **Never** 다. 두 개의 서로 다른 파서로 같은 값을 얻어 확인했다.

### 못 «읽은» 것 — 안 읽은 것이 아니다

| 항목 | 상태 |
|---|---|
| 덮개 닫음 동작(`SUB_BUTTONS LIDACTION`) | 🔴 이 전원 구성에서 **노출되지 않는다**(질의가 값을 안 준다). 「안전하다」도 「위험하다」도 아니고 **못 잰 칸**이다. 노출시키려면 `powercfg /attributes` 로 숨김을 풀어야 하고, 그것은 기기 설정 = 운영자 영역이다 |
| 이 기기의 대기 유형 | `powercfg /a` 상 **Modern Standby(S0)** 계열이고 S1~S3 는 사용 불가다. `STANDBYIDLE=0` 이면 «시간이 지나서» 들어가지는 않지만, 덮개·전원 버튼 축은 위 줄대로 미확인이다 |
| 전원 연결 유지 | 물리 조작 = 운영자 영역. 스크립트가 잴 수 있는 대리 지표(배터리 잔량·AC 여부)는 T5-4 monitoring 으로 회부 |

---

## 5. 재부팅 1회로만 확정되는 것 (이 좌석이 못 한 것)

재부팅은 운영자 영역이라 이 문서는 «절차»까지만 쓴다. 아래 넷은 **재부팅 뒤에 위 §3 을 한 번
돌리는 것으로 전부 동시에** 확정된다.

1. `AutoAdminLogon=1` 이 실제로 로그온을 성립시키는가 → Docker 엔진이 사람 없이 뜨는가
2. `restart=unless-stopped` 3본이 실제로 돌아오는가 (`docker inspect` 의 `RestartCount` 와 `StartedAt` 로 확인)
3. Funnel 의 `--bg` 설정이 tailscaled 재기동을 건너 복원되는가 (runbook §5)
4. Q-52 계보 — pg 가 회복되기 «전»에 ai-api 가 먼저 뜬 경우, 의존 프로브가 스스로 `ok` 로 돌아오는가
   (픽스는 PR#222 에 착지했고 단축 재검은 PASS 다. **재부팅 경로에서의 확인은 아직 없다**)

기록 서식: §3 의 표 출력 + `rc` + 시각(UTC) 을 그대로 붙인다. 「돌렸다」가 아니라 「무엇이 몇 행 초록이었나」를 남긴다.
