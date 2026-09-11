# LATCH-PREP — develop 무대 실패 주입 손잡이 (센쿠2 56대 · 2026-09-11)

> 🔴 **이 문서는 손잡이를 «당기지 않은» 상태로 쓴다.** 아래 명령은 리바이2(또는 센쿠2)가
>    착수 신호 뒤에 그대로 붙여 넣는 문자열이다. 지금 무대는 **원상태**다.
> 🔴 production `:8010`·`:8787`·`gw-autostart.ps1`·예약 작업 **무접촉**. 아래 어떤 명령도
>    production 을 건드리지 않는다(포트·컨테이너 이름이 전부 develop 축).

🔴 **경로 표기**: `$env:USERPROFILE` = 사용자 홈 · `<repo>` = 메인 체크아웃 · `<_wt>` = 리포 형제 `_wt`.
   ci hygiene 이 개인 절대경로를 막는다 — 붙여 넣을 때 각자 환경 값으로 푼다.

## 0. 손잡이 3종과 «실물» 확인

| 손잡이 | 실물 | 읽는 자리 | 드릴에서의 뜻 |
|---|---|---|---|
| `SYNTHESIS_CLI_BIN` | 게이트웨이 프로세스 env | `gateway.py:176` | CLI 호출을 **반드시 실패**시킨다(구독 소모 0) |
| `FKT_SYNTH_FAIL_LATCH_SEC` | 게이트웨이 프로세스 env | `gateway.py:85`(`SYNTH_FAIL_LATCH_SEC`) | 걸쇠 만료 축(기본 900 → **120**) |
| `FKT_RUN_CAP_GLOBAL_PER_HOUR` | ai-api 컨테이너 env | `settings.py:97` | **1** 로 두면 2발째가 `live_hourly_cap_exceeded` |

## 1. 🔴 발주 문면 그대로는 «안 뜬다» — 스텁으로 간다 (실측)

`run.ps1:54~58` 이 기동 «전»에 `Get-Command $env:SYNTHESIS_CLI_BIN` 로 CLI 실재를 검사하고,
없으면 **`exit 3` 으로 기동 자체를 거부**한다. 즉 「존재하지 않는 값」을 주면 게이트웨이가
**뜨지 않아** 드릴의 「실패→걸림」이 아니라 「무대 없음」이 된다.

**대신 = «있는데 반드시 실패하는» CLI 스텁.** 이미 만들어 두었다(무대 밖 고정 경로 · 워크트리 밖):

```
$env:USERPROFILE\.fkt\dev\drill\claude-fail.cmd
```

내용(ASCII 전용 · CRLF):
```
@echo off
REM latch drill stub - always fails, never calls the real CLI (0 subscription use)
echo [stub] synthesis CLI forced failure 1>&2
exit /b 1
```

🔴 **ASCII 전용인 이유 = 실측이다.** 한글 주석을 넣은 1차 판은 `cmd.exe` 가 cp949 로 읽어
`'...'은(는) 내부 또는 외부 명령이 아닙니다` 를 뱉었다(rc 는 1 이지만 스텁이 «자기 말»을 못 했다).
지금 판은 `Popen([...cmd])` 로 직접 재서 **rc=1 · stderr `[stub] synthesis CLI forced failure`** 확인.

확인 2건(둘 다 실측):
- `Get-Command claude-fail` → 해석됨(= `run.ps1` 의 exit 3 가드를 **통과**한다)
- `subprocess.Popen` → **rc 1**(= `gateway.py` 의 「종료코드 != 0」 실패 갈래에 든다)

## 2. 게이트웨이(`:8797`) 손잡이 적용 — 절차 A(권장 · `run.ps1` 직접)

`develop-stage.ps1` 은 `run.ps1` 을 `-Port`·`-PromptFile` 만으로 부른다(`infra/develop-stage.ps1:176`).
`-CliBin` 을 넘기지 않으므로 **env 로 준다**. `Start-Process` 는 부모 env 를 물려주므로 「부모 pwsh 에
env 를 심고 → 스크립트를 부른다」가 성립하지만, 아래 A 는 그 간접을 빼고 바로 부른다.

