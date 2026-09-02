#Requires -Version 7
<#
    재부팅 후 health check — 노트북 운영 조건 §14.4 (T4-3 ⓒ · T5-4 초안 겸용)

    🔴 이 스크립트의 설계 원칙 세 줄. 고칠 때 이 줄을 먼저 읽는다.

      ① **「안 쟀다」와 「재 봤더니 나쁘다」를 같은 칸에 쓰지 않는다.**
         계측기가 없어서 못 잰 행은 FAIL 이 아니라 SKIP 이고, 종료 코드도 다르다.
         두 개를 섞으면 「항상 빨강」이 되고, 항상 빨강인 신호는 아무도 안 본다.
      ② **초록은 «세어 본 초록»만 초록이다.** 0행을 재고 통과하는 일이 없도록
         측정 «건수»를 세고, 0이면 그 자체로 실패다(rc 2).
      ③ **판정식은 «참이어야 할 것»으로 쓴다.** `if (응답 -ne 200) { 실패 }` 처럼 쓰면
         응답이 $null·예외·빈 문자열일 때 조용히 통과한다. 아래는 전부
         `if (조건이 참) { PASS } else { FAIL }` 방향이다.

    사용:
      pwsh -File infra/health-check.ps1 -Project fkt-senku2-t15 -ApiBase http://127.0.0.1:8010
      pwsh -File infra/health-check.ps1 ... -PublicBase https://<host>.ts.net:8443 -WebBase https://<app>.vercel.app

      # 🔴 색인 층(D-16)은 `-PgContainer` 를 «줘야» 잰다. 안 주면 SKIP 이다 — 그리고 SKIP 은
      #   measured 에 들어가지 않으므로, 안 준 채로 난 rc 0 은 「색인이 성하다」는 뜻이 아니다.
      pwsh -File infra/health-check.ps1 ... -PgContainer fkt-senku2-t15-postgres-1

      # 🔴 `-Containers` 는 «부르는 방식마다 모양이 다르다». 둘 다 되게 만들어 두었다(Q-66):
      #   -File   → 인자가 전부 «문자열»이라 콤마로 잇는다(공백 없이)
      pwsh -File infra/health-check.ps1 -Project fkt-senku2-t15 -ApiBase http://127.0.0.1:8010 `
           -Containers fkt-deploy-ai-api,fkt-deploy-caddy
      #   -Command → pwsh 가 파싱하므로 «진짜 배열»을 준다
      pwsh -Command "& ./infra/health-check.ps1 -Containers @('fkt-deploy-ai-api','fkt-deploy-caddy')"

    종료 코드:
      0 = 잰 행이 1개 이상이고 전부 PASS
      1 = FAIL 이 1개 이상
      2 = 잰 행이 0개(= 계측기가 없다 · 「통과」가 아니다)
          또는 `-Containers` 를 «줬는데» 정규화 결과가 0본(= 인자가 오다 부서졌다 · Q-66)
