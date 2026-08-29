# =============================================================================
# migrate.ps1 — 마이그레이션 적용 (1명령)
#
#   pwsh services/ai-api/db/migrate.ps1
#   pwsh services/ai-api/db/migrate.ps1 -EmbeddingDim 1024   # 001 단독 적용 시의 자리표시자 차원
#
# 🔴 -EmbeddingDim 은 «001의 자리표시자»일 뿐 최종 차원이 아니다(Q-7 정정). 003이 모델 확정분
#    384로 못박으므로, 무엇을 주든 전 파일 적용 후 최종 상태는 vector(384)다. 이 파라미터는
#    모델 미정 상태에서 001만 적용하던 시절의 잔재로 남아 있다.
#
# 🔴 재실행 멱등 — 이미 적용된 파일은 schema_migration 이력을 보고 «건너뛴다».
#
# 🔴 「전부 다시 돌리기」 스위치는 «두지 않았다». 그 동작이 바로 아래 결함이며, 결함을
#    재현하는 것 말고는 쓸모가 없다(-Force 로 만들어 실측했더니 정확히 exit 1이 났다).
#    DB 상태를 처음부터 다시 세우려면 데이터베이스를 새로 만들고 이 스크립트를 돌려라 —
#    실측: 신규 DB에 001~005 순차 적용 exit 0 · 재실행 exit 0(전건 skip).
#
# 🔴 왜 「전부 다시 돌리기」를 그만두었나 (2026-08-29 · 004 착지에서 실측된 결함):
#    각 DDL이 IF NOT EXISTS라 재적용이 안전하다는 전제로 매번 전 파일을 돌렸다. 그런데
#    «객체를 교체하는» 마이그레이션이 생기면 그 전제가 깨진다 — 004가 003의 v_index_freshness
#    에 열을 더하자, 다음 실행에서 003이 그 view를 옛 모양으로 되돌리려다
#    `cannot drop columns from view` 로 죽었다. 즉 004가 착지한 DB에서는 migrate 자체가
#    실행 불가가 된다. 「앞 파일이 뒤 파일의 결과를 되감는다」는 순서 문제라 개별 파일의
#    멱등성으로는 막을 수 없다. schema_migration은 이미 그 이력을 들고 있었다 — 쓰기만
#    하고 읽지 않았을 뿐이다.
# 🔴 compose 스택(fkt-postgres)이 기동 중이어야 한다: docker compose up -d
# =============================================================================
param(
  # 001의 vector(:embedding_dim) 자리표시자 값. 🔴 최종 차원은 003이 384로 확정한다.
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

# 이미 적용된 파일 목록. 테이블이 아직 없는 «최초» 실행에서는 조회가 실패하므로 빈 목록으로 둔다.
$applied = @()
$out = docker compose exec -T $Service psql -U $DbUser -d $DbName -tAc `
  "SELECT filename FROM schema_migration" 2>$null
if ($LASTEXITCODE -eq 0 -and $out) { $applied = @($out | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

# 🔴 배너에 «자리표시자»라고 적는다. 그냥 embedding_dim=768 이라고 찍으면 최종 차원이 768인
#    것처럼 읽힌다 — 실제 최종 상태는 003이 정한 384다(Q-7 · levi2 회부 ③).
Write-Host "== migrate: $($files.Count)개 · 적용됨 $($applied.Count)개 · 001 자리표시자 dim=$EmbeddingDim(최종=003의 384) · db=$DbName ==" -ForegroundColor Cyan

foreach ($f in $files) {
  if ($applied -contains $f.Name) {
    Write-Host "-- skip  $($f.Name) (적용됨)" -ForegroundColor DarkGray
    continue
  }
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
