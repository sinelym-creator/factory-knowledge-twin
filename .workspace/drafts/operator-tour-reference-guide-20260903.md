# 투어 참고 자료 — 「문제 될 만한 것」 해결 가이드

> **작성** 2026-09-03 · **입력** `tour-reference-boundaries.md`(스자쿠 30대, 21:19)
> **성격** 해결 방안 조사 + 실행 가이드. 🔴 **법률 자문이 아닙니다.** 라이선스·특허 관련 항목은 「공개 자료에서 확인한 것」과 「의견」을 구분해 적었습니다.
> **범위** 원문 §5 「확인하지 못한 것」 5건을 먼저 메우고(§1), 이어서 §3 규율을 **재현 가능한 절차**로 바꾸고(§2), §4 제품 쪽 위험 4건의 **구체적 해결 방안**을 제시합니다(§3~§5).

---

## 0. 결론 먼저

| 원문의 미확인 항목 | 조사 결과 | 남은 조치 |
|---|---|---|
| Reactour 라이선스 | 🟢 **MIT** 확인 | 없음 |
| tour-kit · UserTourKit | 🟢 **같은 제품**(`@tour-kit/*`, usertourkit.com). 코어 3개 패키지 **MIT**, 나머지는 **상용(proprietary)** | 상용 패키지 소스는 열어보지 않기 |
| react-driver | 🟡 이름이 모호 — `driver.jsx`(MIT)로 추정 | 정확한 URL 확인 필요 |
| Guide.js | 🔴 **미해결** — 403이고 이름만으로는 특정 불가. 후보 중 **GuideChimp는 EUPL-1.2/상용 이중 라이선스**라 permissive가 아님 | 정확한 URL 받아서 재확인 |
| UserTourKit 이용약관 | 🟡 **usertour.io(다른 회사)와 혼동 주의.** usertourkit.com 약관은 별도 확인 못 함. 다만 코어가 MIT라 **소스 열람 자체는 약관 문제 아님** | 상용 패키지 데모 화면 베끼지 않기(기존 방침으로 충분) |
| 특허 | 🟡 확인 불가(원문과 동일). 포커스 트랩·오토 플립은 **WAI-ARIA 권고와 Floating UI 등 공개 구현에 널리 존재**하는 관행 | 사업화 전 변리사 1회 상담 권고(§6) |

**결론은 원문과 같습니다: 「배워서 우리 코드로 짜는 것」은 안전하고, 진짜 일은 제품 쪽(§3~§5)에 있습니다.** 다만 「안전하다」를 **말로 하지 않고 절차와 측정으로 증명**하도록 바꾸는 것이 이 문서의 목적입니다.

---

## 1. 미확인 5건 — 조사 결과

### 1.1 라이선스 확인표 (갱신)

| 사이트 | 라이선스 | 확인 근거 | 비고 |
|---|---|---|---|
| driver.js | MIT | 공식 랜딩 + npm | 원문 확인 완료 |
| react-joyride | MIT | GitHub README | 원문 확인 완료 |
| react-guided-journey | MIT | GitHub README | 원문 확인 완료 |
| **Reactour** | **MIT** | GitHub README(「MIT © Lionel Tzatzkin」), npm `@reactour/*` | 🟢 신규 확인 |
| **tour-kit = UserTourKit** | **이중 라이선스** | GitHub `domidex01/tour-kit` README | MIT: `@tour-kit/core`, `@tour-kit/react`, `@tour-kit/hints` / 상용: `adoption`, `ai`, `analytics`, `announcements`, `checklists`, `license`, `media`, `scheduling`, `surveys` |
| **react-driver** | MIT(추정) | npm `driver.jsx` 키워드에 `react-driver` 포함 | 🟡 다른 패키지일 수 있음 |
| **Guide.js** | 미확인 | 403 | 🔴 §1.3 참조 |

### 1.2 tour-kit / UserTourKit 정리 — 원문의 오해 하나

원문은 tour-kit과 UserTourKit을 별개로, UserTourKit을 「상용 서비스」로 적었습니다. 조사 결과:

