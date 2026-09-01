#Requires -Version 7
<#
    컨테이너 예산 경보선 — 이 노트북에 스택이 몇 «벌» 살아 있는가 (T4-3 ⓔ)

    🔴 이 계기는 **경보만** 낸다. stop·rm·update 를 하지 않는다 — 회수 «지시»는 리더 소관이다.

    ── 무엇을 「1벌」로 세는가 ────────────────────────────────────────────────
    벌 = **DB(postgres·neo4j)가 붙어 있는 network 하나**.
    ai-api 는 그 망의 «구성원»이지 그 자체로 벌을 만들지 않는다.
    DB 가 없는 망에 혼자 있는 ai-api 는 **고아**이고, 고아는 그 자체로 경보다
    (붙을 데이터가 없는 서버는 초록으로 떠도 아무 것도 답하지 못한다).

    ── 🔴 compose 라벨로 세지 않는 이유 (실측 근거) ──────────────────────────
    `com.docker.compose.project` 라벨은 **이미지에 구워진다**. `docker run` 으로 띄우면
    컨테이너가 그 이미지 라벨을 그대로 물려받는다 — 즉 라벨은 「이 컨테이너가 어느 스택에
    사는가」가 아니라 **「이 이미지가 어디서 빌드됐는가」**를 말한다.

      실측(2026-09-01):
        fkt-…-t43-ai-api   라벨 fkt-senku2-q3    ↔ 실제 network fkt-senku2-t15_default
        fkt-…-t35-seeded   라벨 fkt-levi2-t41    ↔ 실제 network fkt-levi2_default
        이미지 라벨 자체가 각각 fkt-senku2-q3 · fkt-levi2-t41 이었다(= 물려받은 것)
      그래서 라벨로 세면 «4벌» 이 나와 상한 3을 넘고 **거짓 경보**가 된다. 실제는 2벌이다.

    이 스크립트는 `NetworkSettings.Networks` 실물만 본다.

    ── 사용 ─────────────────────────────────────────────────────────────────
      pwsh -File infra/container-budget-watch.ps1
      pwsh -File infra/container-budget-watch.ps1 -Quiet          # 임계 이내면 침묵
      pwsh -File infra/container-budget-watch.ps1 -FromJson snap.json   # 자기 계측용

    ── 종료 코드 ────────────────────────────────────────────────────────────
      0 정상 / 1 주의 / 2 경보 / 🔴 3 **측정 불가**
      3 이 따로 있는 이유: docker 가 안 답하는 것을 「0본 = 깨끗」으로 읽으면
      계측기가 죽을수록 초록이 잘 나온다.
#>
[CmdletBinding()]
param(
    [switch] $Quiet,
    # 자기 계측용 — 실 docker 대신 스냅샷 JSON 을 읽는다(수집과 판정을 분리한다).
    # 형식: [{ "Name": "...", "State": "running", "Image": "...", "Networks": ["..."] }, ...]
    [string] $FromJson,
    [string] $Prefix        = 'fkt-',
    [int]    $LimitExist    = 9,
    [int]    $LimitRunning  = 6,
    [int]    $LimitBees     = 3,
    [int]    $NoticeRunning = 3
)

$ErrorActionPreference = 'Stop'
$now = Get-Date

# DB 판별 — 이미지가 정본이고, 이름은 보조다.
# 🔴 못 알아본 DB 가 있으면 그 망은 벌로 안 세지고 거기 붙은 ai-api 가 «고아»로 울린다.
#    시끄러운 쪽으로 틀리게 만든 것이다 — 조용히 빠지는 것보다 낫다.
$DB_IMAGE = 'postgres|pgvector|neo4j'
$DB_NAME  = '-(postgres|neo4j)(-\d+)?$'

function Test-IsDb {
    param($C)
    return ($C.Image -match $DB_IMAGE) -or ($C.Name -match $DB_NAME)
}

