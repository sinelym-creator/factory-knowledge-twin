# develop 배포 스택 — 고정 이름·고정 포트(T7-42 §B). `CLAUDE.md §5` ②의 정본 무대.
#
#   pwsh -File infra/develop-stage.ps1 up        # 없으면 세운다(멱등 · 같은 sha 면 재빌드 생략)
#   pwsh -File infra/develop-stage.ps1 status    # 지금 무엇이 어느 sha 로 도는가
#   pwsh -File infra/develop-stage.ps1 refresh   # origin/develop 최신으로 끌어올리고 다시 세운다
#   pwsh -File infra/develop-stage.ps1 down      # 내린다
#
# 🔴 **왜 이름과 포트를 박는가.** 좌석 워크트리 임시 무대(`:8090`·`:8091`…)는 매번 다른 포트에
#    서고 대(代)가 바뀌면 사라진다. 승격 청구의 근거가 그런 무대에서 나오면 「어디서 잰 값인가」가
#    청구문마다 달라진다. 이 스택은 **이름으로 부를 수 있는** 하나의 무대다.
# 🔴 **production 이 아니다.** 재시작 정책을 주지 않는다(`unless-stopped` 아님) — 재부팅에
#    자동 복귀하는 것은 production 뿐이고, develop 이 조용히 살아 돌아오면 「지금 도는 것이
#    무엇인가」가 다시 흐려진다.

[CmdletBinding()]
param(
    [Parameter(Mandatory, Position = 0)]
    [ValidateSet('up', 'down', 'status', 'refresh')]
    [string] $Action,

    # 🔴 박은 값은 **여기 한 곳**뿐이다. 아래 본문에는 포트·이름 리터럴이 없다.
    [string] $Worktree     = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) '_wt/develop-stage'),
    [int]    $ApiPort      = 8020,
    [int]    $GatewayPort  = 8797,
    [string] $Container    = 'fkt-dev-ai-api',
    [string] $ImageRepo    = 'fkt-ai-api',
    # 검증 스택의 데이터 — `:8090`·`:8091` 이 보는 것과 같은 DB(읽기 공유).
    [int]    $PostgresPort = 5534,
    [int]    $Neo4jBolt    = 7587
)

$ErrorActionPreference = 'Stop'
$repo = (git -C (Split-Path -Parent $PSScriptRoot) rev-parse --show-toplevel)

# 🔴 production 3면과 «절대로» 겹치지 않는다. 인자로 덮어쓸 수 있는 값이라, 덮어쓴 값이
#    production 을 가리키면 여기서 멈춘다 — 「검증하려다 production 을 만졌다」의 유일한 예방은
#    실행 전 거부다.
$PROD = @{ ApiPort = 8010; GatewayPort = 8787; Container = 'fkt-deploy-ai-api' }
if ($ApiPort -eq $PROD.ApiPort -or $GatewayPort -eq $PROD.GatewayPort -or $Container -eq $PROD.Container) {
    Write-Error "거부 — production 좌표를 가리킨다(:$($PROD.ApiPort)·:$($PROD.GatewayPort)·$($PROD.Container)). develop 무대는 production 이 아니다."
    exit 4
}

$promptFile = Join-Path $Worktree 'services/synthesis-gateway/system_prompt.txt'
$runPs1     = Join-Path $Worktree 'services/synthesis-gateway/run.ps1'

function Get-ListenerPid {
    param([int] $OnPort)
    $c = Get-NetTCPConnection -LocalPort $OnPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess }
    return 0
}

function Get-WorktreeSha {
    if (-not (Test-Path -LiteralPath $Worktree)) { return '' }
    return (git -C $Worktree rev-parse --short HEAD 2>$null)
}

function Get-OriginTip {
    # 게이트 2 의 전제 실측용 — 두 refresh 사이에 이 값이 움직였는지 검증이 볼 수 있어야 한다.
    return (git -C $repo rev-parse --short origin/develop 2>$null)
}