#>
[CmdletBinding()]
param(
    # compose 프로젝트명. 비우면 컨테이너 층을 «건너뛴다»(SKIP — 통과가 아니다).
    #
    # 🔴 **이 필터가 보는 것은 «이미지에 구워진» 라벨이지 「지금 어느 스택에 속하는가」가 아니다.**
    #    앞판 주석은 「`docker run` 으로 띄운 컨테이너는 한 건도 안 잡힌다」였는데 **실측과 다르다**
    #    (리바이2 #302 · E1): compose 로 빌드한 이미지에는 `com.docker.compose.project` 라벨이
    #    구워져 있고, 그 이미지를 `docker run` 으로 띄우면 컨테이너가 그 라벨을 «상속»한다 —
    #    즉 안 잡히는 게 아니라 **이미지가 태어난 프로젝트 이름으로 잡힌다**
    #    (`fkt-deploy-ai-api` 의 라벨 3개 = 그 이미지의 라벨과 동일).
    # 🔴 위험의 모양은 「0건」이 아니라 «엉뚱한 건수»다: `-Project fkt-senku2-t15` 로 재면 2건이
    #    잡혀 아래 「0건 = FAIL」 가드가 울리지 않고, 그 사이 배포 ai-api 가 조용히 빠진다.
    #    그래서 `-Containers` 가 «필요 집합»으로 따로 있다 — 이름으로 못 박는 자리다.
    [string]   $Project    = $env:COMPOSE_PROJECT_NAME,
    # 🔴 «이름으로» 반드시 있어야 하는 컨테이너들. 없으면 FAIL 이다(SKIP 아니다) —
    #    「있어야 한다」고 적어 놓고 안 보이는 것은 건너뛸 일이 아니라 실패다.
    # 🔴 `-File` 로 부르면 콤마로 이은 «한 문자열»이 온다 — 아래 정규화가 두 모양을 다 받는다(Q-66).
    [string[]] $Containers = @(),
    # ai-api 의 «호스트» 포트. 🔴 컨테이너 안의 8000 이 아니라 게시된 포트다.
    [string] $ApiBase    = $(if ($env:FKT_API_BASE) { $env:FKT_API_BASE } else { 'http://127.0.0.1:8000' }),
    # Funnel 공개 URL. 비우면 SKIP.
    [string] $PublicBase = $env:FKT_PUBLIC_BASE,
    # 셸(Vercel) URL. 비우면 SKIP.
    [string] $WebBase    = $env:FKT_WEB_BASE,
    # 🔴 색인(pgvector) 층을 재려면 «어느 컨테이너의 psql 인가»를 이름으로 못 박아야 한다(D-16).
    #    `-Project` 라벨로 postgres 를 추측하지 않는다 — 라벨은 «빌드 자리»를 말하지 런타임
    #    소속이 아니다(위 `-Containers` 와 같은 이유). 비우면 이 층은 SKIP 이다.
    [string] $PgContainer = $env:FKT_PG_CONTAINER,
    [string] $PgUser      = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
    [string] $PgDb        = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' }),
    [int]    $TimeoutSec = 10
)

$ErrorActionPreference = 'Stop'
$rows = [System.Collections.Generic.List[object]]::new()

# ── 층 -1. 계기 자신 : 「받은 인자가 내가 생각한 모양인가」 ────────────────────
#
# 🔴 **`-File` 로 부르면 pwsh 는 인자를 «전부 문자열»로 넘긴다.** `-Containers a,b,c` 가
#    `[string[]]` 에 1-원소 `@('a,b,c')` 로 들어오고(실측: `raw-count=1 raw0=[a,b,c]`),
#    그 통짜 문자열을 «이름»으로 물으면 「없는 컨테이너」가 되어 3본이 다 서 있는데도 FAIL 이
#    난다(오케 14:15 실측 · 위양성). 🔴 그것은 **대상의 사실이 아니라 계기의 사실**이었다.
# 🔴 `-Command` 축은 pwsh 가 파싱해 «진짜 배열»을 주므로 콤마가 없다 — 이 한 줄이 두 모양을
#    다 받는다(콤마로 가르고, 다듬고, 빈 원소를 버리고, 평탄화한다).
$containersGiven = $PSBoundParameters.ContainsKey('Containers')
$containersRaw = @($Containers)
$Containers = @($containersRaw |
    ForEach-Object { "$_" -split ',' } |
    ForEach-Object { $_.Trim() } |
    Where-Object { $_ })

# 🔴 **파라미터 이름이 pwsh «자동변수»와 겹치면 바인딩이 조용히 어긋난다**($Host·$Error·$Args…).
#    「지금은 안 겹친다」로 두지 않고 매번 «센다» — 이름은 다음 사람이 늘리고, 그때 이 검사가
#    없으면 어긋남은 값이 이상해진 «대상»의 얼굴로 나타난다.
$autoVarNames = @('Host', 'Error', 'Args', 'Input', 'Matches', 'This', 'PSItem', 'Profile',
                  'Pwd', 'Home', 'PID', 'Event', 'Sender', 'StackTrace', 'ExecutionContext')
$paramClash = @($MyInvocation.MyCommand.Parameters.Keys | Where-Object { $autoVarNames -contains $_ })

