# FKT 합성 게이트웨이(:8787) 자동 기동 — **호스트 `~/.fkt/gw-autostart.ps1` 의 리포 판**(T7-42 §A-5).
#
# 로그온 예약 작업(FKT-Gateway-On)이 부른다. 멱등: 이미 산출물로 떠 있으면 아무것도 안 한다.
# 호스트 파일 교체는 승격 집행 항목(오케 · 허가 안) — 이 파일은 그 «정본 사본»이다.
#
# 🔴 앞판과 다른 점 하나뿐이다: 켜는 대상이 **리포의 run.ps1 이 아니라 승격 산출물의 것**이다.
#    앞판은 `$repo/services/synthesis-gateway/run.ps1` 을 띄웠고, 그 결과 production 이
#    메인 체크아웃을 읽었다(09-05 19:58 · develop ff 로 프롬프트가 재기동 없이 바뀜).
# 🔴 토큰은 파일에 박지 않는다 — 배포 컨테이너 env 에서 런타임에 읽고 출력하지 않는다(앞판과 같다).
# 🔴 절대경로 0 — 호스트 경로는 `$HOME` 기준이다.

$ErrorActionPreference = 'Continue'
$artifacts = Join-Path $HOME '.fkt/prod/gateway'
$log       = Join-Path $HOME '.fkt/gw-autostart.log'
$gwlog     = Join-Path $HOME '.fkt-gateway.log'
function L($m) { Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) }
L "start (artifacts=$artifacts)"

# 0) 산출물이 없으면 켤 것이 없다 — 리포로 «대신» 켜지 않는다. 그것이 끊으려던 결합이다.
if (-not (Test-Path -LiteralPath (Join-Path $artifacts 'run.ps1'))) {
    L "ABORT artifacts missing — promote-artifacts.ps1 -Sha <sha> 를 먼저 돌려라"
    exit 2
}

# 1) 배포 컨테이너가 뜰 때까지 대기(Docker Desktop 기동 포함 · 최대 15분)
$cid = $null
for ($i = 0; $i -lt 90; $i++) {
    try { $cid = (docker ps -q --filter publish=8010 2>$null | Select-Object -First 1) } catch { $cid = $null }
    if ($cid) { break }
    Start-Sleep -Seconds 10
}
if (-not $cid) { L "ABORT deploy container :8010 not found after 15min"; exit 2 }
$envs = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $cid
$tok = ($envs | Where-Object { $_ -like 'FKT_SYNTHESIS_GATEWAY_TOKEN=*' } | Select-Object -First 1) -replace '^FKT_SYNTHESIS_GATEWAY_TOKEN=',''
if (-not $tok) { L "ABORT token env missing"; exit 2 }

# 2) 이미 살아 있으면 — «무엇으로» 살아 있는지까지 본다.
#    🔴 「200 이면 끝」으로 두면, 리포에 묶인 옛 게이트웨이가 떠 있는 한 자동 기동은 그것을
#       영원히 축복한다. 그렇다고 여기서 죽이지도 않는다 — production 을 내리는 것은
#       자동 기동의 권한이 아니다(승격 창 안에서 사람이 한다). 신호만 남기고 종료코드를 가른다.
$h = curl.exe -s -m 5 -H "X-FKT-Gateway-Token: $tok" http://127.0.0.1:8787/health
if ($h -match '"ok"\s*:\s*true') {
    $wanted = ($artifacts -replace '\\', '/')
    $seen   = ''
    if ($h -match '"promptPath"\s*:\s*"([^"]*)"') { $seen = ($Matches[1] -replace '\\\\', '/') -replace '\\', '/' }
    if ($seen -and $seen.StartsWith($wanted)) { L "already up on artifacts: $seen"; exit 0 }
    L "WARN 게이트웨이가 산출물이 아닌 프롬프트로 떠 있다: '$seen' — 사람이 승격 창에서 교체하라"
    exit 3
}

# 3) 기동 — 산출물의 run.ps1 · 프롬프트도 같은 디렉터리
$p = Start-Process -FilePath 'pwsh' -ArgumentList @(
        '-NoProfile', '-File', (Join-Path $artifacts 'run.ps1'),
        '-Bind', '0.0.0.0', '-Token', $tok, '-Model', 'opus', '-Effort', 'medium',
        '-PromptFile', (Join-Path $artifacts 'system_prompt.txt')
     ) -WorkingDirectory $artifacts -RedirectStandardOutput $gwlog -RedirectStandardError "$gwlog.err" -PassThru -WindowStyle Hidden
L "spawned gateway pid=$($p.Id)"
Start-Sleep -Seconds 8
$h = curl.exe -s -m 5 -H "X-FKT-Gateway-Token: $tok" http://127.0.0.1:8787/health
L "health=$h"
if ($h -match '"ok"\s*:\s*true') { exit 0 } else { exit 1 }
