/**
 * 정적 replay — ai-api 없이 GS-01 을 재생하는 «출처» (T4-2a ⓑ · baseline §14.1·§6.2).
 *
 * 🔴 **여기는 «데이터를 어디서 얻는가»만 정한다.** 화면은 Live 든 정적이든 같은 컴포넌트를
 *    타고, 같은 `reduceEvents` 를 부른다 — live/replay 렌더 분기 0(AC ⑤). 이 파일이 하는 일은
 *    「WS 대신 배열」·「fetch 대신 사본」으로 «출처»를 갈아 끼우는 것뿐이다.
 *
 * 🔴 **서버 replay 와 «같은 치환»만 한다**(판정 J-C · 서버 `investigation/replay.py` 와 동형):
 *      mode  → "replay"     녹화본의 mode 는 "live" 다. 그대로 두면 정적 화면이 자기를
 *                           「LIVE」라고 말한다 — 재생본이 새 조사인 척하는 것이다.
 *      runId → 고정 정적 id  서버 run 과 혼동되지 않게. 🔴 이 id 로 `GET /runs/{id}` 를 «부르지
 *                           않는다»(오케 판정) — 서버에 없는 id 다.
 *    `seq`·`ts`·`type`·`payload` 는 **손대지 않는다**. `ts` 를 「지금」으로 바꾸면 재생본이
 *    새 조사인 척하는 것이고, payload 를 만지면 그것은 재생이 아니라 두 번째 구현이다.
 *
 * 🔴 **자산은 «진입할 때» 싣는다.** 조회 사본 111KB + 이벤트 14KB 를 첫 화면 번들에 넣으면
 *    Live 방문자가 쓰지도 않을 것을 내려받는다(§17.1 3s · Q-50). 그래서 전부 동적 import 다.
 */

import type { ErrorDetail } from "@/lib/contract";
import type { RunEvent } from "@/lib/run-events";
import { STATIC_RUN_ID } from "@/lib/static-replay/run-id";

// 🔴 진입 표지는 `run-id.ts` 가 정본이다(자산 그래프와 갈라 두었다) — 여기서는 다시
//    내보내기만 한다. 두 곳에 값을 적으면 갈리는 날 화면과 미들웨어가 다른 것을 연다.
export { STATIC_RUN_ID, isStaticRun } from "@/lib/static-replay/run-id";

export type StaticBlocked = { status: number; body: string };

export type StaticBundle = {
  events: RunEvent[];
  /** 계약 경로 → 그 경로가 실제로 답했던 본문. */
  responses: Record<string, unknown>;
  /** 🔴 서버가 막은 자리. 정적도 여기를 열지 않는다. */
  blocked: Record<string, StaticBlocked>;
  manifest: {
    harvestedAt: string;
    apiBuildSha: string;
    anchors: {
      incidentId: string;
      equipmentId: string;
      plantId: string;
      sensorId: string | null;
      sensorSource: string;
      alarmIds: string[];
    };
    fixture: { events: number; sha256: string };
  };
};

/**
 * 녹화본 JSONL → 이벤트 배열. 🔴 «읽기»이지 가공이 아니다 — 서버 replay 로더도 같은 자리에서
 * 줄 단위로 읽는다(`replay.py:load`). 형상 검사도 같은 정신으로 둔다: 빈 것은 통과가 아니다.
 */
function parseEvents(jsonl: string): RunEvent[] {
  const events: RunEvent[] = [];
  for (const [i, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(line) as Record<string, unknown>;
    } catch {
      // 🔴 못 읽은 줄을 «빈 이벤트»로 만들지 않는다 — 없던 사실이 된다. 자산은 sha 로 잠겨
      //    있으므로 여기 오는 것은 「자산이 깨졌다」는 뜻이고, 그건 조용히 넘길 일이 아니다.
      throw new Error(`정적 replay 자산이 깨졌다 — ${i + 1}번째 줄이 JSON 이 아니다`);
    }
    // 🔴 봉투 두 필드만 치환한다(서버와 동형). 나머지는 그대로 흘려보낸다.
    events.push({ ...raw, mode: "replay", runId: STATIC_RUN_ID } as RunEvent);
  }
  if (events.length === 0) {
    throw new Error("정적 replay 자산에 이벤트가 없다 — 빈 녹화본은 재생본이 아니다");
  }
  return events;
}

let cached: Promise<StaticBundle> | null = null;