# 표 «앞»에 찍는 한 줄 — 초록이든 빨강이든 「무엇을 받아서 잰 것인가」가 먼저 보여야 한다.
$argLine = "args: -Containers 원문 $($containersRaw.Count)개 → 정규화 $($Containers.Count)본" +
           $(if ($Containers.Count) { " [$($Containers -join ', ')]" } else { '' }) +
           " · param↔자동변수 충돌 $($paramClash.Count)" +
           $(if ($paramClash.Count) { " [$($paramClash -join ', ')]" } else { '' })

# 🔴 «줬는데 0본» = 계기가 부서진 것이다. 이때 컨테이너 층을 그냥 건너뛰면 화면은 조용한
#    초록이 되고, 정작 「있어야 한다」고 선언한 것들은 아무도 안 본 채로 지나간다.
#    대상을 의심하기 전에 계기부터 의심한다 — rc 2(측정 실패)이지 rc 1(대상 나쁨)이 아니다.
if ($containersGiven -and $Containers.Count -eq 0) {
    Write-Host $argLine
    Write-Host 'VERDICT: NO-MEASUREMENT — -Containers 를 줬는데 정규화 결과가 0본이다 (인자가 오다 부서졌다).'
    exit 2
}

function Add-Row {
    param([string]$Layer, [string]$Check, [string]$Verdict, [string]$Detail)
    $rows.Add([pscustomobject]@{ Layer = $Layer; Check = $Check; Verdict = $Verdict; Detail = $Detail })
}

# ── 층 0. 계측기 자체 ────────────────────────────────────────────────────────
# 🔴 이름 충돌은 «있을 때만» 행이 된다 — 없는 것을 초록 행으로 세면 measured 가 부풀고,
#    「잰 행 수」가 곧 판정인 이 스크립트에서 그것은 계수를 흐리는 일이다(검산 줄에는 항상 찍힌다).
if ($paramClash.Count -gt 0) {
    Add-Row 'instrument' 'param name clash' 'FAIL' "pwsh 자동변수와 겹치는 파라미터: $($paramClash -join ', ')"
}

# 🔴 도구가 없는 것을 대상의 결함으로 적지 않는다.
$dockerOk = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
if (-not $dockerOk) {
    Add-Row 'instrument' 'docker CLI' 'SKIP' 'docker 명령이 없다 — 컨테이너 층 전체를 잴 수 없다'
}

# ── 층 1. 컨테이너 ───────────────────────────────────────────────────────────
function Test-Container {
    param([string]$Name)
    $state  = (docker inspect $Name --format '{{.State.Status}}')
    $hasHc  = (docker inspect $Name --format '{{if .State.Health}}yes{{else}}no{{end}}')
    $hc     = if ($hasHc -eq 'yes') { docker inspect $Name --format '{{.State.Health.Status}}' } else { '' }
    $policy = (docker inspect $Name --format '{{.HostConfig.RestartPolicy.Name}}')

    if ($state -eq 'running') {
        Add-Row 'container' $Name 'PASS' "running · restart=$policy"
    } else {
        Add-Row 'container' $Name 'FAIL' "state=$state · restart=$policy"
    }

    # 🔴 healthcheck «부재»와 unhealthy 는 다른 사실이다 — 없는 것을 빨강으로 적으면
    #    「이 컨테이너는 나쁘다」로 읽히지만 실제로는 「이 컨테이너는 물어볼 데가 없다」다.
    if ($hasHc -eq 'no') {
        Add-Row 'container-health' $Name 'SKIP' 'healthcheck 정의 없음 — 잴 대상이 없다'
    } elseif ($hc -eq 'healthy') {
        Add-Row 'container-health' $Name 'PASS' 'healthy'
    } else {
        Add-Row 'container-health' $Name 'FAIL' "health=$hc"
    }
}

$seen = [System.Collections.Generic.HashSet[string]]::new()

