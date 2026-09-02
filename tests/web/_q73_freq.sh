#!/usr/bin/env bash
# Q-73 2차 — 빈도·임계 조건. A열(발주 그대로) + B열(부하 실재).
#
# 🔴 A열은 2칸만 돌린다. playwright 는 테스트 수보다 많은 워커를 쓰지 않으므로
#    workers 8/4 를 줘도 «실제로 쓴 워커 수»는 2일 수 있다 — 그 값을 함께 찍어
#    손잡이가 살았는지 죽었는지를 표가 스스로 말하게 한다.
set -u
OUT="$1"
GREP_2='스파크라인이 «브라우저가 부른»|계약 밖 kind 는 404'
: > "$OUT"

run() { # $1=라벨 $2=워커 $3=grep 또는 파일들
  local label="$1" w="$2"; shift 2
  local t0 t1 log
  log="$(mktemp)"
  t0=$(date +%s)
  npx playwright test --timeout=120000 --workers="$w" "$@" > "$log" 2>&1
  local rc=$?
  t1=$(date +%s)
  local used pass fail
  used=$(grep -oE "using [0-9]+ worker" "$log" | head -1 | grep -oE "[0-9]+")
  pass=$(grep -cE "^\s+✓" "$log")
  fail=$(grep -cE "^\s+✘" "$log")
  echo "$label | 요청워커 $w | 실제워커 ${used:-?} | 통과 $pass | 빨강 $fail | rc $rc | $((t1-t0))s" >> "$OUT"
  if [ "$fail" -gt 0 ]; then
    echo "    🔴 빨강 시행 — 상세:" >> "$OUT"
    grep -E "^\s+✘|Test timeout|waiting until|Error:" "$log" | head -6 | sed 's/^/      /' >> "$OUT"
    cp "$log" "${OUT%.txt}-red-$label.log"
  fi
  rm -f "$log"
}

echo "== A열 — 축소(개정 발주 16:34) · 2칸 × workers 8·1 × 2회 = 4셀 (손잡이 사망 증명용)" >> "$OUT"
for w in 8 1; do
  for i in 1 2; do run "A-w${w}-#${i}" "$w" --grep "$GREP_2"; done
done

echo "" >> "$OUT"
echo "== B열 — 부하 실재(이웃과 함께 · t3-2 + t3-3 = 모집단 26칸) · workers 8 vs 2" >> "$OUT"
for w in 8 2; do
  for i in 1 2; do run "B-w${w}-#${i}" "$w" e2e/t3-2-screens.spec.ts e2e/t3-3-evidence.spec.ts; done
done
