#Requires -Version 7
<#
    새 클론 → 1커맨드 (T7-26 · runbook §4-1 「1커맨드는 아직 없다」를 닫는다)

    README 「▶ 실행」의 6단을 한 명령으로 세우고, 끝에 «검산 3층»을 값으로 낸다.

    🔴 설계 원칙 넷. 고칠 때 이 줄을 먼저 읽는다.

      ① **단마다 rc 를 «직접» 본다.** 파이프 뒤의 종료코드는 파이프의 것이지 명령의 것이 아니다.
         외부 명령 호출 뒤에는 그 자리에서 `$LASTEXITCODE` 를 확인하고, 아니면 멈춘다.
      ② **끝난 것은 「오류가 안 났다」가 아니라 «수»로 말한다.** 마지막에 청크·노드·관계 수를
         찍는다. 두 번째 실행의 판정선은 그 수의 **불변**이다 — 조용히 끝났다는 사실이 아니다.
      ③ **볼륨은 리포·워크트리 «밖»이다**(D-13). 워크트리 안에 두면 `git worktree remove` 가
         ignored 파일까지 디렉토리째 지워 배포 중인 스택의 바인드 원본이 사라진다.
         아래 가드가 그 경로를 실행 «전»에 거부한다.
      ④ **포트는 프로젝트명에서 «결정»된다.** 매번 빈 포트를 새로 고르면 두 번째 실행이
         포트가 달라져 컨테이너를 다시 만든다 — 그건 「아무 일도 안 함」이 아니다.

    사용:
      pwsh -File infra/bootstrap.ps1 -ProjectName fkt-clean-0904
      pwsh -File infra/bootstrap.ps1 -ProjectName fkt-clean-0904 -Volumes D:\fkt-vol\clean-0904
      pwsh -File infra/bootstrap.ps1 -ProjectName fkt-clean-0904 -CountsOnly   # 수만 읽는다(멱등 대조용)

    종료 코드:
      0 = 6단 전부 통과하고 검산 3층이 전부 초록
      1 = 어느 단에서 멈췄다(어디서 멈췄는지 마지막 줄이 말한다)
      2 = 검산 층 중 하나가 실패(스택은 섰으나 «세어 본 초록»이 아니다)
#>
[CmdletBinding()]
param(
    # compose project 이름. 🔴 기존 스택과 겹치면 그 스택을 «건드린다» — 새 이름을 준다.
    [Parameter(Mandatory)] [string] $ProjectName,

    # bind mount 뿌리. 🔴 리포·워크트리 «밖»이어야 한다(D-13). 기본값도 그렇게 잡는다.
    [string] $Volumes = (Join-Path $HOME ".fkt-volumes/$ProjectName"),

    # 0 = 프로젝트명에서 결정적으로 파생(두 번째 실행이 같은 포트를 잡게 하려고).
    [int] $PostgresPort = 0,
    [int] $Neo4jHttpPort = 0,
    [int] $Neo4jBoltPort = 0,
    [int] $AiApiPort = 0,

    # 컨테이너가 healthy 가 될 때까지 기다리는 상한(초).
    [int] $HealthTimeoutSec = 600,

    # 아무것도 세우지 않고 «수»만 읽는다 — 멱등 대조(전/후)에 쓴다.
    [switch] $CountsOnly
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$steps = [System.Collections.Generic.List[object]]::new()

function Add-Step([string]$name, [double]$sec, [string]$note) {
    $steps.Add([pscustomobject]@{ Step = $name; Sec = [math]::Round($sec, 1); Note = $note })
}

# 🔴 외부 명령의 rc 를 «그 자리»에서 본다. 파이프로 넘기지 않는다(원칙 ①).
function Assert-Rc([string]$what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FAIL [$what] rc=$LASTEXITCODE" -ForegroundColor Red
        exit 1
    }
}

# ── 0. 전제 확인 ────────────────────────────────────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds

docker version --format '{{.Server.Version}}' > $null 2>&1
Assert-Rc 'docker 데몬 확인'

