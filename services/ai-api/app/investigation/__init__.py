"""investigation — LangGraph 조사 워크플로우와 그 표면 (T2-3).

🔴 이 패키지의 경계(티켓 T2-3 · baseline §15.2·§16.2·§34.6):

1. **공개 경로에 LLM 호출 0.** 다섯 단계 중 `synthesize` 조차 공개 경로에서는 «세는» 일만
   한다(`synthesize.py` 머리말). Claude 를 쓰는 축은 env 게이트 뒤에 있고, 그 env 가 없으면
   노드가 **등록조차 되지 않는다** — 공개 배포가 구독 프록시가 될 자리가 구조적으로 없다.
2. **텔레메트리 0.** langgraph 가 끌고 오는 langchain·langsmith 는 트레이싱이 켜지면 질의와
   인용문을 밖으로 보낸다. `guards.enforce_no_telemetry()` 가 **import 전에** 플래그를 false 로
   못박고 자격 증명을 프로세스 환경에서 지운다 — 확인이 아니라 강제다.
3. **SSOT 쓰기 0.** run·이벤트·WO 초안은 프로세스 안 세션 스코프에만 있다(`store.py`).
   run 은 공장의 사실이 아니라 콘솔의 상태다.
4. **사용자 입력 → SQL·Cypher 조립 0.** 질의문은 상수, 값은 파라미터 바인딩. 조사가 밟는
   앵커는 승인 시나리오 결속표(`binding.py`)에서만 온다.
5. **조용한 폴백 0.** 단계가 터지면 `run.failed` 가 **어느 단계였는지** 담아 나가고, 다른
   전략의 결과로 채우지 않는다. 0건도 「0건」이라고 센다(`structured.StructuredResult.summary`).
"""
