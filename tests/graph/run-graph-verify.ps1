# =============================================================================
# run-graph-verify.ps1 — Neo4j 투영 «독립» 검증 + 재현성 + 대조군 (검증 좌석 · T1-5)
#
#   pwsh tests/graph/run-graph-verify.ps1              # 리포 루트에서
#   pwsh tests/graph/run-graph-verify.ps1 -SkipRebuild # 재현성 축을 건너뛴다
#
# 전제: compose 스택 기동 + migrate.ps1(001~006) + seed + 색인 1회 + projector venv.
# 🔴 컨테이너를 «이름»이 아니라 compose «서비스명»으로 지목한다(dev-environment §4.2).
#
# 🔴 세 축을 한 번에 낸다 — 셋이 다 있어야 초록이 증거가 된다:
#      ① 독립 검증  graph_verify.py  — 스펙·PG 카탈로그에서 «따로» 조립한 기대와 대조
#      ② 재현성      투영을 다시 만들어 내 덤프 지문이 같은가(파생물의 성질)
#      ③ 대조군      graph_drill.py  — 위반을 주입해 ①이 실제로 우는가
#    ②는 «파생 저장소»를 다시 만든다(PG 정본 무접촉). 원장 graph_build에는 실행 1행이 붙는다.
#
# exit: 0 = 세 축 전건 통과 · 1 = 실패 1건 이상 · 2 = 실행 오류
# =============================================================================
param(
  [string] $Service = 'postgres',
  # compose project 이름. 기본값 = 환경변수 COMPOSE_PROJECT_NAME(compose 자신이 읽는 값과 같다).
  # 🔴 D-18 잔여(2026-09-02 실측): 이 인자가 없던 판은 비기본 project 스택에서 exit 2 로 죽었다 —
  #    postgres 가 healthy 인데도 「기동 중이 아닙니다」였다. `docker compose` 는 project 를 안 주면
  #    기본 project 를 보기 때문이다. seed.ps1(#368)·migrate.ps1(#362)과 같은 수리.
  [string] $Project = $env:COMPOSE_PROJECT_NAME,
  [switch] $SkipRebuild
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

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$py = Join-Path $root 'services/projector/.venv/Scripts/python.exe'
if (-not (Test-Path $py)) {
  Write-Host "실행 오류: projector venv 없음 — python -m venv services/projector/.venv 후 requirements 설치" -ForegroundColor Red
  exit 2
}
$env:PYTHONUTF8 = '1'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("fkt-graph-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
$env:GRAPH_DUMP_DIR = $tmp

function Show([string]$title, [string[]]$lines, [int]$code) {
  Write-Host "== $title ==" -ForegroundColor Cyan
  foreach ($l in $lines) {
    $f = $l -split "`t"
    if ($f.Count -lt 5) { continue }
    $color = if ($f[4] -eq 'PASS') { 'DarkGreen' } elseif ($f[4] -eq 'INFO') { 'DarkYellow' } else { 'Red' }
    Write-Host ("  {0}  {1} {2}" -f $f[4], $f[0], $f[1]) -ForegroundColor $color
    if ($f[4] -notin @('PASS', 'INFO')) {
      Write-Host ("        기대 {0} / 실측 {1}" -f $f[2], $f[3]) -ForegroundColor Red
    }
  }
  $p = @($lines | Where-Object { ($_ -split "`t")[4] -eq 'PASS' }).Count
  Write-Host ("  결과: {0}/{1} PASS · exit {2}" -f $p, @($lines | Where-Object { $_ -match "`t" }).Count, $code) `
    -ForegroundColor $(if ($code -eq 0) { 'Green' } else { 'Red' })
  Write-Host ''
}

$fail = 0

# --- ① 독립 검증 --------------------------------------------------------------
$out1 = & $py (Join-Path $root 'tests/graph/graph_verify.py') 2>&1
$c1 = $LASTEXITCODE
Show '① 투영 독립 검증 — 스펙·PG 카탈로그에서 따로 조립한 기대와 대조' $out1 $c1
if ($c1 -ne 0) { $fail = 1 }
$shaA = (Get-FileHash (Join-Path $tmp 'graph-dump.txt') -Algorithm SHA256).Hash

# --- ② 재현성 ----------------------------------------------------------------
if (-not $SkipRebuild) {
  & $py (Join-Path $root 'services/projector/build_projection.py') | Out-Null
  if ($LASTEXITCODE -ne 0) { Write-Host '실행 오류: 재투영 실패' -ForegroundColor Red; exit 2 }
  & $py (Join-Path $root 'tests/graph/graph_verify.py') | Out-Null
  $shaB = (Get-FileHash (Join-Path $tmp 'graph-dump.txt') -Algorithm SHA256).Hash
  $ok = $shaA -eq $shaB
  Write-Host '== ② 재현성 — 삭제 후 재생성 덤프 지문 ==' -ForegroundColor Cyan
  Write-Host ("  {0}  R-01 재투영 전후 덤프 지문 동일 ({1}…)" -f $(if ($ok) { 'PASS' } else { 'FAIL' }), $shaA.Substring(0, 16)) `
    -ForegroundColor $(if ($ok) { 'DarkGreen' } else { 'Red' })
  if (-not $ok) { Write-Host ("        {0} ≠ {1}" -f $shaA, $shaB) -ForegroundColor Red; $fail = 1 }
  Write-Host ''
} else {
  Write-Host '== ② 재현성 — 건너뜀(-SkipRebuild) ==' -ForegroundColor DarkYellow
  Write-Host '   🔴 재현성을 안 재고 낸 초록은 「지금 맞다」까지만 말한다.' -ForegroundColor DarkGray
  Write-Host ''
}

# --- ③ 대조군 ----------------------------------------------------------------
$out3 = & $py (Join-Path $root 'tests/graph/graph_drill.py') 2>&1
$c3 = $LASTEXITCODE
Show '③ 대조군 — 위반을 주입하면 ①이 우는가(주입 후 전건 되감기)' $out3 $c3
if ($c3 -ne 0) { $fail = 1 }

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
if ($fail) {
  Write-Host '  FAIL을 두 방향으로 갈라 읽어라 — ①이 빨강이면 투영이 어긋난 것이고,' -ForegroundColor DarkGray
  Write-Host '  ③이 빨강이면 내 검사가 죽은 것이다. 후자를 놓치면 초록이 증거가 아니게 된다.' -ForegroundColor DarkGray
}
exit $fail