- **동일 제품**입니다. npm 패키지명은 `@tour-kit/react`, 마케팅 사이트가 `usertourkit.com`.
- **코어는 MIT**이고 Pro 기능만 상용입니다. 즉 「상용 서비스 UI를 참고한다」는 우려는 코어 범위에서는 해당 없습니다.
- 주의할 점은 하나: **상용 패키지(체크리스트·설문·공지 등)의 데모 화면이나 코드를 참고하지 않는 것.** 우리 투어는 코어 범위(tour·hint)만 겹치므로 자연스럽게 지켜집니다.
- 🔴 **usertour.io(Usertour Inc.)는 완전히 다른 회사**입니다. 검색하면 이 회사 약관이 먼저 나오므로 혼동하지 마십시오.

### 1.3 Guide.js — 특정 필요

「Guide.js」라는 이름의 라이브러리가 여러 개라 URL 없이는 판정할 수 없습니다. 후보와 라이선스:

| 후보 | 라이선스 | 판정 |
|---|---|---|
| GuideChimp (Labs64) | **EUPL-1.2 또는 상용** | 🔴 permissive 아님. 코드를 가져오면 안 되는 건 물론이고, **구조를 깊이 참고하는 것도 피하는 게 낫습니다** |
| tourguide.js (LikaloLLC) | 확인 필요 | — |
| @sjmc11/tourguidejs | 확인 필요 | — |
| guides.js (jQuery 플러그인) | 확인 필요 | 구식, 참고 가치 낮음 |

**조치:** 원래 열려던 URL을 알려주시면 재확인합니다. 403이 난 사이트라면 그 자체로 「우리가 정식으로 볼 수 없는 자료」이니 **참고 목록에서 빼는 것**이 가장 간단한 해결입니다.

### 1.4 특허 — 소견 (E3, 확인 아님)

- 우리가 쓰는 기법(포커스 트랩, 뷰포트 충돌 시 반대편 배치, 스포트라이트 여백 옵션)은 **WAI-ARIA Authoring Practices의 Dialog 패턴**, **Floating UI의 `flip` 미들웨어**, 수십 개 MIT 라이브러리에 동일하게 존재합니다. 선행 기술이 이렇게 많은 영역은 특허 청구 자체가 어렵습니다.
- 그럼에도 **「위험이 낮다」는 개발자 의견이지 법적 확인이 아닙니다.** 자세한 건 §6.

---

## 2. 「배움」→「이식」 미끄러짐 방지 — 클린룸 절차

원문 §3의 규율 5개는 옳지만 **사람이 기억해서 지키는 형태**입니다. 이를 **절차와 산출물**로 바꾸면 나중에 「우리가 안 베꼈다」를 증명할 수 있습니다. 이것이 소프트웨어 업계에서 쓰는 **클린룸(clean-room) 방식**의 축소판입니다.

### 2.1 왜 이렇게 하나 (설명)

저작권 분쟁에서 쟁점은 「비슷한가」가 아니라 **「베꼈는가」**입니다. 독자적으로 짰음을 보이는 가장 강한 증거는 **참고 자료를 본 사람과 코드를 짠 사람 사이에 「명세」라는 벽이 있었다**는 기록입니다. 1인 개발이라도 **역할을 시간으로 나누고 문서로 남기면** 같은 효과를 냅니다.

### 2.2 3단계 절차

```
[1단계: 관찰]  참고 사이트를 본다 → 「기법 노트」에 자연어로만 적는다
      ↓  (코드·변수명·옵션명·CSS값을 적지 않는다)
[2단계: 명세]  기법 노트를 우리 규격(t6-5-guided-tour-spec.md) 어휘로 번역한다
      ↓  (이 시점부터 참고 사이트를 다시 열지 않는다)
[3단계: 구현]  명세만 보고 짠다 → PR에 명세 링크와 출처 고지를 남긴다
```

**기법 노트에 써도 되는 것 / 안 되는 것**

| 써도 됨 | 쓰면 안 됨 |
|---|---|
| 「말풍선이 아래로 안 들어가면 위로 보낸다. 상하 다 안 되면 좌우를 시도한다」 | `getPopoverPosition()` 함수 본문, 분기 순서 그대로 |
| 「스포트라이트 여백을 픽셀 값으로 노출한다」 | `stagePadding: 10` 같은 이름+기본값 조합 |
| 「Esc로 닫고, 닫으면 포커스를 원래 자리로 되돌린다」 | 그들의 키 핸들러 코드 |
| 「오버레이는 SVG path로 구멍을 뚫는다」(일반 기법) | 그들의 path 문자열, 색상 hex, z-index 값 |

