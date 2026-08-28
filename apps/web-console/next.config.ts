import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 🔴 리포 파일 표준: CLAUDE.md 는 프로젝트 루트 단일본이다.
  // Next 16이 dev 기동 시 앱 폴더에 CLAUDE.md·AGENTS.md 를 자동 생성하므로 끈다.
  agentRules: false,
};

export default nextConfig;
