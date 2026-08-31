"use client";

import { useEffect, useRef } from "react";

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
 */
export function EnterForm() {
  const form = useRef<HTMLFormElement>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    form.current?.requestSubmit();
  }, []);

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