### 2.3 산출물 3개 (리포에 추가)

**① `docs/tour/technique-notes.md`** — 1단계 산출물. 항목마다 `출처 / 관찰한 기법 / 우리 규격 용어` 세 칸.

**② `THIRD_PARTY_NOTICES.md`** 또는 기존 NOTICE — 실제로 **가져온 코드가 없으므로 「참고 고지」 절만 둡니다.**

```markdown
## 설계 참고 (코드 미포함)
다음 오픈소스 프로젝트의 공개 문서와 데모를 설계 참고 자료로 사용했습니다.
코드, 에셋, 스타일 값은 포함하지 않았으며 모든 구현은 독자적으로 작성되었습니다.
- driver.js (MIT) — 팝오버 자동 뒤집기 개념
- Reactour (MIT) — 스포트라이트 여백 옵션 개념
- WAI-ARIA Authoring Practices — Dialog(Modal) 패턴
```

원문 §3-3 「출처를 밝힌다」를 이렇게 문서화하면 **정직함이 곧 방어 근거**가 됩니다.

**③ PR 템플릿 체크박스** (투어 관련 PR에 한정)

```markdown
- [ ] 참고 사이트 코드·에셋·CSS 값을 복사하지 않았다
- [ ] 새 의존성을 추가하지 않았다 (추가했다면 라이선스와 NOTICE 갱신 링크: )
- [ ] 옵션·함수 이름이 t6-5 규격 어휘를 따른다
- [ ] technique-notes.md의 해당 항목을 링크했다: 
```

### 2.4 의존성 「0」을 기계로 지키기

방침이 「의존성 추가 0」이면 사람 대신 CI가 지키게 합니다.

```bash
# package.json diff에 dependencies 변경이 있으면 실패
git diff --name-only origin/main...HEAD | grep -q package.json && \
  git diff origin/main...HEAD -- package.json | grep -E '^\+.*"(dependencies|peerDependencies)"' && exit 1
```

더 단순하게는 `license-checker --onlyAllow "MIT;ISC;BSD-2-Clause;BSD-3-Clause;Apache-2.0"`를 CI에 넣어 **허용 목록 외 라이선스가 들어오면 빌드 실패**시키는 방법이 있습니다. AGPL(intro.js, Shepherd.js)이나 EUPL(GuideChimp)이 실수로 들어오는 것을 막습니다.

---

## 3. 접근성 — 「된다」고 쓰기 전에 재는 법

원문 §4의 첫 항목이자 **가장 실질적인 위험**입니다. 「접근성을 주장하는데 안 쟀다」는 법적으로도(허위 표시) 제품적으로도(실제 사용자 차단) 문제가 됩니다. 아래는 **무엇을 기준으로, 무엇으로, 어떻게** 재는지입니다.

### 3.1 기준: 투어 말풍선은 「모달 다이얼로그」다

WAI-ARIA Authoring Practices의 **Dialog (Modal) 패턴**을 기준으로 삼습니다. 이유: 투어는 배경을 어둡게 하고 사용자 조작을 말풍선 안으로 제한하므로 툴팁(tooltip)이 아니라 다이얼로그입니다. 툴팁 role을 쓰면 스크린리더가 「호버하면 나오는 보조 설명」으로 취급해 버튼을 읽지 않습니다.

**필수 마크업**

| 속성 | 값 | 이유 |
|---|---|---|
| `role` | `dialog` | 스크린리더가 독립 창으로 인식 |
| `aria-modal` | `true` | 배경 콘텐츠를 탐색 트리에서 제외 |
| `aria-labelledby` | 말풍선 제목 id | 창이 열릴 때 제목을 읽음 |
| `aria-describedby` | 본문 id | 이어서 본문을 읽음 |
| 배경 루트 | `inert` 또는 `aria-hidden="true"` | 하이라이트 대상 외 배경 접근 차단 |

**필수 동작**

1. 열릴 때 포커스가 말풍선 안 첫 요소(보통 「다음」 버튼)로 이동
2. Tab / Shift+Tab이 말풍선 안에서 순환(포커스 트랩)
3. **하이라이트된 대상만 예외로 포커스 가능** — 원문의 「가두되 열어 둔다」. 구현은 트랩 범위를 `[말풍선, 대상 요소]` 두 노드로 잡으면 됩니다
4. Esc로 닫힘
5. 닫히면 포커스가 **투어를 시작한 버튼**으로 복귀
6. 단계 이동 시 스크린리더에 「3/6단계: 제목」을 알림 — `aria-live="polite"` 영역에 텍스트를 갱신하는 방식

