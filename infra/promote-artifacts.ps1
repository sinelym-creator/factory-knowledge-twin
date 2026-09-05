# production 승격 산출물 내보내기 — T7-42 §A-4·A-6.
#
#   pwsh -File infra/promote-artifacts.ps1 -Sha <main sha>              # 내보내기만
#   pwsh -File infra/promote-artifacts.ps1 -Sha <main sha> -Restart     # + 게이트웨이 재기동(배포 행위)
#   pwsh -File infra/promote-artifacts.ps1 -Sha <main sha> -MoveModels  # + 모델 캐시 1회 이전
#
# 🔴 **왜 있는가.** production 게이트웨이(:8787)와 배포 ai-api(:8010)가 «메인 체크아웃»을
#    직접 읽고 있었다 — 게이트웨이는 `system_prompt.txt` 를 호출마다(09-05 19:58 실측),
#    ai-api 는 `data/replay` 를 바인드로. 그래서 develop 병합 + `git merge --ff-only` 만으로
#    production 의 거동이 재기동 없이 바뀌었다. 이 스크립트는 그 결합을 끊는다:
#    production 은 **승격된 sha 의 산출물**만 읽고, 그 산출물은 리포 밖에 있다(D-13).
#
# 🔴 **워킹트리를 복사하지 않는다.** 워킹트리는 dirty 일 수 있고(지금도 그렇다 —
#    `skip-worktree` 로 되돌려 둔 프롬프트가 떠 있다), 그러면 「승격했다」와 「무엇을
#    승격했다」가 갈린다. 언제나 `git archive <sha>:` 로 **커밋된 바이트**를 낸다.

[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string] $Sha,

    # 산출물 뿌리 — 리포·`_wt/` 밖 고정 경로(D-13). 절대경로를 박지 않는다.
    [string] $Dest = (Join-Path $HOME '.fkt/prod'),

    # production 게이트웨이 재기동 = **배포 행위**다. 승격 허가 안에서만 준다.
    [switch] $Restart,

    # 모델 캐시 이전은 «옮기는» 일이라 되돌리기 어렵다 — 명시적으로 요구해야 한다.
    [switch] $MoveModels
)

$ErrorActionPreference = 'Stop'
$repo = (git -C (Split-Path -Parent $PSScriptRoot) rev-parse --show-toplevel)
if (-not $repo) { Write-Error '리포를 찾지 못했다'; exit 2 }

# 승격 대상 sha 를 «전체 sha»로 고정한다 — 짧은 sha 는 리포가 자라면 뜻이 바뀔 수 있다.
$full = (git -C $repo rev-parse --verify "$Sha^{commit}" 2>$null)
if (-not $full) { Write-Error "그런 커밋이 없다: $Sha"; exit 2 }

$gatewayFiles = @('gateway.py', 'system_prompt.txt', 'requirements.txt', 'run.ps1')
$gatewayDir   = Join-Path $Dest 'gateway'
$replayDir    = Join-Path $Dest 'data/replay'
$modelsDir    = Join-Path $Dest 'models'

function Export-Tree {
    <#
      `git archive <sha>:<디렉터리>` 를 tar 로 푼다.
      🔴 파이프를 **cmd 로** 돌리는 이유: PowerShell 파이프는 네이티브 출력을 문자열로
         디코드해 CRLF·인코딩을 바꾼다 — 승격 산출물이 커밋된 바이트와 달라지면
         「같은 sha 인데 해시가 다르다」가 되고, 그것을 잡으려고 만든 대조가 자기 때문에 운다.
    #>
    param([string] $TreeIsh, [string] $Into, [string[]] $Files)
    New-Item -ItemType Directory -Force -Path $Into | Out-Null
    $list = if ($Files) { ' ' + ($Files -join ' ') } else { '' }
    # 🔴 tar 에는 **슬래시 경로**를 준다. Windows 의 `\` 를 그대로 넘기면 bsdtar 가 그것을
    #    이스케이프로 읽어 「그런 디렉터리가 없다」로 죽는다(실측 20:28 · 첫 실행 실패).
    $intoFwd = ($Into -replace '\\', '/')
    $cmd  = "git -C `"$repo`" archive `"$TreeIsh`"$list | tar -x -C `"$intoFwd`""
    cmd.exe /c $cmd
    if ($LASTEXITCODE -ne 0) { Write-Error "내보내기 실패: $TreeIsh"; exit 3 }
}

function Assert-SameBytes {
    <#
      내보낸 파일이 **커밋된 blob 과 바이트로 같은가**.
      🔴 sha256 을 양쪽에서 다시 계산하지 않는다 — git 이 이미 내용 주소로 blob 을 부르고
         있으니 `hash-object`(파일) 와 `rev-parse`(트리) 를 맞대면 그 자체가 대조다.
         파일을 두 번 읽어 두 번 해시하면 「같은 계산을 두 번 한 것」이지 대조가 아니다.
    #>
    param([string] $RelPath, [string] $LocalFile)
    $want = (git -C $repo rev-parse "${full}:$RelPath" 2>$null)
    $got  = (git -C $repo hash-object -- "$LocalFile" 2>$null)
    if (-not $want -or -not $got) { return "blob 을 못 읽었다: $RelPath" }
    if ($want -ne $got) { return "바이트 불일치: $RelPath (커밋 $want ≠ 산출물 $got)" }
    return $null
}

Write-Host "승격 sha = $full" -ForegroundColor Cyan
Write-Host "산출물 뿌리 = $Dest"

