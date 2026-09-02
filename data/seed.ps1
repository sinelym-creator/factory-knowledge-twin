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
  # compose project 이름. 기본값 = 환경변수 COMPOSE_PROJECT_NAME(compose 자신이 읽는 값과 같다).
  # 🔴 D-18 잔여(2026-09-02): 이 인자가 없던 판은 비기본 project 스택에서 :56 으로 죽었다 —
  #    postgres 가 healthy 인데도 「기동 중이 아닙니다」였다(실측 재현). `docker compose` 는
  #    project 를 안 주면 기본 project(디렉토리명)를 보기 때문이다. migrate.ps1 과 같은 수리.
  [string] $Project = $env:COMPOSE_PROJECT_NAME,
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
# 🔴 이 배열이 «모든» docker compose 호출에 앞선다(D-18). 조회 한 곳만 고치면 그다음
#    cp·exec 가 같은 이유로 죽는다 — project 를 모르면 컨테이너를 고를 수 없다.
$compose = @('compose')
if ($Project) { $compose += @('-p', $Project) }

$running = docker @compose ps --status running --services
if ($running -notcontains $Service) {
  # 🔴 실패 문면이 «다음 수»를 들고 있어야 한다. 앞판은 project 미지정으로 못 본 경우에도
  #    「먼저 up -d 하십시오」라고만 말해, 스택이 이미 healthy 인 사람을 막다른 길로 보냈다.
  $where = if ($Project) { "project '$Project'" } else { "기본 project(이름 미지정)" }
  $msg = @("compose 서비스 '$Service' 를 $where 에서 찾지 못했습니다.")
  if (-not $Project) {
    $msg += "🔴 project 를 지정하지 않았습니다. 스택을 다른 이름으로 띄웠다면 이 조회는 그 스택을 «보지 못합니다»."
    $msg += "   지정 방법 ① `$env:COMPOSE_PROJECT_NAME='<project>'  ② -Project '<project>' 인자"
    # 지정 방법만 알려주고 이름을 안 알려주면 쓸 수가 없다 — 지금 떠 있는 후보를 함께 낸다.
    $ls = (docker compose ls --format json 2>$null)
    if ($LASTEXITCODE -eq 0 -and $ls) {
      try {
        $names = ($ls | ConvertFrom-Json) | ForEach-Object { $_.Name }
        if ($names) { $msg += "   지금 떠 있는 project: $($names -join ', ')" }
      } catch { }   # 형식이 바뀌어도 안내 자체는 살려 둔다
    }
  } else {
    $msg += "스택이 안 떠 있다면 먼저 'docker compose up -d' 를 실행하십시오."
  }
  throw ($msg -join [Environment]::NewLine)
}

Write-Host '== 2/3 적재 ==' -ForegroundColor Cyan
# 소스 끝의 '/.' = 「디렉터리 내용을」 복사. 대상이 이미 있어도 그 안에 중첩되지 않는다.
docker @compose cp "$generatedDir/." "${Service}:$containerDir/"
if ($LASTEXITCODE -ne 0) { throw "CSV 복사 실패 (exit $LASTEXITCODE)" }

docker @compose exec -T $Service psql -U $DbUser -d $DbName `
  -v ON_ERROR_STOP=1 -q -f "$containerDir/load.sql"
if ($LASTEXITCODE -ne 0) { throw "적재 실패 (exit $LASTEXITCODE)" }

docker @compose exec -T $Service psql -U $DbUser -d $DbName -c @'
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
    docker @compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "검증 실패: $name (exit $LASTEXITCODE)" }
}

Write-Host '== 완료 ==' -ForegroundColor Green

} finally { Pop-Location }
