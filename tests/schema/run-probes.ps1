# =============================================================================
# run-probes.ps1 — 스키마 제약 재현 표본 실행 (T1-1 검증)
#
#   pwsh tests/schema/run-probes.ps1                    # 리포 루트에서 실행(compose 경로)
#   pwsh tests/schema/run-probes.ps1 -Service postgres   # 서비스명은 기본값 postgres
#   pwsh tests/schema/run-probes.ps1 -Direct             # libpq 직결(PGHOST 등 env 로 psql 직접 호출)
#
# 🔴 컨테이너를 «이름»으로 부르지 않는다 — 이름은 COMPOSE_PROJECT_NAME에 따라 바뀐다.
#    dev-environment §4.2 규칙대로 «서비스명»으로 부른다(migrate.ps1과 동일 방식).
#
# 🔴 두 경로(compose · 직결)는 «같은 표본»에 «같은 결과»를 내야 한다(T5-3 C2). 직결은 compose 를
#    거치지 않고 libpq env(PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE)로 psql 을 직접 부른다.
#    -Direct 를 안 줘도 PGHOST 가 있으면 자동 직결(compose 없는 환경에서 그게 유일한 경로다).
#    직결 대상이 안 닿으면(pg_isready 실패) rc 2 — compose 서비스 부재와 같은 등급이다.
#
# 🔴 «거부돼야 하는데 통과하는가»를 본다. 통과 케이스만 세면 제약은 증명되지 않는다.
# 🔴 expect=accept 는 「막지 않는 것이 설계」인 축이다(대조군 · 오케가 비강제로 확정한 G-2·G-3).
#    무엇이 대신 지키는지는 각 probe의 why에 적혀 있다 — 적혀 있지 않은 accept는 눈감기다.
#    G-4b(옛 P-5·P-6)는 tests/data 로 이관했다(spec.relocated 참조).
# 🔴 probe 1건 = 트랜잭션 1개(BEGIN … ROLLBACK). 준비 행까지 되감으므로
#    대상 DB에 아무것도 남지 않는다 — 타 좌석 스택에서도 안전하다.
# 🔴 구현 좌석이 이미 실측한 단일 칼럼 제약 7종은 표본에 없다.
#    자기 실측의 재실행은 검증이 아니라 복창이다.
#
# exit code: 0 = 표본 전건 기대대로 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service   = 'postgres',
  # compose project 이름. 기본값 = 환경변수 COMPOSE_PROJECT_NAME(compose 자신이 읽는 값과 같다).
  # 🔴 D-18 잔여(2026-09-02 실측): 이 인자가 없던 판은 비기본 project 스택에서 exit 2 로 죽었다 —
  #    postgres 가 healthy 인데도 「기동 중이 아닙니다」였다. `docker compose` 는 project 를 안 주면
  #    기본 project 를 보기 때문이다. seed.ps1(#368)·migrate.ps1(#362)과 같은 수리.
  [string] $Project = $env:COMPOSE_PROJECT_NAME,
  [string] $DbUser    = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } elseif ($env:PGUSER) { $env:PGUSER } else { 'fkt' }),
  [string] $DbName    = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   elseif ($env:PGDATABASE) { $env:PGDATABASE } else { 'fkt' }),
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
  # 🔴 직결 = libpq env 로 psql 을 직접 부른다. 서비스 실재 확인은 compose 가 아니라 pg_isready 로
  #    대체한다 — 대상이 안 닿으면 rc 2(compose 서비스 부재와 같은 등급 · 없는 대상에 초록 금지).
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

$specPath = Join-Path $PSScriptRoot 'constraint-probes.json'
if (-not (Test-Path $specPath)) { Write-Host "실행 오류: 표본 파일 없음 $specPath" -ForegroundColor Red; exit 2 }
$spec = Get-Content -Raw -Encoding UTF8 $specPath | ConvertFrom-Json