# 🔴 D-13 가드 — 볼륨 경로가 리포·워크트리 «안»이면 여기서 멈춘다. 실행 후에 알면 늦다.
$volFull = [System.IO.Path]::GetFullPath($Volumes)
foreach ($forbidden in @($repoRoot, (Join-Path (Split-Path $repoRoot -Parent) '_wt'))) {
    $f = [System.IO.Path]::GetFullPath($forbidden)
    if ($volFull.StartsWith($f, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Host "FAIL [볼륨 경로] $volFull 는 '$f' 안이다 — 리포·워크트리 «밖»에 둔다(D-13)." -ForegroundColor Red
        Write-Host "      워크트리 안의 바인드 원본은 'git worktree remove' 가 디렉토리째 지운다. git 은 그걸 못 본다." -ForegroundColor Red
        exit 1
    }
}
New-Item -ItemType Directory -Force -Path $volFull | Out-Null

# 🔴 포트는 프로젝트명에서 «결정»된다(원칙 ④). 두 번째 실행이 같은 값을 잡아야 컨테이너가
#    다시 만들어지지 않는다. 대역은 기존 스택(5434·5534·5536 · 7474/7687 · 7574/7576 · 8000·8010)
#    과 겹치지 않는 자리로 잡았다.
$h = 0
foreach ($c in $ProjectName.ToCharArray()) { $h = (($h * 31) + [int]$c) % 100 }
if ($PostgresPort  -le 0) { $PostgresPort  = 5600 + $h }
if ($Neo4jHttpPort -le 0) { $Neo4jHttpPort = 7600 + $h }
if ($Neo4jBoltPort -le 0) { $Neo4jBoltPort = 7700 + $h }
if ($AiApiPort     -le 0) { $AiApiPort     = 8300 + $h }

$env:COMPOSE_PROJECT_NAME = $ProjectName
$env:POSTGRES_PORT        = "$PostgresPort"
$env:NEO4J_HTTP_PORT      = "$Neo4jHttpPort"
$env:NEO4J_BOLT_PORT      = "$Neo4jBoltPort"
$env:AI_API_PORT          = "$AiApiPort"
$env:VOLUME_ROOT          = $volFull

$compose = @('compose', '-p', $ProjectName, '-f', (Join-Path $repoRoot 'docker-compose.yml'))
$pgContainer = "$ProjectName-postgres-1"
$neoContainer = "$ProjectName-neo4j-1"
$apiBase = "http://127.0.0.1:$AiApiPort"

# ── 수 읽기 — 검산과 멱등 대조가 «같은 계측기»를 쓴다 ────────────────────────────
function Get-Counts {
    $chunks = docker @compose exec -T postgres psql -U fkt -d fkt -tAc `
        "SELECT count(*) FROM document_chunk WHERE embedding IS NOT NULL;" 2>$null
    $chunkRc = $LASTEXITCODE
    $nodes = docker @compose exec -T neo4j cypher-shell -u neo4j -p fkt_local_dev --format plain `
        "MATCH (n) RETURN count(n) AS n;" 2>$null
    $nodeRc = $LASTEXITCODE
    $rels = docker @compose exec -T neo4j cypher-shell -u neo4j -p fkt_local_dev --format plain `
        "MATCH ()-[r]->() RETURN count(r) AS r;" 2>$null
    $relRc = $LASTEXITCODE
    $num = { param($v) if ($null -eq $v) { -1 } else { $t = ($v -join "`n") -replace '[^\d]', ''; if ($t) { [int]$t } else { -1 } } }
    [pscustomobject]@{
        VectorChunks  = (& $num $chunks)
        Nodes         = (& $num ($nodes  | Select-Object -Last 1))
        Relationships = (& $num ($rels   | Select-Object -Last 1))
        Rc            = "$chunkRc/$nodeRc/$relRc"
    }
}

if ($CountsOnly) {
    $c = Get-Counts
    Write-Host "== counts [$ProjectName] ==" -ForegroundColor Cyan
    $c | Format-List | Out-String | Write-Host
    exit 0
}

Write-Host "== bootstrap [$ProjectName] ==" -ForegroundColor Cyan
Write-Host "   repo    : $repoRoot"
Write-Host "   volumes : $volFull   (리포·워크트리 밖 · D-13)"
Write-Host "   ports   : pg $PostgresPort · neo4j $Neo4jHttpPort/$Neo4jBoltPort · api $AiApiPort   (프로젝트명 파생)"
Add-Step '0 전제·포트' ($sw.Elapsed.TotalSeconds - $t0) "vol=$volFull"

# ── 1·2. compose up (project·포트·볼륨은 위 env 로 이미 지정됨) ─────────────────
$t0 = $sw.Elapsed.TotalSeconds
$sha = git -C $repoRoot rev-parse --short HEAD 2>$null
if ($LASTEXITCODE -ne 0 -or -not $sha) { $sha = 'unknown' }
$env:FKT_BUILD_SHA = $sha
docker @compose up -d --build
Assert-Rc '1 docker compose up -d --build'

# healthy 를 «기다린다» — up 의 rc 0 은 「띄웠다」이지 「섰다」가 아니다.
$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    $states = docker @compose ps --format '{{.Service}}={{.Health}}'
    if ($LASTEXITCODE -eq 0 -and $states) {
        $arr = @($states)
        $ok = @($arr | Where-Object { $_ -match '=healthy$' })
        if ($ok.Count -ge 3) { $healthy = $true; break }
    }
    Start-Sleep -Seconds 5
}
if (-not $healthy) {
    Write-Host "FAIL [1 healthy 대기] $HealthTimeoutSec 초 안에 3본이 healthy 가 되지 않았다:" -ForegroundColor Red
    docker @compose ps --format '{{.Service}}={{.Health}}'
    exit 1
}
Add-Step '1·2 compose up + healthy' ($sw.Elapsed.TotalSeconds - $t0) "sha=$sha"