**적용**(pwsh 창 1개 · 무대 워크트리 기준):
```
pwsh -NoProfile -Command "
  \$gw = (Get-NetTCPConnection -LocalPort 8797 -State Listen -EA SilentlyContinue).OwningProcess;
  if (\$gw) { Stop-Process -Id \$gw -Force };
  \$env:SYNTHESIS_CLI_BIN='$env:USERPROFILE\.fkt\dev\drill\claude-fail.cmd';
  \$env:FKT_SYNTH_FAIL_LATCH_SEC='120';
  Start-Process -FilePath 'pwsh' -ArgumentList @('-NoProfile','-File',
    '<_wt>\develop-stage\services\synthesis-gateway\run.ps1',
    '-Port','8797','-PromptFile',
    '<_wt>\develop-stage\services\synthesis-gateway\system_prompt.txt')
    -WorkingDirectory '<_wt>\develop-stage\services\synthesis-gateway'
    -RedirectStandardOutput \$env:USERPROFILE'\.fkt\dev\gateway.drill.log'
    -RedirectStandardError  \$env:USERPROFILE'\.fkt\dev\gateway.drill.err'
    -WindowStyle Hidden"
```
**적용 확인**(밖에서):
```
curl -s http://127.0.0.1:8797/health
```
→ `ok:true` 이면 떴다. 🔴 `/health` 는 `SYNTHESIS_CLI_BIN`·`FKT_SYNTH_FAIL_LATCH_SEC` 를
**싣지 않는다** — 「걸쇠가 120초로 짧아졌는가」는 `/health` 로 못 본다. 확인은 **드릴 자체**로
한다(실패 1발 → `synth.latchedUntil` 이 now+~120s · 900s 가 아니다).

**원복**(드릴 끝나면 반드시):
```
pwsh -NoProfile -Command "
  \$gw=(Get-NetTCPConnection -LocalPort 8797 -State Listen -EA SilentlyContinue).OwningProcess;
  if (\$gw) { Stop-Process -Id \$gw -Force }"
pwsh -NoProfile -File <repo>\infra\develop-stage.ps1 refresh -Worktree <_wt>\develop-stage > $env:TEMP\stage-restore.log 2>&1
```
🔴 `refresh` 는 **깨끗한 env** 로 게이트웨이를 다시 띄운다(스텁·120 이 사라진다). 스크립트 출력은
파일로 받는다 — 파이프로 받으면 자식이 stdout 을 물어 끝나지 않는다.
**원복 검증**: `curl -s http://127.0.0.1:8797/health` → `synth` 4칸이 `null/null/0/null`(걸쇠 해제 ·
기동 직후 상태) · `promptSha256 3560668716ab` · 무대 sha 정합은 `develop-stage.ps1 status`.

## 3. ai-api(`:8020`) 손잡이 — 전역 상한 1

무대 스크립트의 `docker run` 에는 이 키가 **없다**(`infra/develop-stage.ps1:281~291`). 그래서
드릴 동안만 **같은 형상 + 키 1개**로 재생성한다. 아래는 현 컨테이너 `inspect` 실물에서 뜬 값이다
(`f6c9fe4` 시점 · 이미지 태그는 그때 값으로 바꿔 쓴다).