# ── 수집 ────────────────────────────────────────────────────────────────────
function Get-LiveSnapshot {
    # 🔴 선결: docker 가 실제로 답하는가. 안 답하면 «0본»이 아니라 «판정 불가»다.
    $probe = & docker version --format '{{.Server.Version}}' 2>&1
    $probeRc = $LASTEXITCODE
    $ok = ($probeRc -eq 0) -and $probe -and ($probe -notmatch 'error|cannot|refused|denied')
    if (-not $ok) {
        Write-Output ('🔴 [container-budget] {0}  docker 미응답 — 판정 «불가»(0본 아님)' -f $now.ToString('MM-dd HH:mm:ss'))
        Write-Output ('   probe rc={0}  out={1}' -f $probeRc, (($probe | Out-String).Trim()))
        exit 3
    }

    $rows = @(& docker ps -a --format '{{.Names}}|{{.State}}|{{.Image}}' 2>$null) |
            Where-Object { $_ -and ($_ -split '\|')[0].StartsWith($Prefix) }

    $out = foreach ($r in $rows) {
        $p = $r -split '\|'
        $nets = @((& docker inspect $p[0] --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}|{{end}}' 2>$null) -split '\|') |
                Where-Object { $_ }
        [pscustomobject]@{ Name = $p[0]; State = $p[1]; Image = $p[2]; Networks = $nets }
    }
    return @($out)
}

if ($FromJson) {
    $containers = @(Get-Content -Raw -Path $FromJson | ConvertFrom-Json)
    $source = "snapshot:$([IO.Path]::GetFileName($FromJson))"
} else {
    $containers = Get-LiveSnapshot
    $source = 'docker'
}

# ── 판정 ────────────────────────────────────────────────────────────────────
$existCount   = @($containers).Count
$runningCount = @($containers | Where-Object { $_.State -eq 'running' }).Count

# 벌 = DB 가 붙은 network
$dbNetworks = [System.Collections.Generic.HashSet[string]]::new()
foreach ($c in $containers) {
    if (Test-IsDb $c) { foreach ($n in @($c.Networks)) { [void]$dbNetworks.Add($n) } }
}
$beeCount = $dbNetworks.Count

# 고아 = DB 가 아니면서, 붙어 있는 망 중 어디에도 DB 가 없는 컨테이너
$orphans = @()
foreach ($c in $containers) {
    if (Test-IsDb $c) { continue }
    $nets = @($c.Networks)
    $attached = @($nets | Where-Object { $dbNetworks.Contains($_) })
    if ($attached.Count -eq 0) {
        $where = if ($nets.Count -eq 0) { '망 없음' } else { $nets -join ',' }
        $orphans += ('{0} (state={1} · {2})' -f $c.Name, $c.State, $where)
    }
}

$alerts  = @()
$notices = @()

if ($existCount   -gt $LimitExist)   { $alerts += ('존재 {0}본 > 상한 {1}본' -f $existCount, $LimitExist) }
if ($runningCount -gt $LimitRunning) { $alerts += ('running {0}본 > 상한 {1}본' -f $runningCount, $LimitRunning) }
if ($beeCount     -gt $LimitBees)    { $alerts += ('벌 {0} > 상한 {1}벌  (DB 가 붙은 network 수)' -f $beeCount, $LimitBees) }
if ($orphans.Count -ge 1) {
    $alerts += ('고아 {0}본 — DB 없는 망의 서비스(붙을 데이터가 없다)' -f $orphans.Count)
}
if ($runningCount -gt $NoticeRunning -and $runningCount -le $LimitRunning) {
    $notices += ('running {0}본 — 주의선 {1}본 초과(작업 중이면 정상)' -f $runningCount, $NoticeRunning)
}

# ── 출력 ────────────────────────────────────────────────────────────────────
$head = '[container-budget] {0}  ({1})  존재 {2} / running {3} / 벌 {4} / 고아 {5}' -f `
        $now.ToString('MM-dd HH:mm:ss'), $source, $existCount, $runningCount, $beeCount, $orphans.Count

if ($alerts.Count -gt 0) {
    Write-Output ('🔴 ' + $head)
    $alerts  | ForEach-Object { Write-Output ('   경보  ' + $_) }
    $orphans | ForEach-Object { Write-Output ('   고아  ' + $_) }
    $notices | ForEach-Object { Write-Output ('   주의  ' + $_) }
    Write-Output '   🔴 조치 = 리더에게 통보. 이 계기는 stop·rm 을 하지 않는다.'
    exit 2
}

if ($notices.Count -gt 0) {
    Write-Output ('🔵 ' + $head)
    $notices | ForEach-Object { Write-Output ('   주의  ' + $_) }
    exit 1
}

if (-not $Quiet) { Write-Output ('🔵 ' + $head + '  — 전건 상한 이내') }
exit 0
