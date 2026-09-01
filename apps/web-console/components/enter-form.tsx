"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { enterSession } from "@/lib/contract";
import { ENTRY_DESTINATION } from "@/lib/session";

/**
 * 입장 «실행» — `/` 화면의 클라이언트 마운트가 `POST /enter` 를 명시 호출한다 (Q-39 ⓒ).
 *
 * 🔴 **왜 클라이언트인가.** 입장이 서버 홉(`proxy.ts`)에 있던 동안, 그 홉은 사람이 아니라
 *    프리페치도 밟았다 — 딥링크로 「열람만」 들어온 방문자에게 세션이 조용히 생겼다.
 *    프리페치는 문서를 «가져올» 뿐 JS 를 실행하지 않으므로, 입장을 마운트로 옮기면
 *    「가져간 사람」과 「들어온 사람」이 갈린다. 표지(prefetch 헤더)로 가르는 길은 없다 —
 *    이 층까지 오지 않거나 오다 떨어진다는 것이 14대 삼중 실측이다.
 *
 * 🔴 **`fetch` 가 아니라 «form 제출»이다.** 두 가지를 한 형태로 얻는다:
 *      ① 브라우저가 POST → 303 → `GET /overview` 를 «직접» 따라가므로 왕복이 한 번이다
 *         (fetch 로 받으면 응답을 버리고 다시 이동해야 한다).
 *      ② JS 가 없는 방문자에게는 아래 버튼이 그대로 «명시 입장»이 된다 — 자동 실행이
 *         없을 때 빈 화면에 서지 않는다(§6.2 「빈 화면 금지」의 이 화면 몫).
 *
 * 🔴 **한 번만 쏜다.** React StrictMode 는 개발에서 effect 를 두 번 돌리고, 사람은
 *    버튼을 두 번 누른다. 핸들러 자체도 멱등이지만(세션 보유 = 발급 0), 요청을 두 번
 *    내지 않는 것이 먼저다 — 「서버가 막아 준다」에 기대면 막는 쪽이 바뀌는 날 조용히 샌다.
 *
 * 🔴 **JS 가 있으면 «항해»가 아니라 «요청»으로 쏜다**(D-3 · 2026-08-31).
 *
 *    앞판은 `requestSubmit()` 이었다 — 네이티브 form 제출은 곧 **항해**이고, 항해가 걸린
 *    순간부터 이 문서는 죽은 문서가 된다: 그 뒤에 일어나는 갱신은 계산은 되지만 사람에게
 *    닿지 않는다. 그래서 ai-api 가 응답하지 않을 때 모드 배지의 첫 tick 이 상한(2s)에
 *    제때 끝나고 `setState` 까지 돌아도, 화면은 「확인 중」인 채로 남고 «정적 재생 제안»도
 *    뜨지 않았다 — 방문자는 백엔드가 죽었다는 사실을 «다음 문서»에서야 본다.
 *
 *    🔴 이것은 추론이 아니라 대조군이다(블랙홀 자극 · 같은 페이지 · 같은 tick):
 *       항해를 «대기»시키면 30초 뒤에도 배지가 `checking` 이고, 같은 항해를 **204 로 즉시
 *       끝내면** 같은 자리에서 3.5초에 `unavailable` + 제안이 뜬다. 다른 것은 그 하나뿐이다.
 *
 *    그래서 JS 경로만 «부수 요청»으로 바꾼다. 문서는 `/` 위에 살아 있고, 배지·배너·제안이
 *    상한 안에 사람에게 닿는다. 이동은 클라이언트 항해라 셸이 «다시 마운트되지 않아»
 *    첫 tick 이 알아낸 사실이 다음 화면까지 그대로 간다(앞판은 문서가 바뀌며 버려졌다).
 *
 *    🔴 Q-39 의 세 규율은 그대로다 — POST 전용(프리페치는 GET 이라 405) · «명시 호출»
 *       (마운트가 부른다) · 1회. 그리고 **JS 가 없는 방문자에게는 아래 form 이 그대로
 *       네이티브 제출**이라 303 경로가 살아 있다(그 경로는 항해가 목적이므로 문제가 없다).
 *    🔴 `redirect: "manual"` 인 이유: 그냥 두면 fetch 가 303 을 따라가 `/overview` **문서를
 *       통째로** 받아 버리고(그 SSR 이 API 를 기다리는 동안 사람은 아무것도 못 본다) 그
 *       응답을 버린다. 우리는 쿠키만 필요하고 화면은 클라이언트 항해가 그린다.
 */