if ($dockerOk -and $Project) {
    $names = @(docker ps -a --filter "label=com.docker.compose.project=$Project" --format '{{.Names}}') |
             Where-Object { $_ }

    if ($names.Count -eq 0) {
        # 🔴 0건은 초록이 아니다. 프로젝트명이 틀렸거나 스택이 아예 없다.
        Add-Row 'container' "project=$Project" 'FAIL' '이 프로젝트의 컨테이너가 0건이다 (이름 오타이거나 스택 부재)'
    }
    foreach ($n in $names) { [void]$seen.Add($n); Test-Container -Name $n }
} elseif ($dockerOk) {
    Add-Row 'container' 'project' 'SKIP' '-Project 미지정 — 컨테이너 층을 재지 않았다'
}

# 🔴 이름으로 «있어야 한다»고 선언된 것들 — compose 라벨이 없는 `docker run` 컨테이너가
#    이 자리에서만 잡힌다. 부재 = FAIL(건너뜀이 아니다).
if ($dockerOk) {
    foreach ($n in @($Containers | Where-Object { $_ })) {
        if ($seen.Contains($n)) { continue }
        $exists = @(docker ps -a --filter "name=^/$n$" --format '{{.Names}}') | Where-Object { $_ }
        if ($exists.Count -eq 0) {
            Add-Row 'container' $n 'FAIL' '있어야 한다고 선언된 컨테이너가 없다'
        } else {
            [void]$seen.Add($n); Test-Container -Name $n
        }
    }
}

# ── 층 2. ai-api 프로세스 «와» 의존 프로브 (두 층이다 — Q-52 계보) ───────────
function Test-Api {
    param([string]$Base, [string]$Layer)
    if (-not $Base) { Add-Row $Layer 'base url' 'SKIP' '주소 미지정 — 재지 않았다'; return }
    $url = "$($Base.TrimEnd('/'))/api/health"
    try {
        $r = Invoke-WebRequest -Uri $url -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
    } catch {
        Add-Row $Layer 'reachable' 'FAIL' "$url — $($_.Exception.Message)"
        return
    }
    if ($r.StatusCode -eq 200) {
        Add-Row $Layer 'http 200' 'PASS' $url
    } else {
        Add-Row $Layer 'http 200' 'FAIL' "$url — status=$($r.StatusCode)"
        return
    }

    # 🔴 200 은 「이 프로세스가 답한다」는 뜻이지 「의존이 산다」는 뜻이 아니다
    #    (docker-compose.yml ai-api healthcheck 머리말 · Q-52). 본문을 따로 읽는다.
    $body = $null
    try { $body = $r.Content | ConvertFrom-Json } catch {
        Add-Row $Layer 'body json' 'FAIL' '200 인데 본문이 JSON 이 아니다'
        return
    }
    if ($body.PSObject.Properties.Name -contains 'status') {
        if ($body.status -eq 'ok') {
            Add-Row $Layer 'status' 'PASS' "status=$($body.status)"
        } else {
            Add-Row $Layer 'status' 'FAIL' "status=$($body.status) (프로세스는 답하지만 의존이 성립하지 않는다)"
        }
    } else {
        Add-Row $Layer 'status' 'FAIL' '응답에 status 필드가 없다 — 계약이 갈렸다'
    }

    $deps = $body.dependencies
    if ($null -eq $deps) {
        Add-Row $Layer 'dependencies' 'FAIL' '응답에 dependencies 가 없다 — 의존 축을 잴 수 없다'
    } else {
        $depNames = @($deps.PSObject.Properties.Name)
        if ($depNames.Count -eq 0) {
            Add-Row $Layer 'dependencies' 'FAIL' 'dependencies 가 비었다 — 0건은 통과가 아니다'
        }
        foreach ($d in $depNames) {
            $st = $deps.$d.state
            if ($st -eq 'ok') {
                Add-Row "$Layer-dep" $d 'PASS' "state=$st"
            } elseif ($st -eq 'unconfigured') {
                Add-Row "$Layer-dep" $d 'SKIP' 'unconfigured — 이 배치에서 안 쓰는 의존이다'
            } else {
                Add-Row "$Layer-dep" $d 'FAIL' "state=$st"
            }
        }
    }
}

Test-Api -Base $ApiBase    -Layer 'ai-api(local)'
Test-Api -Base $PublicBase -Layer 'ai-api(funnel)'

