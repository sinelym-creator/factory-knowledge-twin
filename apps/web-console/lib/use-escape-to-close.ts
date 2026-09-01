import { useEffect, useRef } from "react";

/**
 * 열려 있는 대화상자를 **Esc 로 닫는다** (D-7 · Q-59).
 *
 * 🔴 **훅 하나로 둔다.** 지금 이 셸에는 inline 대화상자가 두 곳(세션 리셋 · 작업지시 승인/반려)
 *    있고, 같은 키 처리를 두 벌 적으면 세 번째 대화상자가 생기는 날 그 자리만 조용히 빠진다 —
 *    「Esc 로 닫힌다」가 화면마다 참·거짓이 갈리는 형태다. 규칙은 한 곳에 성문한다.
 *
 * 🔴 **`document` 에 듣는다.** 대화상자 요소에 `onKeyDown` 을 붙이면 그 안에 포커스가 있을
 *    때만 잡힌다 — 이 셸의 대화상자는 열릴 때 포커스를 옮기지 않으므로(포커스 트랩은 이 티켓의
 *    범위가 아니다) 방문자의 포커스는 여전히 열기 버튼에 있다. 거기서 Esc 를 눌러도 닫혀야 한다.
 *
 * 🔴 **「닫아도 되는가」는 부르는 쪽이 정한다.** 첫 인자는 「열려 있는가」가 아니라 «지금 Esc 가
 *    닫아야 하는가»다: 리셋은 요청이 나간 뒤(`busy`) 취소 버튼을 잠그므로 Esc 도 같이 잠가야
 *    일관되고, 작업지시 쪽은 언제든 취소할 수 있으므로 열려 있으면 곧 참이다. 두 자리의 규칙이
 *    다른 것이 사실이고, 훅이 그것을 하나로 뭉개면 화면 규칙이 조용히 바뀐다.
 *
 * 🔴 **여기서 «닫힘»보다 넓은 일을 하지 않는다.** 포커스 복귀·트랩·스크롤 잠금은 접근성상
 *    필요한 것들이지만 정본이 지금 말하는 것은 「Esc 로 닫힘」뿐이다 — 코드가 정본보다 넓어지면
 *    그 넓힌 부분은 아무 근거 없이 자란 것이 된다(필요하면 회부해서 정본을 먼저 넓힌다).
 */
export function useEscapeToClose(active: boolean, close: () => void): void {
  // 🔴 `close` 를 의존에 넣지 않는다. 호출부는 대개 인라인 화살표를 넘기므로 매 렌더 새 함수가
  //    되고, 그러면 이 effect 가 렌더마다 리스너를 떼었다 붙인다 — 그 사이 한 틱은 Esc 가
  //    아무 데도 닿지 않는 창이다. 최신 함수는 ref 로 들고, 등록은 `active` 로만 움직인다.
  //    🔴 **ref 쓰기는 «렌더 중»이 아니라 effect 안에서 한다**(`react-hooks/refs`). 렌더 중에
  //    `latest.current` 를 건드리면 React 가 렌더를 버리거나 다시 돌리는 경우(Strict/동시성)에
  //    화면에 서지 않은 값이 ref 에 남는다. 아래 effect 는 «의존 배열이 없다» — 커밋마다 돌아
  //    최신 콜백을 담는다. 읽는 쪽(keydown 핸들러)은 언제나 커밋 «뒤»에 실행되므로 이 훅이
  //    부르는 함수는 앞판과 같다: 거동을 바꾸지 않고 쓰는 «시점»만 옮겼다.
  const latest = useRef(close);
  useEffect(() => {
    latest.current = close;
  });

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // 🔴 `event.key` 만 본다. `keyCode` 는 폐기됐고, IME 조합 중에는 `key` 가 "Process" 로
      //    와서 여기 걸리지 않는다 — 한글을 입력하다 누른 Esc 가 대화상자를 닫아 버리는 일이
      //    이 한 줄로 걸러진다(반려 사유 입력이 그 자리다).
      if (event.key !== "Escape") return;
      latest.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active]);
}
