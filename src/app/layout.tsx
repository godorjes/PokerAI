import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poker AI V3.2",
  description: "五人桌无限注德州扑克，本地机器人阶段",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