/**
 * 자산을 싣는다 — 🔴 **동적 import**(첫 화면 청크에 안 실린다). 같은 런타임에서 두 번째
 * 부름은 캐시를 준다: 한 번 내려온 것을 다시 파싱해 이벤트 배열이 두 벌 생기지 않게.
 */
export function loadStaticReplay(): Promise<StaticBundle> {
  cached ??= (async () => {
    const [{ GS01_EVENTS_JSONL, GS01_EVENT_COUNT }, { STATIC_RESPONSES, STATIC_BLOCKED }, { STATIC_MANIFEST }] =
      await Promise.all([
        import("./generated/events"),
        import("./generated/responses"),
        import("./generated/manifest"),
      ]);

    const events = parseEvents(GS01_EVENTS_JSONL);
    // 🔴 «센 것»과 «적힌 것»을 맞춰 본다. 자산은 두 스크립트를 거쳐 왔고, 그 사이에서 줄이
    //    사라지면 화면은 조용히 짧은 재생을 보여 준다 — 짧아진 것을 아무도 모른다.
    if (events.length !== GS01_EVENT_COUNT) {
      throw new Error(`정적 replay 이벤트 수가 갈렸다 — 실제 ${events.length} · 자산 표기 ${GS01_EVENT_COUNT}`);
    }

    return {
      events,
      responses: STATIC_RESPONSES,
      blocked: STATIC_BLOCKED,
      manifest: STATIC_MANIFEST as unknown as StaticBundle["manifest"],
    };
  })();
  return cached;
}

/**
 * 사본 조회 결과 — 🔴 `Reply` 와 «같은 형태»다(화면이 Live 와 같은 자리에서 받는다).
 *
 * 🔴 `detail` 을 함께 싣는 이유: 화면들이 `detail.code` 로 사유를 «가른다»(예: 문서 화면이
 *    `highlight_mismatch` 와 `highlight_not_found` 를 다르게 그린다). 정적 경로가 code 를
 *    버리고 문장만 넘기면, 서버가 나눈 이유가 정적 화면에서만 합쳐진다 — 같은 사건을 두
 *    경로가 다르게 그리는 것이고, 그것이 「동형」이 깨지는 가장 조용한 방식이다.
 */
export type StaticLookup<T> =
  | { state: "ok"; data: T }
  | { state: "unavailable"; why: string; status?: number; detail?: ErrorDetail };

/**
 * 계약 경로로 사본을 찾는다.
 *
 * 🔴 **세 갈래를 가른다** — 있다 / 서버가 «막았다» / 굳히지 않았다. 셋을 한 모습으로 그리면
 *    서버가 나눈 이유가 화면에서 사라진다(계약이 404·501 을 따로 답하는 이유가 그것이다).
 * 🔴 굳히지 않은 것을 「없다」로 그리지 않는다 — 그것은 자산 범위의 문제이지 데이터의 부재가
 *    아니다. 화면은 「이 화면은 정적 재생본이 담지 않는다」고 말해야 한다.
 */
export function staticLookup<T>(bundle: StaticBundle, path: string): StaticLookup<T> {
  const hit = bundle.responses[path];
  if (hit !== undefined) return { state: "ok", data: hit as T };

  const blocked = bundle.blocked[path];
  if (blocked) {
    // 🔴 서버가 «말한» 사유를 그대로 옮긴다 — code 와 message 둘 다. 문구를 지어내지 않고,
    //    못 꺼냈으면 `detail` 을 비운다(그럴듯한 code 를 만들면 화면은 「서버가 사유를
    //    말했다」고 그리는데 실제로는 아무 말도 없었던 것이 된다 · `contract.ts:errorDetail`).
    let why = `서버가 이 자리를 막는다 (HTTP ${blocked.status})`;
    let detail: ErrorDetail | undefined;
    try {
      const parsed = JSON.parse(blocked.body) as { error?: { code?: unknown; message?: unknown } };
      const { code, message } = parsed.error ?? {};
      if (typeof code === "string" && typeof message === "string") detail = { code, message };
      if (typeof message === "string") why = message;
    } catch {
      // 본문이 JSON 이 아니면 위 기본 문구를 쓴다 — 없는 말을 만들지 않는다.
    }
    return { state: "unavailable", why, status: blocked.status, detail };
  }

  return { state: "unavailable", why: "정적 재생본이 이 자리를 담지 않는다", status: undefined };
}
