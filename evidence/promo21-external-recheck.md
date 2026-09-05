# 승격 21 외부 재검 — production `d4ebe35`

- 좌석: 검증(리바이2 53대) · 발주 = 오케 선발주 `23:28:08` · 착수 조건(전환 완료 멘션) `23:29:16`
- 대상: production 게이트웨이 `:8787` · 호스트 산출물 `~/.fkt/prod/gateway/` · 자동 기동 `~/.fkt/gw-autostart.ps1`
- 구독 소비 **0**(live run 0 · 채점기 미기동) · production 변경 **0**(전 프로브 읽기 전용 · GET/POST 프로브만)
- 근거 등급: **E1** = 내 손 실측 · **E2** = 대상이 남긴 기록(로그·리포 바이트) · **E3** = 소견
- 🔴 경로 표기는 `~` 기준으로 적는다(절대경로 hygiene). `/health` 의 `promptPath` 원값은 호스트 절대경로이며 아래에서 `~/.fkt/prod/gateway/system_prompt.txt` 로 환원해 적는다.

## 0. 판정

| 축 | 내용 | 판정 | 등급 |
|---|---|---|---|
| ① | `-Restart` 실경로 = 예약 작업 `FKT-Gateway-On` 경로(폴백 아님) | **PASS** | E1 |
| ② | 예약 작업 Ready·rc 0 + 새 리스너 명령줄 = 산출물 경로 | **PASS** | E1 |
| ③ | `/health` 에 `bind`·`authRequired` 출현 + effort `medium`→`low` 뒤집힘 · promptSha 불변 | **PASS** | E1(post)+E2(pre) |
| ③' | 무토큰 `/health` 401 · 빈 본문 POST 401 | **참이나 판정력 없음** — 승격 21 «이전»에도 참 | E1+E2 |
| ④ | 공개면 밖 IP `/` 200 · `/api/live/status online:true` | **PASS** | E1 |
| ⑤ | 못 잰 것 = 폴백 갈래 · `/health` pre 상태 직접 관측 | **미측정(이름으로 남김)** | — |

**종합 = PASS.** 회부 1건(§5 · 승격 21 이 만든 회귀 아님).

## 1. 축 ① — `-Restart` 가 실제로 탄 경로

인과 사슬을 **시각**으로 잇는다(전부 내 손 · E1).

| 시각 | 사실 | 출처 |
|---|---|---|
| `23:28:38` | `~/.fkt/gw-autostart.ps1` = **3892B · mtime 22:59** | 내 `ls` (= pre 상태의 마지막 내 손 관측) |
| `23:28:39.293` | 같은 파일 **mtime 갱신** → 3889B | 내 `stat` |
| `23:28:44` | 예약 작업 `FKT-Gateway-On` **LastRunTime** | 내 `Get-ScheduledTaskInfo` |
| `23:28:44` | autostart 로그 `start (artifacts=~/.fkt/prod/gateway)` | 로그 파일(E2) |
| `23:28:46` | 로그 `spawned gateway pid=33984` | 로그 파일(E2) |
| `23:28:47` | `:8787` 리스너 python **StartTime** | 내 `Get-Process` |
| `23:28:54` | 로그 `health=...effort low, bind, authRequired` | 로그 파일(E2) |

- 예약 작업 Action(내 손) = `pwsh.exe -NoProfile -WindowStyle Hidden -File ~/.fkt/gw-autostart.ps1`.
- **LastRunTime `23:28:44` == 로그 `start` `23:28:44`** → 이 실행을 부른 것이 예약 작업이다(폴백 아님).
- 옛 리스너 **pid 11332 = GONE**(내 `Get-Process`) · 새 리스너 pid **44604**.

### 호스트 파일 교체 — 두 산식 병기

