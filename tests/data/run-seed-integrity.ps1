# =============================================================================
# run-seed-integrity.ps1 — T1-2 seed 데이터 정합 표본 실행 (검증 좌석)
#
#   pwsh tests/data/run-seed-integrity.ps1        # 리포 루트에서 실행
#
# 전제: compose 스택 기동 + migrate.ps1 적용 + `pwsh data/seed.ps1` 적재 완료.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
# 🔴 읽기 전용 — 어떤 행도 쓰지 않는다. 타 좌석 스택에서 돌려도 안전하다.
#
# exit code: 0 = 표본 전건 PASS · 1 = FAIL 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service = 'postgres',
  [string] $DbUser  = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName  = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' }),
  [switch] $Quiet
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$up = docker compose ps --format '{{.Service}}' 2>$null
if ($up -notcontains $Service) {
  Write-Host "실행 오류: 서비스 '$Service' 가 기동 중이 아닙니다. 먼저 'docker compose up -d' 를 실행하십시오." -ForegroundColor Red
  exit 2
}

$sqlPath = Join-Path $PSScriptRoot 'seed-integrity.sql'
if (-not (Test-Path $sqlPath)) { Write-Host "실행 오류: 표본 파일 없음 $sqlPath" -ForegroundColor Red; exit 2 }

# -tA = 헤더·정렬 없이 구분자 출력. 파싱이 서식에 흔들리지 않는다.
$raw = Get-Content -Raw -Encoding UTF8 $sqlPath |
  docker compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -tA -F "`t" 2>&1
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
Write-Host "   서비스 $Service · db $DbName · 읽기 전용(쓰기 0)" -ForegroundColor DarkGray
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