function Invoke-Http {
    param([string] $Url)
    try { return (curl.exe -s -m 5 $Url) } catch { return '' }
}

function Ensure-Worktree {
    if (-not (Test-Path -LiteralPath (Join-Path $Worktree '.git'))) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Worktree) | Out-Null
        git -C $repo worktree add --detach $Worktree origin/develop
        if ($LASTEXITCODE -ne 0) { Write-Error '워크트리 생성 실패'; exit 3 }
    }
}

function Sync-Worktree {
    git -C $repo fetch origin --quiet
    git -C $Worktree checkout --detach origin/develop --quiet
    if ($LASTEXITCODE -ne 0) { Write-Error '워크트리 갱신 실패'; exit 3 }
}

function Start-DevGateway {
    $existing = Get-ListenerPid -OnPort $GatewayPort
    if ($existing -ne 0) {
        # 이미 우리 것이 떠 있으면 그대로 둔다(멱등). 남의 것이면 죽이지 않고 이름으로 말한다.
        # 🔴 JSON 본문의 경로는 역슬래시가 **이스케이프**돼 있다(`C:\\Users\\…`). 두 표기를
        #    그대로 맞대면 우리 무대를 「남의 것」으로 읽고, 그 틀린 문면이 운영자를 움직인다
        #    (실측 20:56 — 멱등 2회차가 우리 게이트웨이를 남의 것이라고 경고했다).
        #    양쪽을 슬래시 한 표기로 눕혀서 본다.
        $body   = Invoke-Http "http://127.0.0.1:$GatewayPort/health"
        $needle = ($Worktree -replace '\\', '/')
        $seen   = (($body -replace '\\\\', '/') -replace '\\', '/')
        if ($seen -like "*$needle*") { return $existing }
        if ($body -match '"ok"\s*:\s*true') {
            Write-Warning ":$GatewayPort 에 다른 프롬프트의 게이트웨이가 떠 있다(pid $existing) — 손대지 않는다. down 으로 내리고 다시 up 하라."
            return $existing
        }
        Write-Warning ":$GatewayPort 를 pid $existing 가 점유 중이다 — 게이트웨이가 아니다. 손대지 않는다."
        return $existing
    }
    $p = Start-Process -FilePath 'pwsh' -ArgumentList @(
            '-NoProfile', '-File', $runPs1, '-Port', "$GatewayPort", '-PromptFile', $promptFile
         ) -WorkingDirectory (Split-Path -Parent $runPs1) -PassThru -WindowStyle Hidden
    Start-Sleep -Seconds 3
    return $p.Id
}

function Stop-DevGateway {
    $listener = Get-ListenerPid -OnPort $GatewayPort
    if ($listener -eq 0) { return }
    # 🔴 **내 것인지 확인하고 죽인다.** 포트만 보고 죽이면 남의 무대를 내린다 —
    #    막는 것은 대상 하나로 좁힌다.
    $cmdline = (Get-CimInstance Win32_Process -Filter "ProcessId=$listener" -ErrorAction SilentlyContinue).CommandLine
    if ($cmdline -and ($cmdline -replace '\\', '/') -like "*$(($Worktree -replace '\\','/'))*") {
        Stop-Process -Id $listener -Force
        Write-Host "게이트웨이 내림 pid=$listener"
    } else {
        Write-Warning ":$GatewayPort pid $listener 는 이 무대의 것이 아니다 — 내리지 않는다."
    }
}