| 대상 | 파일 sha256 | git blob SHA-1(`hash-object`) | 바이트 |
|---|---|---|---|
| 교체 **전**(백업 `gw-autostart.ps1.pre-d4ebe35f2f02`) | `7815392199e2…` | `e9137495ef4f…` | 3892 |
| 교체 **후**(설치본 `gw-autostart.ps1`) | `e3b19813448b…` | `5372e8747f0e…` | 3889 |
| 리포 `origin/main~1:infra/gw-autostart.ps1` | — | **`e9137495ef4f…`** | — |
| 리포 `origin/main:infra/gw-autostart.ps1` | — | **`5372e8747f0e…`** | — |

🔴 **전·후 두 줄이 각각 직전 main·현 main 의 blob 과 완전 일치한다.** 「리포 판이 설치되었다」가 한 방향(후)만이 아니라 **양쪽**으로 확증된다 — 백업본이 직전 main 판이라는 사실이, 교체가 이 승격의 것임을 가른다.

## 2. 축 ② — 리스너가 무엇을 읽는가

- 리스너 명령줄(내 손 · `Win32_Process`): `python.exe -u ~/.fkt/prod/gateway/gateway.py` → **산출물 경로**. 메인 체크아웃·워크트리 경로 **0**.
- 예약 작업 `State=Ready` · `LastTaskResult=0`.
- `~/.fkt/prod/BUILD_SHA` = `~/.fkt/prod/gateway/BUILD_SHA` = **`d4ebe35f2f023f212f246d30f82d20e009ed08b1`** = main tip.
- **pid 계보**: 로그의 `spawned gateway pid=33984` 는 `pwsh` 래퍼다. 실제 게이트웨이(python 리스너)는 그 자식 **44604**(내 손: `ParentProcessId=33984`, `parent_name=pwsh.exe`). §5 관찰 참조.

## 3. 축 ③ — `/health` 필드와 effort 뒤집힘

`23:29:21` 토큰 `/health` = **200**(내 손):

```
{"ok": true, "timeoutMs": 60000, "model": "opus", "effort": "low",
 "promptPath": "~/.fkt/prod/gateway/system_prompt.txt",   <- 원값은 호스트 절대경로(환원 표기)
 "promptSha256": "a71c93b148db", "bind": "0.0.0.0", "authRequired": true}
```

| 항목 | pre | post | 근거 |
|---|---|---|---|
| `effort` | `medium` | **`low`** | pre = autostart 로그 `22:26:39` 줄(E2) + 리포 `origin/main~1:infra/gw-autostart.ps1:54` `-Effort medium`(E2) / post = 내 curl(E1) |
| `bind` | 필드 없음 | **`0.0.0.0`** | pre = 같은 로그 줄에 필드 부재(E2) + `main~1:gateway.py` 내 `"bind"` **0건** → main **1건**(E2) / post = 내 curl(E1) |
| `authRequired` | 필드 없음 | **`true`** | 위와 동일(`authRequired` 0건 → 1건) |
| `promptSha256` | `a71c93b148db` | `a71c93b148db` | **불변** · 산출물 실파일 sha256 = `a71c93b148db2c24…`(내 손) → 자기 신고와 파일이 일치 |

- effort 뒤집힘의 **원인 줄**을 짚었다: 뒤집은 것은 게이트웨이가 아니라 **자동 기동 스크립트 54행**의 `-Effort` 인자다(`medium`→`low`).

### ③' 무토큰 401 — 이 축은 승격 21 을 판정하지 못한다

- 내 손(post): 무토큰 `GET /health` **401** · 빈 본문 `POST /synthesize` **401** · 빈 본문 `POST /` **401**(본문 = `{"rejectedReason": "X-FKT-Gateway-Token 가 없거나 맞지 않는다"}`).
- 그러나 **pre 바이트에도 같은 문이 있었다**: `main~1:gateway.py` 의 `rejectedReason` **13건** = main **13건**, 그리고 `/health` 를 인증 뒤에 두는 줄(`if self.path.rstrip("/") == "/health"`)이 **양쪽 모두** 인증 분기 «다음»에 있다.
- 🔴 즉 **기준선에서 이미 참**인 축이다. 초록이지만 「승격 21 이 401 을 만들었다」는 뜻이 아니라 **회귀가 없다**는 뜻만 갖는다. `authRequired: true` 는 **행동의 신설이 아니라 그 행동의 신고**다.