### 3.2 관련 WCAG 2.2 항목 (측정 대상)

| 항목 | 우리 투어에서의 의미 |
|---|---|
| 2.1.1 키보드 | 마우스 없이 전 단계 완주 가능 |
| 2.1.2 키보드 함정 없음 | Esc가 항상 동작 |
| 2.4.3 포커스 순서 | 다음 → 이전 → 닫기 순서가 시각 배치와 일치 |
| 2.4.7 포커스 표시 | 말풍선 안 버튼에 포커스 링이 보임 |
| **2.4.11 포커스 가림 방지(AA, 2.2 신설)** | 포커스를 받은 요소가 저작자가 만든 콘텐츠(우리 말풍선·오버레이)에 **완전히** 가려지면 실패. **원문 §4 「말풍선이 글자를 가림」과 같은 항목입니다** — 접근성 측정이 곧 그 버그의 측정입니다 |
| 4.1.2 이름·역할·값 | role/aria 마크업 정확 |

2.4.11에 대한 W3C 설명은 「포커스를 받은 컴포넌트가 저작자 콘텐츠에 의해 완전히 숨겨지지 않아야 한다」이고, AA 수준에서는 부분 가림은 허용됩니다. 우리 목표는 부분 가림도 없애는 것(§4)이지만 **합격선은 「완전히 가리지 않음」**입니다.

### 3.3 자동 측정: axe-core + Playwright

이미 Playwright를 쓰고 있다면 `@axe-core/playwright` 하나만 추가하면 됩니다(개발 의존성이라 §2.4 방침에 저촉되지 않습니다 — devDependency는 배포물에 안 들어가므로 고지 의무도 없습니다).

```ts
// e2e/tour-a11y.spec.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('투어 6단계 접근성', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '투어 시작' }).click();

  for (let step = 1; step <= 6; step++) {
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // (1) axe 위반 0
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations, `step ${step}`).toEqual([]);

    // (2) 포커스가 말풍선 안에 있음
    const focusInside = await dialog.evaluate(
      el => el.contains(document.activeElement));
    expect(focusInside, `step ${step} focus`).toBe(true);

    // (3) Tab 순환 — 5번 눌러도 말풍선 밖으로 안 나감
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate(
      el => el.contains(document.activeElement))).toBe(true);

    // (4) 하이라이트 대상이 말풍선에 가려지지 않음 (2.4.11)
    const target = page.locator('[data-tour-target]').first();
    const [t, d] = await Promise.all([target.boundingBox(), dialog.boundingBox()]);
    expect(overlapRatio(t!, d!), `step ${step} obscured`).toBeLessThan(0.1);

    if (step < 6) await page.keyboard.press('Enter'); // 다음
  }

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // (5) 포커스 복귀
  await expect(page.getByRole('button', { name: '투어 시작' })).toBeFocused();
});

function overlapRatio(a: Box, b: Box) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (x * y) / (a.width * a.height);
}
type Box = { x: number; y: number; width: number; height: number };
```

**설명:** axe는 마크업 오류(role 누락, 대비 부족)를 잡지만 **포커스 동작과 가림은 잡지 못합니다.** 그래서 (2)~(5)를 직접 검사합니다. `overlapRatio < 0.1`은 「10% 미만 가림」이라는 우리 기준이며, 2.4.11 합격선(완전 가림 아님)보다 엄격합니다.

### 3.4 수동 측정 (자동화가 못 잡는 것)

자동 테스트가 통과해도 **한 번은 사람이** 해야 합니다. 30분이면 됩니다.

| # | 절차 | 합격 기준 |
|---|---|---|
| 1 | 마우스를 뽑고 키보드만으로 투어 완주 | 6단계 모두 통과, Esc 즉시 종료 |
| 2 | 브라우저 확대 200% (WCAG 1.4.4) | 말풍선이 뷰포트 안에 있고 대상을 안 가림 |
| 3 | 화면 폭 375px(모바일) | 위와 동일 |
| 4 | 스크린리더 1개 (Windows: NVDA 무료 / macOS: VoiceOver 내장) | 열릴 때 「대화상자, {제목}」 읽음. 단계 이동 시 「n/6단계」 읽음. 버튼 이름이 「다음」「이전」「닫기」로 읽힘 |
| 5 | `prefers-reduced-motion: reduce` 설정 | 스포트라이트 이동 애니메이션 꺼짐 |

