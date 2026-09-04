"use client";

import Link from "next/link";
import { useState } from "react";

import { type CompareResult, type Scenario, compareBrowser } from "@/lib/contract";

/**
 * ⑤ 검색 전략 비교 (wireframes §5 · T3-4).
 *
 * 🔴 **질문은 «승인 목록에서 고른다»**(§16.2 · P0). 자유 입력창을 두지 않는다 — 임의 질의
 *    표면은 이 화면의 조작 경계 밖이고, 「chat-first 금지」(§10)와 같은 자리다.
 *
 * 🔴 **전략 이름은 계약이 정한 셋이다**(`strategies: ["vector","hybrid","graphrag"]`).
 *    목록을 서버에서 받아 오는 라우트가 없으므로 여기 적되, «계약의 값»이지 화면이 지어낸
 *    값이 아니라는 것을 이 주석이 정본으로 남긴다. 넷째가 생기면 계약이 먼저 바뀐다.
 */
const STRATEGIES = ["vector", "hybrid", "graphrag"] as const;

/**
 * 🔴 **«차이 요약»은 규칙 기반이고 우열을 말하지 않는다**(§5 인터랙션 ④ · baseline §0.2).
 *
 * 목업은 「⚠ 안전 규정 미포함 / ✓ 규정까지 관계로 도달」처럼 근거의 «종류»를 읽는 라벨을
 * 보여 준다. 그런데 이 응답의 hit 에는 `kind` 가 없다(실측 키 = evidenceId/score/excerpt).
 * evidenceId 모양으로 종류를 «추측»하면 그것은 화면이 서버가 말하지 않은 것을 지어내는
 * 일이라(이 리포의 「id 에서 뜻을 추측하지 않는다」 규율), 대신 **집합 사실만** 말한다:
 * 겹친 근거 수와 그 열에만 있는 근거 수. 둘 다 응답만으로 참·거짓이 갈린다.
 */
function diffLabels(results: CompareResult[]): { shared: string[]; only: Map<string, string[]> } {
  const sets = results.map((r) => new Set(r.hits.map((h) => h.evidenceId)));
  const shared = results.length > 1 ? [...sets[0]].filter((id) => sets.every((s) => s.has(id))) : [];
  const only = new Map<string, string[]>();
  results.forEach((r, i) => {
    only.set(
      r.strategy,
      [...sets[i]].filter((id) => sets.every((s, k) => k === i || !s.has(id))),
    );
  });
  return { shared, only };
}

