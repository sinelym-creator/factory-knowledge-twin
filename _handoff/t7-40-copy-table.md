# T7-40 — 화면 문구 대조표 (센쿠2 43대 · 2026-09-04)

규칙(오케 17:11·17:19): 방문자에게 보이는 문자열 = 「~습니다/~하세요」체 · 반말·설계 노트체(«»·— 이유 서술)·내부 용어 금지 · 전문 용어는 쉬운 말로 · 값·`data-*`·`aria-*`·계측 심볼 불변.

| # | 파일:줄 | 전 | 후 | 용어 풀이 |
|---|---|---|---|---|
| 1 | `components/unavailable.tsx:58` | ? "서버가 «그런 자원이 없다»고 답했다." : "이 화면의 데이터를 지금 가져오지 못했다." | ? "요청한 항목을 찾을 수 없습니다." : "데이터를 불러오지 못했습니다." | — |
| 2 | `components/unavailable.tsx:67` | ? "«없다»와 «못 물어봤다»는 다른 사건이라 다른 문장으로 답한다 — 이 자리는 전자다." : "화면이 «비어 있는 것»이 아니라 «묻지 못한 것»이다 — 두 상태를 같은 모습으로 그리지 않으려고 이 자리를 둔다." | ? "주소를 확인하거나 목록으로 돌아가 주세요." : "잠시 후 다시 시도해 주세요. 화면이 비어 있는 것이 아니라 아직 데이터를 받지 못한 상태입니다." | — |
| 3 | `components/evidence/deep-link-notice.tsx:30` | 세션 안에서 열렸다 — 조사 화면으로 오갈 수 있다. | 이 조사에서 인용한 근거입니다. Overview 로 돌아갈 수 있습니다. | — |
| 4 | `components/evidence/deep-link-notice.tsx:58` | 🔗 <span className="text-ai">세션 없이 «열람만»</span> 열린 화면이다. | 🔗 <span className="text-ai">열람 전용</span>으로 열린 화면입니다. | — |
| 5 | `components/evidence/deep-link-notice.tsx:61` | 계약 v0.1.6 의 읽기 전용 예외 2라우트(<span className="id">GET /evidence/{"{id}"}</span> ·{" "} <span className="id">GET /documents/{"{docId}"}</span>)만 세션 없이 답한다. 조사 실행·작업지시 초안·승인 이력은 세션 «소유» 자원이라 이 화면에서는 열리지 않는다 — 비어 있는 것이 아니라 이 경로에 없는 것이다. | 근거와 문서는 세션 없이도 보실 수 있습니다. 조사 실행·작업지시 초안·승인 이력은 세션에 속한 자료라 이 화면에서는 열리지 않습니다. | 계약 v0 → (내부 문서 표기 · 삭제) |
| 6 | `components/evidence/deep-link-notice.tsx:66` | 링크에 <span className="id">?run={runId}</span> 이 붙어 있지만 무세션에서는 뜻이 없다 — run 은 발급 세션의 것이고, 남의 세션 자원은 존재조차 숨긴다(404). | 링크에 조사 번호가 붙어 있지만 이 화면에서는 조사 결과를 열 수 없습니다. 조사는 시작한 세션에서만 보실 수 있습니다. | 404 → (상태 코드 · 삭제) · run → 조사 |
| 7 | `components/evidence/cited-body.tsx:34` | 🔴 인용 좌표가 본문 범위 밖이다 — 강조를 그리지 않는다. | 인용 위치가 본문 범위를 벗어나 강조를 표시하지 않습니다. | — |
| 8 | `components/evidence/cited-body.tsx:49` | 인용 구간 지정 없음 — 문서 전문을 그대로 보여 준다. | 인용 구간이 지정되지 않아 문서 전문을 보여 드립니다. | — |
| 9 | `components/evidence/cited-body.tsx:71` | <span>— 원문에서 잘라 낸 구간이다(별도 인용문을 그리지 않는다).</span> | <span>원문 중 인용된 구간입니다.</span> | — |
| 10 | `app/evidence/[evidenceId]/page.tsx:72` | 이 404 는 두 가지를 함께 뜻한다 — 「그런 근거가 없다」 또는 「이 라우트가 다루지 않는 kind 다」. 계약 v0.1.1 이 정한 kind 는 <span className="id">doc-chunk</span> ·{" "} <span className="id">record</span> 뿐이라,{" "} <span className="id">graph-path</span> · <span className="id">sensor-series</span> 의 id 도 같은 코드로 답한다. 코드 분리는 계약 개정 사안이다(원장 Q-34). | 요청하신 근거를 찾을 수 없습니다. 주소가 정확한지 확인해 주시고, 조사 화면의 근거 목록에서 다시 열어 주세요. | 404 → (상태 코드 · 삭제) · chunk → 인용 구간 · kind → 종류 · 계약 v0 → (내부 문서 표기 · 삭제) · 원장 Q → (내부 문서 표기 · 삭제) |
| 11 | `app/evidence/[evidenceId]/page.tsx:194` | 🔴 <span className="id">{evidence.evidenceId}</span> 에서 documentId 를 갈라내지 못했다 — chunk id 조성(<span className="id">{"{documentId}@r{N}#{NNN}"}</span>)과 어긋난다. 문서를 추측해서 부르지 않는다. | <span className="id">{evidence.evidenceId}</span> 에서 원문 문서를 찾지 못했습니다. 근거 번호의 형식이 예상과 달라 원문을 함께 보여 드리지 못합니다. | chunk → 인용 구간 |
| 12 | `app/evidence/[evidenceId]/page.tsx:280` | 🔴 kind=record 인데 <span className="id">record</span> 가 비어 있다 — 계약 v0.1.1 형상과 어긋난다. | 이 근거의 내용을 받지 못했습니다. | kind → 종류 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 13 | `app/evidence/[evidenceId]/page.tsx:269` | — 이연(원장 Q-36). 계약에 revision 선택 축이 없고, 옛 revision 은 색인 chunk 가 0건이라 좌표로도 열리지 않는다(실측 <span className="id">400 highlight_not_found</span>). 계약 v0.2 + 색인 정책 재론에 결속. | 이전 판본은 아직 제공되지 않습니다. | chunk → 인용 구간 · revision → 판본 · 색인 → 검색 색인 · 원장 Q → (내부 문서 표기 · 삭제) |
| 14 | `app/evidence/[evidenceId]/page.tsx:299` | 🔴 이 근거에는 revision·색인 축이 «없다» — 화이트리스트 테이블을 직독하므로 「색인이 낡았다」는 개념이 성립하지 않는다(계약 v0.1.1). 그래서 신뢰 배지도 신선도를 주장하지 않는다. 인용 가능 여부는 <span className="id">approvalState</span>·유효기간이 아니라 이 레코드 자체가 SSOT 라는 사실이 답한다. | 이 근거는 대장에서 바로 읽어 온 값이라 판본·색인 신선도라는 개념이 없습니다. 그래서 신뢰 배지도 신선도를 표시하지 않습니다. | SSOT → 대장 · revision → 판본 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 15 | `app/evidence/[evidenceId]/page.tsx:314` | <p className="mt-2 text-body-c">이 자리는 T3-4다 — 조사가 실제로 지나간 경로 위에 선다.</p> | <p className="mt-2 text-body-c">조사가 지나간 그래프 경로를 보여 드리는 자리입니다.</p> | T3-4 → (내부 티켓 표기 · 삭제) |
| 16 | `app/evidence/[evidenceId]/page.tsx:317` | ▪ 출처는 <span className="id">GET /graph/paths?byRun={"{runId}"}</span> 하나뿐이다. 그 응답은 «조사가 밟은» 경로라, run 이 없으면 그릴 대상 자체가 없다. | ▪ 경로는 조사가 실제로 밟은 자리에서만 나옵니다. 조사 결과가 없으면 그릴 대상도 없습니다. | run → 조사 |
| 17 | `app/evidence/[evidenceId]/page.tsx:321` | ▪ 이 라우트는 읽기 예외 2라우트에 <span className="text-ink">들지 않는다</span> — run 은 세션 소유 자원이라 딥링크(무세션)에서는 열리지 않는다(계약 v0.1.6). {hasSession ? " 지금 세션은 있다." : " 지금 이 화면은 무세션이다."} | ▪ 조사 결과는 시작한 세션에서만 열리므로, 세션 없이 연 화면에서는 보이지 않습니다. {hasSession ? " 지금은 세션이 있습니다." : " 지금은 세션 없이 열린 화면입니다."} | run → 조사 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 18 | `app/evidence/[evidenceId]/page.tsx:325` | ▪ 재생(replay) run 은 경로 «원본»이 없어 <span className="id">501</span> 이다 — fixture 는 이벤트만 담는다(T2-4 판정 J-G). | ▪ 녹화 재생본에는 경로 원본이 담겨 있지 않아 이 자리는 비어 있습니다. | 501 → (상태 코드 · 삭제) · fixture → 녹화 자산 · run → 조사 |
| 19 | `app/documents/[docId]/page.tsx:55` | 🔴 P1 <span className="id">/documents</span> SSOT Registry(revision·hash·drift 목록)와 별개 — <span className="text-ink">단건 열람 전용</span> 화면이다. | <span className="text-ink">문서 한 건을 열람하는 화면</span>입니다. | SSOT → 대장 · revision → 판본 |
| 20 | `app/documents/[docId]/page.tsx:76` | 인용 강조 요청이 거절됐다 — 문서가 없는 것은 아니다. | 인용 구간을 표시하지 못했습니다. 문서는 정상적으로 열렸습니다. | — |
| 21 | `app/documents/[docId]/page.tsx:82` | ? "요청한 chunk 가 이 문서의 것이 아니다(형식 위반이거나 다른 문서)." : "이 문서의 chunk id 형식이지만 그 좌표가 실재하지 않는다 — 색인되지 않은 revision 이거나 범위 밖 index 다."}{" "} 강조를 조용히 버리고 문서만 보여 주면, 강조를 요청한 쪽은 왜 없는지 알 수 없다. | ? "요청하신 인용 구간이 이 문서의 것이 아닙니다." : "이 문서의 인용 구간이지만 해당 위치를 찾을 수 없습니다."}{" "} 문서 본문은 그대로 보여 드립니다. | chunk → 인용 구간 · revision → 판본 · 색인 → 검색 색인 |
| 22 | `components/tour/tour-steps.ts:112` | title: "알람은 «울린 행»의 값이 앵커다", | title: "알람은 울린 그 행의 값이 기준입니다", | — |
| 23 | `components/tour/tour-steps.ts:113` | body: "임계와 관측값이 나란히 있습니다. 기준은 센서의 임계표가 아니라 실제로 울린 그 알람 행의 값입니다 — 둘이 다를 수 있어서 화면은 울린 값을 씁니다.", | body: "임계와 관측값이 나란히 있습니다. 기준은 센서의 임계표가 아니라 실제로 울린 그 알람 행의 값입니다. 둘이 다를 수 있어서 화면은 울린 값을 씁니다.", | — |
| 24 | `components/tour/tour-steps.ts:140` | body: "화면의 모든 주장은 근거로 되돌아갈 수 있습니다. 근거 칩을 누르면 그 원본으로 갑니다 — 다음 스텝에서 직접 눌러 봅니다.", | body: "화면의 모든 주장은 근거로 되돌아갈 수 있습니다. 근거 칩을 누르면 그 원본으로 갑니다. 다음 걸음에서 직접 눌러 보세요.", | — |
| 25 | `components/tour/tour-steps.ts:169` | body: "조사 결과로 작업지시서 «초안»이 나옵니다. 초안은 사람이 승인해야 효력이 생깁니다 — 이 콘솔은 결정을 대신하지 않습니다.", | body: "조사 결과로 작업지시서 초안이 나옵니다. 초안은 사람이 승인해야 효력이 생깁니다. 이 콘솔은 결정을 대신하지 않습니다.", | — |
| 26 | `components/tour/tour-overlay.tsx:554` | 이 단계는 다른 화면에서 이어집니다 — 아래 버튼으로 이동하세요. | 이 단계는 다른 화면에서 이어집니다. 아래 버튼으로 이동해 주세요. | — |
| 27 | `components/tour/tour-overlay.tsx:559` | 이 화면에서 가리킬 자리를 찾지 못했습니다 — 데이터가 아직 오지 않았거나 이 상태에는 없는 요소입니다. 건너뛰고 계속할 수 있습니다. | 이 화면에서 가리킬 자리를 찾지 못했습니다. 데이터가 아직 오지 않았거나 지금 상태에는 없는 요소입니다. 건너뛰고 계속하실 수 있습니다. | — |
| 28 | `components/incident/run-panels.tsx:88` | ? "아직 계획이 오지 않았습니다 — 첫 이벤트를 기다리는 중입니다." : "이 조사의 단계를 받지 못했습니다 — 위의 사유를 보십시오." | ? "아직 계획이 오지 않았습니다. 첫 소식을 기다리는 중입니다." : "이 조사의 단계를 받지 못했습니다. 위의 안내를 확인해 주세요." | — |
| 29 | `components/incident/run-panels.tsx:131` | {s.state === "halted" && "중단됨 — 이 단계가 도는 중에 조사가 끝났습니다"} | {s.state === "halted" && "중단됨 · 이 단계가 진행되는 중에 조사가 끝났습니다"} | — |
| 30 | `components/incident/run-panels.tsx:268` | ? "조사가 아직 후보를 내지 않았습니다 — 종합 단계에서 옵니다." | ? "조사가 아직 후보를 내지 않았습니다. 종합 단계에서 나옵니다." | — |
| 31 | `components/incident/run-panels.tsx:270` | ? "조사가 중단되어 후보가 나오지 않았습니다 — 위의 사유를 보십시오." | ? "조사가 중단되어 후보가 나오지 않았습니다. 위의 안내를 확인해 주세요." | — |
| 32 | `components/incident/run-panels.tsx:383` | ? "아직 근거가 없습니다 — 조사가 진행되며 여기에 쌓입니다." | ? "아직 근거가 없습니다. 조사가 진행되면 여기에 쌓입니다." | — |
| 33 | `components/incident/run-console.tsx:567` | 실시간 스트림 대신 주기 조회로 진행 중입니다 — {POLL_INTERVAL_MS / 1000}초마다 서버에 | 실시간 연결 대신 주기 조회로 진행 중입니다. {POLL_INTERVAL_MS / 1000}초마다 서버에 | — |
| 34 | `components/incident/run-console.tsx:550` | 서버가 다시 응답합니다 — 이 화면은 정적 재생본이고, 되감은 자리는 그대로 남습니다. | 서버가 다시 응답합니다. 이 화면은 녹화 재생본이고, 되감은 자리는 그대로 남습니다. | 정적 재생본 → 녹화 재생본 |
| 35 | `components/incident/run-console.tsx:535` | 중지됨 — {state.stopNote} | 중지됨 · {state.stopNote} | — |
| 36 | `components/incident/run-console.tsx:511` | 🔴 조사가 중단됐습니다 — {state.failure.message} (<span className="id">{state.failure.code}</span>) | 조사가 중단됐습니다. {state.failure.message} (<span className="id">{state.failure.code}</span>) | — |
| 37 | `components/incident/run-console.tsx:303` | `서버가 조회 빈도를 제한했습니다 — 주기 조회를 멈춥니다${r.retryAfterSec !== undefined ? ` (${r.retryAfterSec}초 뒤 다시 열어 보세요)` : ""}.` | `서버가 조회 빈도를 제한해 주기 조회를 멈춥니다${r.retryAfterSec !== undefined ? ` (${r.retryAfterSec}초 뒤 다시 열어 보세요)` : ""}.` | — |
| 38 | `components/incident/run-console.tsx:304` | : `주기 조회가 실패했습니다 — ${r.why}`, | : `주기 조회가 실패했습니다. (${r.why})`, | — |
| 39 | `components/incident/run-console.tsx:378` | if (r.state !== "ok") setNote(`중지하지 못했습니다 — ${r.why}`); | if (r.state !== "ok") setNote(`중지하지 못했습니다. (${r.why})`); | — |
| 40 | `components/incident/run-console.tsx:610` | title="정적 재생본은 검색 전략 비교를 담지 않습니다 — 서버 계산이 필요합니다" | title="녹화 재생본에는 검색 전략 비교가 담겨 있지 않습니다. 서버 계산이 필요합니다" | 정적 재생본 → 녹화 재생본 |
| 41 | `components/incident/sensor-trend.tsx:71` | { key, why: "이 창은 Live 전용입니다 — 정적 재생본은 24h 창만 담습니다" } | { key, why: "이 구간은 실시간 조사에서만 볼 수 있습니다. 녹화 재생본은 24시간 구간만 담고 있습니다" } | Live → 실시간 · 정적 재생본 → 녹화 재생본 |
| 42 | `components/incident/sensor-trend.tsx:159` | ⚠ 알람 센서가 아니다 — 이 설비의 첫 센서다.{" "} | ⚠ 알람이 울린 센서가 아니라 이 설비의 첫 센서입니다.{" "} | — |
| 43 | `components/incident/sensor-trend.tsx:161` | ? "이 incident 에 연결된 알람이 없다." : `연결된 알람(${alarmIds.join(", ")})이 «활성» 목록에 없어 센서를 정본에서 특정하지 못했다.` | ? "이 상황에 연결된 알람이 없습니다." : `연결된 알람(${alarmIds.join(", ")})이 활성 목록에 없어 센서를 특정하지 못했습니다.` | incident → 상황 |
| 44 | `components/incident/synthesis-pending.tsx:65` | <span className="text-warn">— 예상({expectedSec}초)보다 오래 걸리고 있습니다</span> | <span className="text-warn">예상({expectedSec}초)보다 오래 걸리고 있습니다</span> | — |
| 45 | `components/compare/compare-panel.tsx:94` | 승인 질문 목록을 가져오지 못했습니다 — 목록 없이 임의 질문을 만들지 않습니다. | 승인된 질문 목록을 가져오지 못했습니다. 목록 없이 임의로 질문을 만들지 않습니다. | — |
| 46 | `components/compare/compare-panel.tsx:153` | 검색 엔진을 준비하는 중입니다 — 첫 실행은 임베딩 모델을 올리느라 오래 걸립니다(실측 30초+ · 이후 1초 미만). | 검색 엔진을 준비하는 중입니다. 첫 실행은 준비 시간이 필요해 30초 이상 걸릴 수 있고, 그 뒤에는 1초 안에 끝납니다. | — |
| 47 | `components/compare/compare-panel.tsx:158` | 비교하지 못했습니다 — {why} | 비교하지 못했습니다. ({why}) | — |
| 48 | `components/compare/compare-panel.tsx:206` | 🔴 이 수치는 이 실행 1회의 관측치입니다 — 정식 벤치마크(Target/Actual)는 Evaluation에서 냅니다. | 이 수치는 이번 실행 1회의 관측값입니다. 정식 성능 측정은 평가 화면에서 확인하실 수 있습니다. | — |
| 49 | `components/work-order/wo-screen.tsx:189` | 절차는 안전 조치의 «근거»라 편집할 수 없습니다. | 절차는 안전 조치의 근거이므로 편집할 수 없습니다. | — |
| 50 | `components/work-order/wo-screen.tsx:298` | <p className="text-foot text-muted">초안이 스스로 말하는 «빈 곳»</p> | <p className="text-foot text-muted">초안이 스스로 밝힌 빈 곳</p> | — |
| 51 | `components/work-order/wo-screen.tsx:334` | ? "종단 상태 — 편집할 수 없습니다." | ? "최종 상태라 편집할 수 없습니다." | — |
| 52 | `components/work-order/wo-screen.tsx:383` | 이 목록은 이 화면이 열려 있는 동안만 남습니다 — 새로고침하면 사라집니다(서버에 이력 조회 | 이 목록은 화면이 열려 있는 동안만 남습니다. 새로고침하면 사라집니다(서버에 이력 조회 | — |
| 53 | `components/static-visitor.tsx:56` | title={`정적 재생본 방문자 ${visitor.visitorId} — 서버 세션이 아닙니다. 이 브라우저에만 남습니다.`} | title={`녹화 재생본 방문자 ${visitor.visitorId} · 서버 세션이 아니라 이 브라우저에만 남습니다.`} | 정적 재생본 → 녹화 재생본 |
| 54 | `components/reset-button.tsx:36` | : `초기화하지 못했습니다 — 백엔드 미연결(${reply.why}).`, | : `초기화하지 못했습니다. 서버에 연결하지 못했습니다. (${reply.why})`, | — |
| 55 | `components/overview/sparkline.tsx:47` | — 추세 못 가져옴 | 추세를 가져오지 못했습니다 | — |
| 56 | `components/overview/start-investigation.tsx:109` | const after = retryAfterSec !== undefined ? ` — ${retryAfterSec}초 뒤에 다시 시도할 수 있습니다` : ""; | const after = retryAfterSec !== undefined ? ` ${retryAfterSec}초 뒤에 다시 시도할 수 있습니다.` : ""; | — |
| 57 | `components/live-status.tsx:369` | "Live AI 합성이 꺼져 있습니다(소유자 게이트웨이 미도달) — 조사·근거 수집은 그대로 실행되고, 원인 후보는 결정적 집계로 종합합니다. 화면 흐름은 동일합니다." | "실시간 AI 종합이 꺼져 있습니다. 조사와 근거 수집은 그대로 실행되고, 원인 후보는 집계로 종합합니다. 화면 흐름은 같습니다." | Live → 실시간 |
| 58 | `components/live-status.tsx:371` | ? `Live 상태를 확인하지 못했습니다(${visitorWhy(why)}). 백엔드가 아직 연결되지 않았습니다 — 오류가 아닙니다.` | ? `실시간 상태를 확인하지 못했습니다(${visitorWhy(why)}). 서버가 아직 연결되지 않았을 뿐 오류는 아닙니다.` | Live → 실시간 |
| 59 | `lib/run-events.ts:312` | if (code === 4404) return "서버가 이 조사를 찾지 못했습니다 — 다른 세션의 조사이거나 사라진 조사입니다."; | if (code === 4404) return "서버가 이 조사를 찾지 못했습니다. 다른 세션의 조사이거나 사라진 조사입니다."; | — |
| 60 | `lib/run-events.ts:316` | return `실시간 스트림이 연결되어 있지 않습니다 (코드 ${code}) — 서버가 사유를 남기지 못한 종료입니다(연결 실패·중간 절단이 모두 이 코드입니다). 아래는 서버에 다시 조회한 결과입니다.`; | return `실시간 연결이 끊어졌습니다 (코드 ${code}). 서버가 사유를 남기지 못한 종료입니다. 아래는 서버에 다시 조회한 결과입니다.`; | — |
| 61 | `components/incident/run-panels.tsx:88` | "아직 계획이 오지 않았습니다 — 첫 이벤트를 기다리는 중입니다." | "아직 계획이 오지 않았습니다. 첫 소식을 기다리는 중입니다." | — |
| 62 | `components/incident/run-panels.tsx:89` | "이 조사의 단계를 받지 못했습니다 — 위의 사유를 보십시오." | "이 조사의 단계를 받지 못했습니다. 위의 안내를 확인해 주세요." | — |
| 63 | `components/incident/run-console.tsx:535` | 중지됨 — {state.stopNote} | 중지됨 · {state.stopNote} | — |
| 64 | `components/incident/sensor-trend.tsx:161` | "이 incident 에 연결된 알람이 없다." | "이 상황에 연결된 알람이 없습니다." | incident → 상황 |
| 65 | `components/incident/sensor-trend.tsx:162` | `연결된 알람(${alarmIds.join(", ")})이 «활성» 목록에 없어 센서를 정본에서 특정하지 못했다.` | `연결된 알람(${alarmIds.join(", ")})이 활성 목록에 없어 어느 센서인지 특정하지 못했습니다.` | — |
| 66 | `components/compare/compare-panel.tsx:158` | 비교하지 못했습니다 — {why} | 비교하지 못했습니다. ({why}) | — |
| 67 | `components/app-shell.tsx:106` | {chipLabel(session)} | 내 세션 <span className="id">{chipLabel(session)}</span> | — |
| 68 | `components/app-shell.tsx:100` | ? "이 세션의 변경은 다른 방문자에게 보이지 않습니다" : "이 세션의 변경은 다른 방문자에게 보이지 않습니다 · 🔴 아직 백엔드에 등록되지 않은 임시 세션입니다" | ? `내 세션 ${chipLabel(session)} · 이 세션에서 바꾼 것은 다른 방문자에게 보이지 않습니다` : `내 세션 ${chipLabel(session)} · 이 세션에서 바꾼 것은 다른 방문자에게 보이지 않습니다 · 아직 백엔드에 등록되지 않은 임시 세션입니다` | — |
| 69 | `app/incidents/[incidentId]/page.tsx:175` | 이 화면은 아직 조사를 돌리지 않았습니다 — Overview의 「조사 시작」이 여기로 옵니다. | 이 화면은 아직 조사를 시작하지 않았습니다. Overview 의 「조사 시작」을 누르면 여기로 옵니다. | — |
| 70 | `app/incidents/[incidentId]/page.tsx:248` | Overview 의 「조사 시작」이 <span className="id">?run=</span> 을 달고 여기로 옵니다 — 그때 단계·근거·경과가 이 자리에 섭니다. | Overview 의 「조사 시작」을 누르면 여기로 옵니다. 그때 단계·근거·경과가 이 자리에 나타납니다. | run → 조사 |
| 71 | `components/compare/compare-panel.tsx:147` | 이 세션은 백엔드에 등록되지 않아 비교를 실행할 수 없습니다 — 본문 <span className="id">sessionId</span> 가 쿠키와 같아야 서버가 받습니다(계약 v0.1.6). | 이 세션은 서버에 등록되지 않아 비교를 실행할 수 없습니다. 화면을 새로고침해 다시 입장해 주세요. | sessionId → 세션 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 72 | `components/incident/run-panels.tsx:251` | live 응답을 근거 결속 가드가 전량 거부했습니다 — {synthesis.rejectedReason}. 아래 순위는 결정적 집계입니다. | AI 가 쓴 종합 문장이 근거를 인용하지 못해 전량 거부되었습니다. ({synthesis.rejectedReason}) 아래 순위는 집계로 낸 결과입니다. | live → 실시간 |
| 73 | `components/placeholder.tsx:43` | 지금 서 있는 것은 전역 셸(세션 격리 · 리셋 · Live 감지 · Replay fallback)과 라우트 골격이다. | 지금 준비된 것은 화면 뼈대입니다. 세션 분리·초기화·실시간 감지·재생 전환이 함께 서 있습니다. | Live → 실시간 |
| 74 | `components/tour/tour-steps.ts:104` | 알람 하나가 조사·근거·조치로 이어지는 흐름을 아홉 걸음으로 따라갑니다. 이 화면의 값은 전부 synthetic 데이터이고, 둘러보기는 녹화된 재생본으로만 돕니다. | 알람 하나가 조사·근거·조치로 이어지는 흐름을 아홉 걸음으로 따라갑니다. 이 화면의 값은 모두 시연용으로 만든 가상 데이터이고, 둘러보기는 녹화된 재생본으로만 진행됩니다. | synthetic → 가상 데이터 |
| 75 | `components/evidence/trust-header.tsx:96` | title="계약 v0.1.1 — record 는 SSOT 를 직독하는 근거라 색인 신선도라는 축 자체가 없다. stale=false 는 상수이지 «신선 실증»이 아니다." | title="이 근거는 대장에서 바로 읽어 온 값이라 색인이 낡았는지 따질 대상이 아닙니다." | SSOT → 대장 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 76 | `components/evidence/trust-header.tsx:98` | ─ 색인 축 없음 (SSOT 직독) | ─ 대장에서 바로 읽음 | SSOT → 대장 · 색인 → 검색 색인 |
| 77 | `components/evidence/trust-header.tsx:108` | title="색인이 현행 revision 과 어긋났거나(STALE), 온톨로지 버전을 확인하지 못했거나(ONTOLOGY_UNVERIFIED), 색인 빌드가 실패했다(BUILD_FAILED). 계약의 stale 은 boolean 1개라 «어느 쪽인지»는 말하지 못한다 — 6상태 노출은 Q-22(계약 v0.2 재론)." | title="검색 색인이 문서의 최신 판본을 아직 따라잡지 못했습니다. 원문은 정상이지만 검색 결과가 조금 늦을 수 있습니다." | STALE → 최신 아님 · revision → 판본 · 계약 v0 → (내부 문서 표기 · 삭제) |
| 78 | `components/evidence/trust-header.tsx:110` | ⚠ STALE INDEX | ⚠ 검색 색인이 최신이 아님 | STALE → 최신 아님 |
| 79 | `components/evidence/trust-header.tsx:119` | title="stale=false — 색인 신선도 뷰가 FRESH 를 «실증»했다. 계약의 보수 매핑상 FRESH 만 false 이므로(Q-22), 이 초록은 「모르는 값을 초록으로 흘린 것」이 아니다." | title="검색 색인이 문서의 최신 판본과 일치하는 것을 확인했습니다." | FRESH → 최신 |
| 80 | `components/evidence/trust-header.tsx:121` | ✓ 색인 최신 (FRESH 실증) | ✓ 검색 색인 최신 | FRESH → 최신 |