**기록:** 결과를 `docs/tour/a11y-report-YYYYMMDD.md`에 남깁니다. **이 파일이 있어야 「접근성 지원」이라고 쓸 수 있습니다.** 없으면 문구를 「키보드 조작 지원」처럼 실측한 범위로 좁힙니다.

---

## 4. 말풍선이 글자를 가리는 문제 — 배치 알고리즘

원문 §4 세 번째 항목. 9→6단계로 줄인 것은 증상 완화이고, 원인은 **배치 로직**입니다. 우리가 배운 「auto-flip」을 우리 규격으로 구현하는 방법입니다.

### 4.1 원리 (설명)

말풍선 위치 결정은 3단계입니다.

```
① 선호 위치에 배치해 본다 (예: 대상 아래)
② 뷰포트를 벗어나면 → 반대편(위)으로 뒤집는다  ← flip
③ 그래도 벗어나면 → 축을 바꿔(좌/우) 시도하고, 다 안 되면 가장 덜 벗어나는 곳에 두고 축 방향으로 밀어 넣는다  ← shift
```

여기에 우리 문제를 위해 **④ 대상과 겹치지 않는지 검사**를 추가합니다. 기존 라이브러리 대부분은 ②③만 하고 ④는 여백(offset)으로 대충 막습니다. 우리는 ④를 명시적으로 넣습니다.

### 4.2 우리 규격 어휘로 쓴 명세

```ts
type Side = 'top' | 'bottom' | 'left' | 'right';

interface PlacementInput {
  target: DOMRect;        // 하이라이트 대상
  bubble: { width: number; height: number };
  viewport: { width: number; height: number };
  preferred: Side;
  gap: number;            // 대상과 말풍선 사이 최소 간격 (규격: spotlightMargin + 8)
}

interface PlacementResult {
  side: Side;
  x: number; y: number;
  fits: boolean;          // false면 호출자가 fallback(중앙 고정)을 선택
}
```

**알고리즘(자연어)** — 이것이 「기법 노트」 수준이고, 코드는 이 문장만 보고 짭니다.

1. 시도 순서를 만든다: `[preferred, opposite(preferred), ...나머지 두 축]`
2. 각 side에 대해 좌표를 계산한다 (대상 중앙 정렬)
3. 다음 두 조건을 **모두** 만족하는 첫 side를 채택한다
   - 뷰포트 안에 완전히 들어감
   - 대상 rect와의 교집합 면적이 0
4. 하나도 없으면: 뷰포트 안에 들어가는 side 중 **대상과 교집합이 가장 작은** side를 택하고, 축 방향으로 shift해 교집합을 줄인다
5. 그래도 교집합 > 대상 면적의 10%면 `fits: false` → 호출자는 말풍선을 **화면 하단 중앙 고정 + 대상으로 향하는 화살표 없음** 모드로 전환한다

### 4.3 「첫 화면」이 특히 문제인 이유와 대책

첫 단계는 보통 화면 상단 헤더나 큰 영역을 가리키므로 **대상이 크고 여백이 없습니다.** 대책 두 가지 중 택일:

- **A. 첫 단계는 대상 없는 「환영」 모달로** — 화면 중앙에 띄우고 하이라이트 없음. 가림 문제가 원천 소멸. 가장 흔한 해법.
- **B. 큰 대상은 스포트라이트만 하고 말풍선은 5번 fallback 모드로** — 대상 면적이 뷰포트의 40% 이상이면 자동으로 fallback.

### 4.4 측정

§3.3 테스트의 (4)번 `overlapRatio`가 그대로 이 문제의 회귀 테스트입니다. **6단계 × 3뷰포트(1440·1024·375) = 18케이스**를 CI에 넣으면 「오늘 안에 재측」이 이후 영구히 자동화됩니다.

---

## 5. 공개면 첫 화면 「미연결」(콜드 1.83초 vs 상한 2초)

원문 §4 다섯 번째. 근인이 확정됐고 수리 중이므로 **재발 방지 관점**만 적습니다. 1.83초는 상한 2초에 0.17초 여유라 **네트워크 흔들림만으로 재발**합니다.

### 5.1 원인 유형별 대책

