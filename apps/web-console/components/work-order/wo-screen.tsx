"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  type ApprovalResult,
  type WoPart,
  type WorkOrderDraft,
  decideWorkOrderBrowser,
  patchWorkOrderBrowser,
} from "@/lib/contract";
import { useEscapeToClose } from "@/lib/use-escape-to-close";

/**
 * ④ 작업지시서 편집·승인 (wireframes §4 · T3-5 «최소 형상»).
 *
 * 🔴 **화면은 서버보다 «느슨»하게 말하지 않는다.** 이 화면의 규칙은 전부 서버 실측에서 나왔다:
 *      · 편집 가능 = `title` · `parts` **뿐**(그 밖은 403 — 세 코드가 갈려 온다)
 *      · 안전 조치는 mandatory 여부와 «무관»하게 잠긴다(Q-31: wireframes 의 「mandatory 인 경우」
 *        단서는 서버보다 느슨하다 — 조건절을 지운다)
 *      · 승인·반려는 종단이고, 그 뒤 편집은 409 다
 *    서버보다 «엄격»한 규칙은 하나 둔다 — 반려 사유 필수(아래 성문).
 *
 * 🔴 **`priority`·`planned_at`·`assignee_role`·`estimated_minutes` 칸을 만들지 않는다.** 목업에는
 *    있지만 서버에는 없다(실측 12필드 전수). 칸을 만들면 계약 밖 표면이 화면에서 태어난다.
 */