# ── 층 3. 셸 ────────────────────────────────────────────────────────────────
if ($WebBase) {
    try {
        $w = Invoke-WebRequest -Uri $WebBase -TimeoutSec $TimeoutSec -SkipHttpErrorCheck
        if ($w.StatusCode -eq 200) { Add-Row 'web' 'http 200' 'PASS' $WebBase }
        else { Add-Row 'web' 'http 200' 'FAIL' "$WebBase — status=$($w.StatusCode)" }
    } catch {
        Add-Row 'web' 'reachable' 'FAIL' "$WebBase — $($_.Exception.Message)"
    }
} else {
    Add-Row 'web' 'base url' 'SKIP' '-WebBase 미지정 — 재지 않았다'
}

# ── 층 3.5. 색인(pgvector) — 🔴 D-16: 위 층이 «전부 초록»이어도 벡터는 0 일 수 있다 ────
#
# 실증(E1 · 2026-09-01 16:26~19:11): D-13 재구성이 seed 는 되살렸는데 T1-4 색인을 다시
# 돌리지 않아 `document_chunk` 임베딩이 0 건이었다. 컨테이너 running · healthcheck healthy ·
# `/api/health` 200 · seed 계수 · neo4j 대조 — 그 어느 것도 이 사실을 못 봤고, 공개 Live
# 경로만 `LookupError: document_chunk 에 임베딩이 0건이다`(retrieval/vector.py:67) 로 죽었다.
# 「본 층이 전부 초록인데 제품이 죽어 있다」는 계측기가 그 축을 안 재고 있다는 뜻이다.
function Test-VectorIndex {
    if (-not $dockerOk) {
        Add-Row 'retrieval' 'document_chunk' 'SKIP' 'docker 명령이 없다 — 색인 층을 잴 수 없다'
        return
    }
    if (-not $PgContainer) {
        Add-Row 'retrieval' 'document_chunk' 'SKIP' '-PgContainer 미지정 — 색인 층을 재지 않았다'
        return
    }
    # 🔴 `chr(124)` 로 잇는다 — SQL 안에 따옴표를 넣지 않으려는 것이다(PowerShell 인용이
    #    한 겹 더 씌워지는 자리라, 구분자 하나 때문에 계측기가 깨지는 일을 만들지 않는다).
    $sql = 'SELECT count(*) || chr(124) || count(embedding) || chr(124) || count(DISTINCT embedding_model) FROM document_chunk'
    $out = & docker exec $PgContainer psql -U $PgUser -d $PgDb -tAc $sql 2>&1
    $line = ($out | Out-String).Trim()
    # 🔴 계측기가 답을 못 준 것을 «대상의 결함»으로 적지 않는다(설계 원칙 ①). 테이블이 아직
    #    없거나 psql 이 못 붙은 것은 SKIP 이지 FAIL 이 아니다 — 여기서 FAIL 을 내면 마이그레이션
    #    전 환경이 영구 빨강이 되고, 영구 빨강은 아무도 안 본다.
    if ($LASTEXITCODE -ne 0 -or $line -notmatch '^\d+\|\d+\|\d+$') {
        Add-Row 'retrieval' 'document_chunk' 'SKIP' "psql 계수를 읽지 못했다 — $line"
        return
    }
    $n = $line -split '\|'
    $chunks = [int]$n[0]; $embedded = [int]$n[1]; $models = [int]$n[2]
    # 🔴 판정은 «참이어야 할 것»으로 쓴다(원칙 ③). 기대 «건수»(오늘의 59)를 박지 않는다 —
    #    seed 가 늘면 그 숫자가 낡아 계측기가 거짓 빨강을 낸다. 검색이 실제로 요구하는
    #    불변식만 본다: 0 이 아니고 · 전건 임베딩되어 있고 · 한 모델로만 만들어졌다.
    #    (그 둘이 곧 `retrieval/vector.py:67`·`:70` 이 우는 조건이다 — 경보의 사정거리를
    #     처방과 같게 맞춘 것이다.)
    if ($embedded -gt 0 -and $embedded -eq $chunks -and $models -eq 1) {
        Add-Row 'retrieval' 'document_chunk' 'PASS' "chunk $chunks · 임베딩 $embedded · 모델 $models 종"
    } else {
        Add-Row 'retrieval' 'document_chunk' 'FAIL' "chunk $chunks · 임베딩 $embedded · 모델 $models 종 — T1-4 색인(services/indexer/build_index.py)을 다시 돌린다"
    }
}