## 4. 축 ④ — 공개면(밖)

`23:32:33`~`23:32:37` 내 손:

| 대상 | 코드 | 연결 IP | 비고 |
|---|---|---|---|
| `https://factory-knowledge-twin.vercel.app/` | **200** | `216.198.79.131` | 1.17s |
| `.../api/live/status` | **200** | `216.198.79.131` | `{"online":true,"checkedAt":"2026-09-05T14:32:37Z"}` → 셸이 게이트웨이에 **도달** |

- **밖의 근거 = 연결 IP** `216.198.79.131`(Vercel edge · tailnet self 아님) · 응답 헤더 `Tailscale-*` **0건**.
- 승격 19 때의 edge IP(`64.29.17.131`)와 다르지만 **둘 다 Vercel edge** — edge 회전이며 「밖」 판정에는 영향 없다(E3).

## 5. 축 ⑤ — 못 잰 것 · 회부 · 자수

### 못 잰 것(값이 아니라 이름으로)

1. **예약 작업 폴백 갈래**(`Get-ScheduledTask` 부재 / `Disabled`) — 예약 작업이 `Ready` 였으므로 **한 줄도 돌지 않았다**. 이 승격에서 그 갈래는 **시험되지 않았다**. 초록이 아니라 **미시험**이다.
2. **`/health` pre 상태의 직접 관측** — 발주(`23:28:08`)와 promote 실행(`23:28:39`) 사이가 **31초**였고, 그 창 안의 내 유일한 프로브가 헤더를 틀렸다(§자수 1). 위 pre 값은 **대상이 남긴 로그와 리포 바이트로 복원**한 것(E2)이지 내 손의 pre 실측(E1)이 아니다.

### 회부 1건 — 공개면 build marker 가 main 과 다르다

- 공개 `/api/health` = `"build":"4d39bde"` (내 손 `23:32:58`) · main tip = `d4ebe35`.
- `4d39bde` = **`origin/main~2`** (main 과 23 커밋 차) · production 컨테이너 이미지 태그도 `fkt-deploy-ai-api:4d39bde`.
- 🔴 **승격 21 이 만든 회귀가 아니다**: 이 값은 promote **이전**(`23:28:38` 내 `docker ps`)에도 `4d39bde` 였다 — 승격 21 은 게이트웨이 산출물 축만 갱신했고 ai-api 컨테이너는 재빌드 대상이 아니었다.
- 다만 **O-18(공개 `/api/health.build` == main sha)은 지금 불만족 상태**다. 승격 21 의 결함이 아니라 **그 이전부터 열려 있던 축**으로 오케에 회부한다(판단은 내 몫이 아니다).

### 자수(내 계측기)

1. `23:28:5x` 첫 `/health` 프로브를 **`Authorization: Bearer`** 로 쳐서 401 을 받았다. 이 문의 헤더는 **`X-FKT-Gateway-Token`** 이다. 이 401 은 대상의 답이 아니라 **내 프로브의 답**이었고, 그대로 「전환 전 = 인증 걸림」으로 읽었다면 pre 상태를 틀리게 적을 뻔했다.
2. 같은 이유로 **전환 전 기준선 창을 놓쳤다**(§5 못 잰 것 2). 발주가 「지금 기준선부터」라고 했는데 내 첫 측정이 promote 착지(`23:28:39`)보다 **1초 늦었다**.
3. `~/.fkt/gw-autostart.ps1.probe-junk-senku2-5003c2a-lane-copy`(3889B)의 sha256 이 설치본과 **동일**하다 — 이 사본은 이미 리포 판이었다. 「3889B 파일이 둘」을 보고 잠시 설치본을 그 사본으로 오인할 뻔했으나, blob SHA-1 두 열(§1)이 갈라 주었다.
