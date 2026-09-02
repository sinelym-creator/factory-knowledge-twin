# synthesis-gateway 실행 — 운영자 PC 호스트 프로세스.
#
#   pwsh -File services/synthesis-gateway/run.ps1                       # 루프백 전용(기본)
#   pwsh -File services/synthesis-gateway/run.ps1 -Bind 0.0.0.0 -Token <값>   # 배포 컨테이너에서 닿게
#
# 실측·녹화·시연 때만 켜고 끝나면 Ctrl+C 로 내린다(상시 가동 0). 컨테이너에 넣지 않는다.
# 켜고 끄기를 창 하나로 하려면 `switch.ps1 on|off|status` 를 쓴다.

[CmdletBinding()]
param(
    [string] $Bind,
    [string] $Token,
    [int]    $Port,
    [int]    $TimeoutMs,
    [string] $CliBin,
    [string] $Model,
    [string] $Effort
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# 인자가 있으면 인자가 이긴다. 없으면 이미 준 env, 그것도 없으면 기본값.
if ($Bind)      { $env:SYNTHESIS_GATEWAY_BIND  = $Bind }
if ($Token)     { $env:SYNTHESIS_GATEWAY_TOKEN = $Token }
if ($Port)      { $env:SYNTHESIS_GATEWAY_PORT  = "$Port" }
# 🔴 게이트웨이 상한은 «게이트웨이 이름»으로 준다. 구 이름(SYNTHESIS_TIMEOUT_MS)은
#    이제 ai-api 클라이언트 예산의 것이라, 여기에 그 이름을 쓰면 -TimeoutMs 가
#    조용히 무시된다(값은 기본 60000 인데 운영자는 자기 값이 걸린 줄 안다).
if ($TimeoutMs) { $env:SYNTHESIS_GATEWAY_TIMEOUT_MS = "$TimeoutMs" }
if ($CliBin)    { $env:SYNTHESIS_CLI_BIN       = $CliBin }
if ($PSBoundParameters.ContainsKey('Model'))  { $env:SYNTHESIS_MODEL  = $Model }
# 🔴 ContainsKey 로 본다 — 빈 문자열은 «CLI 기본으로 돌려라»는 뜻이라
#    `if ($Model)` 로 쓰면 그 지시가 통째로 사라진다.
if ($PSBoundParameters.ContainsKey('Effort')) { $env:SYNTHESIS_EFFORT = $Effort }

if (-not $env:SYNTHESIS_GATEWAY_BIND) { $env:SYNTHESIS_GATEWAY_BIND = '127.0.0.1' }
if (-not $env:SYNTHESIS_GATEWAY_PORT) { $env:SYNTHESIS_GATEWAY_PORT = '8787' }
if (-not $env:SYNTHESIS_GATEWAY_TIMEOUT_MS) { $env:SYNTHESIS_GATEWAY_TIMEOUT_MS = '60000' }
if (-not $env:SYNTHESIS_CLI_BIN)      { $env:SYNTHESIS_CLI_BIN      = 'claude' }

# CLI 가 없으면 여기서 «소리 내어» 멈춘다 — 뜬 뒤에 매 요청마다 실패하는 것보다 낫다.
if (-not (Get-Command $env:SYNTHESIS_CLI_BIN -ErrorAction SilentlyContinue)) {
    Write-Error "Claude Code CLI 를 찾지 못했다: $($env:SYNTHESIS_CLI_BIN) — 로그인된 호스트에서 실행하라"
    exit 3
}

# 🔴 비루프백 bind + 토큰 없음 = gateway.py 가 기동을 거부한다(exit 4). 여기서 먼저 말해 둔다.
Write-Host "ai-api 쪽에는 이렇게 준다:" -ForegroundColor DarkGray
Write-Host "  `$env:FKT_LOCAL_SYNTHESIS_GATEWAY = 'http://127.0.0.1:$($env:SYNTHESIS_GATEWAY_PORT)'" -ForegroundColor DarkGray
if ($env:SYNTHESIS_GATEWAY_TOKEN) {
    Write-Host "  `$env:FKT_SYNTHESIS_GATEWAY_TOKEN = '<같은 값>'   # 커밋 0 · 로그 0" -ForegroundColor DarkGray
}

python (Join-Path $here 'gateway.py')
