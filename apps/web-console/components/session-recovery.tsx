"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { announceSessionExpired } from "@/components/live-status";
import { enterSession } from "@/lib/contract";

/**
 * D-55 — **세션이 사라진 뒤의 「다시 입장」을 화면이 스스로 한다.**
 *
 * 왜(E1 · `services/ai-api/app/session_store.py:1~14` 머리말): 세션 저장소는 프로세스 안이라
 * ai-api 가 재기동하면 전부 사라지고, 사라진 세션은 `401 session_required` 를 받는다. 서버는
 * 그 자리에서 「화면은 다시 입장하면 된다」고 적어 두었는데 — **셸에 그 「다시 입장」이 없었다**
 * (`session_required` 를 다루는 코드 0건). 그래서 옛 `fkt_sid` 쿠키를 든 브라우저는 전 화면에서
 * 401 패널만 봤다(폐하 실물 16:52 · 공개면 `/overview`).
 *
 * 🔴 **세션 발급 로직을 «두 번째 자리»에 적지 않는다.** 재입장은 이미 있는 경로
 *    (`enterSession()` → `POST /enter` → `createSession`)를 그대로 부른다 — 여기에 발급을
 *    다시 구현하면 쿠키 속성·재시도 예산이 두 곳에서 갈린다.
 * 🔴 **자동 재시도는 «문서당 한 번»이다.** 표지는 모듈 변수 `attempted` 이고, `router.refresh()`
 *    는 문서를 다시 읽지 않으므로 그 값이 그대로 산다 — 401 이 이어지면 두 번째 마운트에서
 *    표지가 이미 서 있어 패널로 간다. 재입장이 실패하는 상황에서 무한히 `/enter` 를 때리는
 *    형태가 구조적으로 못 생긴다.
 * 🔴 **자동 회차에는 패널을 그리지 않는다.** 「지금 되살리는 중」과 「되살리지 못했다」는 다른
 *    사실이라 다른 것을 그린다 — 성공할 회차에 만료 패널을 한 번 번쩍이면 방문자는 자기가
 *    무엇을 본 것인지 모른다.
 * 🔴 **끝내 실패하면 배지도 함께 내린다**(오케 보강 16:56 · 폐하 실물 16:54). 게이트웨이만 보는
 *    `online` 은 세션이 죽어도 초록이라, 배지가 「LIVE」인 채 본문은 401 인 화면이 남았다.
 *    모드 값 집합은 늘리지 않고(`data-mode` 계약 보존) 기존 `unavailable` 로 내린다.
 */

/** 🔴 문서당 1회 표지 — `router.refresh()` 를 지나 살고, 진짜 새로고침에서만 풀린다. */
let attempted = false;

export function SessionRecovery({ screen, heading }: { screen: string; heading: boolean }) {
  /* `pending` = 자동 재입장이 도는 중 · `expired` = 재시도 뒤에도 401(= 사람이 눌러야 한다).
     🔴 «마운트 시점»에 얼어붙는다 — 렌더 중에 모듈 표지를 다시 읽으면, 자동 재입장이 도는
        도중의 리렌더 한 번이 화면을 만료 패널로 뒤집는다(아직 실패하지 않은 것을 실패로 그린다). */
  const [phase, setPhase] = useState<"pending" | "expired">(() => (attempted ? "expired" : "pending"));
  /* 🔴 **재시도의 «끝»을 눈으로 봐야 한다.** `router.refresh()` 는 문서를 다시 읽지 않으므로,
     재시도 뒤에도 401 이면 이 컴포넌트는 **다시 마운트되지 않고 그대로 서 있다** — 「두 번째
     마운트가 사실을 확인한다」는 형태로 짜면 그 회차는 영원히 「되살리는 중」에 머문다.
     그래서 전이의 종료를 듣는다: 전이가 끝났는데 **내가 아직 여기 있다**는 것 자체가
     「새 렌더도 401 이었다」는 증거다(성공했다면 데이터 화면이 나를 지웠을 것이다). */
  const [refreshing, startRefresh] = useTransition();
  const awaited = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (attempted) {
      /* 🔴 여기서만 배지를 내린다 — 자동 회차에서 내리면 곧 되살아날 상태를 「끊겼다」로 적는다. */
      announceSessionExpired();
      return;
    }
    attempted = true;
    let alive = true;
    void (async () => {
      try {
        await enterSession({ renew: true });
      } catch {
        /* 🔴 재입장 자체가 실패해도 «여기서» 패널로 넘기지 않는다 — 아래 refresh 가 새 렌더를
           불러 오고, 그 렌더가 여전히 401 이면 전이 종료가 그 사실을 말한다. 실패를 이 자리에서
           단정하면 「쿠키는 발급됐는데 화면만 포기한」 회차가 생긴다. */
      }
      if (!alive) return;
      /* 원요청 1회 재시도 = 서버 렌더를 새 쿠키로 다시 돌린다(soft refresh · 문서는 그대로). */
      awaited.current = true;
      startRefresh(() => router.refresh());
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    if (!awaited.current || refreshing) return;
    /* 전이가 끝났고 나는 아직 살아 있다 = 새 서버 렌더도 401. 이제 사람이 눌러야 한다. */
    setPhase("expired");
    announceSessionExpired();
  }, [refreshing]);

  if (phase === "pending") {
    /* 🔴 이 자리는 «패널이 아니다» — `screen-unavailable` 표지를 달지 않는다. 달면 계측기가
       「데이터를 못 가져온 화면」을 세는데, 실제로는 되살리는 중인 회차까지 함께 세게 된다. */
    return (
      <section className="max-w-2xl" data-testid="session-recovering">
        {heading ? (
          <h1 className="text-lg font-semibold">{screen}</h1>
        ) : (
          <p className="text-lg font-semibold">{screen}</p>
        )}
        <p className="mt-4 text-foot text-muted">세션을 다시 여는 중입니다…</p>
      </section>
    );
  }

  return (
    <section className="max-w-2xl" data-testid="screen-unavailable" data-kind="unavailable">
      {heading ? (
        <h1 className="text-lg font-semibold">{screen}</h1>
      ) : (
        <p className="text-lg font-semibold">{screen}</p>
      )}
      <div className="mt-4 rounded border border-warn/40 bg-panel p-4">
        <p className="text-body-c text-warn">세션이 만료되었습니다. 다시 입장해 주세요.</p>
        {/* 🔴 원문 값은 그대로 남긴다 — 표시가 사람 말이 되어도 계측기가 읽는 값은 안 변한다. */}
        <p className="id mt-2 text-foot text-muted" data-why="HTTP 401">
          사유: 서버 응답 오류(401)
        </p>
        <button
          type="button"
          onClick={() => {
            /* 🔴 사람이 누른 회차는 «문서를 다시 읽는다» — 서버 렌더뿐 아니라 브라우저가 이미
               401 로 끝낸 요청들까지 같은 새 쿠키로 다시 나가야 화면 전체가 한 상태가 된다.
               문서당 1회 표지도 이때 함께 풀린다(자동 회차의 무한 반복은 여전히 못 생긴다). */
            void enterSession({ renew: true }).finally(() => window.location.reload());
          }}
          className="fkt-btn fkt-btn-primary mt-4 rounded-pill px-4 text-foot"
          data-testid="session-reenter"
        >
          다시 입장
        </button>
      </div>
    </section>
  );
}
