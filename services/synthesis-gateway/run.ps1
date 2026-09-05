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
    [string] $Effort,
    # 🔴 시스템 프롬프트를 «다른 곳»에서 읽게 한다(T7-42 A-1). production 은 승격 산출물
    #    디렉터리를 가리키고, 미지정이면 이 스크립트 옆 파일 = 지금까지의 거동 그대로다.
    [string] $PromptFile
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
if ($PromptFile) {
    # 🔴 **여기서 존재를 확인한다.** gateway.py 도 없으면 exit 2 로 거부하지만, 그때는 이미
    #    「띄웠는데 안 뜬다」다. 오타 난 경로를 준 사람에게 그 자리에서 말하는 편이 낫다.
    if (-not (Test-Path -LiteralPath $PromptFile)) {
        Write-Error "프롬프트 파일이 없다: $PromptFile"
        exit 5
    }
    $env:SYNTHESIS_GATEWAY_PROMPT_FILE = (Resolve-Path -LiteralPath $PromptFile).Path
}
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

# 🔴 `-u` = 버퍼 끄기. 출력이 파일로 «리다이렉트»되면 python 의 stdout 은 블록 버퍼가 되어,
#    기동 줄(주소·모델·**프롬프트 경로와 sha**)이 버퍼가 찰 때까지 파일에 안 나타난다.
#    실측(20:51 · #769 로그 첫 기동): `gateway.log` 90바이트에 run.ps1 의 안내만 있고 gateway.py
#    의 기동 줄은 0. 로그를 남기게 만들어 놓고 정작 필요한 줄이 안 남는 자리였다.
#    (stderr 는 원래 버퍼가 없어 접근 로그는 `.err` 로 이미 나왔다 — 그래서 «절반만» 비어 보였다.)
python -u (Join-Path $here 'gateway.py')
