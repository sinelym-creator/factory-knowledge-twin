# =============================================================================
# run-transition-net.ps1 — approval_state «전이 자체» 그물 실행 (검증 좌석 · G-3)
#
#   pwsh tests/data/run-transition-net.ps1        # 리포 루트에서 실행
#
# 전제: compose 스택 기동 + migrate.ps1 적용 + `pwsh data/seed.ps1` 적재 완료.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
# 🔴 이 표본은 «쓴다» — 전체가 BEGIN … ROLLBACK 1개 안이고 쌍 1건 = plpgsql 하위 블록 1개라
#    이중으로 되감긴다. 마지막 T-0가 잔여물 0을 실측한다. seed-integrity(읽기 전용)와 섞지 않는다.
#
# 🔴 판정 3종:
#      PASS/FAIL — 합법 3쌍·위반 6쌍(변형 2종)에 대한 «성문된 기대»와의 대조
#      INFO      — 스펙이 침묵하는 «건너뜀» 3쌍. 계수만 하고 판정하지 않는다(오케 회부 대상).
#                  INFO는 exit code에 영향을 주지 않는다 — 판정하지 않은 것을 통과라 부르지 않는다.
#
# exit code: 0 = 판정 대상 전건 일치 · 1 = 불일치 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service = 'postgres',
  [string] $DbUser  = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName  = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' })
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$up = docker compose ps --format '{{.Service}}' 2>$null
if ($up -notcontains $Service) {
  Write-Host "실행 오류: 서비스 '$Service' 가 기동 중이 아닙니다. 먼저 'docker compose up -d' 를 실행하십시오." -ForegroundColor Red
  exit 2
}

$sqlPath = Join-Path $PSScriptRoot 'transition-net.sql'
if (-not (Test-Path $sqlPath)) { Write-Host "실행 오류: 표본 파일 없음 $sqlPath" -ForegroundColor Red; exit 2 }

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

Write-Host '== 전이 그물 — «합법 전이는 조용한가 · 위반 전이는 우는가» ==' -ForegroundColor Cyan
Write-Host "   서비스 $Service · db $DbName · 격리 = 트랜잭션 롤백 2중(잔여물 0)" -ForegroundColor DarkGray
Write-Host '   실측 열 = 전이 그물(C-23~C-27) 증분 · 기존 그물(C-21·C-22) 증분 — 두 열이 대조군이다' -ForegroundColor DarkGray
foreach ($r in $rows) {
  switch ($r.Verdict) {
    'PASS' { Write-Host ("  PASS  {0} {1}" -f $r.Id, $r.What) -ForegroundColor DarkGreen
             Write-Host ("        {0}" -f $r.Actual) -ForegroundColor DarkGray }
    'INFO' { Write-Host ("  INFO  {0} {1}" -f $r.Id, $r.What) -ForegroundColor DarkYellow
             Write-Host ("        {0} — 스펙이 침묵하는 쌍이라 판정하지 않는다" -f $r.Actual) -ForegroundColor DarkGray }
    default { Write-Host ("  FAIL  {0} {1}" -f $r.Id, $r.What) -ForegroundColor Red
              Write-Host ("        기대 {0} / 실측 {1}" -f $r.Expected, $r.Actual) -ForegroundColor Red }
  }
}

$pass = @($rows | Where-Object { $_.Verdict -eq 'PASS' }).Count
$info = @($rows | Where-Object { $_.Verdict -eq 'INFO' }).Count
$fail = @($rows | Where-Object { $_.Verdict -notin @('PASS','INFO') }).Count
$judged = $pass + $fail
Write-Host ''
Write-Host ("결과: 판정 {0}/{1} PASS · FAIL {2}건 · INFO {3}건(미판정)" -f $pass, $judged, $fail, $info) `
  -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) {
  Write-Host '  FAIL 두 방향을 갈라 읽어라 — 위반을 넣었는데 조용하면 사정거리가 좁아진 것이고,' -ForegroundColor DarkGray
  Write-Host '  합법을 넣었는데 울면 그물이 넓어진 것이다. 전자는 부채, 후자는 위양성이다.' -ForegroundColor DarkGray
}
exit $(if ($fail) { 1 } else { 0 })