export function WorkOrderScreen({ initial }: { initial: WorkOrderDraft }) {
  const [wo, setWo] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [saved, setSaved] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [changes, setChanges] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  /** 🔴 잠긴 필드를 «건드렸을 때» 뜨는 문구 — 서버 코드마다 다른 문장(3코드 = 3문구). */
  const [locked, setLocked] = useState<string | null>(null);
  const [asking, setAsking] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  // 🔴 이쪽 취소 버튼은 잠기지 않는다(승인·반려는 눌러야 나간다) — 그래서 열려 있으면 곧
  //    Esc 로 닫을 수 있다. 적어 둔 사유는 사라지지 않는다: `reason` 은 대화상자 «밖» 상태라
  //    다시 열면 그대로 있다(닫기가 «취소»이지 «지우기»가 아니다).
  useEscapeToClose(asking !== null, () => setAsking(null));
  /**
   * 🔴 **부품 이름 칸이 «제어 입력»인 이유**(D-5 · T3-5 ②′ FAIL).
   *
   *    앞판은 `defaultValue` 였다. 신규 부품은 서버가 `componentId` 를 주지 않아 행의 유일한
   *    구별자가 «자리»(index)이고, 신규 2건 중 앞을 지우면 뒤가 그 자리로 올라오면서 React 가
   *    같은 DOM 노드를 재사용한다. 비제어 입력은 재사용된 노드의 값을 다시 읽지 않으므로,
   *    서버가 옳게 지운 뒤에도 화면에는 «지운 이름»이 남았다(검증 좌석 2/2 재현).
   *
   *    값 축은 온전했지만 이 화면은 사람이 결재하는 마지막 장면이다(§16.4) — 「지운 부품이
   *    아직 있다」로 읽은 사람이 한 번 더 [삭제] 를 누르면 남아야 할 부품이 지워진다.
   *    표시의 거짓이 값의 손실로 넘어가는 거리가 한 클릭이라 표시 축으로 접지 않는다.
   *
   *    🔴 처방을 «key» 가 아니라 «입력»에 둔 이유: 신규 부품에 줄 안정 id 가 어디에도 없다.
   *       서버 응답(`parts`)에 신규 원소의 id 가 없고, 저장할 때마다 `setWo(r.data)` 가 배열을
   *       통째로 갈아 끼우므로 클라이언트가 만든 id 는 왕복을 못 넘는다 — 자리가 곧 정체성인
   *       목록이다. 그런 목록에서 «안정 key» 는 지어낼 수 있을 뿐 존재하지 않으므로, 노드가
   *       재사용돼도 값이 다시 그려지는 형태(제어 입력)로 뿌리를 없앤다.
   *       (신규 부품에 서버 id 를 주는 길도 있으나 그것은 계약 형상 변경이라 이 픽스 밖이다.)
   *
   *    편집 중인 «한 칸»만 초안을 든다. 목록 전체를 초안으로 들면 그 초안이 자리로 색인되어
   *    같은 밀림이 한 층 위에서 되살아난다.
   */
  const [editing, setEditing] = useState<{ index: number; value: string } | null>(null);
  /**
   * 🔴 **이력은 «세션 내»가 전부다.** 조회 라우트가 없고 approve/reject 가 주는 `auditId` 뿐이라
   *    (실측), 새로고침하면 사라진다. 그 한계를 화면이 스스로 말한다 — 남아 있는 척하지 않는다.
   */
  const [history, setHistory] = useState<{ at: string; text: string }[]>([]);

  const readOnly = wo.approvalState !== "pending";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(
    async (patch: { title?: string; parts?: WoPart[] }) => {
      setSaved("saving");
      const r = await patchWorkOrderBrowser(wo.workOrderDraftId, patch);
      if (r.state === "ok") {
        setWo(r.data);
        setSaved("saved");
        setChanges((n) => n + 1);
        setWhy(null);
      } else {
        setSaved("error");
        // 🔴 서버가 «사유 코드»로 가른 것을 화면이 한 문장으로 합치지 않는다.
        setWhy(r.detail ? `${r.detail.message} (${r.detail.code})` : r.why);
      }
    },
    [wo.workOrderDraftId],
  );

  // 디바운스 자동 저장 — 타이핑이 멈춘 뒤에 한 번 나간다(글자마다 PATCH 를 쏘지 않는다).
  useEffect(() => {
    if (readOnly || title === wo.title) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save({ title }), 700);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [title, wo.title, readOnly, save]);

  async function decide(decision: "approve" | "reject") {
    // 🔴 «화면 규칙»: 반려에는 사유가 필요하다. 서버는 사유 없이도 200 을 준다(실측) —
    //    화면이 서버보다 엄격한 것은 허용된다(오케 판정 08-31). 서버 규칙이라고 말하지 않는다.
    if (decision === "reject" && reason.trim().length === 0) return;
    const r = await decideWorkOrderBrowser(wo.workOrderDraftId, decision, reason.trim() || undefined);
    setAsking(null);
    if (r.state !== "ok") {
      setWhy(r.detail ? `${r.detail.message} (${r.detail.code})` : r.why);
      return;
    }
    const res: ApprovalResult = r.data;
    setWo({ ...wo, approvalState: decision === "approve" ? "approved" : "rejected" });
    setHistory((h) => [
      ...h,
      {
        at: new Date().toLocaleTimeString("ko-KR"),
        text: `${decision === "approve" ? "승인" : "반려"} · ${res.auditId}${reason.trim() ? ` · 사유: ${reason.trim()}` : ""}`,
      },
    ]);
    setReason("");
  }

  const badge =
    wo.approvalState === "approved" ? "✅ 승인됨" : wo.approvalState === "rejected" ? "⛔ 반려됨" : "◷ 승인 대기";

  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="wo-screen" data-state={wo.approvalState}>
      <h1 className="sr-only">④ 작업지시서 편집·승인 · {wo.workOrderDraftId}</h1>

      <section className="fkt-card p-5" data-testid="wo-header">
        <div className="flex flex-wrap items-center gap-2 text-foot">
          <span className="id text-body-c">{wo.workOrderDraftId}</span>
          <span className="fkt-pill bg-fill text-muted" data-testid="wo-badge">
            {badge}
          </span>
          <span className="text-muted">출처</span>
          <Link href={`/incidents/${encodeURIComponent(wo.incidentId)}`} className="id text-ai hover:underline" data-testid="wo-incident-link">
            {wo.incidentId}
          </Link>
          <span className="text-muted">· 고장 모드</span>
          <span className="id">{wo.failureModeId}</span>
        </div>
        <p className="mt-2 text-foot text-muted">{wo.note}</p>
      </section>

      <div className="flex min-w-0 gap-3">
        {/* ── 편집 영역 ─────────────────────────────────────────────────────── */}
        <section className="min-w-0 flex-1 space-y-3">
          <div className="fkt-card p-5">
            <label className="block text-foot text-muted" htmlFor="wo-title">
              제목
            </label>
            <input
              id="wo-title"
              className="mt-1 w-full rounded-chip bg-inset px-2 py-1.5 text-body-c disabled:opacity-60"
              value={title}
              disabled={readOnly}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="wo-title"
            />

            <p className="mt-3 text-foot text-muted">
              대상 설비 <span className="id text-ink">{wo.equipmentId}</span>{" "}
              {/* 🔴 조사 결과에 귀속된 값이라 사람이 바꾸지 않는다(wireframes §4 ⑧). 서버도 열지 않는다. */}
              <span className="fkt-pill bg-fill">고정</span>
            </p>
          </div>

          {/* 절차 — 🔴 읽기 전용. 서버가 «안전 조치의 근거»라 잠근다(403 safety_basis_immutable) */}
          <div className="fkt-card p-5" data-testid="wo-procedures">
            <p className="text-foot text-muted">
              절차(SOP) <span className="fkt-pill bg-fill">읽기 전용</span>
            </p>
            <ul className="mt-2 space-y-1 text-body-c">
              {wo.procedures.map((p) => (
                <li key={p.sopId}>
                  <span className="id text-foot text-ai">{p.sopId}</span> {p.title}{" "}
                  <span className="text-foot text-muted">· {p.status}</span>
                </li>
              ))}
              {wo.procedures.length === 0 && <li className="text-foot text-muted">인용된 절차가 없습니다.</li>}
            </ul>
            <p className="mt-2 text-foot text-muted">
              절차는 안전 조치의 «근거»라 편집할 수 없습니다.
            </p>
          </div>

          {/* 부품 — 편집 가능(서버가 여는 두 필드 중 하나) */}
          <div className="fkt-card p-5" data-testid="wo-parts">
            <div className="flex items-center">
              <p className="text-foot text-muted">필요 부품</p>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  // 🔴 목록의 «자리»가 바뀌면 자리로 색인된 초안은 남의 행을 가리킨다.
                  setEditing(null);
                  void save({ parts: [...wo.parts, { name: "" }] });
                }}
                className="ml-auto fkt-pill bg-fill text-foot text-muted hover:text-ink disabled:opacity-40"
                data-testid="wo-part-add"
              >
                + 추가
              </button>
            </div>
            <ul className="mt-2 space-y-1">
              {wo.parts.map((p, i) => (
                <li key={`${p.componentId ?? "new"}-${i}`} className="flex items-center gap-2" data-testid="wo-part">
                  {/* 🔴 componentId 는 «있으면» 보여 주고 없으면 만들지 않는다 — 사람이 더한 부품에
                      온톨로지 id 를 지어 붙이면 그 id 는 아무 데도 안 열린다(「없는 근거」가 된다). */}
                  {p.componentId ? (
                    <span className="id text-foot text-muted">{p.componentId}</span>
                  ) : (
                    <span className="text-foot text-muted">(신규)</span>
                  )}
                  <input
                    className="min-w-0 flex-1 rounded-chip bg-inset px-2 py-1 text-body-c disabled:opacity-60"
                    // 🔴 값의 출처는 «서버가 준 배열» 하나다. 편집 중인 칸만 초안을 덧댄다 —
                    //    두 곳에서 값을 만들면 어느 쪽이 참인지 화면이 스스로 답하지 못한다.
                    value={editing?.index === i ? editing.value : (p.name ?? "")}
                    disabled={readOnly}
                    placeholder="부품 이름"
                    onChange={(e) => setEditing({ index: i, value: e.target.value })}
                    onBlur={(e) => {
                      setEditing(null);
                      if (e.target.value === (p.name ?? "")) return;
                      const next = wo.parts.map((q, k) => (k === i ? { ...q, name: e.target.value } : q));
                      void save({ parts: next });
                    }}
                    data-testid="wo-part-name"
                  />
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      setEditing(null);   // 같은 이유 — 지우면 뒤 행이 이 자리로 올라온다
                      void save({ parts: wo.parts.filter((_, k) => k !== i) });
                    }}
                    className="fkt-pill bg-fill text-foot text-muted hover:text-ink disabled:opacity-40"
                    data-testid="wo-part-delete"
                  >
                    삭제
                  </button>
                </li>
              ))}
              {wo.parts.length === 0 && <li className="text-foot text-muted">부품이 없습니다.</li>}
            </ul>
          </div>

          {/* 🛡 안전 조치 — 🔴 편집·삭제 «불가». 서버가 무조건 잠근다(403 safety_measure_immutable) */}
          <div className="rounded border border-warn/40 bg-panel p-3" data-testid="wo-safety">
            <p className="text-foot text-warn">🛡 안전 조치 · 편집·삭제 불가</p>
            <ul className="mt-2 space-y-1 text-body-c">
              {wo.safetyMeasures.map((m) => (
                <li key={m.safetyRuleId} data-testid="wo-safety-item" data-mandatory={String(m.mandatory)}>
                  <span className="id text-foot">{m.safetyRuleId}</span> {m.title}{" "}
                  <span className="text-foot text-muted">· {m.class}</span>
                  <button
                    type="button"
                    onClick={() =>
                      // 🔴 «시도»는 화면에서 끝난다 — 서버에 보내지 않는다(403 이 뻔한 요청을 쏘지 않는다).
                      //    문구는 서버가 그 자리에 주는 코드(safety_measure_immutable)와 같은 뜻이어야 한다.
                      setLocked(
                        "안전 조치는 SOP 가 요구하는 항목이라 편집·삭제할 수 없습니다 (safety_measure_immutable).",
                      )
                    }
                    className="ml-2 fkt-pill bg-fill text-foot text-muted hover:text-ink"
                    data-testid="wo-safety-delete"
                    title="이 항목은 삭제할 수 없습니다"
                  >
                    삭제
                  </button>
                </li>
              ))}
              {wo.safetyMeasures.length === 0 && <li className="text-foot text-muted">안전 조치가 없습니다.</li>}
            </ul>
            {/* 🔴 Q-31: wireframes 는 「mandatory 인 경우」라 적었지만 서버는 mandatory 여부와 «무관»하게
                잠근다. 조건절을 그대로 쓰면 화면이 서버보다 느슨하게 말하는 것이 된다 — 지웠다.
                🔴 Q-32: 「어느 SOP 가 이것을 요구하는가」는 응답에 `sourceSopId` 가 없어 «말할 수 없다».
                목업의 인용 문구를 여기 지어 넣지 않는다(계약 v0.2 재론까지 이연). */}
            <p className="mt-2 text-foot text-muted">
              안전 조치는 SOP 가 요구하는 항목이라 편집·삭제할 수 없습니다.
            </p>
            {locked && (
              <p className="mt-1 text-foot text-warn" role="status" data-testid="wo-locked-note">
                {locked}
              </p>
            )}
          </div>

          {wo.gaps.length > 0 && (
            <div className="fkt-card p-5" data-testid="wo-gaps">
              <p className="text-foot text-muted">초안이 스스로 말하는 «빈 곳»</p>
              <ul className="mt-1 list-disc pl-5 text-body-c">
                {wo.gaps.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* ── 근거 패널 380px ───────────────────────────────────────────────── */}
        <aside className="w-95 shrink-0 fkt-card p-5" data-testid="wo-evidence" data-count={wo.evidenceIds.length}>
          <p className="text-foot text-muted">이 초안이 인용한 근거 {wo.evidenceIds.length}건</p>
          <ul className="mt-2 max-h-160 space-y-1 overflow-y-auto">
            {wo.evidenceIds.map((id) => (
              <li key={id}>
                {/* 🔴 kind 를 id 모양으로 «추측»하지 않는다 — 이 응답에는 kind 가 없다. 아이콘 대신
                    id 를 그대로 보이고, 무엇인지는 ③ 이 열려서 말한다(T3-3 착지분). */}
                <Link
                  href={`/evidence/${encodeURIComponent(id)}`}
                  className="id text-foot text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
                  data-testid="wo-evidence-link"
                >
                  {id}
                </Link>
              </li>
            ))}
            {wo.evidenceIds.length === 0 && <li className="text-foot text-muted">인용된 근거가 없습니다.</li>}
          </ul>
        </aside>
      </div>

      {/* ── 하단 액션 ─────────────────────────────────────────────────────── */}
      <section className="flex flex-wrap items-center gap-2 fkt-card p-5" data-testid="wo-actions">
        <span className="text-foot text-muted" data-testid="wo-save-state" data-changes={changes}>
          {readOnly
            ? "종단 상태 — 편집할 수 없습니다."
            : saved === "saving"
              ? "저장 중…"
              : saved === "error"
                ? "저장하지 못했습니다"
                : changes > 0
                  ? `변경 ${changes}건 · 자동 저장됨`
                  : "변경 없음"}
        </span>
        {why && (
          <span className="text-foot text-warn" role="status" data-testid="wo-error">
            {why}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setAsking("reject")}
            className="fkt-btn fkt-btn-secondary rounded-pill px-4 text-foot text-muted hover:text-ink disabled:opacity-40"
            data-testid="wo-reject"
          >
            반려 (사유 입력)
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setAsking("approve")}
            className="fkt-btn fkt-btn-primary rounded-pill px-5 text-foot"
            data-testid="wo-approve"
          >
            승인
          </button>
        </div>
      </section>

      {history.length > 0 && (
        <section className="fkt-card p-5" data-testid="wo-history">
          <p className="text-foot text-muted">이 세션의 이력</p>
          <ul className="mt-1 space-y-0.5 text-foot">
            {history.map((h, i) => (
              <li key={i}>
                <span className="text-muted">{h.at}</span> · <span className="id">{h.text}</span>
              </li>
            ))}
          </ul>
          {/* 🔴 이력 «조회» 라우트가 없다(실측) — approve/reject 가 주는 auditId 뿐이다.
              남아 있는 척하지 않고 한계를 화면이 말한다. */}
          <p className="mt-1 text-foot text-muted">
            이 목록은 이 화면이 열려 있는 동안만 남습니다 — 새로고침하면 사라집니다(서버에 이력 조회
            경로가 없습니다).
          </p>
        </section>
      )}

      {asking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-scrim p-4">
          <div className="w-full max-w-md fkt-card p-6" role="dialog" aria-modal>
            <p className="text-body-c">
              {asking === "approve" ? "이 작업지시서를 승인할까요?" : "이 작업지시서를 반려할까요?"}
            </p>
            <p className="mt-1 text-foot text-muted">
              {asking === "approve"
                ? "승인 후에는 편집할 수 없고 되돌릴 수 없습니다(서버가 종단으로 강제합니다)."
                : "반려 후에는 편집할 수 없고 되돌릴 수 없습니다."}
            </p>
            {asking === "reject" && (
              <>
                <label className="mt-3 block text-foot text-muted" htmlFor="wo-reason">
                  사유 <span className="text-warn">(필수)</span>
                </label>
                <textarea
                  id="wo-reason"
                  className="mt-1 w-full rounded-chip bg-inset px-2 py-1.5 text-body-c"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  data-testid="wo-reason"
                />
              </>
            )}
            <div className="mt-4 flex justify-end gap-2 text-foot">
              <button
                className="fkt-btn fkt-btn-secondary rounded-pill px-4.5 text-muted hover:text-ink"
                onClick={() => setAsking(null)}
                data-testid="wo-cancel"
              >
                취소
              </button>
              <button
                className="fkt-btn fkt-btn-secondary rounded-pill px-4.5 text-ai hover:text-ink disabled:opacity-40"
                disabled={asking === "reject" && reason.trim().length === 0}
                onClick={() => void decide(asking)}
                data-testid="wo-confirm"
              >
                {asking === "approve" ? "승인" : "반려"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
