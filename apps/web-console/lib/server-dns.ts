/**
 * 🔴 **D-12d — ai-api 로 나가는 «서버» 요청의 이름 해석을 우리 손으로 한 겹 감싼다.**
 *
 * 🔴 **이것은 «완화»가 아니라 «우회»다.** 뿌리는 우리 층이 아니다 — ts.net 권위 네임서버가
 *    `AAAA` 질의에 간헐적으로 **NXDOMAIN**(NODATA 여야 한다)을 답하고, 리졸버는 RFC 2308 대로
 *    그 부정 응답을 «이름 단위»로 캐시한다. 그러면 A 레코드가 멀쩡한데도 그 인스턴스의
 *    `getaddrinfo` 는 이름 자체가 없다며 `ENOTFOUND` 를 낸다. 이 파일은 그 캐시를 «지나가지
 *    않는 길»을 하나 더 두는 것이지, 권위 응답을 고치지 않는다.
 *
 * 실측(E1 · 2026-09-01):
 *   · 15:13~ Production 함수 3종(`/enter` · 프록시 `/api/health` · `live/status`) 전건
 *     `getaddrinfo ENOTFOUND harry.tail488f52.ts.net` ↔ 같은 분 공개 DoH 는 A 2건 정상 ·
 *     인그레스 IP 직결 200 · 로컬 200.
 *   · 15:19:17 프록시 `health` 는 200 으로 돌아왔는데 `/enter` 는 같은 순간 3/3 ENOTFOUND
 *     — **함수 인스턴스마다 갈린다**. 부정 캐시가 인스턴스에 붙어 있다는 뜻이고, 그래서
 *     아래 캐시도 «인스턴스 수명»이다(전역 저장소가 아니다 · 인스턴스가 갈리면 다시 빈다).
 *   · 자비스 DoH 반복 10회: Cloudflare `AAAA` **NXDOMAIN 2/10** · Google 0/10 · `A` 는 전건
 *     안정 ⇒ 부정 캐시를 «유발하는» 질의는 AAAA 쪽이다.
 *   · 같은 축 40회 연속성: CF **18/40**(최장 연속 7) ↔ Google **0/40** · **같은 회차에 둘 다
 *     실패한 적 0** ⇒ 권위는 답을 갖고 있고 «특정 리졸버 노드»가 부정 캐시에 걸려 있다
 *     (애니캐스트 노드 섞임 · 함수 인스턴스는 한 노드에 붙는다 = 17분 연속의 설명).
 *
 * 🔴 그래서 ② 는 **병렬 + 첫 유효 답**이다. 한 제공자의 NXDOMAIN·빈 답을 «최종»으로 읽으면
 *    그 노드의 병을 우리 결론으로 삼는 것이 된다. 순서를 고정하거나 한쪽을 선호하지도
 *    않는다 — 40회 표본의 비대칭은 «그 시각 그 노드»의 것이지 제공자의 성질이 아니다.
 *
 * 🔴 그래서 ① 단은 `family: 4` 로 묻는다 — **AAAA 를 우리가 안 물으면** 그 캐시를 우리 손으로
 *    만들 일이 없다. 인그레스가 v4 2개뿐이라(실측 A=2 · AAAA 없음) 잃는 것은 0 이다.
 *
 * 단계:
 *   ① 시스템 `dns.lookup(host, { family: 4, all: true })` → 성공하면 그대로 쓰고 «마지막 성공»을 캐시
 *   ② `ENOTFOUND`·`EAI_AGAIN`·`ESERVFAIL` 이면 DoH 로 A 조회 — **1.1.1.1 과 8.8.8.8 을 «병렬»로
 *      묻고 「A ≥ 1」인 첫 답을 쓴다**(각 1.5s)
 *   ③ 그것도 실패면 마지막 성공 캐시(TTL 무시 — 「없는 것보다 낡은 것」)
 *   ④ 다 없으면 **원래 오류를 그대로** 돌려준다(지금과 같은 실패 · 새 실패를 만들지 않는다)
 *
 * 🔴 **DoH 는 IP 로 직결한다** — 이름을 풀 수 없어서 온 자리에서 이름을 또 풀 수는 없다.
 *    TLS 는 IP SAN 으로 검증된다(실측: servername 없이 1.1.1.1 172ms · 8.8.8.8 416ms · 둘 다
 *    A=[103.84.155.153, 103.84.155.217] · 상한 1.5s 안).
 * 🔴 **`fetch` 를 쓰지 않는다** — 「셸에서 나가는 fetch 는 `lib/contract.ts` 한 파일」이라는
 *    불변식(`scripts/contract-surface.mjs`)을 이 파일 때문에 깨지 않기 위해서다. 여기서는
 *    `node:https` 로 내려간다(계약 표면이 아니라 «이름 해석»이다).
 * 🔴 **서버 전용 파일이다.** `node:dns`·`node:https` 를 import 하므로 클라이언트 번들에
 *    들어가면 빌드가 깨진다 — 부르는 쪽이 «서버 분기에서 지연 import» 한다.
 * 🔴 **로그에 호스트명·IP 를 적지 않는다**(공개 경계 §15.2). 남는 것은 단계 이름과 건수·ms 다.
 */
