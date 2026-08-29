"""reading — 계약 v0.1 §근거·그래프의 «읽기» 표면 (T2-2).

`/scenarios` · `/evidence/{evidenceId}` · `/documents/{docId}` 세 라우트가 여기 있다.
retrieval(T2-1)이 **무엇을 인용할지 찾는» 쪽이라면, 이쪽은 «그 인용을 펴 보이는» 쪽이다 —
compare 가 낸 `evidenceId` 를 도로 받아 원문·좌표·신뢰 배지로 되돌린다.

🔴 응답 형상의 정본은 `packages/contracts/rest-api-v0.1.md` 의 **「v0.1.1 응답 형상 append」**
   절이다. 계약이 서술로만 두었던 자리를 오케가 성문했고, 구현은 그것을 따를 뿐 여기서
   필드를 새로 짓지 않는다(계약 = 오케 scope).

🔴 T2-1과 같은 경계: LLM 호출 0 · 사용자 입력 → SQL 문자열 조립 0(파라미터 바인딩과
   화이트리스트 상수만) · 계약 밖 신규 경로 0.
"""
