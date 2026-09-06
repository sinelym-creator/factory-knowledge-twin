# =============================================================================
# run-seed-integrity.ps1 — T1-2 seed 데이터 정합 표본 실행 (검증 좌석)
#
#   pwsh tests/data/run-seed-integrity.ps1        # 리포 루트에서 실행(compose 경로)
#   pwsh tests/data/run-seed-integrity.ps1 -Direct  # libpq 직결(PGHOST 등 env 로 psql 직접 호출)
#
# 전제: compose 스택 기동 + migrate.ps1 적용 + `pwsh data/seed.ps1` 적재 완료.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
# 🔴 읽기 전용 — 어떤 행도 쓰지 않는다. 타 좌석 스택에서 돌려도 안전하다.
#
# 🔴 두 경로(compose · 직결)는 «같은 표본»에 «같은 결과»를 내야 한다(T5-3 C2). 직결은 compose 를
#    거치지 않고 libpq env(PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)로 psql 을 직접 부르며,
#    서비스 실재 확인은 pg_isready 로 대체한다. -Direct 를 안 줘도 PGHOST 가 있으면 자동 직결.
#    직결 대상이 안 닿으면 rc 2 — compose 서비스 부재와 같은 등급이다.
#
# exit code: 0 = 표본 전건 PASS · 1 = FAIL 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service = 'postgres',
  # compose project 이름. 기본값 = 환경변수 COMPOSE_PROJECT_NAME(compose 자신이 읽는 값과 같다).
  # 🔴 D-18 잔여(2026-09-02 실측): 이 인자가 없던 판은 비기본 project 스택에서 exit 2 로 죽었다 —
  #    postgres 가 healthy 인데도 「기동 중이 아닙니다」였다. `docker compose` 는 project 를 안 주면
  #    기본 project 를 보기 때문이다. seed.ps1(#368)·migrate.ps1(#362)과 같은 수리.
  [string] $Project = $env:COMPOSE_PROJECT_NAME,
  [string] $DbUser  = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } elseif ($env:PGUSER) { $env:PGUSER } else { 'fkt' }),
  [string] $DbName  = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   elseif ($env:PGDATABASE) { $env:PGDATABASE } else { 'fkt' }),
  [switch] $Quiet,
  # libpq 직결. -Direct 이거나 PGHOST 가 있으면 compose 를 거치지 않고 psql 을 직접 부른다.
  [switch] $Direct,
  [string] $PsqlBin      = 'psql',
  [string] $PgIsReadyBin = 'pg_isready'
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# 🔴 PGHOST 존재 = 직결 자동(compose 없는 환경에서 그게 유일한 경로다). -Direct 는 명시 스위치.
if ($env:PGHOST) { $Direct = $true }

# 🔴 이 배열이 «모든» docker compose 호출에 앞선다(D-18). 조회 한 곳만 고치면 그다음 exec 가
#    같은 이유로 죽는다 — project 를 모르면 컨테이너를 고를 수 없다.
$compose = @('compose')
if ($Project) { $compose += @('-p', $Project) }

