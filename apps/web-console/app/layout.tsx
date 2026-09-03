import type { Metadata } from "next";
import "./globals.css";

import { AppShell } from "@/components/app-shell";

/* 폰트 = 시스템 스택(globals.css `--fkt-font-sans` · T6-4 규격서 ②). Geist 웹폰트를 내렸다 —
   fetch 0 이 LCP 를 가장 싸게 줄이는 길이고(⑤ E3), 애플 감성의 절반은 플랫폼 폰트 자체다. */

export const metadata: Metadata = {
  title: "Factory Knowledge Twin — AI Operations Console",
  description: "synthetic 공장 1곳의 운영 콘솔 (PoC · 실 공장 데이터가 아닙니다)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
