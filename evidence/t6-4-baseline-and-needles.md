# T6-4 ⑥ 준비 — 기준선 「전」 50컷 + D-24 화면 needle · E1

오케 발주(09-03 14:26 방향 변경): #448 대상 ⑥ 전체는 **보류**(재설계 예정). 지금 남기는 것은
**재설계 뒤 「후」 열과 나란히 놓을 「전」 열**과, D-24 회부에서 화면 축으로 넘어온 **needle 2종**이다.

## §1 기준선 「전」 — 50컷 (5화면 × 5폭 × reduced on/off · **다크 1스킴**)

- 대상 = **내가 세운 로컬 재빌드본**(develop `e374e62` · 셸 3102 · `FKT_API_BASE=8010`) —
  오케 판정(14:29)대로 Production 은 옛 팔레트라 「전」의 주어가 갈린다.
- 그물 = `tests/web/t64_baseline_shots.mjs`(신설) · 산출 = `evidence/screens/t6-4-baseline/`
  (PNG 50 + `manifest-before.json`) · 총 3.1MB.
- 🔴 다크는 **강제**했다(`colorScheme:"dark"`). 헤드리스 기본값은 라이트라 그냥 찍으면
  「전」이 정본 §10(neutral dark 기본)과 다른 화면이 된다.
- 🔴 `reduced` 두 열을 함께 찍는다 — 모션이 걸린 화면은 «찍는 순간»에 따라 그림이 달라진다.

### 같이 잰 것 — 가로 스크롤(`scrollingElement.scrollWidth` vs `clientWidth`)

**50칸 중 12칸이 넘친다**(판정이 아니라 «전» 관측이다):

| 화면 | 폭 | scrollWidth/clientWidth |
|---|---|---|
| overview | 390 | **756/390**(reduced·motion 동일) |
| incident | 390 | **816/390** |
| evidence · work-order · compare | 390 | **560/390**(reduced) · **552/390**(motion) |
| incident | 768 | **816/768** |

- 390 은 5화면 **전부** 넘치고, 768 은 incident 만 넘친다. 1024·1280·1440 은 0건.
- 오케가 준 참고값(390 가로 스크롤 **756/390**)과 overview 열이 **일치**한다(교차 확인).

## §2 D-24 화면 needle 2종 — 그물 추가 + **실제 자극으로 확인**

- `tests/web/d23_screen_recheck.mjs` 에 `auth-header`(`X-FKT…`) · `token-word`(`[Tt]oken`) 추가.
  🔴 `\b` 를 쓰지 않는다 — 한글 조사 앞에서 경계가 어긋나면 「안 보인다」가 「없다」로 읽힌다.
- 🔴 **needle 을 늘렸으면 늘린 needle 이 무는지부터** — 대조군 주입 문면에 D-24 문면을 더했다.
  결과: 대조군에서 `exc-class`(`ConnectionRefusedError`) · `auth-header`(`X-FKT-Gateway-Token`) ·
  `token-word`(`Token`) **3종 전부 검출**. 새 needle 은 「한 번도 물어본 적 없는 눈」이 아니다.
- **실제 401 자극**(로컬 ai-api 8012 + 좌석 GW 8789 토큰 불일치 · 셸 3102 재빌드):
  - 서버 사유 = **「게이트웨이가 요청을 거부했습니다(HTTP 401)」** — #447(D-24 수리) 착지 확인.
    수리 전 문면(내가 09-03 14:0x 에 실측한 것) = 「게이트웨이 401 · X-FKT-Gateway-Token 가
    없거나 맞지 않는다」 → **헤더 이름이 사라졌다**.
  - 화면(overview · 배너 · run 타임라인) needle **0건** · 대조군 검출 · WS 소켓 1 · **프레임 32** ·
    console error 0 · GW 로그 `POST /synthesize` **401 · 토큰 불일치 · CLI spawn 0** → **구독 0**.

## 잰 것 · 안 잰 것

- **잰 것**(E1): 50컷 + 가로 스크롤 50칸 · needle 대조군 3종 · 401 화면 needle 6칸.
- **안 잰 것**: 대비 4.5:1 · Lighthouse LCP/CLS · 터치 타깃 ≥44 — ⑥ 전체 축이고 **「후」가 없으면
  비교가 성립하지 않아** 이번엔 안 열었다(전 열만 찍는 것은 가능하나, 발주가 보류된 축이다).
  라이트 스킴 열도 안 찍었다(정본 §10 = 다크 1스킴 · 오케 14:25).
- **자원**: 셸 3102 · ai-api 8012 · GW 8789 — **전부 내림**. 8787 no listener · 8010 health 200(무접촉).

## 🔴 내 계측기 자수 (2건)

1. **CRLF 를 못 봤다** — 병합된 `d23_screen_recheck.mjs` 는 CRLF 로 체크아웃되는데 `\n` 기준
   문자열로 앵커를 잡아 치환이 조용히 실패했다(assert 로 잡았다). 줄바꿈을 실측해 쓰는 방식으로 고쳤다.
2. **needle 을 먼저 붙이고 대조군을 나중에 늘렸다** — 순서가 반대였다면 「0건」을 한 번은
   근거 없이 적을 뻔했다. 붙인 그물은 같은 실행에서 물게 해야 한다.