function Ensure-Container {
    param([string] $Sha)
    $tag  = "${ImageRepo}:dev-$Sha"
    $have = (docker images -q $tag 2>$null)
    if (-not $have) {
        Write-Host "이미지 빌드 $tag …"
        docker build -t $tag (Join-Path $Worktree 'services/ai-api')
        if ($LASTEXITCODE -ne 0) { Write-Error '이미지 빌드 실패'; exit 3 }
    } else {
        Write-Host "이미지 재사용 $tag (같은 sha — 재빌드 생략)"
    }

    $running = (docker ps -q --filter "name=^$Container$" 2>$null)
    $runningImage = if ($running) { (docker inspect $Container --format '{{.Config.Image}}' 2>$null) } else { '' }
    if ($running -and $runningImage -eq $tag) {
        Write-Host "컨테이너 그대로 $Container ($tag)"
        return
    }
    docker rm -f $Container 2>$null | Out-Null
    # 🔴 재시작 정책 없음 · 컨테이너에서 호스트로 나가는 주소는 `host.docker.internal`.
    docker run -d --name $Container `
        -p "${ApiPort}:8000" `
        -e "FKT_POSTGRES_DSN=postgresql://fkt:fkt_local_dev@host.docker.internal:$PostgresPort/fkt" `
        -e "FKT_NEO4J_URI=bolt://host.docker.internal:$Neo4jBolt" `
        -e 'FKT_NEO4J_USER=neo4j' `
        -e 'FKT_NEO4J_PASSWORD=fkt_local_dev' `
        -e "FKT_LOCAL_SYNTHESIS_GATEWAY=http://host.docker.internal:$GatewayPort" `
        -e "FKT_BUILD_SHA=$Sha" `
        $tag | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Error '컨테이너 기동 실패'; exit 3 }
    Write-Host "컨테이너 기동 $Container ($tag) → :$ApiPort"
}

function Show-Status {
    $sha  = Get-WorktreeSha
    $tip  = Get-OriginTip
    $api  = Invoke-Http "http://127.0.0.1:$ApiPort/api/health"
    $gw   = Invoke-Http "http://127.0.0.1:$GatewayPort/health"
    $build = if ($api -match '"build"\s*:\s*"([^"]*)"') { $Matches[1] } else { '(못 읽음)' }
    $psha  = if ($gw  -match '"promptSha256"\s*:\s*"([^"]*)"') { $Matches[1] } else { '(못 읽음)' }
    $ppath = if ($gw  -match '"promptPath"\s*:\s*"([^"]*)"') { $Matches[1] } else { '(못 읽음)' }
    [pscustomobject]@{
        worktreeSha   = if ($sha) { $sha } else { '(없음)' }
        originDevTip  = if ($tip) { $tip } else { '(못 읽음)' }
        inSync        = ($sha -and $tip -and $sha -eq $tip)
        apiPort       = $ApiPort
        apiBuild      = $build
        apiPid        = Get-ListenerPid -OnPort $ApiPort
        gatewayPort   = $GatewayPort
        promptSha256  = $psha
        promptPath    = $ppath
        gatewayPid    = Get-ListenerPid -OnPort $GatewayPort
        container     = (docker ps --filter "name=^$Container$" --format '{{.Names}} {{.Image}} {{.Status}}' 2>$null)
    } | Format-List
}

switch ($Action) {
    'status' { Show-Status; exit 0 }
    'down' {
        Stop-DevGateway
        docker rm -f $Container 2>$null | Out-Null
        Write-Host "내렸다 — 워크트리 $Worktree 는 남긴다(다음 up 이 재사용한다)."
        exit 0
    }
    'up' {
        Ensure-Worktree
        $sha = Get-WorktreeSha
        Ensure-Container -Sha $sha
        $gwPid = Start-DevGateway
        Write-Host "게이트웨이 pid=$gwPid · 프롬프트 $promptFile"
        Show-Status
        exit 0
    }
    'refresh' {
        Ensure-Worktree
        Sync-Worktree
        $sha = Get-WorktreeSha
        Stop-DevGateway
        Ensure-Container -Sha $sha
        $gwPid = Start-DevGateway
        Write-Host "게이트웨이 pid=$gwPid · 프롬프트 $promptFile"
        Show-Status
        exit 0
    }
}
