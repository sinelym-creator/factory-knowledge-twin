#!/usr/bin/env bash
# D-80 가르는 시험 — 「`GET /runs/{id}` 404 는 프로브의 세션 불일치인가, 코드인가」(cap 0).
#
# 🔴 `app/routers/investigations.py:165` 의 `_run_or_404` 는 **「없다」·「끝났다」·「남의 것이다」를
#    같은 404 로 낸다**(계약 v0.1.6 존재 은닉). 그러니 404 하나로는 갈래를 못 가른다 —
#    **손잡이 하나(쿠키 항아리)만 다른 두 열**을 세워 그 404 의 주어를 묻는다.
#
# 열 A(자극) : 항아리 «하나»로 세션 발급 → run 생성 → 폴링까지 전부 같은 쿠키
# 열 B(대조군): run 은 A 와 같은 방식으로 만들고, **폴링마다 새 세션**을 발급해 그 쿠키로 조회
# 🔴 자극 열을 먼저 돌린다 — 대조군을 먼저 돌리면 세션·슬롯을 쥐어 초록을 만든다.
#
# usage: bash d80_session_jar_probe.sh [BASE] [OUTDIR]
set -u
BASE="${1:-http://127.0.0.1:8001}"
OUT="${2:-.}"
JAR_DIR="$(mktemp -d)"
trap 'rm -rf "$JAR_DIR"' EXIT

log() { printf '%s\n' "$*"; }
# 코드와 본문을 한 번에 — 본문 앞머리만 남긴다(비밀·장문 방지).
req() { # req METHOD PATH JAR [DATA]
  local m="$1" p="$2" jar="$3" data="${4:-}"
  if [ -n "$data" ]; then
    curl -s -o "$JAR_DIR/body" -w '%{http_code}' -X "$m" "$BASE$p" -b "$jar" -c "$jar" \
      -H 'content-type: application/json' -d "$data"
  else
    curl -s -o "$JAR_DIR/body" -w '%{http_code}' -X "$m" "$BASE$p" -b "$jar" -c "$jar"
  fi
}
body() { head -c 240 "$JAR_DIR/body"; }
jget() { python -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(d.get(sys.argv[2],''))" "$JAR_DIR/body" "$1" 2>/dev/null; }

log "== 열 A(자극) — 항아리 하나 =="
JAR_A="$JAR_DIR/a.jar"; : > "$JAR_A"
CODE=$(req POST /api/sessions "$JAR_A" '{}');           log "A1 POST /api/sessions            -> $CODE  $(body)"
SID=$(jget sessionId)
COOKIE_LINES=$(grep -c -v '^#' "$JAR_A" 2>/dev/null || echo 0)
log "A1 sessionId=$SID · 항아리 쿠키 줄 수=$COOKIE_LINES"
CODE=$(req GET /api/scenarios "$JAR_A");                log "A2 GET  /api/scenarios           -> $CODE"
SCEN=$(python -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(d[0]['scenarioId'] if d else '')" "$JAR_DIR/body")
[ -n "$SCEN" ] || { log "🔴 시나리오 목록을 못 읽었다 — 계측 실패다(색을 내지 않는다)"; exit 2; }
log "A2 scenarioId=$SCEN"
CODE=$(req POST "/api/scenarios/$SCEN/runs" "$JAR_A" "{\"sessionId\":\"$SID\",\"mode\":\"replay\"}")
log "A3 POST /api/scenarios/$SCEN/runs -> $CODE  $(body)"
RUN=$(jget runId)
log "A3 runId=$RUN"
log "A4 GET /api/runs/$RUN — 10초 폴링(같은 항아리)"
A_CODES=""
for i in $(seq 1 10); do
  CODE=$(req GET "/api/runs/$RUN" "$JAR_A")
  ST=$(jget status)
  A_CODES="$A_CODES $CODE/$ST"
  log "   t+${i}s -> $CODE status=$ST"
  sleep 1
done
CODE=$(req GET "/api/runs/$RUN/events" "$JAR_A")
EV=$(python -c "import json,sys;d=json.load(open(sys.argv[1],encoding='utf-8'));print(len(d) if isinstance(d,list) else 'not-a-list')" "$JAR_DIR/body")
log "A5 GET  /api/runs/$RUN/events -> $CODE  events=$EV"

log ""
log "== 열 B(대조군) — 폴링마다 «새 세션» =="
B_CODES=""
for i in $(seq 1 3); do
  JAR_B="$JAR_DIR/b$i.jar"; : > "$JAR_B"
  CODE=$(req POST /api/sessions "$JAR_B" '{}')
  BSID=$(jget sessionId)
  CODE2=$(req GET "/api/runs/$RUN" "$JAR_B")
  B_CODES="$B_CODES $CODE2"
  log "   B$i 새 세션 $BSID (발급 $CODE) 로 같은 run 조회 -> $CODE2  $(body)"
done

log ""
log "== 요약 =="
log "A(같은 항아리) 조회 코드: $A_CODES"
log "A events: $CODE / $EV"
log "B(요청마다 새 세션) 조회 코드:$B_CODES"