# 여러 문장을 «한 트랜잭션»으로 보내고 성공 여부만 돌려준다. 끝에서 반드시 되감는다.
function Invoke-Tx([string[]] $statements) {
  $script = "BEGIN;`n" + (($statements | ForEach-Object { $_.TrimEnd(';') + ';' }) -join "`n") + "`nROLLBACK;`n"
  # 🔴 두 경로가 «같은 SQL»을 보낸다 — 다른 것은 psql 이 어디서 도는가(컨테이너 exec vs libpq 직결)뿐이다.
  $out = if ($Direct) {
    $script | & $PsqlBin -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -q 2>&1
  } else {
    $script | docker @compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -q 2>&1
  }
  return @{ ok = ($LASTEXITCODE -eq 0); msg = ((($out | Select-String -Pattern 'ERROR' | Select-Object -First 1) -as [string]) -replace '\s+', ' ') }
}

Write-Host "== $($spec.name) ==" -ForegroundColor Cyan
$conn = if ($Direct) { "직결(libpq · PGHOST=$($env:PGHOST))" } else { "compose 서비스 $Service" }
Write-Host "   경로 $conn · db $DbName · 격리 = 트랜잭션 롤백(잔여물 0)" -ForegroundColor DarkGray

$fail = 0; $blocked = 0
foreach ($p in $spec.probes) {
  $setup = @($spec.commonSetup) + @($p.setup | Where-Object { $_ })

  # 준비 행만으로 한 번 돌려본다 — 여기서 실패하면 probe 결과를 신뢰할 수 없다.
  # 준비 실패를 «거부»로 오독하면 없는 제약을 있다고 보고하게 된다.
  $control = Invoke-Tx $setup
  if (-not $control.ok) {
    $blocked++
    Write-Host ("  BLOCKED  {0} {1}" -f $p.id, $p.label) -ForegroundColor Yellow
    Write-Host ("           준비 행이 먼저 실패했다 — 판정 불가: {0}" -f $control.msg) -ForegroundColor Yellow
    continue
  }

  $r = Invoke-Tx ($setup + @($p.sql))
  $got = if ($r.ok) { 'accept' } else { 'reject' }
  $ok = ($got -eq $p.expect)
  if (-not $ok) { $fail++ }
  # 🔴 초록 두 종류를 화면에서 구분한다 — 「막았다」와 「막지 않는 것이 설계다」는 다른 사실이다.
  #    구분하지 않으면 6/6이 「전부 막힌다」로 읽혀, 비강제 축이 조용히 잊힌다.
  $mark = if (-not $ok) { 'FAIL' } elseif ($p.expect -eq 'accept') { 'PASS(비강제)' } else { 'PASS' }
  Write-Host ("  {0,-12} {1} {2}" -f $mark, $p.id, $p.label) `
    -ForegroundColor $(if (-not $ok) { 'Red' } elseif ($p.expect -eq 'accept') { 'DarkGreen' } else { 'Green' })
  if (-not $ok) {
    Write-Host ("        기대 {0} / 실제 {1}   [{2}]" -f $p.expect, $got, $p.gap) -ForegroundColor Red
    Write-Host ("        {0}" -f $p.why) -ForegroundColor DarkYellow
  }
}

$total = $spec.probes.Count
$byDesign = @($spec.probes | Where-Object { $_.expect -eq 'accept' }).Count
Write-Host ""
Write-Host ("결과: {0}/{1} 기대대로 · 어긋남 {2}건 · 판정불가 {3}건" -f ($total - $fail - $blocked), $total, $fail, $blocked) `
  -ForegroundColor $(if ($fail -eq 0 -and $blocked -eq 0) { 'Green' } else { 'Red' })
Write-Host "  FAIL = 스키마가 막아야 할 것을 막지 않는다는 뜻이다(표본의 결함이 아니다)." -ForegroundColor DarkGray
Write-Host ("  그중 {0}건은 expect=accept — 통과가 «설계»인 축이다(대조군 + 비강제 확정). 초록이 「전부 막힌다」는 뜻이 아니다." -f $byDesign) -ForegroundColor DarkGray
if ($spec.relocated) {
  Write-Host ("  이관 {0}건(표본 밖에서 검증): {1}" -f @($spec.relocated).Count,
    (($spec.relocated | ForEach-Object { "$($_.id) → $($_.to)" }) -join ' · ')) -ForegroundColor DarkGray
}
exit $(if ($fail -eq 0 -and $blocked -eq 0) { 0 } else { 1 })