# ── 3. 마이그레이션 001~008 ─────────────────────────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds
pwsh -NoProfile -File (Join-Path $repoRoot 'services/ai-api/db/migrate.ps1') -Project $ProjectName
Assert-Rc '3 migrate.ps1'
Add-Step '3 migrate' ($sw.Elapsed.TotalSeconds - $t0) ''

# ── 4. synthetic seed ───────────────────────────────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds
pwsh -NoProfile -File (Join-Path $repoRoot 'data/seed.ps1') -Project $ProjectName
Assert-Rc '4 seed.ps1'
Add-Step '4 seed' ($sw.Elapsed.TotalSeconds - $t0) ''

# ── venv 를 만드는 자리 — 5·6 은 「한 줄」이 아니다(README 가 그렇게 적어 둔 자리) ──
function New-ServiceVenv([string]$service) {
    $dir = Join-Path $repoRoot "services/$service"
    $py  = Join-Path $dir '.venv/Scripts/python.exe'
    if (-not (Test-Path $py)) {
        python -m venv (Join-Path $dir '.venv')
        Assert-Rc "$service venv 생성"
    }
    & $py -m pip install --quiet --disable-pip-version-check -r (Join-Path $dir 'requirements.txt')
    Assert-Rc "$service requirements 설치"
    return $py
}

# 🔴 파이썬 단의 stdout 인코딩을 «먼저» 고정한다. 실측(09-04 09:25 · 이 스크립트 1회차):
#    `build_projection.py` 는 투영을 «끝내고»(노드 309·관계 448) 요약을 찍다가 죽었다 —
#    `UnicodeEncodeError: 'cp949' codec can't encode character '—'`. 콘솔 코드페이지가
#    CP949 면 em dash 한 글자가 rc 1 을 만든다. 🔴 일이 실패한 게 아니라 «일을 보고하다» 죽은
#    것이라, 데이터는 들어가 있는데 1커맨드는 실패로 끝난다 — 가장 헷갈리는 형태의 빨강이다.
#    여기서 고치는 것은 «이 경로»뿐이다. 손으로 runbook 6단을 돌리는 사람은 여전히 걸린다
#    (뿌리는 services/ 의 print 라 이 티켓의 scope 밖 · 별건으로 회부).
$env:PYTHONIOENCODING = 'utf-8'

# 🔴 색인·투영은 «호스트»에서 돌고 컨테이너 밖에서 DB 를 본다 — 그래서 대상을 명시해야 한다.
#    D-72 이후 두 스크립트는 «기본값을 갖지 않는다»: 안 주면 색인하지 않고 rc 2 로 죽는다.
#    그전에는 조용히 기본 포트 5434(= «다른 스택»)를 갈아 치울 수 있었다.
$env:FKT_POSTGRES_DSN = "host=127.0.0.1 port=$PostgresPort user=fkt password=fkt_local_dev dbname=fkt"
# PG* 는 psql·마이그레이션 등 «libpq 를 직접 쓰는» 자리를 위해 남긴다 — 색인·투영은 위 DSN 만 본다.
$env:PGHOST = '127.0.0.1'; $env:PGPORT = "$PostgresPort"
$env:PGUSER = 'fkt'; $env:PGPASSWORD = 'fkt_local_dev'; $env:PGDATABASE = 'fkt'
$env:NEO4J_HOST = '127.0.0.1'; $env:NEO4J_BOLT_PORT = "$Neo4jBoltPort"
$env:NEO4J_USER = 'neo4j'; $env:NEO4J_PASSWORD = 'fkt_local_dev'

