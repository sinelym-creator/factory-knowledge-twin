# synthesis-gateway 실행 — 운영자 PC 호스트 프로세스.
#
#   pwsh -File services/synthesis-gateway/run.ps1
#
# 실측·녹화 때만 켜고 끝나면 Ctrl+C 로 내린다(상시 가동 0). 컨테이너에 넣지 않는다.

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path

# 값은 여기서 «기본만» 세운다 — 이미 준 env 는 덮지 않는다.
if (-not $env:SYNTHESIS_GATEWAY_PORT) { $env:SYNTHESIS_GATEWAY_PORT = '8787' }
if (-not $env:SYNTHESIS_TIMEOUT_MS)   { $env:SYNTHESIS_TIMEOUT_MS   = '60000' }
if (-not $env:SYNTHESIS_CLI_BIN)      { $env:SYNTHESIS_CLI_BIN      = 'claude' }

# CLI 가 없으면 여기서 «소리 내어» 멈춘다 — 뜬 뒤에 매 요청마다 실패하는 것보다 낫다.
if (-not (Get-Command $env:SYNTHESIS_CLI_BIN -ErrorAction SilentlyContinue)) {
    Write-Error "Claude Code CLI 를 찾지 못했다: $($env:SYNTHESIS_CLI_BIN) — 로그인된 호스트에서 실행하라"
    exit 3
}

Write-Host "ai-api 쪽에는 이렇게 준다:" -ForegroundColor DarkGray
Write-Host "  `$env:FKT_LOCAL_SYNTHESIS_GATEWAY = 'http://127.0.0.1:$($env:SYNTHESIS_GATEWAY_PORT)'" -ForegroundColor DarkGray

python (Join-Path $here 'gateway.py')