# --- ① 게이트웨이 -----------------------------------------------------------------
Export-Tree -TreeIsh "${full}:services/synthesis-gateway" -Into $gatewayDir -Files $gatewayFiles

# --- ② replay 픽스처(A-6) ----------------------------------------------------------
# production ai-api 가 `<repo>/data/replay` 를 바인드하고 있던 자리. 같은 sha 에서 낸다.
Export-Tree -TreeIsh "${full}:data/replay" -Into $replayDir

# --- ③ 대조 ------------------------------------------------------------------------
$problems = @()
foreach ($f in $gatewayFiles) {
    $problems += Assert-SameBytes -RelPath "services/synthesis-gateway/$f" -LocalFile (Join-Path $gatewayDir $f)
}
# replay 는 파일 수가 유동적이라 트리 전체를 «건수»로도 센다 — 0건이면 내보내기가 빈 것이다.
$replayCount = @(Get-ChildItem -Path $replayDir -Recurse -File -ErrorAction SilentlyContinue).Count
if ($replayCount -eq 0) { $problems += 'replay 산출물이 0건이다(빈 결과는 통과가 아니다)' }
foreach ($rel in (git -C $repo ls-tree -r --name-only $full -- data/replay)) {
    $problems += Assert-SameBytes -RelPath $rel -LocalFile (Join-Path $Dest ($rel -replace '/', '\'))
}
$problems = @($problems | Where-Object { $_ })

# --- ④ 도장 -------------------------------------------------------------------------
# 🔴 같은 실행의 한 값으로 두 자리에 쓴다 — 두 파일이 서로 다른 sha 를 말할 수 없게.
$full | Set-Content -Path (Join-Path $Dest 'BUILD_SHA')      -Encoding utf8 -NoNewline
$full | Set-Content -Path (Join-Path $gatewayDir 'BUILD_SHA') -Encoding utf8 -NoNewline

# --- ⑤ 프롬프트 해시(무대 `/health` 의 promptSha256 과 맞대는 값) ----------------------
$promptFile = Join-Path $gatewayDir 'system_prompt.txt'
$promptSha  = (Get-FileHash -Algorithm SHA256 -LiteralPath $promptFile).Hash.ToLower().Substring(0, 12)

Write-Host ''
Write-Host "게이트웨이 = $gatewayDir  ($($gatewayFiles.Count) 파일)"
Write-Host "replay     = $replayDir  ($replayCount 파일)"
Write-Host "promptSha256[:12] = $promptSha   # `:8787 /health` 의 promptSha256 과 같아야 한다"

if ($problems.Count -gt 0) {
    Write-Host ''
    $problems | ForEach-Object { Write-Error $_ }
    exit 3
}
Write-Host '대조 = 전건 일치(커밋된 blob = 산출물 바이트)' -ForegroundColor Green

# --- ⑥ 모델 캐시 1회 이전(옵트인) -----------------------------------------------------
if ($MoveModels) {
    $source = Join-Path $repo '.volumes-deploy/models'
    if (-not (Test-Path -LiteralPath $source)) {
        Write-Host "모델 캐시 원본이 없다(이미 옮겼거나 애초에 없다): $source" -ForegroundColor DarkGray
    } elseif (Test-Path -LiteralPath $modelsDir) {
        Write-Host "이미 $modelsDir 가 있다 — 이전은 1회다. 건너뛴다." -ForegroundColor DarkGray
    } else {
        # 🔴 **살아 있는 마운트를 먼저 센다**(D-13 · 09-01 15:49 사고 · 09-05 22대 재발).
        #    `git status` 가 깨끗해도 그 디렉터리가 돌고 있는 컨테이너의 바인드 원본이면
        #    옮기는 순간 그 컨테이너의 바닥이 빠진다.
        $mounts = @(docker ps -a --format '{{.Names}}' 2>$null | ForEach-Object {
            $m = docker inspect $_ --format '{{range .Mounts}}{{.Source}};{{end}}' 2>$null
            if ($m -and ($m -replace '\\', '/') -like "*$(($source -replace '\\','/'))*") { $_ }
        })
        if ($mounts.Count -gt 0) {
            Write-Error "이전 거부 — 이 경로를 마운트한 컨테이너가 있다: $($mounts -join ', ') · 먼저 컨테이너를 재생성하라"
            exit 4
        }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $modelsDir) | Out-Null
        Move-Item -LiteralPath $source -Destination $modelsDir
        Write-Host "모델 캐시 이전 완료 → $modelsDir" -ForegroundColor Green
    }
}

# --- ⑦ 재기동(배포 행위 · 승격 허가 안에서만) -------------------------------------------
if ($Restart) {
    # 🔴 켜는 것은 **산출물의 run.ps1** 이다(리포의 것이 아니라). 리포 것으로 켜면 방금 끊은
    #    결합이 그 자리에서 되살아난다 — 프롬프트도 리포에서 읽게 된다.
    $switch = Join-Path $repo 'services/synthesis-gateway/switch.ps1'
    Write-Host 'production 게이트웨이를 내린다…' -ForegroundColor Yellow
    pwsh -NoProfile -File $switch off
    Start-Process -FilePath 'pwsh' -ArgumentList @(
        '-NoProfile', '-File', (Join-Path $gatewayDir 'run.ps1'),
        '-PromptFile', $promptFile
    ) -WindowStyle Hidden
    Write-Host "산출물 게이트웨이를 올렸다 — `:8787 /health` 의 promptPath 가 $gatewayDir 인지 확인하라" -ForegroundColor Green
}

exit 0
