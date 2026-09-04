#!/usr/bin/env bash
# T7-24 · X-18 — 「시드·마이그레이션을 두 번 실행하면 두 번째가 안전하게 아무 일도 안 하는가」
# 리바이2 39대. 정본 = docs/plan/test-plan-v1.md §6 X-18.
#
# 🔴 판정선은 「오류가 안 났다」가 아니라 **「상태가 한 번만 바뀌었다」를 «수»로 보인다**(판정선 2 ①).
#    그래서 이 스크립트가 내는 값은 rc 가 아니라 **DB 지문 3종**이다:
#      ① 표 수  ② 총 행수  ③ 표별 행수의 sha256(어느 표가 몇 줄인지까지 담는 지문)
#
# 🔴 **빨강 확인이 먼저다.** 「두 번 돌려서 같다」는 «아무것도 안 세는 자»로도 참이다.
#    그래서 시드 «전»에 일부러 행을 지워 지문이 «움직이는지» 확인한다. 안 움직이면 exit 2.
#    지운 것은 시드가 되돌린다 — 이 스크립트가 자기 자극을 스스로 복구한다.
#
# 🔴 대상은 **내 컨테이너만**(`fkt-levi2-*`). 센쿠2 스택·배포는 건드리지 않는다.
#
# 사용: bash tests/ops/t724x_seed_twice.sh [컨테이너] [compose project]
set -uo pipefail
PG="${1:-fkt-levi2-postgres-1}"
PROJECT="${2:-fkt-levi2}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PERTURB_TABLE="${PERTURB_TABLE:-alarm}"

q() { docker exec "$PG" psql -U fkt -d fkt -tAc "$1" 2>&1; }

fingerprint() {
  local tables total per
  tables=$(q "select count(*) from information_schema.tables where table_schema='public';")
  per=$(q "select string_agg(t||':'||n, ',' order by t) from (
             select c.relname as t, c.reltuples::bigint as n
             from pg_class c join pg_namespace ns on ns.oid=c.relnamespace
             where ns.nspname='public' and c.relkind='r') s;")
  # reltuples 는 통계라 ANALYZE 없이는 늙는다 — 실제 행수를 세서 쓴다.
  per=$(q "select string_agg(format('%s:%s', table_name, (xpath('/row/c/text()',
             query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text::bigint), ',' order by table_name)
           from information_schema.tables where table_schema='public' and table_type='BASE TABLE';")
  total=$(echo "$per" | tr ',' '\n' | awk -F: '{s+=$2} END {print s+0}')
  echo "$tables|$total|$(printf '%s' "$per" | sha256sum | cut -c1-16)"
}

echo "=== X-18 시드 2회 · 대상 컨테이너=$PG · project=$PROJECT ==="
S0=$(fingerprint); echo "snap0 (자극 전)          표|행|지문 = $S0"

# ── 🔴 빨강 확인 = 지문이 «움직이는가» ───────────────────────────────────────
DEL=$(q "delete from public.${PERTURB_TABLE} where ctid in (select ctid from public.${PERTURB_TABLE} limit 1) returning 1;" | grep -c 1)
SP=$(fingerprint); echo "snapP (행 ${DEL}개 지움)    표|행|지문 = $SP"
if [ "$S0" = "$SP" ]; then
  echo "🔴 빨강 확인 실패 — 행을 지웠는데 지문이 안 움직였다. 이 계측기로는 멱등을 판정할 수 없다."
  exit 2
fi
echo "빨강 확인: ✓ 지문이 움직인다(지운 뒤 달라짐)"

# ── 자극: 시드 1회차 · 2회차 ────────────────────────────────────────────────
run_seed() {
  local tag="$1" t0 rc
  t0=$(date +%s)
  pwsh -NoProfile -File "$REPO/data/seed.ps1" -Project "$PROJECT" > "/tmp/t724x-seed-$tag.log" 2>&1
  rc=$?   # 🔴 파이프 뒤 rc 금지 — 리다이렉트로 받고 직접 읽는다
  echo "시드 $tag: rc=$rc · $(( $(date +%s) - t0 ))s · 로그 /tmp/t724x-seed-$tag.log"
  return $rc
}
run_seed 1; RC1=$?
S1=$(fingerprint); echo "snap1 (시드 1회차 뒤)     표|행|지문 = $S1"
run_seed 2; RC2=$?
S2=$(fingerprint); echo "snap2 (시드 2회차 뒤)     표|행|지문 = $S2"

echo
echo "복원됨(snapP≠snap1, snap1=snap0): $([ "$S1" != "$SP" ] && [ "$S1" = "$S0" ] && echo 예 || echo "아니오 — snap0=$S0 / snap1=$S1")"
echo "멱등(snap1=snap2): $([ "$S1" = "$S2" ] && echo 예 || echo 아니오)"
if [ "$S1" = "$S2" ] && [ $RC1 -eq 0 ] && [ $RC2 -eq 0 ]; then
  echo "[X-18] 판정: PASS — 두 번째 실행이 상태를 바꾸지 않았다(지문 동일 · rc 0)"
else
  echo "[X-18] 판정: FAIL — rc1=$RC1 rc2=$RC2 · snap1=$S1 snap2=$S2"
fi
