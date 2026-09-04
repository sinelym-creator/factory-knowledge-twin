import Link from "next/link";

import { isStaticRun } from "@/lib/static-replay/run-id";

/**
 * 근거 화면의 «돌아갈 길» — 경로 표시 1줄 (D-58 ⓐ · 폐하 청구 09-04 17:07).
 *
 * 근거는 조사에서 인용돼 열리지만, 열린 뒤에는 «어디서 왔는지»가 화면에 남지 않았다.
 * 딥링크로 들어온 방문자에게는 애초에 온 길이 없다. 그 둘을 같은 한 줄이 말한다.
 *
 * 🔴 **아는 자리로만 보낸다** — `deep-link-notice.tsx` 가 이미 성문한 규율을 이 줄도 따른다.
 *    `?run=` 은 incidentId 를 말해 주지 않고, 계약 v0.1.15 에도 run→incident 를 되짚는 조회가
 *    없다(실측: `grep run→incident` 0건). 그래서 **조사 조각은 링크가 아니라 라벨**이다.
 *    그럴듯한 incidentId 를 지어 링크로 걸면 눌렀을 때 남의 화면이나 404 로 간다 —
 *    「돌아갈 길」을 만들려다 «틀린 길»을 만드는 것이 이 티켓의 유일한 실패 방식이다.
 *    조사 조각이 링크가 되는 것은 O-10(run 목록 조회 계약)이 선 뒤다.
 *
 * 🔴 **세 갈래를 조각 수로 말한다** — 정적 재생본 · 실제 run · run 없음. 없는 축을 「비어
 *    있는 조각」으로 그리면 방문자는 자기가 무엇을 잃었는지 모른 채 회색 칸을 본다.
 *    run 이 없으면 조사 조각 자체를 세우지 않는다(발주 문면 「첫 조각만」).
 */
export function EvidenceBreadcrumb({
  evidenceId,
  runId,
  staticIncidentId,
}: {
  evidenceId: string;
  /** `?run=` — 조사 조각의 유일한 출처. 없으면 그 조각은 서지 않는다. */
  runId?: string;
  /**
   * 정적 재생본이 «자기 manifest 에 적어 둔» incidentId(`anchors.incidentId`).
   * 🔴 화면이 짓는 값이 아니라 굳혀 둔 사본이 들고 있는 값이다 — 그래서 이 축에서만
   *    가운데 조각이 링크가 될 수 있다. Live 축에는 이런 출처가 없다(위 성문).
   */
  staticIncidentId?: string;
}) {
  const isStatic = isStaticRun(runId);
  const investigation = runId
    ? isStatic
      ? // 🔴 정적 재생본은 «조사»가 아니라 굳혀 둔 사본이다 — 같은 낱말로 부르지 않는다(§0.2).
        "둘러보기 재생"
      : `조사 ${shortRun(runId)}`
    : null;

  /**
   * 🔴 **정적 방문자는 세션이 없다** — `/incidents` 목록은 세션 소유 자원이라 `proxy.ts:134`
   *    가 홈으로 되돌린다(실측 `GET /incidents → 307 → /`). 그 링크를 정적 축에 걸면 투어를
   *    보던 사람이 «투어 밖»으로 나간다. 그래서 이 축에서는 첫 조각을 라벨로 두고, 대신
   *    `proxy.ts:91` 이 이미 여는 주소(`/incidents/{id}`)를 가운데 조각에 건다.
   *    같은 한 줄이 축마다 다른 조각을 링크로 삼는다 — 열리는 문으로만 보내기 때문이다.
   */
  const staticHome = isStatic && staticIncidentId
    ? `/incidents/${encodeURIComponent(staticIncidentId)}?run=${encodeURIComponent(runId!)}`
    : null;

  return (
    <nav aria-label="경로" data-testid="evidence-breadcrumb" className="text-foot text-muted">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <li>
          {staticHome ? (
            <span>Incidents</span>
          ) : (
            <Link
              href="/incidents"
              className="fkt-hit rounded-chip px-1 text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
            >
              Incidents
            </Link>
          )}
        </li>
        {investigation && (
          <li className="flex items-center gap-x-1.5">
            <Separator />
            {staticHome ? (
              <Link
                href={staticHome}
                data-testid="evidence-breadcrumb-run"
                className="fkt-hit rounded-chip px-1 text-ai underline-offset-2 hover:underline focus:outline-2 focus:outline-ai"
              >
                {investigation}
              </Link>
            ) : (
              // 🔴 라벨이다 — 링크가 아니다(위 성문). 눌리는 것처럼 보이지 않게 색도 주지 않는다.
              <span data-testid="evidence-breadcrumb-run">{investigation}</span>
            )}
          </li>
        )}
        <li className="flex min-w-0 items-center gap-x-1.5">
          <Separator />
          <span aria-current="page" className="min-w-0 truncate text-ink">
            근거 <span className="id">{evidenceId}</span>
          </span>
        </li>
      </ol>
    </nav>
  );
}

function Separator() {
  return (
    <span aria-hidden="true" className="text-muted/60">
      ›
    </span>
  );
}

/**
 * run 짧은 표기 — 한 줄에 서기 위해 줄이되, 🔴 «지어내지» 않는다. 앞머리를 그대로 남기고
 * 자른 사실을 말줄임으로 표시한다. 짧은 run 은 손대지 않는다(자를 것이 없다).
 */
function shortRun(runId: string): string {
  return runId.length > 12 ? `${runId.slice(0, 10)}…` : runId;
}