**적용**:
```
docker rm -f fkt-dev-ai-api
docker run -d --name fkt-dev-ai-api -p 8020:8000 ^
  -e "FKT_POSTGRES_DSN=postgresql://fkt:fkt_local_dev@host.docker.internal:5534/fkt" ^
  -e "FKT_NEO4J_URI=bolt://host.docker.internal:7587" ^
  -e "FKT_NEO4J_USER=neo4j" -e "FKT_NEO4J_PASSWORD=fkt_local_dev" ^
  -e "FKT_LOCAL_SYNTHESIS_GATEWAY=http://host.docker.internal:8797" ^
  -e "FKT_BUILD_SHA=<무대 sha>" -e "FKT_REPLAY_FIXTURE_DIR=/srv/data/replay" ^
  -e "FKT_CORS_ORIGINS=http://localhost:3100,http://127.0.0.1:3100,http://localhost:3000,http://127.0.0.1:3000" ^
  -e "FKT_RUN_CAP_GLOBAL_PER_HOUR=1" ^
  -v "$env:USERPROFILE\.fkt\dev\data\replay:/srv/data/replay:ro" ^
  fkt-ai-api:dev-<무대 sha>
```
형상 불변식(현 컨테이너 실측과 같아야 한다): 포트 `8020->8000` · 네트워크 **bridge** ·
재시작 정책 **no**(develop 은 자동 복귀 안 함) · cmd `uvicorn … --no-proxy-headers` ·
바인드 1본(replay **ro**).

**적용 확인**(계수 0 읽기 경로 · 구독 소모 0):
```
curl -s "http://127.0.0.1:8020/api/live/status?sessionId=latch-drill-probe"
```
→ `hourlyCap.limit` 이 **1** 이면 먹었다. (`runCap.limit` 은 3 그대로.)

**원복**:
```
pwsh -NoProfile -File <repo>\infra\develop-stage.ps1 refresh -Worktree <_wt>\develop-stage > $env:TEMP\stage-restore.log 2>&1
```
→ 스크립트가 정본 형상으로 다시 만든다. **원복 검증** = 위 같은 URL 로 `hourlyCap.limit` **3** ·
`/api/health.build` 가 무대 sha · `docker inspect fkt-dev-ai-api` env 에 `FKT_RUN_CAP_GLOBAL_PER_HOUR` **없음**.

## 4. 드릴 순서(손잡이 관점에서만 · 판정은 검증 좌석)

1. §3 적용(전역 1) → §2 적용(스텁 + 120) — **게이트웨이를 나중에** 올린다(ai-api 재생성이
   게이트웨이를 건드리지 않지만, 순서를 고정해 두면 「어느 쪽이 안 먹었나」를 가르기 쉽다).
2. 합성 1발 → 실패 → `/health.synth` 에 `lastOutcome:"failed"` · `latchedUntil` = now+~120s.
3. 복구 = 스텁을 진짜 CLI 로 되돌려 재기동(§2 원복) → 성공 1발 → 걸쇠 **즉시 해제**.
4. 만료 축을 보려면 §2 를 유지한 채 120초를 기다린다(900 이면 못 기다린다 — 그래서 단축).
5. 2발째 거절 문장은 §3 의 `=1` 이 만든다.

## 5. 🔴 안 잰 것 / 못 박아 둘 것

- **§2·§3 을 실제로 «당기지 않았다»** — 이 문서의 확인 실측은 (a) 스텁의 `Get-Command` 해석
  (b) 스텁의 `Popen` rc=1 (c) 현 컨테이너·스크립트 문자열 실물 셋뿐이다. 걸쇠가 실제로 120초로
  걸리는지는 **드릴이 처음 재는 값**이다.
- `/health` 는 두 게이트웨이 env 를 싣지 않는다 → 「적용됐는가」를 `/health` 로 판정하지 마라.
  적용 판정은 **거동**(latchedUntil 간격)으로만 선다.
- `develop-stage.ps1 refresh` 는 게이트웨이가 **이미 같은 프롬프트로 떠 있으면 재기동하지 않는다**
  (`:160~169`). 그래서 원복은 「죽이고 → refresh」 순서다. 죽이지 않고 refresh 만 하면 스텁이 산다.
- 무대 DB(`:5534`·`:7587`)는 팀 공용이다 — 드릴은 DB 를 건드리지 않는다(상한·CLI 축만).
