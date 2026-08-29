import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 🔴 리포 파일 표준: CLAUDE.md 는 프로젝트 루트 단일본이다.
  // Next 16이 dev 기동 시 앱 폴더에 CLAUDE.md·AGENTS.md 를 자동 생성하므로 끈다.
  agentRules: false,

  // 계약 v0.1의 base는 `/api`다(rest-api-v0.1.md). 화면 코드가 그 경로를 «그대로» 부르고,
  // 어디로 나갈지는 여기 한 줄이 정한다 — 포트가 바뀌어도 화면 코드는 바뀌지 않는다.
  // ai-api가 떠 있지 않으면 이 rewrite는 연결 거부가 되고, 클라이언트는 그것을 «미연결»로 접는다.
  async rewrites() {
    const base = process.env.FKT_API_BASE ?? "http://127.0.0.1:8000";
    return [{ source: "/api/:path*", destination: `${base}/api/:path*` }];
  },
};

export default nextConfig;