Test-VectorIndex

# ── 층 4. 노트북 조건 (§14.4) ────────────────────────────────────────────────
function Get-PowerIndex {
    param([string]$Sub, [string]$Setting)
    $raw = & powercfg /query SCHEME_CURRENT $Sub $Setting 2>$null
    if (-not $raw) { return $null }
    # 🔴 powercfg 출력은 시스템 로캘을 탄다. 로캘을 타지 않는 것은 'AC'/'DC' 와 0x 값뿐이라
    #    그 둘로만 고른다(한국어 Windows 에서 실측 확인).
    $ac = $raw | Select-String -Pattern 'AC.*0x' | Select-Object -Last 1
    if (-not $ac) { return $null }
    return [Convert]::ToInt64((($ac -replace '.*(0x[0-9a-fA-F]{8}).*', '$1')), 16)
}

foreach ($p in @(@{ n = 'sleep(STANDBYIDLE)';      s = 'SUB_SLEEP'; k = 'STANDBYIDLE' },
                 @{ n = 'hibernate(HIBERNATEIDLE)'; s = 'SUB_SLEEP'; k = 'HIBERNATEIDLE' })) {
    $v = Get-PowerIndex -Sub $p.s -Setting $p.k
    if ($null -eq $v) {
        # 🔴 숨김 설정이라 «못» 읽은 것과, 읽었더니 나쁜 것은 다르다.
        Add-Row 'laptop' $p.n 'SKIP' '이 전원 구성에서 노출되지 않는 설정이다 (못 읽음 ≠ 나쁨)'
    } elseif ($v -eq 0) {
        Add-Row 'laptop' $p.n 'PASS' '0 = 안 함(Never)'
    } else {
        Add-Row 'laptop' $p.n 'FAIL' "$v 초 후 진입 — §14.4 는 «끔»을 요구한다"
    }
}

$ts = Get-Service -Name 'Tailscale' -ErrorAction SilentlyContinue
if ($null -eq $ts) {
    Add-Row 'laptop' 'Tailscale service' 'SKIP' '서비스가 없다 — 이 머신은 Tunnel 호스트가 아니다'
} elseif ($ts.Status -eq 'Running' -and $ts.StartType -eq 'Automatic') {
    Add-Row 'laptop' 'Tailscale service' 'PASS' 'Running · StartType=Automatic'
} else {
    Add-Row 'laptop' 'Tailscale service' 'FAIL' "Status=$($ts.Status) · StartType=$($ts.StartType)"
}

# ── 판정 ────────────────────────────────────────────────────────────────────
# 🔴 표 «앞»에 계기 줄을 먼저 놓는다 — 아래 행들이 「무엇을 받아서」 잰 것인지 모르면
#    초록도 빨강도 읽을 수 없다(Q-66 의 위양성은 정확히 그 자리에서 났다).
Write-Host $argLine
$rows | Format-Table -AutoSize | Out-String -Width 200 | Write-Host

$pass = @($rows | Where-Object Verdict -eq 'PASS').Count
$fail = @($rows | Where-Object Verdict -eq 'FAIL').Count
$skip = @($rows | Where-Object Verdict -eq 'SKIP').Count
$measured = $pass + $fail

Write-Host "measured=$measured (PASS $pass / FAIL $fail) · SKIP $skip"

if ($measured -eq 0) {
    Write-Host 'VERDICT: NO-MEASUREMENT — 잰 행이 0개다. 통과가 아니라 계측 실패다.'
    exit 2
}
if ($fail -gt 0) {
    Write-Host 'VERDICT: FAIL'
    exit 1
}
Write-Host 'VERDICT: PASS'
exit 0