import { lookup as systemLookup, type LookupAddress, type LookupOptions } from "node:dns";
import https from "node:https";

/** DoH 한 곳당 상한. 두 곳을 «순차»로 도는 최악은 3s 이고, 그 위에 fetch 자신의 상한이 있다. */
const DOH_TIMEOUT_MS = 1500;

/** 이 코드들만 «이름 해석이 고장났다»로 본다 — 나머지는 우리가 고칠 축이 아니다. */
const RECOVERABLE = new Set(["ENOTFOUND", "EAI_AGAIN", "ESERVFAIL"]);

/**
 * 🔴 «마지막 성공 답» — 호스트별 A 목록. **인스턴스 수명**이다(모듈 전역 = 함수 인스턴스 하나).
 *    인스턴스가 갈리면 비고, 그때는 ①·② 가 다시 답한다. TTL 을 두지 않는 이유: 이 캐시가
 *    쓰이는 순간은 「지금 아무도 답을 못 준다」이고, 그 자리에서 낡음을 따지는 것은 사치다.
 */
const lastGood = new Map<string, string[]>();

type DohEndpoint = { readonly stage: string; readonly ip: string; readonly path: (host: string) => string };

/** 🔴 이름이 아니라 «IP» 다 — 이 두 주소는 인증서에 IP SAN 으로 들어 있어 검증이 선다. */
const DOH_ENDPOINTS: readonly DohEndpoint[] = [
  {
    stage: "doh-cf",
    ip: "1.1.1.1",
    path: (host) => `/dns-query?name=${encodeURIComponent(host)}&type=A`,
  },
  {
    stage: "doh-google",
    ip: "8.8.8.8",
    path: (host) => `/resolve?name=${encodeURIComponent(host)}&type=A`,
  },
];

/** DoH JSON 한 곳 조회 — A 레코드만 꺼낸다(§보강 1: AAAA 는 «묻지 않는다»). */
function dohQuery(endpoint: DohEndpoint, host: string): Promise<string[]> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: endpoint.ip,
        port: 443,
        method: "GET",
        path: endpoint.path(host),
        headers: { accept: "application/dns-json" },
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) return resolve([]);
          try {
            const parsed = JSON.parse(body) as { Answer?: { type: number; data: string }[] };
            // type 1 = A. CNAME(5) 등 다른 답은 주소가 아니다 — 지어내지 않는다.
            resolve((parsed.Answer ?? []).filter((a) => a.type === 1).map((a) => a.data));
          } catch {
            resolve([]);
          }
        });
      },
    );
    req.setTimeout(DOH_TIMEOUT_MS, () => req.destroy(new Error("doh timeout")));
    req.on("error", () => resolve([]));
    req.end();
  });
}

/**
 * 🔴 **먼저 「쓸 수 있는 답」을 준 쪽을 쓴다 — 둘 다 비어야 실패다**(보강 2).
 *    한 곳의 빈 답(NXDOMAIN 포함)은 「이름이 없다」가 아니라 「그 노드가 지금 그렇게 말한다」다.
 *    그래서 «먼저 실패한 쪽»으로 결론을 내지 않고, 남은 쪽의 답을 끝까지 기다린다.
 */