export function ComparePanel({
  scenario,
  sessionId,
  sessionOrigin,
  initialQuestion,
  runId,
}: {
  scenario: Scenario | null;
  sessionId: string | null;
  sessionOrigin: string | null;
  initialQuestion: string | null;
  runId: string | null;
}) {
  const questions = scenario?.questions ?? [];
  const [question, setQuestion] = useState(initialQuestion ?? questions[0] ?? "");
  const [picked, setPicked] = useState<string[]>([...STRATEGIES]);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [results, setResults] = useState<CompareResult[] | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  // 🔴 «될 리가 없는» 상태를 먼저 말한다 — pending 세션은 본문 sessionId 가 쿠키와 갈려 422/401 이 된다.
  const usable = Boolean(sessionId) && sessionOrigin === "api" && questions.length > 0;

  async function run() {
    if (!sessionId || picked.length === 0) return;
    setBusy(true);
    setWhy(null);
    setResults(null);
    // 🔴 첫 호출은 임베딩 모델 적재가 섞여 느리다(실측 30초+ · warm 100ms). 「멈춘 것」처럼
    //    보이지 않게 준비 중임을 말한다 — 빈 화면 0. 준비 축 자체는 Q-44 로 회부돼 있다.
    const slowTimer = setTimeout(() => setSlow(true), 3000);
    const r = await compareBrowser(sessionId, question, picked);
    clearTimeout(slowTimer);
    setSlow(false);
    setBusy(false);
    if (r.state === "ok") setResults(r.data);
    else setWhy(r.status ? `${r.why} (${r.status})` : r.why);
  }

  const diff = results ? diffLabels(results) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="compare-panel">
      <h1 className="sr-only">⑤ 검색 전략 비교</h1>

      <section className="fkt-card p-5" data-testid="compare-controls">
        <label className="block text-foot text-muted" htmlFor="compare-question">
          질문 <span className="text-muted">(승인 질문 목록)</span>
        </label>
        {questions.length === 0 ? (
          <p className="mt-1 text-body-c text-warn">
            승인된 질문 목록을 가져오지 못했습니다. 목록 없이 임의로 질문을 만들지 않습니다.
          </p>
        ) : (
          <select
            id="compare-question"
            className="mt-2 w-full rounded-chip bg-inset px-3.5 py-3 text-body-c"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            data-testid="compare-question"
          >
            {questions.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-foot">
          {STRATEGIES.map((s) => (
            <label
              key={s}
              className={`flex cursor-pointer items-center gap-1.5 rounded-pill px-3 py-1 transition-colors duration-(--fkt-dur-1) ${
                picked.includes(s) ? "bg-fill font-semibold text-ink" : "text-muted hover:bg-inset hover:text-ink"
              }`}
            >
              {/* 🔴 입력은 «남긴다» — 스타일만 바꾸고 접근성·그물 표지는 그대로다.
                  `sr-only` 로 두면 키보드 포커스와 체크 상태가 보조기술에 남는다. */}
              <input
                type="checkbox"
                className="sr-only"
                checked={picked.includes(s)}
                onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s] : p.filter((x) => x !== s)))}
                data-testid="compare-strategy"
                data-strategy={s}
              />
              {s}
            </label>
          ))}
          <button
            type="button"
            onClick={() => void run()}
            disabled={!usable || busy || picked.length === 0}
            className="ml-auto fkt-btn fkt-btn-primary rounded-pill px-5"
            data-testid="compare-run"
            title={usable ? undefined : "이 세션은 아직 백엔드에 등록되지 않았습니다"}
          >
            {busy ? "비교하는 중…" : "실행"}
          </button>
        </div>

        {!usable && questions.length > 0 && (
          <p className="mt-2 text-foot text-warn" data-testid="compare-unusable">
            이 세션은 서버에 등록되지 않아 비교를 실행할 수 없습니다. 화면을 새로고침해
            다시 입장해 주세요.
          </p>
        )}
        {slow && busy && (
          <p className="mt-2 text-foot text-muted" role="status" data-testid="compare-warming">
            검색 엔진을 준비하는 중입니다. 첫 실행은 준비 시간이 필요해 30초 이상 걸릴 수 있고, 그 뒤에는 1초 안에 끝납니다.
          </p>
        )}
        {why && (
          <p className="mt-2 text-foot text-warn" role="status" data-testid="compare-error">
            비교하지 못했습니다. ({why})
          </p>
        )}
      </section>

      {results && (
        <section
          className="grid gap-3"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, results.length)}, minmax(0, 1fr))` }}
          data-testid="compare-columns"
          data-columns={results.length}
        >
          {results.map((r) => (
            <div key={r.strategy} className="fkt-card p-5" data-testid="compare-column" data-strategy={r.strategy}>
              <p className="flex items-baseline justify-between text-body-c">
                <span>{r.strategy}</span>
                <span className="id text-foot text-muted">{r.elapsedMs.toLocaleString()} ms</span>
              </p>
              <ol className="mt-2 space-y-2">
                {r.hits.map((h, i) => (
                  <li key={`${h.evidenceId}-${i}`} className="border-t border-edge pt-2 first:border-0 first:pt-0" data-testid="compare-hit">
                    <p className="text-foot">
                      <span className="text-muted">{i + 1}</span>{" "}
                      <Link
                        href={`/evidence/${encodeURIComponent(h.evidenceId)}${runId ? `?run=${encodeURIComponent(runId)}` : ""}`}
                        className="id text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
                      >
                        {h.evidenceId}
                      </Link>{" "}
                      <span className="text-muted">{h.score.toFixed(3)}</span>
                    </p>
                    <p className="mt-0.5 line-clamp-3 text-foot text-muted">{h.excerpt}</p>
                  </li>
                ))}
                {r.hits.length === 0 && <li className="text-foot text-muted">이 전략은 결과를 내지 않았습니다.</li>}
              </ol>
              {/* «차이 요약» — 집합 사실만. 우열을 말하지 않는다. */}
              <p className="mt-3 border-t border-edge pt-2 text-foot text-muted" data-testid="compare-diff">
                이 열에만 있는 근거 {diff?.only.get(r.strategy)?.length ?? 0}건
                {diff && diff.shared.length > 0 && <> · 모든 열이 함께 집은 근거 {diff.shared.length}건</>}
              </p>
            </div>
          ))}
        </section>
      )}

      {/* 🔴 측정-주장 경계 각주 — «상시» 노출(baseline §0.2 · wireframes §5) */}
      <p className="fkt-card px-4 py-3 text-foot text-warn" data-testid="compare-footnote">
        이 수치는 이번 실행 1회의 관측값입니다. 정식 성능 측정은 평가 화면에서 확인하실 수 있습니다.
        여기의 순위·score·소요는 전략의 우열을 판정하지 않습니다.
      </p>
    </div>
  );
}
