#Requires -Version 7
<#
    neo4j-restore.ps1 — 논리 덤프(구조본) → 새 neo4j 로 재적재 (D-12 사고 복구 · 준비본)

    🔴 이 스크립트는 «구조본이 정본»이라는 전제로 돈다. 구조본은 원본 DB 가 살아 있는 동안
       Query API 로 뜬 것이고(노드 309 · 관계 448 · 제약 14), 리바이2 검증에서 참조 무결성
       0/448 · 교차 COUNT 14/14 로 통과했다.

    설계 세 줄:
      ① **빈 DB 에만 적재한다.** 노드가 하나라도 있으면 멈춘다(rc 2) — 덮어쓰기는 복구가 아니라 사고다.
      ② **elementId 는 재현할 수 없다.** 원본 id 를 임시 속성 `__rid` 로 실어 노드를 만들고,
         관계를 그 값으로 이어 붙인 뒤 «지운다». 남기면 원본에 없던 속성이 생긴다.
      ③ **끝나고 세어 본다.** 총 309/448 뿐 아니라 라벨 14종·관계 19종의 «분포»까지 대조한다.
         총계만 맞고 분포가 틀린 적재는 총계만 보는 검사에서 초록이 된다.

    사용:
      pwsh infra/neo4j-restore.ps1 -Container <neo4j 컨테이너> -DryRun    # 문장만 세어 본다
      pwsh infra/neo4j-restore.ps1 -Container <neo4j 컨테이너>            # 실제 적재
      # 구조본 위치가 다르면 -RescueDir <경로> — 기본값은 «리포의 형제» _rescue 다

    종료 코드: 0 = 적재 + 대조 일치 · 1 = 대조 불일치 · 2 = 입력·전제 불충족(적재 전 중단)
