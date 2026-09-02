# =============================================================================
# run-net-liveness.ps1 — 「그 그물은 실패를 «낼 수 있는가»」 실행 (검증 좌석 · T1-7 A단 ③)
#
#   pwsh tests/data/run-net-liveness.ps1        # 리포 루트에서 실행
#
# 전제: compose 스택 기동 + migrate.ps1 적용 + `pwsh data/seed.ps1` 적재 완료.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
# 🔴 이 표본은 «쓴다» — 검사 1건 = 트랜잭션 1개(BEGIN … ROLLBACK)라 되감기 후 잔여물 0이다.
#    마지막 L-0가 그 되감기를 실측한다. seed-integrity.ps1(읽기 전용)과 섞지 않는다.
#
# exit code: 0 = 그물 전건 생존 · 1 = 생존 실패 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service = 'postgres',
  # compose project 이름. 기본값 = 환경변수 COMPOSE_PROJECT_NAME(compose 자신이 읽는 값과 같다).
  # 🔴 D-18 잔여(2026-09-02 실측): 이 인자가 없던 판은 비기본 project 스택에서 exit 2 로 죽었다 —
  #    postgres 가 healthy 인데도 「기동 중이 아닙니다」였다. `docker compose` 는 project 를 안 주면
  #    기본 project 를 보기 때문이다. seed.ps1(#368)·migrate.ps1(#362)과 같은 수리.
  [string] $Project = $env:COMPOSE_PROJECT_NAME,
  [string] $DbUser  = $(if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'fkt' }),
  [string] $DbName  = $(if ($env:POSTGRES_DB)   { $env:POSTGRES_DB }   else { 'fkt' })
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# 🔴 이 배열이 «모든» docker compose 호출에 앞선다(D-18). 조회 한 곳만 고치면 그다음 exec 가
#    같은 이유로 죽는다 — project 를 모르면 컨테이너를 고를 수 없다.
$compose = @('compose')
if ($Project) { $compose += @('-p', $Project) }

$up = docker @compose ps --format '{{.Service}}' 2>$null
if ($up -notcontains $Service) {
  # 🔴 실패 문면이 «다음 수»를 들고 있어야 한다. 앞판은 project 미지정으로 못 본 경우에도
  #    「먼저 up -d 하십시오」라고만 말해, 스택이 이미 healthy 인 사람을 막다른 길로 보냈다.
  $where = if ($Project) { "project '$Project'" } else { "기본 project(이름 미지정)" }
  Write-Host "실행 오류: compose 서비스 '$Service' 를 $where 에서 찾지 못했습니다." -ForegroundColor Red
  if (-not $Project) {
    Write-Host "  🔴 project 를 지정하지 않았습니다. 스택을 다른 이름으로 띄웠다면 이 조회는 그 스택을 «보지 못합니다»." -ForegroundColor Red
    Write-Host "     지정 방법 ① `$env:COMPOSE_PROJECT_NAME='<project>'  ② -Project '<project>' 인자" -ForegroundColor Red
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

$sqlPath = Join-Path $PSScriptRoot 'net-liveness.sql'
if (-not (Test-Path $sqlPath)) { Write-Host "실행 오류: 표본 파일 없음 $sqlPath" -ForegroundColor Red; exit 2 }

$raw = Get-Content -Raw -Encoding UTF8 $sqlPath |
  docker @compose exec -T $Service psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1 -tA -F "`t" 2>&1
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

Write-Host '== 데이터 그물 생존 시험 — «위반을 주입하면 빨강이 나오는가» ==' -ForegroundColor Cyan
Write-Host "   서비스 $Service · db $DbName · 격리 = 트랜잭션 롤백(잔여물 0)" -ForegroundColor DarkGray
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
  Write-Host '  FAIL = 위반을 넣었는데 그물이 울지 않았다는 뜻이다 — 그 그물의 초록은 증거가 아니다.' -ForegroundColor DarkGray
}
exit $(if ($fail) { 1 } else { 0 })