| 유형 | 대책 | 설명 |
|---|---|---|
| 서버리스 콜드 스타트 | (a) 프로비전드 동시성 / 최소 인스턴스 1 (b) 5분 간격 warm-up 핑 | (a)는 비용, (b)는 무료지만 완전하지 않음. 공개면 하나면 (a)의 비용은 미미 |
| 클라이언트가 상태 확인을 너무 빨리 포기 | 연결 판정을 **「타임아웃 = 미연결」에서 「타임아웃 = 확인 중」으로** 바꾸고, 재시도 2회 후에만 「미연결」 표시 | 가장 싸고 효과 큼. 사용자에게 「미연결」은 고장 신호라 오판 비용이 큼 |
| 헬스체크 경로가 무거움 | `/health`를 DB·외부 호출 없이 즉답하게 분리 | 연결 여부와 서비스 준비 여부를 따로 봄 |
| 투어 시작 시점 | 투어를 **연결 확인 후**에만 시작 (또는 첫 단계를 환영 모달로 — §4.3 A와 동일) | 투어 첫 단계에서 「미연결」 배지가 스포트라이트되는 최악 조합 방지 |

### 5.2 상한을 「지표」로

2초 상한을 코드 상수로만 두지 말고 **측정값을 남깁니다.** `performance.mark('conn-check-start')` → 응답 시 `measure` → 콘솔 또는 로그로 전송. 일주일 p95를 보고 상한을 조정합니다. 1.83초가 「한 번 잰 값」이면 p95는 더 높을 가능성이 큽니다.

---

## 6. 특허·법무 — 언제, 무엇을 물어볼 것인가

- **지금 필요한 것:** 없음. 코드 미복제 + 널리 알려진 UI 관행만 사용하는 현 방침으로 충분합니다.
- **사업화(유료 전환·투자 유치) 전 1회:** 변리사에게 **「이 UI 상호작용 목록이 알려진 등록 특허와 충돌하는지」** FTO(Freedom-to-Operate) 약식 검토를 요청합니다. 준비물은 §2.3 ①의 기법 노트 — 이미 자연어로 정리돼 있어 그대로 넘기면 됩니다. 이것이 기법 노트를 지금 만들어 두는 두 번째 이유입니다.
- **원문 §5 「이용 약관」:** MIT 코드의 공개 리포·npm 페이지를 읽는 것은 약관 대상이 아닙니다. 약관이 문제 되는 건 **로그인이 필요한 유료 데모·대시보드**를 보고 화면을 옮기는 경우뿐이며, 우리는 하지 않습니다.

---

## 7. 실행 체크리스트

**오늘**
- [ ] Guide.js 원래 URL 확인 → 라이선스 판정 또는 참고 목록에서 제외
- [ ] react-driver가 `driver.jsx`가 맞는지 확인
- [ ] 첫 단계를 환영 모달(§4.3 A)로 바꿀지 결정 — 가림 문제와 미연결 노출을 한 번에 해결

**이번 주**
- [ ] `docs/tour/technique-notes.md` 작성 (§2.3 ①)
- [ ] NOTICE에 「설계 참고」 절 추가 (§2.3 ②)
- [ ] PR 템플릿 체크박스 (§2.3 ③)
- [ ] `@axe-core/playwright` 추가 후 §3.3 테스트 — 6단계 × 3뷰포트
- [ ] 수동 측정 1회 + `a11y-report` 기록 (§3.4)
- [ ] 연결 판정 로직을 「확인 중 → 재시도 → 미연결」 3상태로 (§5.1)

**사업화 전**
- [ ] `license-checker --onlyAllow` CI 게이트 (§2.4)
- [ ] 변리사 FTO 약식 검토 (§6)

---

## 부록 — 이 문서의 확인/미확인 구분

| 구분 | 내용 |
|---|---|
| 🟢 공개 자료로 확인 | Reactour MIT · tour-kit 이중 라이선스 구성 · usertour.io ≠ usertourkit.com · GuideChimp EUPL · WCAG 2.4.11 정의 |
| 🟡 추정 | react-driver = driver.jsx |
| 🔴 미확인 | Guide.js 정체 · usertourkit.com 자체 약관 전문 · 특허 |
| 소견(E3) | §1.4 특허 위험 낮음 · §5 원인 유형 분류 · §4.3 첫 화면 대책 선호 |
