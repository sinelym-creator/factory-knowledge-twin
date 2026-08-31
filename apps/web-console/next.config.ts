import type { NextConfig } from "next";

/**
 * 🔴 **`FKT_API_BASE` 는 «빌드 시점»에 정해진다 — Q-37 종결**(T4-1 ⓑ).
 *
 * 있었던 일: 이 값이 «두 층»에서 각각 서 있었다.
 *   · `rewrites()` 의 destination = 빌드 산출물에 구워진다 → **빌드** 값
 *   · `lib/contract.ts` 의 `apiBase()` = 서버 프로세스의 `process.env` → **런타임** 값
 * 실측(T4-1 · 빌드 8003 / start 9999 로 «일부러» 갈라 띄움): 브라우저 경유 `/api/*` 는
 * 8003 이 답했고(ai-api 자기 로그에 그 401 이 찍혔다) 서버 렌더·입장 핸들러는 9999 로 나가
 * 미연결이 됐다. 세션도 pending 으로 떨어졌다.
 * 🔴 그리고 그 화면은 «정상처럼 보였다» — 「Live AI 연결이 끊겨 Replay로 전환했습니다」라는
 *    평상시 fallback 문구가 떴다. 설정 사고가 평상시 화면과 구별되지 않는 것이 이 결함의 몸통이다.
 *
 * 처방(오케 판정 08-31): **빌드 값이 정본**이다. `env` 로 빌드 타임 상수를 구워 앱 코드가
 * 그것만 읽게 하고, 런타임 env 는 «대조용»으로만 둔다 — 다르면 `instrumentation.ts` 가
 * 부팅을 죽인다. 화면 상단 경고 같은 «부드러운» 신호는 두지 않는다: 정상처럼 보이는 자리를
 * 하나 더 만드는 일이기 때문이다.
 *
 * 🔴 목적지를 바꾸려면 **재빌드**해야 한다. `next start` 에만 새 값을 주는 것은 목적지 변경이
 *    아니라 «부팅 실패»다(그렇게 되도록 만들었다).
 */
const API_BASE = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";

/**
 * 보안 헤더 (baseline §16.3 「security header와 CSP」 · T4-1 ⓒ).
 *
 * 🔴 **CSP 는 실측으로 조정한다.** 여기 적힌 절은 「막고 싶은 것」이 아니라 「이 셸이 실제로
 *    쓰는 것」의 목록이다 — 넓게 적으면 CSP 가 있다는 사실만 남고 아무것도 안 막는다.
 *      connect-src  'self' + ws:/wss: — 계약 호출은 rewrite 경유라 same-origin 이고,
 *                   WS(`/api/ws/runs/{id}`)도 같은 origin 으로 업그레이드된다(T3-4 실측 101).
 *      script/style 'unsafe-inline' — Next 가 하이드레이션 부트스트랩을 인라인으로 심는다.
 *                   nonce 로 좁히는 것은 이 티켓 범위 밖이다(전 화면 실측이 따라와야 한다).
 *      frame-ancestors 'none' — 클릭재킹. X-Frame-Options 보다 이쪽이 정본이다.
 * 🔴 위반은 «콘솔에 보이게» 둔다(report-only 로 숨기지 않는다) — 조용히 막힌 리소스는
 *    「없는 기능」과 구별되지 않는다.
 */
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' ws: wss:",
  "form-action 'self'",
].join("; ");

/**
 * 🔴 **HSTS 는 https 로 서비스될 때만 붙인다.** 로컬 http 에 붙이면 브라우저가 그 호스트를
 *    https 로만 기억해 `127.0.0.1` 개발이 통째로 막히고, 그 상태는 캐시라 되돌리기 어렵다.
 *    공개 배포(Vercel·Tunnel)에서 `FKT_PUBLIC_HTTPS=1` 로 켠다.
 */
const HTTPS_PUBLIC = process.env.FKT_PUBLIC_HTTPS === "1";

const nextConfig: NextConfig = {
  // 🔴 리포 파일 표준: CLAUDE.md 는 프로젝트 루트 단일본이다.
  // Next 16이 dev 기동 시 앱 폴더에 CLAUDE.md·AGENTS.md 를 자동 생성하므로 끈다.
  agentRules: false,

  // 🔴 빌드 타임 상수 — 앱 코드는 «이것만» 읽는다(`lib/contract.ts` apiBase).
  //    런타임 `process.env.FKT_API_BASE` 와 갈리면 instrumentation 이 부팅을 죽인다.
  env: { FKT_API_BASE_BUILD: API_BASE },

  // 계약 v0.1의 base는 `/api`다(rest-api-v0.1.md). 화면 코드가 그 경로를 «그대로» 부르고,
  // 어디로 나갈지는 여기 한 줄이 정한다 — 포트가 바뀌어도 화면 코드는 바뀌지 않는다.
  // ai-api가 떠 있지 않으면 이 rewrite는 연결 거부가 되고, 클라이언트는 그것을 «미연결»로 접는다.
  // 🔴 WebSocket 업그레이드도 이 rewrite 를 그대로 탄다(T3-4 실측: 셸 경유 101) — 그래서
  //    브라우저는 API base 를 알 필요가 없고, 세션 쿠키도 same-origin 으로 실린다.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_BASE}/api/:path*` }];
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          // 이 셸은 카메라·마이크·위치를 쓰지 않는다 — 안 쓰는 것은 «꺼 둔다».
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
          ...(HTTPS_PUBLIC
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
