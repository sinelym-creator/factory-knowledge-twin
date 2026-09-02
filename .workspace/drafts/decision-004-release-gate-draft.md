---
asset_class: decision-draft
description: D-004 상신문 — §35.7 최종 관문 「Release 후보 — 축소 적용(v0.3)」 · T3-6 착지(#386) 수치 확정 · 폐하 상신 09-02 15:59 · 승인 원문·id 기입 뒤 docs/decisions/004 로 승격
status: submitted
size_limit: 3KB
---

# D-004(상신) — §35.7 최종 관문 = 「Release 후보 — 축소 적용(v0.3)」

- **결정 청구**: baseline v0.3(축소 적용 · #356) 기준으로 본 PoC 의 최종 상태를 **「Release 후보 — 축소 적용(v0.3)」** 로 확정하고 「Portfolio Release」 로는 판정하지 않는다(§35.7 10조건 중 미충족이 남아 있는 한 — 판정문 §4 · #357 · #386).
- **09-02 15:59 기준 §35.7 상태**(출처 = verdict §4 #386 갱신본 + 당일 PR · E1): **충족 3** = ⑤ Public Offline Fallback(외부 축 · #373 §9 Q-70 6/6 + Gate 6 ⓒ 정적 재생 공개 셸 완주 #386) · ⑨ License(#360 NOTICE·THIRD_PARTY · 트리 실재) · ⑩ README Claim-Evidence(성능 수치 0건 · 발췌 자동 대조 #387) · **부분 3** = ② GS E2E(공개 경로 replay 완주 #373 · 브라우저 E2E **97 통과 / 32 빨강 / 2 건너뜀 · #386** · §21 증거 ②③④ 5/5·7/7·16/16 · 잔여 = D-21 + Q-73 2칸) · ⑧ GitHub Actions(workflow 2본 · required 지정 = 리포 설정 · 폐하) · ① P0 기능(원장 **42/47** · Phase 0~4 전건 + T3-6 · 잔여 5 = T5-1~T5-5 = 이 관문과 함께 축소 적용 판정) · **미충족 4** = ③ Independent Verification(Gate 3 평가셋 없음 · Gate 7 14행 중 5행 공백) · ④ Security Gate(admin endpoint · malformed WS 2항 · ⑦⑧⑪ 측정 불가 · **D-21** — 오늘 착지 = D-19 #378·#379 · D-20 #379~#382 + 스캐너 0 종결 · 공개 경계 스캔 트리 위반 0 #377) · ⑥ Benchmark(T5-1 미착지) · ⑦ KPI·Latency(§35.2 전항 · §35.3 P50/P95 빈 칸 · 외부 vantage 조건부 실측만).
- **동반 결정 D-21**(공개 셸 WS 미개통 · P1 · 화면 「미연결」 정직 표기 · `onclose` 시 GET 폴링 fallback 기존재): 층 = **Vercel rewrite 쪽(E1 · #388 · 같은 쿠키·run 으로 Vercel 경유 opened=false / Funnel 직결 opened=true)**. 선택지 ⓐ 릴리스 노트 제약 명기 + «릴리스 뒤 개선»(**권고** · D-2 기능 동결 · 되돌림 0) ⓑ 클라이언트 WS 직결(센쿠2 견적 = CSP 는 이미 허용 · 진짜 장벽 = 세션 쿠키 `SameSite=Lax` → `None; Secure` 변경 필요 = 세션 축 전체 위험 · 60~120분 + 외부 재실측 + 재배포(D-14 소모)) ⓒ 폴링 대체(견적 후속).
- **범위(기각 포함)**: 「Portfolio Release」 선언 = 기각(미충족 4 잔존 · §0.2 측정-주장 경계) · 기한 연장으로 ③④⑥⑦ 채우기 = 기각(상한 09-04 · «릴리스 뒤 개선» 칸으로 이관 = Q-72 계보).
- **잰 범위**: 로컬 스택(#357) + 공개 배포 외부 vantage(#373 · #386 · Vercel 엣지 경유 · 워커 8/2) · 1대 노트북 · 재부팅 1회 · 실공장 데이터 0(synthetic 만). **안 잰 것** = P50/P95 · 실사용자 · 노트북 OFF 창 재현(오늘 창 없음) · 공개 릴레이를 지난 WS(#388 열 B 는 tailnet self).
- **승인 원문(무수정)**: 「」
- **해석(별줄)**: 
- **일시**: 상신 2026-09-02 15:59 KST(팀 채널 · 스자쿠 21대) · 승인 {hh:mm}