# 임베딩 모델을 «이번에» 내려받았는지 값으로 남긴다(5단은 네트워크가 필요한 자리).
$hfCache = Join-Path $HOME '.cache/huggingface'
$hfBefore = if (Test-Path $hfCache) { (Get-ChildItem $hfCache -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } else { 0 }

# ── 5. 벡터 색인 ────────────────────────────────────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds
$idxPy = New-ServiceVenv 'indexer'
& $idxPy (Join-Path $repoRoot 'services/indexer/build_index.py')
Assert-Rc '5 build_index.py'
$hfAfter = if (Test-Path $hfCache) { (Get-ChildItem $hfCache -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } else { 0 }
$hfDeltaMb = [math]::Round((($hfAfter - $hfBefore) / 1MB), 1)
Add-Step '5 색인(venv+build_index)' ($sw.Elapsed.TotalSeconds - $t0) "HF 캐시 증가 ${hfDeltaMb} MB"

# ── 6. 그래프 투영 ──────────────────────────────────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds
$prjPy = New-ServiceVenv 'projector'
& $prjPy (Join-Path $repoRoot 'services/projector/build_projection.py')
Assert-Rc '6 build_projection.py'
Add-Step '6 투영(venv+build_projection)' ($sw.Elapsed.TotalSeconds - $t0) ''

# ── 검산 3층 — 「섰다」가 아니라 «세어 본 초록» ─────────────────────────────────
$t0 = $sw.Elapsed.TotalSeconds
Write-Host ''
Write-Host "== 검산 ==" -ForegroundColor Cyan

# ⓐ health-check.ps1 (컨테이너 층 + API 층 + 색인 층 D-16)
pwsh -NoProfile -File (Join-Path $repoRoot 'infra/health-check.ps1') `
     -Project $ProjectName -ApiBase $apiBase -PgContainer $pgContainer
$healthRc = $LASTEXITCODE

# ⓑ·ⓒ 수 — 벡터 청크 ≥1(D-16) · 노드·관계
$counts = Get-Counts

$verdicts = [ordered]@{
    'ⓐ health-check(컨테이너·API·색인)' = ($healthRc -eq 0)
    'ⓑ 벡터 청크 ≥ 1 (D-16)'            = ($counts.VectorChunks -ge 1)
    'ⓒ 그래프 노드·관계 ≥ 1'             = (($counts.Nodes -ge 1) -and ($counts.Relationships -ge 1))
}
Add-Step '검산 3층' ($sw.Elapsed.TotalSeconds - $t0) "health rc=$healthRc"

Write-Host ''
Write-Host "== 단계별 경과 ==" -ForegroundColor Cyan
$steps | Format-Table -AutoSize | Out-String | Write-Host
Write-Host "== 검산 3층 ==" -ForegroundColor Cyan
foreach ($k in $verdicts.Keys) {
    $v = $verdicts[$k]
    Write-Host ("  {0} {1}" -f $(if ($v) { 'PASS' } else { 'FAIL' }), $k) -ForegroundColor $(if ($v) { 'Green' } else { 'Red' })
}
Write-Host ''
Write-Host "== 수 (두 번째 실행의 판정선 = 이 세 값의 «불변») ==" -ForegroundColor Cyan
Write-Host "  vector_chunks = $($counts.VectorChunks)   nodes = $($counts.Nodes)   relationships = $($counts.Relationships)   (rc $($counts.Rc))"
Write-Host "  api = $apiBase   pg = 127.0.0.1:$PostgresPort   bolt = 127.0.0.1:$Neo4jBoltPort   volumes = $volFull"
Write-Host "  총 경과 = $([math]::Round($sw.Elapsed.TotalSeconds,1)) 초"

if ($verdicts.Values -contains $false) { exit 2 }
exit 0