export function EnterForm() {
  const form = useRef<HTMLFormElement>(null);
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    void (async () => {
      try {
        // 🔴 fetch 자체는 `lib/contract.ts` 안에 있다 — «셀에서 나가는 fetch 는 한 파일»
        //    불변식(scripts/contract-surface.mjs)을 이 줄로 깨지 않는다. 쿠키를 심는 일·303 을
        //    따라가지 않는 이유는 그 함수의 머릿말에 적혀 있다.
        await enterSession();
      } catch {
        // 🔴 입장 요청이 실패해도 «화면을 세운다». 세션은 핸들러가 pending 으로 답하거나
        //    다음 화면의 가드가 다시 물을 일이고, 여기서 멈추면 방문자는 빈 자리에 선다.
      }
      router.push(ENTRY_DESTINATION);
      // 🔴 **섬을 옳기고 난 뒤, 서버 트리를 한 번 다시 받는다**(D-3 회귀 방지).
      //
      // 소프트 항해는 페이지만 다시 가져오고 **루트 레이아웃은 재사용한다** — 그런데
      // 셀(`AppShell`)은 서버에서 쿠키를 읽어 세션 칩·리셋 버튼을 그린다. 그 레이아웃은
      // 방문자가 `/` 에 서 있던 순간(아직 쿠키가 없다)에 그려졌으므로, 그대로 두면
      // 입장에 성공한 방문자의 화면에서 **리셋 버튼과 세션 칩이 사라진다**(P0 11항 중
      // «세션 격리·리셋» 두 항이 화면에서 없어진다). 앞판이 그런 적이 없던 것은
      // 네이티브 제출이 문서를 통째로 갈아치워 레이아웃까지 다시 SSR 됐기 때문이다 —
      // 즉 이 줄은 «새 기능»이 아니라 문서 교체가 공짜로 주던 것을 명시적으로 갚는 자리다.
      //
      // 🔴 `refresh()` 는 클라이언트 상태를 버리지 않는다 — 첫 tick 이 알아낸 모드는
      //    그대로 살아있다. 그 보존이 이 처방의 목적이니, **문서 교체로 되돌리는 것으로는
      //    고치지 않는다**(그것은 D-3 을 그대로 되살린다).
      // 🔴 순서가 중요하다 — **push 먼저, refresh 나중.** 먼저 refresh 하면 아직 `/` 위라
      //    가드(«`/` 는 머무는 곳이 아니다»)가 다시 돌아 항해가 둘로 겹친다.
      //    그리고 refresh 는 화면을 «막지» 않는다: 이미 그려진 화면 위로 새 트리가 도착할
      //    때 교체될 뿐이라, 배지·배너가 상한 안에 사람에게 닿는 것은 그대로다(q50 그물로 재측).
      router.refresh();
    })();
  }, [router]);

  return (
    <form
      ref={form}
      method="post"
      action="/enter"
      className="mx-auto mt-24 flex max-w-sm flex-col items-center gap-3 text-center"
      data-testid="entry-form"
    >
      <p className="text-sm" role="status">
        세션을 만들고 조사 화면으로 들어갑니다…
      </p>
      <p className="text-xs text-muted">
        이 세션의 변경은 다른 방문자에게 보이지 않습니다. 자동으로 넘어가지 않으면 아래를
        눌러 주세요.
      </p>
      <button
        type="submit"
        className="rounded border border-edge px-3 py-1.5 text-xs text-ai hover:bg-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-ai"
        data-testid="enter-button"
      >
        입장하기 →
      </button>
    </form>
  );
}