function firstUsable<T extends { found: string[] }>(tasks: Promise<T>[]): Promise<T | undefined> {
  return new Promise((resolve) => {
    let pending = tasks.length;
    let settled = false;
    const lose = () => {
      pending -= 1;
      if (!settled && pending === 0) resolve(undefined);
    };
    for (const task of tasks) {
      task
        .then((r) => {
          if (settled) return;
          if (r.found.length > 0) {
            settled = true;
            return resolve(r);
          }
          lose();
        })
        .catch(lose);
    }
  });
}

/**
 * 🔴 `net.connect` 의 `LookupFunction` 과 **글자 그대로 같은** 모양이어야 한다 — 여기서
 *    `address` 를 optional 로 두면 undici 의 `connect.lookup` 자리에 못 꽂힌다(빌드 실측:
 *    `TS2322 … is not assignable to type 'LookupFunction'`). 오류 회차에도 자리는 채운다.
 */
type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** 호출자가 `all` 을 요구했는지에 맞춰 같은 답을 두 모양 중 하나로 돌려준다. */
function reply(cb: LookupCallback, options: LookupOptions, addresses: string[]): void {
  if (options.all) {
    cb(
      null,
      addresses.map((address) => ({ address, family: 4 })),
    );
    return;
  }
  cb(null, addresses[0], 4);
}

export type DnsStage = "system" | "doh-cf" | "doh-google" | "cache" | "none";

/** 관측용 — 「어느 단계가 답했는가」. 정상(①)은 세되 «로그를 내지 않는다»(소음 금지). */
export type DnsObservation = { stage: DnsStage; systemCode: string; ms: number };

export type LookupDeps = {
  /** 시스템 해석기(기본 = `systemLookupV4`). 드릴이 여기를 갈아 끼워 ①의 실패를 만든다. */
  readonly system?: (host: string, cb: (err: NodeJS.ErrnoException | null, addresses: string[]) => void) => void;
  /** DoH 조회. 드릴이 여기를 갈아 끼워 ②의 성공·실패를 만든다. */
  readonly doh?: (endpoint: DohEndpoint, host: string) => Promise<string[]>;
  /** 관측 훅 — 프로덕션은 `console.warn`, 드릴은 배열에 담는다. */
  readonly observe?: (o: DnsObservation) => void;
};

/**
 * 🔴 **`family: 4` 로만 묻는다**(보강 1). AAAA 질의가 부정 캐시를 만드는 축이므로 우리가
 *    그것을 «내지 않는다». 인그레스는 v4 2개뿐이라 잃는 주소가 없다.
 */
export function systemLookupV4(
  host: string,
  cb: (err: NodeJS.ErrnoException | null, addresses: string[]) => void,
): void {
  systemLookup(host, { family: 4, all: true }, (err, addresses) => {
    if (err) return cb(err, []);
    cb(
      null,
      (addresses as LookupAddress[]).map((a) => a.address),
    );
  });
}

/**
 * `net.connect` 가 받는 모양의 `lookup` 을 만든다.
 *
 * 🔴 **새 실패를 만들지 않는다**: ②③ 이 다 비면 ①이 준 «원래 오류»를 그대로 돌려준다.
 *    여기서 우리가 만든 오류를 얹으면, 이 우회가 없던 날과 실패의 모양이 달라져
 *    「무엇이 고장인가」를 읽는 사람이 한 겹 더 벗겨야 한다.
 */
