# =============================================================================
# seed.ps1 — synthetic seed 생성 + 적재 + 검증 (1명령 · T1-2)
#
#   pwsh data/seed.ps1                 # 생성 → 적재 → 검증
#   pwsh data/seed.ps1 -SkipGenerate   # 이미 만든 CSV로 적재만
#   pwsh data/seed.ps1 -SkipLoad       # 생성만 (DB 없이 멱등 확인용)
#
# 🔴 재실행 멱등 — 두 축이 함께 성립해야 한다.
#    ① 생성: random seed·기준 시각이 고정이라 같은 CSV가 나온다(data/generated/manifest.sha256).
#    ② 적재: seed 테이블을 TRUNCATE 후 다시 넣는다. 몇 번 돌려도 같은 상태가 된다.
#
# 🔴 적재는 seed 테이블 24종을 «비우고» 다시 넣는다. 손으로 넣은 데이터가 있다면 사라진다 —
#    synthetic seed 전용 스크립트이며, 그 밖의 용도로 쓰지 않는다.
#
# 🔴 compose 스택이 기동 중이어야 한다. 좌석별 병렬 스택은 dev-environment §4.2 참조.
# =============================================================================
param(
  [switch] $SkipGenerate,
  [switch] $SkipLoad,
  # 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(D-1 구조 격리 · migrate.ps1과 동일)
  [string] $Service = 'postgres',
  [string] $DbUser  = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName  = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' })
)

$ErrorActionPreference = 'Stop'
# 한국어 출력·플롯 블록 문자가 CP949로 깨지지 않게 콘솔 인코딩을 UTF-8로 고정한다
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$env:PYTHONIOENCODING = 'utf-8'

$repoRoot     = Resolve-Path (Join-Path $PSScriptRoot '..')
$generatedDir = Join-Path $PSScriptRoot 'generated'
$verifyDir    = Join-Path $PSScriptRoot 'generators/verify'
$containerDir = '/tmp/fkt-seed'

Push-Location $repoRoot
try {

# --- 1. 생성 -----------------------------------------------------------------
if (-not $SkipGenerate) {
  Write-Host '== 1/3 생성 ==' -ForegroundColor Cyan
  python -m data.generators.generate
  if ($LASTEXITCODE -ne 0) { throw "생성 실패 (exit $LASTEXITCODE)" }
} else {
  Write-Host '== 1/3 생성 건너뜀 ==' -ForegroundColor DarkGray
  if (-not (Test-Path (Join-Path $generatedDir 'load.sql'))) {
    throw "생성물이 없습니다: $generatedDir — -SkipGenerate 없이 한 번 실행하십시오."
  }
}

if ($SkipLoad) { Write-Host '== 적재 건너뜀 (-SkipLoad) ==' -ForegroundColor DarkGray; return }

# --- 2. 적재 -----------------------------------------------------------------
$running = docker compose ps --status running --services
if ($running -notcontains $Service) {
  throw "compose 서비스 '$Service' 가 기동 중이 아닙니다. 먼저 'docker compose up -d' 를 실행하십시오."
}

Write-Host '== 2/3 적재 ==' -ForegroundColor Cyan
# 소스 끝의 '/.' = 「디렉터리 내용을」 복사. 대상이 이미 있어도 그 안에 중첩되지 않는다.
docker compose cp "$generatedDir/." "${Service}:$containerDir/"
if ($LASTEXITCODE -ne 0) { throw "CSV 복사 실패 (exit $LASTEXITCODE)" }

docker compose exec -T $Service psql -U $DbUser -d $DbName `
  -v ON_ERROR_STOP=1 -q -f "$containerDir/load.sql"
if ($LASTEXITCODE -ne 0) { throw "적재 실패 (exit $LASTEXITCODE)" }

docker compose exec -T $Service psql -U $DbUser -d $DbName -c @'
SELECT 'sensor_reading' AS t, count(*) FROM sensor_reading
UNION ALL SELECT 'equipment', count(*) FROM equipment
UNION ALL SELECT 'document_revision', count(*) FROM document_revision
UNION ALL SELECT 'alarm', count(*) FROM alarm
UNION ALL SELECT 'maintenance_record', count(*) FROM maintenance_record;
'@

# --- 3. 검증 -----------------------------------------------------------------
Write-Host '== 3/3 검증 ==' -ForegroundColor Cyan
foreach ($name in @('gs01_binding', 'd2_revision_divergence', 'd5_unmapped_failure_mode')) {
  Write-Host "-- $name.sql" -ForegroundColor DarkCyan
  Get-Content -Raw -Encoding UTF8 (Join-Path $verifyDir "$name.sql") |
    docker compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "검증 실패: $name (exit $LASTEXITCODE)" }
}

Write-Host '== 완료 ==' -ForegroundColor Green

} finally { Pop-Location }
