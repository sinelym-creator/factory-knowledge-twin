/**
 * 신뢰 배지 행 — 「이 근거를 지금 인용해도 되는가」를 한 줄로 (wireframes §3 문서 헤더 · F-4).
 *
 * 계약이 이 자리에 실어 보낸 6필드(`revisionId`·`contentHash`·`stale`·`approvalState`·
 * `effectiveFrom`·`effectiveTo`)를 «전부» 그린다 — 하나를 빼면 그 축은 화면에서 사라지고,
 * 사라진 축은 아무도 틀렸다고 말해 주지 않는다.
 *
 * 🔴 **색인 배지는 «양쪽 다» 그린다**(오케 승인 08-30). stale=false 일 때 배지를 «비우면»
 *    방문자도 다음 좌석도 「신선하다」와 「배지가 아직 구현되지 않았다」를 구분하지 못한다.
 *    지금 seed 에는 STALE revision 이 0건이라(T3-3 실측 E1) 이 화면에서 amber 는 한 번도
 *    켜지지 않는다 — 그럴수록 켜지지 않은 자리가 «켜질 수 있는 자리»로 보여야 한다.
 *
 * 🔴 **`record` 의 `stale=false` 를 「FRESH 실증」으로 쓰지 않는다.** 계약 v0.1.1 에서
 *    record 의 false 는 «색인이라는 개념이 없다»는 뜻이지 «신선을 확인했다»가 아니다.
 *    두 false 를 같은 초록 배지로 그리면, 재는 축이 없는 것을 잰 것처럼 말하게 된다
 *    (§0.2 측정-주장 경계). 그래서 `indexed={false}` 면 배지 낱말 자체가 다르다.
 */
export function TrustHeader({
  revisionId,
  contentHash,
  approvalState,
  effectiveFrom,
  effectiveTo,
  stale,
  indexed = true,
}: {
  revisionId: string | null;
  contentHash: string | null;
  approvalState: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  stale: boolean;
  /** false = 색인 축이 «없는» 근거(record). 배지가 신선도를 주장하지 않는다. */
  indexed?: boolean;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foot text-muted"
      data-testid="trust-header"
      data-stale={stale}
      data-indexed={indexed}
    >
      {revisionId ? (
        <span className="id text-ink">{revisionId}</span>
      ) : (
        <span className="id">revision 없음</span>
      )}

      <span>
        상태{" "}
        {approvalState ? (
          // 🔴 색만으로 구분하지 않는다(§10) — 아이콘 + 텍스트 라벨 병행.
          <span className={approvalState === "approved" ? "text-ok" : "text-warn"}>
            {approvalState === "approved" ? "✓" : "◷"} {approvalState}
          </span>
        ) : (
          <span>—</span>
        )}
      </span>

      <span>
        유효{" "}
        {effectiveFrom ? (
          <span className="id">
            {effectiveFrom}~{effectiveTo ?? ""}
          </span>
        ) : (
          "—"
        )}
      </span>

      <span>
        sha256{" "}
        {contentHash ? (
          // 앞 4 · 뒤 4 — wireframes §3 표기(`5945…f5e8`). 전체는 title 로 남긴다.
          <span className="id" title={contentHash}>
            {contentHash.slice(0, 4)}…{contentHash.slice(-4)}
          </span>
        ) : (
          "—"
        )}
      </span>

      <IndexBadge stale={stale} indexed={indexed} />
    </div>
  );
}

function IndexBadge({ stale, indexed }: { stale: boolean; indexed: boolean }) {
  if (!indexed) {
    return (
      <span
        className="fkt-pill bg-fill"
        data-testid="index-badge"
        data-state="not-indexed"
        title="이 근거는 대장에서 바로 읽어 온 값이라 색인이 낡았는지 따질 대상이 아닙니다."
      >
        ─ 대장에서 바로 읽음
      </span>
    );
  }
  if (stale) {
    return (
      <span
        className="rounded border border-warn/50 px-2 py-0.5 text-warn"
        data-testid="index-badge"
        data-state="stale"
        title="검색 색인이 문서의 최신 판본을 아직 따라잡지 못했습니다. 원문은 정상이지만 검색 결과가 조금 늦을 수 있습니다."
      >
        ⚠ 검색 색인이 최신이 아님
      </span>
    );
  }
  return (
    <span
      className="rounded border border-ok/40 px-2 py-0.5 text-ok"
      data-testid="index-badge"
      data-state="fresh"
      title="검색 색인이 문서의 최신 판본과 일치하는 것을 확인했습니다."
    >
      ✓ 검색 색인 최신
    </span>
  );
}