export function createFallbackLookup(deps: LookupDeps = {}) {
  const system = deps.system ?? systemLookupV4;
  const doh = deps.doh ?? dohQuery;
  const observe = deps.observe ?? defaultObserve;

  return function fallbackLookup(host: string, options: LookupOptions, cb: LookupCallback): void {
    const started = Date.now();
    system(host, (err, addresses) => {
      if (!err && addresses.length > 0) {
        lastGood.set(host, addresses);
        observe({ stage: "system", systemCode: "ok", ms: Date.now() - started });
        return reply(cb, options, addresses);
      }

      const systemCode = err?.code ?? "EMPTY";
      // 🔴 이름 해석 «고장»이 아닌 실패는 우리가 손댈 자리가 아니다 — 그대로 올린다.
      if (err && !RECOVERABLE.has(systemCode)) {
        observe({ stage: "none", systemCode, ms: Date.now() - started });
        return cb(err, "");
      }

      void (async () => {
        const won = await firstUsable(
          DOH_ENDPOINTS.map(async (endpoint) => ({ endpoint, found: await doh(endpoint, host) })),
        );
        if (won) {
          lastGood.set(host, won.found);
          observe({ stage: won.endpoint.stage as DnsStage, systemCode, ms: Date.now() - started });
          return reply(cb, options, won.found);
        }

        const cached = lastGood.get(host);
        if (cached && cached.length > 0) {
          observe({ stage: "cache", systemCode, ms: Date.now() - started });
          return reply(cb, options, cached);
        }

        observe({ stage: "none", systemCode, ms: Date.now() - started });
        // ④ 원래 오류 그대로 — ①이 오류를 안 줬다면(주소 0건) 그때만 우리가 만든다.
        cb(
          err ?? Object.assign(new Error("dns lookup returned no address"), { code: "ENOTFOUND" }),
          "",
        );
      })();
    });
  };
}

/**
 * 🔴 정상 경로(①)는 **로그를 내지 않는다** — 모든 요청마다 한 줄이 쌓이면 그 로그는 아무도
 *    안 읽고, 정작 우회가 돈 회차가 그 안에 묻힌다. 호스트·IP 는 어느 단계에서도 안 찍는다.
 */
function defaultObserve(o: DnsObservation): void {
  if (o.stage === "system") return;
  console.warn(`[dns] system=${o.systemCode} fallback=${o.stage} ${o.ms}ms`);
}

/** 드릴이 캐시 축을 재현할 수 있도록 비우는 자리 — 프로덕션 경로에서는 부르지 않는다. */
export function __resetDnsCacheForDrill(): void {
  lastGood.clear();
}

/**
 * 🔴 **ai-api 로 나가는 서버 요청이 탈 «한 벌»** — undici 의 `fetch` 와 **같은 패키지의**
 *    `Agent` 를 함께 돌려준다.
 *
 * 🔴 왜 «같은 패키지»여야 하나: 전역 `fetch`(Node 내부 undici)에 이 패키지의 `Agent` 를
 *    `dispatcher` 로 넘기면 «다른 복사본»끼리 만나 dispatcher 가 조용히 무시되거나 형이
 *    안 맞는다. 한 경로로 묶어 그 함정을 없앤다(오케 조건 ②).
 * 🔴 왜 지연 import 인가: `lib/contract.ts` 는 **클라이언트 번들에도 들어간다.** 그 파일이
 *    `undici` 를 최상단에서 import 하면 브라우저 빌드가 깨진다. 그래서 이 서버 전용 모듈에
 *    가두고, 부르는 쪽이 «서버 분기 안에서» `await import("./server-dns")` 한다.
 * 🔴 Agent 는 **한 번만** 만든다 — 요청마다 새로 만들면 연결 재사용이 사라지고, 위의
 *    `lastGood` 캐시와 달리 그것은 성능이 아니라 «부하»의 문제가 된다.
 * 🔴 TLS: `lookup` 이 주소를 바꿔도 **SNI·인증서 검증은 호스트명 그대로** 간다 — undici 는
 *    `servername` 을 URL 의 host 에서 정하고, 우리가 바꾸는 것은 «어디로 연결하는가»뿐이다.
 */
type UndiciBundle = {
  fetch: (input: string, init?: Record<string, unknown>) => Promise<Response>;
  dispatcher: unknown;
};

let bundle: UndiciBundle | undefined;

export async function loadServerFetch(): Promise<UndiciBundle> {
  if (bundle) return bundle;
  const undici = await import("undici");
  const agent = new undici.Agent({ connect: { lookup: createFallbackLookup() } });
  bundle = {
    fetch: undici.fetch as unknown as UndiciBundle["fetch"],
    dispatcher: agent,
  };
  return bundle;
}