#>
[CmdletBinding()]
param(
    [string] $Container = 'fkt-senku2-t15-neo4j-1',
    # 🔴 **개인 절대경로를 기본값에 두지 않는다**(공개 경계 §15.2 · CI hygiene 게이트가 잡는다).
    #    구조본은 리포 «형제» 디렉토리에 둔다 — 리포 «안»에 두면 워크트리 정리에 함께 쓸려 가고,
    #    이 스크립트가 존재하는 이유가 바로 그 사고다.
    [string] $RescueDir = (Join-Path $PSScriptRoot '..\..\_rescue'),
    [string] $NodesFile = 'neo4j-nodes-1558.json',
    [string] $RelsFile = 'neo4j-rels-1558.json',
    [string] $SchemaFile = 'neo4j-schema-1559.json',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8

# 🔴 기대값 = 구조 시점의 실측이다. 여기 적힌 수와 다르면 «입력이 다른 것»이므로 적재 전에 멈춘다.
$ExpectedNodes = 309
$ExpectedRels = 448
$ExpectedLabels = 14
$ExpectedRelTypes = 19
$ExpectedConstraints = 14

function Read-Section {
    param([string]$Text, [string]$Name)
    # 🔴 schema 덤프는 «단일 JSON 이 아니다» — `--- NAME ---` 절 3개가 이어 붙어 있다.
    #    통째로 ConvertFrom-Json 하면 두 번째 절에서 죽는다(리바이2 지적).
    $m = [regex]::Match($Text, "(?ms)^--- $Name ---\r?\n(.*?)(?=^--- |\z)")
    if (-not $m.Success) { throw "schema 덤프에 «$Name» 절이 없다" }
    return $m.Groups[1].Value.Trim() | ConvertFrom-Json
}

function Invoke-Cypher {
    param([string]$Statement, [hashtable]$Parameters = @{})
    $payload = @{ statement = $Statement; parameters = $Parameters } | ConvertTo-Json -Depth 20 -Compress
    # 🔴 비밀번호는 «컨테이너 안»에서만 만져진다 — 인자로 넘기면 프로세스 목록·로그에 남는다.
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
    $sh = @'
P="${NEO4J_AUTH#*/}"
A=$(printf "neo4j:%s" "$P" | base64 | tr -d "\n")
echo "__PAYLOAD__" | base64 -d > /tmp/q.json
wget -qO- --header="Content-Type: application/json" --header="Accept: application/json" \
  --header="Authorization: Basic $A" --post-file=/tmp/q.json \
  http://localhost:7474/db/neo4j/query/v2
rm -f /tmp/q.json
'@ -replace '__PAYLOAD__', $b64
    $out = docker exec $Container sh -c $sh 2>&1
    if ($LASTEXITCODE -ne 0) { throw "cypher 실행 실패: $out" }
    return $out | ConvertFrom-Json
}

# ── 1. 입력 로드 + «입력 자체» 검증 ──────────────────────────────────────────
# 🔴 «파일이 없다»는 적재 실패가 아니라 **측정 불가**다 — 예외 스택이 아니라 rc 2 로 말한다.
#    기본 경로는 «리포의 형제» 를 가리키므로, 워크트리에서 돌리면 한 단계가 어긋난다(그때는 -RescueDir).
$missing = @($NodesFile, $RelsFile, $SchemaFile | Where-Object { -not (Test-Path (Join-Path $RescueDir $_)) })
if ($missing.Count -gt 0) {
    Write-Host "🔴 구조본을 못 찾았다 — RescueDir='$RescueDir' · 없는 파일: $($missing -join ', ')" -ForegroundColor Red
    Write-Host "   -RescueDir <경로> 로 구조본 위치를 지정하라(적재는 시작하지 않았다)."
    exit 2
}

$nodesRaw = Get-Content (Join-Path $RescueDir $NodesFile) -Raw | ConvertFrom-Json
$relsRaw = Get-Content (Join-Path $RescueDir $RelsFile) -Raw | ConvertFrom-Json
$schemaRaw = Get-Content (Join-Path $RescueDir $SchemaFile) -Raw

$nodes = $nodesRaw.data.values
$rels = $relsRaw.data.values
$constraints = (Read-Section -Text $schemaRaw -Name 'CONSTRAINTS').data.values

# 🔴 만드는 것은 **UNIQUENESS 제약뿐**이다(리바이2 판정): RANGE 인덱스 14는 그 제약이 «스스로»
#    만드는 뒷받침 인덱스이고, LOOKUP 2본은 DB 가 자동 생성한다 — 따로 만들면 이름이 충돌한다.
$uniqueness = @($constraints | Where-Object { $_[1] -eq 'UNIQUENESS' })

$labelGroups = $nodes | Group-Object { ($_[1] -join ':') }
$relGroups = $rels | Group-Object { $_[2] }

$fail = @()
if ($nodes.Count -ne $ExpectedNodes) { $fail += "노드 $($nodes.Count) ≠ $ExpectedNodes" }
if ($rels.Count -ne $ExpectedRels) { $fail += "관계 $($rels.Count) ≠ $ExpectedRels" }
if ($labelGroups.Count -ne $ExpectedLabels) { $fail += "라벨 $($labelGroups.Count)종 ≠ $ExpectedLabels" }
if ($relGroups.Count -ne $ExpectedRelTypes) { $fail += "관계타입 $($relGroups.Count)종 ≠ $ExpectedRelTypes" }
if ($uniqueness.Count -ne $ExpectedConstraints) { $fail += "UNIQUENESS $($uniqueness.Count) ≠ $ExpectedConstraints" }

Write-Host "== 입력 =="
Write-Host "  노드 $($nodes.Count) · 관계 $($rels.Count) · 라벨 $($labelGroups.Count)종 · 관계타입 $($relGroups.Count)종 · UNIQUENESS $($uniqueness.Count)"
if ($fail.Count -gt 0) {
    Write-Host "🔴 입력이 구조 시점과 다르다 — 적재하지 않는다:" -ForegroundColor Red
    $fail | ForEach-Object { Write-Host "   · $_" }
    exit 2
}

if ($DryRun) {
    Write-Host "== DryRun — 만들 문장 수 =="
    Write-Host "  제약 $($uniqueness.Count) · 노드 배치 $($labelGroups.Count)(라벨 그룹별 UNWIND 1문) · 관계 배치 $($relGroups.Count)(타입별 1문) · __rid 제거 1문"
    Write-Host "  라벨: $(($labelGroups | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' · ')"
    Write-Host "  관계: $(($relGroups | ForEach-Object { "$($_.Name)=$($_.Count)" }) -join ' · ')"
    exit 0
}

# ── 2. 대상이 «비어 있는가» ─────────────────────────────────────────────────
$before = (Invoke-Cypher -Statement 'MATCH (n) RETURN count(n) AS c').data.values[0][0]
if ([int]$before -ne 0) {
    Write-Host "🔴 대상 DB 에 이미 노드 $before 개가 있다 — 덮어쓰지 않는다(사람이 판단할 자리)." -ForegroundColor Red
    exit 2
}

# ── 3. 제약(UNIQUENESS 만) ──────────────────────────────────────────────────
Write-Host "== 제약 =="
foreach ($c in $uniqueness) {
    $name = $c[0]; $label = $c[2][0]; $prop = $c[3][0]
    Invoke-Cypher -Statement "CREATE CONSTRAINT ``$name`` IF NOT EXISTS FOR (n:``$label``) REQUIRE n.``$prop`` IS UNIQUE" | Out-Null
}
Write-Host "  $($uniqueness.Count)종 생성"

# ── 4. 노드 — 라벨 그룹마다 한 문장 ─────────────────────────────────────────
Write-Host "== 노드 =="
foreach ($g in $labelGroups) {
    $labels = ($g.Name -split ':' | ForEach-Object { "``$_``" }) -join ':'
    $rows = @($g.Group | ForEach-Object { @{ id = $_[0]; props = $_[2] } })
    Invoke-Cypher -Statement "UNWIND `$rows AS r CREATE (n:$labels) SET n = r.props, n.__rid = r.id" -Parameters @{ rows = $rows } | Out-Null
    Write-Host "  $($g.Name) $($g.Count)"
}

# ── 5. 관계 — 타입마다 한 문장(타입은 파라미터가 될 수 없다) ────────────────
Write-Host "== 관계 =="
foreach ($g in $relGroups) {
    $type = $g.Name
    $rows = @($g.Group | ForEach-Object { @{ from = $_[0]; to = $_[1]; props = $_[3] } })
    $stmt = "UNWIND `$rows AS r MATCH (a {__rid: r.from}), (b {__rid: r.to}) CREATE (a)-[x:``$type``]->(b) SET x = r.props"
    Invoke-Cypher -Statement $stmt -Parameters @{ rows = $rows } | Out-Null
    Write-Host "  $type $($g.Count)"
}

# ── 6. 임시 키 제거 — 원본에 없던 속성을 남기지 않는다 ──────────────────────
Invoke-Cypher -Statement 'MATCH (n) WHERE n.__rid IS NOT NULL REMOVE n.__rid' | Out-Null

# ── 7. 자기 검증 — 총계 «와» 분포 ───────────────────────────────────────────
Write-Host "== 대조 =="
$afterNodes = [int](Invoke-Cypher -Statement 'MATCH (n) RETURN count(n) AS c').data.values[0][0]
$afterRels = [int](Invoke-Cypher -Statement 'MATCH ()-[r]->() RETURN count(r) AS c').data.values[0][0]
$afterLabels = (Invoke-Cypher -Statement 'MATCH (n) UNWIND labels(n) AS l RETURN l, count(*) AS c').data.values
$afterTypes = (Invoke-Cypher -Statement 'MATCH ()-[r]->() RETURN type(r) AS t, count(*) AS c').data.values
$leftover = [int](Invoke-Cypher -Statement 'MATCH (n) WHERE n.__rid IS NOT NULL RETURN count(n) AS c').data.values[0][0]

$mismatch = @()
if ($afterNodes -ne $ExpectedNodes) { $mismatch += "노드 $afterNodes ≠ $ExpectedNodes" }
if ($afterRels -ne $ExpectedRels) { $mismatch += "관계 $afterRels ≠ $ExpectedRels" }
if ($leftover -ne 0) { $mismatch += "__rid 잔여 $leftover(기대 0)" }

$wantLabels = @{}; foreach ($g in $labelGroups) { $wantLabels[$g.Name] = $g.Count }
foreach ($row in $afterLabels) {
    if (-not $wantLabels.ContainsKey($row[0])) { $mismatch += "없어야 할 라벨 $($row[0])"; continue }
    if ([int]$row[1] -ne $wantLabels[$row[0]]) { $mismatch += "라벨 $($row[0]) $($row[1]) ≠ $($wantLabels[$row[0]])" }
    $wantLabels.Remove($row[0])
}
foreach ($k in $wantLabels.Keys) { $mismatch += "적재 안 된 라벨 $k" }

$wantTypes = @{}; foreach ($g in $relGroups) { $wantTypes[$g.Name] = $g.Count }
foreach ($row in $afterTypes) {
    if (-not $wantTypes.ContainsKey($row[0])) { $mismatch += "없어야 할 관계 $($row[0])"; continue }
    if ([int]$row[1] -ne $wantTypes[$row[0]]) { $mismatch += "관계 $($row[0]) $($row[1]) ≠ $($wantTypes[$row[0]])" }
    $wantTypes.Remove($row[0])
}
foreach ($k in $wantTypes.Keys) { $mismatch += "적재 안 된 관계 $k" }

Write-Host "  노드 $afterNodes/$ExpectedNodes · 관계 $afterRels/$ExpectedRels · 라벨 $($afterLabels.Count)종 · 관계타입 $($afterTypes.Count)종 · __rid 잔여 $leftover"
if ($mismatch.Count -gt 0) {
    Write-Host 'VERDICT: FAIL' -ForegroundColor Red
    $mismatch | ForEach-Object { Write-Host "   · $_" }
    exit 1
}
Write-Host 'VERDICT: PASS — 구조본과 라벨·관계 분포까지 일치' -ForegroundColor Green
exit 0
