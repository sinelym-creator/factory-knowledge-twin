"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useModalInert } from "@/lib/use-modal-inert";

import { resetSession } from "@/lib/contract";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { clearIntroSeen } from "@/components/overview/intro-seen";
import { clearTour } from "@/components/tour/tour-reset";

/**
 * ⟲ 리셋 (wireframes §0) — 확인 모달 → `POST /api/sessions/{sid}/reset` → 초기 상태 복귀.
 *
 * 🔴 「초기화됐습니다」를 «응답을 받은 뒤에만» 말한다. 백엔드가 아직 없을 때 성공처럼 보이게
 *    하면, 화면이 하지 않은 일을 했다고 말하는 것이다(P0 11항 중 «리셋»의 참·거짓이 여기서 갈린다).
 *
 * 🔴 **D-56 — 확인 창은 `document.body` 로 내보낸다(portal).**
 *
 *    이 버튼은 앱바(`.fkt-glass`) 안에 산다. 그 클래스는 `backdrop-filter` 를 쓰고
 *    (`app/globals.css:388~391`), **`backdrop-filter` 가 걸린 요소는 `position: fixed` 자손의
 *    컨테이닝 블록이 된다** — 그래서 「화면 전체」를 뜻하던 `fixed inset-0` 이 실제로는
 *    «앱바 한 줄»(52px)이었고, 그 안에서 가운데 정렬된 166px 창은 위로 삐져나갔다.
 *    실측이 그대로 산수로 맞는다: 앱바 52 → 중심 26 → `top = 26 - 83 = -57`(desktop 실측 -57) ·
 *    앱바 103(390 폭) → 중심 51.5 → `-31.5`(실측 -32). 첫 줄이 잘려 보인 이유가 이것이다.
 *    🔴 그래서 «앵커를 옮기는» 처방이 아니라 **컨테이닝 블록 밖으로 내보내는** 처방을 쓴다 —
 *       좌표를 손보면 앱바 높이가 바뀌는 폭(390 = 103px)마다 다시 어긋난다.
 */
export function ResetButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const [asking, setAsking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* 모달이 열려 있는 동안 배경을 실제로 막는다 — `aria-modal` 선언에 실제를 맞춘다(D-44). */
  const modalRef = useRef<HTMLDivElement | null>(null);
  useModalInert(asking, modalRef);

  // 🔴 「닫아도 되는가」 = 열려 있고 «요청이 나가지 않았을 때». 취소 버튼이 `busy` 동안
  //    잠기므로 Esc 도 같이 잠근다 — 버튼으로는 못 닫는데 키로는 닫히면 같은 화면이 두 규칙을
  //    갖게 되고, 그때 「되돌리는 중」에 창만 사라져 방문자는 요청이 취소된 줄 안다.
  useEscapeToClose(asking && !busy, () => setAsking(false));

  async function confirm() {
    setBusy(true);
    const reply = await resetSession(sessionId);
    setBusy(false);
    setAsking(false);
    /* 🔴 **E-1·E-3 — 「처음 상태」에는 안내와 투어도 든다.** 앞판은 서버 세션만 되돌리고
       브라우저에 적힌 「안내 봤음」(`sessionStorage`)·「투어 진행」(`localStorage`)은 그대로
       두었다 — 그래서 리셋한 사람의 화면에 안내 카드가 다시 뜨지 않고, 초대 카드는 계속
       「이어서 보기」였다. 화면이 「처음으로 되돌렸다」고 말하면서 처음이 아닌 상태를 보였다.
       🔴 **서버가 성공한 회차에만 지운다**(오케 승인 09-11). 실패했는데 지우면 화면만 처음이
          되고 서버는 그대로라 둘이 갈린다 — 실패 갈래는 키를 보존한다. */
    if (reply.state === "ok") {
      clearIntroSeen(sessionId);
      clearTour();
      /* 🔴 **E-5 — 「처음 상태로 되돌렸다」고 말하려면 «보이는 것»도 처음이어야 한다.**
         앞판은 서버 세션과 브라우저 키만 되돌리고 «지금 화면»은 그대로 두었다. 그래서 조사
         화면(`/incidents/<id>?run=…`)에서 리셋하면 토스트만 뜨고 재생본이 그대로 남았다 —
         화면이 한 말과 화면이 보여 주는 것이 어긋난다(폐하 실기기 실측 09-11).
         🔴 **주소에 상태가 실려 있다**(`?run=…`)는 것이 핵심이다. 그 화면에 머무는 한
            다시 그리든 말든 같은 재생본을 가리킨다 — 그래서 «첫 화면으로 데려간다».
         🔴 이미 overview 면 `push` 가 같은 주소라 아무 일도 일어나지 않는다(라우터가 접는다).
            그때는 서버 컴포넌트를 다시 받아야 비워진 세션이 화면에 온다 — `refresh` 가 그 자리다. */
      if (pathname.startsWith("/overview")) router.refresh();
      else router.push("/overview");
    }
    setResult(
      reply.state === "ok"
        ? "세션을 초기 상태로 되돌렸습니다."
        : `초기화하지 못했습니다. 서버에 연결하지 못했습니다. (${reply.why})`,
    );
  }

  return (
    <>
      <button
        className="fkt-hit fkt-pill bg-fill text-foot text-muted hover:text-ink"
        onClick={() => {
          setResult(null);
          setAsking(true);
        }}
        title="이 세션의 상태를 처음으로 되돌립니다"
        data-testid="reset-button"
      >
        ⟲ <span className="sr-only">세션 </span>리셋
      </button>

      {asking &&
        createPortal(
        <div ref={modalRef} className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="w-full max-w-sm fkt-card p-6" role="dialog" aria-modal>
            <p className="text-body-c">이 세션을 처음 상태로 되돌릴까요?</p>
            <p className="mt-1 text-foot text-muted">
              변경한 작업지시서 초안·조사 결과가 사라집니다. 다른 방문자에게는 영향이 없습니다.
            </p>
            <div className="mt-4 flex justify-end gap-2 text-foot">
              <button className="fkt-btn fkt-btn-secondary rounded-pill px-4.5 text-muted hover:text-ink"
                      onClick={() => setAsking(false)} disabled={busy}>
                취소
              </button>
              <button className="fkt-btn fkt-btn-secondary rounded-pill px-4.5 text-ai hover:text-ink"
                      onClick={() => void confirm()} disabled={busy}>
                {busy ? "되돌리는 중…" : "되돌리기"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {result && (
        <span className="text-foot text-muted" role="status">
          {result}
        </span>
      )}
    </>
  );
}
