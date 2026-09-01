# =============================================================================
# run-probes.ps1 — 스키마 제약 재현 표본 실행 (T1-1 검증)
#
#   pwsh tests/schema/run-probes.ps1                    # 리포 루트에서 실행
#   pwsh tests/schema/run-probes.ps1 -Service postgres   # 서비스명은 기본값 postgres
#
# 🔴 컨테이너를 «이름»으로 부르지 않는다 — 이름은 COMPOSE_PROJECT_NAME에 따라 바뀐다.
#    dev-environment §4.2 규칙대로 «서비스명»으로 부른다(migrate.ps1과 동일 방식).
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
  [string] $DbUser    = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName    = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' })
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$up = docker compose ps --format '{{.Service}}' 2>$null
if ($up -notcontains $Service) {
  Write-Host "실행 오류: 서비스 '$Service' 가 기동 중이 아닙니다. 먼저 'docker compose up -d' 를 실행하십시오." -ForegroundColor Red
  exit 2
}

$specPath = Join-Path $PSScriptRoot 'constraint-probes.json'
if (-not (Test-Path $specPath)) { Write-Host "실행 오류: 표본 파일 없음 $specPath" -ForegroundColor Red; exit 2 }
$spec = Get-Content -Raw -Encoding UTF8 $specPath | ConvertFrom-Json

# 여러 문장을 «한 트랜잭션»으로 보내고 성공 여부만 돌려준다. 끝에서 반드시 되감는다.
function Invoke-Tx([string[]] $statements) {
  $script = "BEGIN;`n" + (($statements | ForEach-Object { $_.TrimEnd(';') + ';' }) -join "`n") + "`nROLLBACK;`n"
  $out = $script | docker compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -q 2>&1
  return @{ ok = ($LASTEXITCODE -eq 0); msg = ((($out | Select-String -Pattern 'ERROR' | Select-Object -First 1) -as [string]) -replace '\s+', ' ') }
}

Write-Host "== $($spec.name) ==" -ForegroundColor Cyan
Write-Host "   서비스 $Service · db $DbName · 격리 = 트랜잭션 롤백(잔여물 0)" -ForegroundColor DarkGray

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