if ($Direct) {
  # 🔴 직결 = libpq env 로 psql 을 직접 부른다. 서비스 실재 확인은 pg_isready 로 대체한다 —
  #    대상이 안 닿으면 rc 2(compose 서비스 부재와 같은 등급 · 없는 대상에 초록 금지).
  & $PgIsReadyBin *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "실행 오류: 직결 대상(PGHOST=$($env:PGHOST) PGPORT=$($env:PGPORT) db=$DbName)에 pg_isready 가 닿지 못했습니다." -ForegroundColor Red
    Write-Host "  libpq env(PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)를 확인하십시오." -ForegroundColor Red
    exit 2
  }
} else {
  $up = docker @compose ps --format '{{.Service}}' 2>$null
  if ($up -notcontains $Service) {
    # 🔴 실패 문면이 «다음 수»를 들고 있어야 한다. 앞판은 project 미지정으로 못 본 경우에도
    #    「먼저 up -d 하십시오」라고만 말해, 스택이 이미 healthy 인 사람을 막다른 길로 보냈다.
    $where = if ($Project) { "project '$Project'" } else { "기본 project(이름 미지정)" }
    Write-Host "실행 오류: compose 서비스 '$Service' 를 $where 에서 찾지 못했습니다." -ForegroundColor Red
    if (-not $Project) {
      Write-Host "  🔴 project 를 지정하지 않았습니다. 스택을 다른 이름으로 띄웠다면 이 조회는 그 스택을 «보지 못합니다»." -ForegroundColor Red
      Write-Host "     지정 방법 ① `$env:COMPOSE_PROJECT_NAME='<project>'  ② -Project '<project>' 인자  ③ -Direct(libpq)" -ForegroundColor Red
      # 지정 방법만 알려주고 이름을 안 알려주면 쓸 수가 없다 — 지금 떠 있는 후보를 함께 낸다.
      $ls = (docker compose ls --format json 2>$null)
      if ($LASTEXITCODE -eq 0 -and $ls) {
        try {
          $names = ($ls | ConvertFrom-Json) | ForEach-Object { $_.Name }
          if ($names) { Write-Host "     지금 떠 있는 project: $($names -join ', ')" -ForegroundColor Red }
        } catch { }   # 형식이 바뀌어도 안내 자체는 살려 둔다
      }
    } else {
      Write-Host "  스택이 안 떠 있다면 먼저 'docker compose up -d' 를 실행하십시오." -ForegroundColor Red
    }
    exit 2
  }
}

$sqlPath = Join-Path $PSScriptRoot 'seed-integrity.sql'
if (-not (Test-Path $sqlPath)) { Write-Host "실행 오류: 표본 파일 없음 $sqlPath" -ForegroundColor Red; exit 2 }

# -tA = 헤더·정렬 없이 구분자 출력. 파싱이 서식에 흔들리지 않는다.
# 🔴 두 경로가 «같은 SQL»을 보낸다 — 다른 것은 psql 이 어디서 도는가(컨테이너 exec vs libpq 직결)뿐이다.
$raw = if ($Direct) {
  Get-Content -Raw -Encoding UTF8 $sqlPath | & $PsqlBin -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -tA -F "`t" 2>&1
} else {
  Get-Content -Raw -Encoding UTF8 $sqlPath | docker @compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -tA -F "`t" 2>&1
}
if ($LASTEXITCODE -ne 0) {
  Write-Host "실행 오류: psql exit $LASTEXITCODE" -ForegroundColor Red
  $raw | ForEach-Object { Write-Host "  $_" }
  exit 2
}

$rows = @($raw | Where-Object { $_ -match "`t" } | ForEach-Object {
  $f = $_ -split "`t"
  [pscustomobject]@{ Id = $f[0]; What = $f[1]; Expected = $f[2]; Actual = $f[3]; Verdict = $f[4] }
})

if (-not $rows) { Write-Host '실행 오류: 표본 결과를 파싱하지 못했습니다.' -ForegroundColor Red; exit 2 }

Write-Host '== T1-2 seed 데이터 정합 표본 — «생성기 자기 점검이 보지 않는 축» ==' -ForegroundColor Cyan
$conn = if ($Direct) { "직결(libpq · PGHOST=$($env:PGHOST))" } else { "compose 서비스 $Service" }
Write-Host "   경로 $conn · db $DbName · 읽기 전용(쓰기 0)" -ForegroundColor DarkGray
foreach ($r in $rows) {
  if ($r.Verdict -eq 'PASS') {
    if (-not $Quiet) { Write-Host ("  PASS  {0} {1}" -f $r.Id, $r.What) -ForegroundColor DarkGreen }
  } else {
    Write-Host ("  FAIL  {0} {1}" -f $r.Id, $r.What) -ForegroundColor Red
    Write-Host ("        기대 {0} / 실측 {1}" -f $r.Expected, $r.Actual) -ForegroundColor Red
  }
}

$pass = @($rows | Where-Object { $_.Verdict -eq 'PASS' }).Count
$fail = @($rows | Where-Object { $_.Verdict -ne 'PASS' }).Count
Write-Host ''
Write-Host ("결과: {0}/{1} PASS · FAIL {2}건" -f $pass, $rows.Count, $fail) -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) { Write-Host '  FAIL = 데이터가 스펙·평가셋 전제와 어긋난다는 뜻이다. README의 «알려진 FAIL»을 먼저 대조하라.' -ForegroundColor DarkGray }
exit $(if ($fail) { 1 } else { 0 })
