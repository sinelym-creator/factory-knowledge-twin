# synthesis-gateway — Live 진단 합성 게이트웨이 (T6-1)

**운영자 PC 의 호스트 프로세스다.** 컨테이너가 아니고, `docker-compose.yml` 에 없고, 상시 뜨지
않는다. 실측·fixture 녹화 때만 켜고 끝나면 내린다.

ai-api 는 이 게이트웨이에 후보와 근거 발췌를 보내고, Claude Code CLI(구독 로그인)가 답한
순위·근거 문장을 돌려받는다. 자격 증명은 이 프로세스에도 컨테이너에도 없다 — 인증은
호스트에 이미 로그인된 CLI 의 것이다.

경계 정본 = `docs/baseline/poc-baseline-v0.2.md` §15.2 · 형상 정본 =
`packages/contracts/rest-api-v0.1.md` v0.1.11.

## 실행

```powershell
pwsh -File services/synthesis-gateway/run.ps1
# 확인: curl http://127.0.0.1:8787/health
```

ai-api 쪽에는 도달 주소를 **환경변수 하나로만** 준다.

```powershell
$env:FKT_LOCAL_SYNTHESIS_GATEWAY = 'http://127.0.0.1:8787'
```

이 값이 없으면 ai-api 는 live 축을 **import 조차 하지 않는다**(`resolve_synthesizer`).

| env | 기본값 | 무엇 |
|---|---|---|
| `SYNTHESIS_GATEWAY_PORT` | `8787` | 바인드 포트(127.0.0.1 고정) |
| `SYNTHESIS_TIMEOUT_MS` | `60000` | CLI 상한. ai-api 클라이언트는 여기에 5s 여유를 더해 기다린다 |
| `SYNTHESIS_CLI_BIN` | `claude` | Claude Code CLI 실행 파일 |
| `SYNTHESIS_MODEL` | (미지정) | 비우면 CLI 기본 모델. 아래 실측을 보고 비워 두었다 |

## 왜 이 형상인가 (실측 근거)

### 타임아웃 기본값이 60s 인 이유 — 「≤10s」는 이 호스트에서 달성 불가

계약의 잠정 목표는 10s 였다. 같은 형상(payload 2,854B)으로 재 봤다.

| 모델 | 벽시계 | CLI 내부 `duration_ms` | 응답 형식 |
|---|---|---|---|
| 기본(미지정) ×3 | 22.4 / 21.9 / 18.2 s | 13.6 / 11.9 / 10.9 s | 맨 JSON — 3/3 파싱 성공 |
| `--model haiku-4-5` ×2 | 36.8 / 55.6 s | 27.8 / 45.4 s | 코드 펜스로 감쌈 — 2/2 파싱 실패 |

- 최속 관측 18.2s. **내부 API 시간만 해도 10.9s 로 이미 10s 를 넘는다** — 프로세스를 상주시켜
  기동 오버헤드(≈7~10s)를 없애도 10s 안에 들지 못한다.
- 「더 작은 모델이 더 빠르다」는 직관은 **실측이 반증했다**. 그래서 `SYNTHESIS_MODEL` 을 비워
  둔다(CLI 기본). 지정은 할 수 있으나, 지정하기 전에 다시 재라.
- Target 10s / Actual 18.2~22.4s 는 baseline 개정 회부 사안이다(오케 판정 09-02 19:33).

### 「답한 모델」을 입력 토큰으로 고르는 이유

CLI 는 본 모델과 내부 보조 모델의 사용량을 **둘 다** 싣는다. 출력 토큰으로 고르면 보조가
이긴다 — 사소한 프롬프트에서 보조 72 tok 대 본 9 tok 을 실측했다. 프롬프트 전량을 받는 쪽이
본 모델이므로 **입력 토큰 합**으로 고른다.

### 프레임워크를 안 들이는 이유

라우트 2개 · 동시 1 · 컨테이너 밖 · 실측 때만 뜨는 프로세스다. 단일 스레드 `HTTPServer` 면
「동시 1」이 **서버 구조 자체로** 보장된다(세마포어를 따로 두지 않는다). 런타임 의존 0.

### CLI 를 빈 작업 디렉터리에서 돌리는 이유

리포 안에서 돌리면 프로젝트의 `CLAUDE.md` 가 프롬프트에 섞여 들어간다. 매 요청마다 빈 임시
디렉터리를 만들어 그 안에서 돌린다. 함께 쓰는 플래그:

- `--restricted` — Bash·PowerShell·REPL 등 실행계 도구와 WebFetch 제거 + 사용자/프로젝트
  settings 무시.
- `--strict-mcp-config` — MCP 서버 0.
- `--system-prompt-file` — 규칙(주어진 evidenceId 만 인용 · 근거 부족 = `insufficient` ·
  SQL/Cypher/코드 0 · JSON 만)을 파일로 고정.

## API

### `POST /synthesize`

```jsonc
// 요청
{
  "anchor": { "scenarioId": "GS-01", "alarmId": "AL-...", "equipmentId": "EQ-..." },
  "candidates": [
    { "failureModeId": "FM-...", "label": "...", "pattern": "...",
      "evidenceIds": ["..."], "history": ["..."], "citations": ["..."],
      "graphHops": 1, "sopIds": ["..."] }
  ],
  "evidenceText": { "<evidenceId>": "발췌..." }
}

// 200
{
  "ranking": ["FM-...", "..."],
  "rationale": { "FM-...": { "sentences": ["..."], "citedEvidenceIds": ["..."] } },
  "insufficient": false,
  "model": "claude-opus-5[1m]",   // 이벤트의 synthesis.model 로 그대로 간다
  "elapsedMs": 17930
}
```

비 200 은 전부 `{"rejectedReason": "..."}` 를 돌려주고, ai-api 는 이것을
`axis="live-rejected"` 로 **드러낸다**(조용한 폴백 0).

| 상태 | 언제 |
|---|---|
| 400 | 입력 형상 위반(candidates·evidenceText 비었음 등) |
| 413 | 본문 1MiB 초과 |
| 502 | CLI 종료코드 ≠ 0 · 봉투/응답 파싱 실패 · 모델 응답 형상 위반 · 인용 id 가 준 근거 밖 |
| 503 | CLI 를 찾지 못했다 |
| 504 | CLI 타임아웃 |

### `GET /health`

`{"ok": true, "timeoutMs": ..., "model": ...}`. 계약 표면이 아니라 운영자용 확인 창구다 —
합성 1회를 쓰지 않고 「떠 있는가」만 본다.

## 이 게이트웨이가 «판정»하지 않는 것

인용 id 가 **run 근거집합** 안인지는 ai-api 의 가드가 다시 본다
(`app/investigation/live_synthesis.apply_guard`). 여기서 보는 것은 「보낸 발췌 안인가」까지다 —
보낸 목록이 잘못 좁거나 넓으면 그 잘못은 ai-api 층에서 걸린다.
