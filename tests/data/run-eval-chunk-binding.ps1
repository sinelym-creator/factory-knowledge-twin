# =============================================================================
# run-eval-chunk-binding.ps1 — 평가 문항 chunk 입도 정답 근거 검증 (검증 좌석 · U-1)
#
#   pwsh tests/data/run-eval-chunk-binding.ps1        # 리포 루트에서 실행
#
# 전제: compose 스택 기동 + migrate.ps1 적용 + `pwsh data/seed.ps1` 적재 완료.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
# 🔴 읽기 전용이다. 색인이 비어 있으면 전건 FAIL이 «맞다» — 「색인이 없다」와 「좌표가 틀렸다」를
#    같은 초록으로 덮지 않는다.
#
# exit code: 0 = 바인딩 전건 성립 · 1 = 어긋남 1건 이상 · 2 = 실행 오류
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

$sqlPath = Join-Path $PSScriptRoot 'eval-chunk-binding.sql'
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

Write-Host '== 평가 문항 chunk 입도 바인딩 — «적힌 좌표가 색인에 실재하는가» ==' -ForegroundColor Cyan
Write-Host "   서비스 $Service · db $DbName · 읽기 전용(쓰기 0) · 전제 = 색인 빌드 완료" -ForegroundColor DarkGray
foreach ($r in $rows) {
  if ($r.Verdict -eq 'PASS') {
    Write-Host ("  PASS  {0} {1}" -f $r.Id, $r.What) -ForegroundColor DarkGreen
  } else {
    Write-Host ("  FAIL  {0} {1}" -f $r.Id, $r.What) -ForegroundColor Red
    Write-Host ("        기대 {0} / 실측 {1}" -f $r.Expected, $r.Actual) -ForegroundColor Red
  }
}

$pass = @($rows | Where-Object { $_.Verdict -eq 'PASS' }).Count
$fail = @($rows | Where-Object { $_.Verdict -ne 'PASS' }).Count
Write-Host ''
Write-Host ("결과: {0}/{1} PASS · FAIL {2}건" -f $pass, $rows.Count, $fail) -ForegroundColor $(if ($fail) { 'Red' } else { 'Green' })
if ($fail) {
  Write-Host '  FAIL = 평가셋이 «존재하지 않는 근거»를 정답이라 말하고 있다는 뜻이다.' -ForegroundColor DarkGray
  Write-Host '         benchmarks/datasets/eval-questions-draft.md §8의 좌표를 재실측해 고쳐라.' -ForegroundColor DarkGray
}
exit $(if ($fail) { 1 } else { 0 })
