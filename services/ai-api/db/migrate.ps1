# =============================================================================
# migrate.ps1 — 마이그레이션 적용 (1명령)
#
#   pwsh services/ai-api/db/migrate.ps1
#   pwsh services/ai-api/db/migrate.ps1 -EmbeddingDim 1024   # 차원 바꿔서 신규 적용 시
#
# 🔴 재실행 멱등 — 모든 DDL이 IF NOT EXISTS다. 두 번 돌려도 오류가 나지 않는다.
# 🔴 compose 스택(fkt-postgres)이 기동 중이어야 한다: docker compose up -d
# =============================================================================
param(
  [int]    $EmbeddingDim = 768,
  # 🔴 D-1 구조 격리: 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다.
  #    container_name을 없앴으므로 프로젝트명이 달라도(좌석별 병렬 스택) 그대로 동작한다.
  [string] $Service      = 'postgres',
  [string] $DbUser       = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName       = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' })
)

$ErrorActionPreference = 'Stop'
# 한국어 출력이 CP949로 깨지지 않게 콘솔 인코딩을 UTF-8로 고정한다
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$migrationDir = Join-Path $PSScriptRoot 'migrations'

# compose 파일이 있는 리포 루트에서 실행해야 서비스명이 해석된다
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
Push-Location $repoRoot
try {

# 서비스가 살아 있는지 먼저 확인 — 없으면 psql 오류 대신 사람이 읽을 안내를 낸다
$running = docker compose ps --status running --services
if ($running -notcontains $Service) {
  throw "compose 서비스 '$Service' 가 기동 중이 아닙니다. 먼저 'docker compose up -d' 를 실행하십시오."
}

$files = Get-ChildItem -Path $migrationDir -Filter '*.sql' | Sort-Object Name
if (-not $files) { throw "적용할 마이그레이션이 없습니다: $migrationDir" }

Write-Host "== migrate: $($files.Count)개 · embedding_dim=$EmbeddingDim · db=$DbName ==" -ForegroundColor Cyan

foreach ($f in $files) {
  Write-Host "-- apply $($f.Name)" -ForegroundColor DarkCyan
  # ON_ERROR_STOP=1 : 한 문장이라도 실패하면 즉시 비정상 종료(부분 적용 방지)
  Get-Content -Raw -Encoding UTF8 $f.FullName |
    docker compose exec -T $Service psql -U $DbUser -d $DbName `
      -v ON_ERROR_STOP=1 -v embedding_dim=$EmbeddingDim -q
  if ($LASTEXITCODE -ne 0) { throw "실패: $($f.Name) (exit $LASTEXITCODE)" }
}

Write-Host '== 적용 완료 ==' -ForegroundColor Green
docker compose exec -T $Service psql -U $DbUser -d $DbName -c `
  "SELECT filename, applied_at FROM schema_migration ORDER BY filename;"

} finally { Pop-Location }
