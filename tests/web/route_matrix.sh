#!/usr/bin/env bash
# P0 6라우트 · 세션 가드 HTTP 매트릭스 — 브라우저 없이 «한 홉»을 그대로 본다.
# 🔴 리다이렉트를 따라가지 않는다(-L 없음). 따라가면 최종 200만 남아 가드가 «있었는지»가 사라진다.
BASE="${1:-http://127.0.0.1:3101}"
ROUTES=(/ /overview /incidents/INC-2025-019 /evidence/EV-1 /work-orders/WO-1 /compare)
probe() { curl -s -o /dev/null --max-time 8 -w "%{http_code} %{redirect_url}" ${2:+-H "Cookie: $2"} "$BASE$1"; }
printf '%-34s %-26s %s\n' "경로" "쿠키 없음" "쿠키 있음(api:abcd1234)"
for r in "${ROUTES[@]}"; do
  printf '%-34s %-26s %s\n' "$r" "$(probe "$r")" "$(probe "$r" 'fkt_session=api%3Aabcd1234')"
done
echo
echo "-- 가드 matcher 제외 규칙 탐침 (proxy.ts config.matcher — 쿠키 «없이»)"
for r in /incidents/x.svg /evidence/x.svg /work-orders/x.svg /api /apiary; do
  printf '%-34s %s\n' "$r" "$(probe "$r")"
done
