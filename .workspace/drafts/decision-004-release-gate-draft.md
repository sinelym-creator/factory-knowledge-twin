---
asset_class: decision-draft
description: D-004 초안 — §35.7 최종 관문 상신문 「Release 후보 — 축소 적용(v0.3)」 · T3-6 본 판정 착지 뒤 수치 확정 → docs/decisions/004 로 승격(폐하 승인 원문·id 기입)
status: draft
size_limit: 2KB
---

# D-004(초안) — §35.7 최종 관문 = 「Release 후보 — 축소 적용(v0.3)」

- **결정 청구**: baseline v0.3(축소 적용 · #356) 기준으로 본 PoC 의 최종 상태를 **「Release 후보 — 축소 적용(v0.3)」** 로 확정하고 「Portfolio Release」 로는 판정하지 않는다(§35.7 10조건 중 미충족이 남아 있는 한 — 판정문 §4 · #357).
- **오늘(09-02) 기준 §35.7 상태**(출처 = verdict §4 + 당일 PR): 충족 = ⑤ Public Offline Fallback(외부 실측 #373 §9 · Q-70 ≤8s 6/6) · ⑨ License(#360 NOTICE·THIRD_PARTY) · ⑩ README Claim-Evidence(성능 수치 0건) · 부분 = ② GS E2E(공개 경로 replay 완주 #373 · 브라우저 E2E = **T3-6 결과 {PASS/FAIL/건너뜀 계수 · PR#}**) · ⑧ GitHub Actions(workflow 2본 · required 지정 = 리포 설정 · 폐하) · ① P0 기능(원장 {n}/47 · 오케 판정) · 미충족 = ③ Independent Verification(Gate 3 평가셋 없음 · Gate 7 14행 중 5행 공백) · ④ Security Gate(admin endpoint · malformed WS 2항 · ⑦⑧⑪ 측정 불가 — 오늘 착지 = D-19 게이트 확장 #378 · D-20 CGNAT 치환 #379·#380·{apps PR#} · 공개 경계 스캔 트리 위반 0 #377) · ⑥ Benchmark(T5-1 미착지) · ⑦ KPI·Latency(§35.2 전항 · §35.3 P50/P95 빈 칸).
- **범위(기각 포함)**: ⓑ 「Portfolio Release」 선언 = 기각(미충족 4 잔존 · §0.2 측정-주장 경계) · ⓒ 기한 연장으로 ③④⑥⑦ 채우기 = 기각(상한 09-04 · «릴리스 뒤 개선» 칸으로 이관 = Q-72 계보).
- **잰 범위**: 로컬 스택(#357) + 공개 배포 외부 vantage(#373 · T3-6) · 1대 노트북 · 재부팅 1회 · 실공장 데이터 0(synthetic 만).
- **승인 원문(무수정)**: 「」
- **해석(별줄)**: 
- **일시**: 2026-09-02 {hh:mm} KST
