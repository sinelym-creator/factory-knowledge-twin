/**
 * 문서 원문 + 인용 문장 강조 (wireframes §3 문서 원문 탭 · 계약 v0.1.1 `highlight`).
 *
 * 🔴 **강조는 «원문을 잘라» 만든다** — 인용문을 따로 받아 그리지 않는다. `body[start:end]`
 *    로 잘라야 화면에 뜬 강조가 「원문의 그 자리」임이 구조적으로 참이 된다. 인용문을 별도
 *    문자열로 받아 그리면 좌표가 틀려도 화면은 멀쩡해 보이고, 그 거짓은 원문과 나란히 놓고
 *    비교하기 전에는 드러나지 않는다(T2-2 offsets.py 머리말과 같은 축).
 *    실측(T3-3 E1): `/evidence`.text === `/documents`.body[start:end] · 두 라우트 좌표 일치.
 *
 * 🔴 **좌표가 본문 밖이면 «강조하지 않고 운다».** 잘라 낸 결과가 빈 문자열이거나 범위를
 *    벗어나면 그럴듯한 자리를 대신 칠하지 않는다 — 엉뚱한 문장을 인용으로 표시하는 것은
 *    강조가 없는 것보다 나쁘다(offsets.py 「0이나 전체 범위 같은 그럴듯한 값을 지어내지
 *    않는다」의 화면 쪽 절반).
 */
import { readCitation } from "@/components/evidence/read-citation";

export function CitedBody({
  body,
  span,
  chunkId,
}: {
  body: string;
  /** 없으면 강조 없이 전문만 — 「인용을 요청하지 않은 열람」이다. */
  span: { start: number; end: number } | null;
  chunkId?: string;
}) {
  /* 🔴 판정·자르기 «규칙»은 `read-citation.ts` 로 옮겼다 — 화면 없이 재기 위해서다(U-09·U-10). */
  const view = readCitation(body, span);

  if (view.kind === "out-of-range") {
    return (
      <section data-testid="cited-body" data-highlight="out-of-range">
        <p className="rounded border border-danger/50 bg-panel p-3 text-body-c text-danger">
          🔴 인용 좌표가 본문 범위 밖이다 — 강조를 그리지 않는다.
        </p>
        <p className="id mt-1 text-foot text-muted">
          요청 좌표 [{view.start}, {view.end}) · 본문 길이 {view.bodyLength}
          {chunkId ? ` · ${chunkId}` : ""}
        </p>
        <BodyText>{body}</BodyText>
      </section>
    );
  }

  if (view.kind === "none") {
    return (
      <section data-testid="cited-body" data-highlight="none">
        <p className="mb-2 text-foot text-muted">
          인용 구간 지정 없음 — 문서 전문을 그대로 보여 준다.
        </p>
        <BodyText>{body}</BodyText>
      </section>
    );
  }

  const { start, end } = view;
  return (
    <section data-testid="cited-body" data-highlight="ok">
      {/* 🔴 키보드 내비 — 본문이 길면 인용까지 스크롤로만 갈 수 있어서는 안 된다.
          링크라 Tab 으로 잡히고 Enter 로 뛴다(클라이언트 JS 없이 성립한다). */}
      <p className="mb-2 flex flex-wrap items-center gap-2 text-foot text-muted">
        <a
          href="#cited"
          className="fkt-pill bg-fill text-ai hover:bg-bg focus:outline-2 focus:outline-ai"
        >
          ▾ 인용 구간으로 이동
        </a>
        <span className="id">
          offset [{start}, {end}) · {end - start}자 / 본문 {body.length}자
        </span>
        <span>— 원문에서 잘라 낸 구간이다(별도 인용문을 그리지 않는다).</span>
      </p>
      <BodyText>
        {view.before}
        <mark
          id="cited"
          tabIndex={-1}
          data-testid="cited-span"
          className="bg-ai/15 text-ink outline-1 outline-ai/50"
        >
          {view.quoted}
        </mark>
        {view.after}
      </BodyText>
    </section>
  );
}

/** 원문은 «원문대로» — 마크다운으로 다시 그리지 않는다(그리면 본문과 좌표가 갈린다). */
function BodyText({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-[60vh] overflow-auto rounded-chip bg-inset p-3 text-foot leading-relaxed whitespace-pre-wrap">
      {children}
    </pre>
  );
}
