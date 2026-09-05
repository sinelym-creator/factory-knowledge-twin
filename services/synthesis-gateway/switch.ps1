# 소유자 스위치 — 창 하나로 live 합성을 켜고 끈다.
#
#   pwsh -File services/synthesis-gateway/switch.ps1 on -Bind 0.0.0.0 -Token <값> -Effort low
#   pwsh -File services/synthesis-gateway/switch.ps1 off
#   pwsh -File services/synthesis-gateway/switch.ps1 status
#
# 🔴 이 스위치가 곧 「내가 ON 한 경우만 LLM」이다. 게이트웨이가 내려가면 ai-api 의
#    `/live/status.online` 이 실도달 프로브로 false 를 답하고, 화면은 녹화 재생(REPLAY)으로
#    내려간다 — 컨테이너를 재기동하지 않는다.

[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('on', 'off', 'status')]
    [string] $Action,

    [string] $Bind,
    [string] $Token,
    [string] $Model,
    [string] $Effort,
    # 🔴 사람 손 경로에도 «산출물 프롬프트»를 가리킬 길을 준다(O-40). 이것이 없어서
    #    `switch.ps1 on` 은 언제나 리포 옆 파일을 읽는 게이트웨이를 띄웠다 —
    #    promote-artifacts.ps1 이 끊으려던 바로 그 결합이 이 경로에만 남아 있었다.
    #    미지정이면 지금까지의 거동 그대로다(run.ps1 옆 파일).
    [string] $PromptFile,
    [int]    $Port      = $(if ($env:SYNTHESIS_GATEWAY_PORT) { [int]$env:SYNTHESIS_GATEWAY_PORT } else { 8787 }),
    [string] $StatusUrl = 'http://127.0.0.1:8010/api/live/status'
)

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path

function Get-ListenerPid {
    param([int] $OnPort)
    $conn = Get-NetTCPConnection -LocalPort $OnPort -State Listen -ErrorAction SilentlyContinue |
            Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
    return 0
}

function Test-Health {
    param([int] $OnPort, [string] $WithToken)
    $headers = @{}
    if ($WithToken) { $headers['X-FKT-Gateway-Token'] = $WithToken }
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:$OnPort/health" -Headers $headers `
                               -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        return [pscustomobject]@{ Reached = $true; Status = $r.StatusCode; Body = $r.Content }
    } catch {
        $code = 0
        if ($_.Exception.Response) { $code = [int]$_.Exception.Response.StatusCode }
        return [pscustomobject]@{ Reached = ($code -ne 0); Status = $code; Body = '' }
    }
}

switch ($Action) {

    'on' {
        $existing = Get-ListenerPid -OnPort $Port
        if ($existing) {
            Write-Host "이미 ON — 포트 $Port 를 pid $existing 가 듣고 있다. 새로 띄우지 않는다." -ForegroundColor Yellow
            exit 0
        }

        $runArgs = @('-File', (Join-Path $here 'run.ps1'))
        if ($Bind)  { $runArgs += @('-Bind',  $Bind) }
        if ($Token) { $runArgs += @('-Token', $Token) }
        # 🔴 ContainsKey 로 본다 — 빈 문자열은 «CLI 기본으로 돌려라»는 지시라, `if ($Model)` 로
        #    쓰면 그 지시가 통째로 사라진다(run.ps1 과 같은 규율).
        if ($PSBoundParameters.ContainsKey('Model'))  { $runArgs += @('-Model',  $Model) }
        if ($PSBoundParameters.ContainsKey('Effort')) { $runArgs += @('-Effort', $Effort) }
        if ($PromptFile) { $runArgs += @('-PromptFile', $PromptFile) }
        $runArgs += @('-Port', "$Port")

        $proc = Start-Process -FilePath 'pwsh' -ArgumentList $runArgs -PassThru -WindowStyle Minimized

        # 🔴 Start-Process 는 «띄웠다»만 말한다 — 실제로 듣고 있는지는 두드려서 확인한다.
        #    (조용히 죽는 기동을 「ON」으로 보고한 적이 있다.)
        $ok = $false
        foreach ($i in 1..20) {
            Start-Sleep -Milliseconds 500
            if ((Test-Health -OnPort $Port -WithToken $Token).Status -eq 200) { $ok = $true; break }
            if ($proc.HasExited) { break }
        }
        if ($ok) {
            Write-Host "ON — pid $($proc.Id) · http://127.0.0.1:$Port · bind $(if ($Bind) { $Bind } else { '127.0.0.1' })" -ForegroundColor Green
            exit 0
        }
        if ($proc.HasExited) {
            Write-Error "기동 실패 — 프로세스가 exit $($proc.ExitCode) 로 끝났다(비루프백 bind + 토큰 없음이면 4)."
        } else {
            Write-Error "기동은 됐는데 10s 안에 /health 가 200 을 답하지 않았다 — 창을 열어 직접 보라."
        }
        exit 5
    }

    'off' {
        $target = Get-ListenerPid -OnPort $Port
        if (-not $target) {
            Write-Host "이미 OFF — 포트 $Port 를 듣는 프로세스가 없다." -ForegroundColor Yellow
            exit 0
        }

        # 🔴 포트만 보고 죽이지 않는다. 그 자리에 남의 서비스가 앉아 있을 수 있다.
        $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId = $target" -ErrorAction SilentlyContinue).CommandLine
        if ($cmdline -notmatch 'gateway\.py') {
            Write-Error "포트 $Port 의 pid $target 는 게이트웨이가 아니다 — 내리지 않는다. 명령줄: $cmdline"
            exit 6
        }

        Stop-Process -Id $target -Force
        # 🔴 「Stop 성공」은 종료가 아니다 — 포트가 실제로 비었는지로 확인한다.
        $gone = $false
        foreach ($i in 1..10) {
            Start-Sleep -Milliseconds 300
            if (-not (Get-ListenerPid -OnPort $Port)) { $gone = $true; break }
        }
        if ($gone) {
            Write-Host "OFF — pid $target 내렸다. 포트 $Port 비었다." -ForegroundColor Green
            exit 0
        }
        Write-Error "Stop-Process 는 돌았는데 포트 $Port 가 아직 듣고 있다 — 직접 확인하라."
        exit 7
    }

    'status' {
        $listener = Get-ListenerPid -OnPort $Port
        $health   = Test-Health -OnPort $Port -WithToken $Token
        Write-Host "게이트웨이  포트 $Port · pid $(if ($listener) { $listener } else { '-' }) · /health $($health.Status) $($health.Body)"

        try {
            $live = Invoke-RestMethod -Uri $StatusUrl -TimeoutSec 5 -ErrorAction Stop
            Write-Host "배포 화면   $StatusUrl · online=$($live.online) · checkedAt=$($live.checkedAt)"
            Write-Host "→ 방문자에게는 $(if ($live.online) { 'LIVE(실제 LLM 합성)' } else { 'REPLAY(녹화 재생)' }) 로 보인다."
        } catch {
            # 🔴 「못 물어봤다」를 「off 다」로 적지 않는다 — 다른 사실이다.
            Write-Host "배포 화면   $StatusUrl · 조회 실패($($_.Exception.Message)) — 배포가 떠 있는지 먼저 보라." -ForegroundColor Yellow
        }
        exit 0
    }
}
