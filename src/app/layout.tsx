import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Poker AI V3.2 · 本地德州扑克与 AI 五人桌",
    template: "%s · Poker AI",
  },
  description:
    "本地运行的五人桌无限注德州扑克与 AI 实验项目：四名牌风机器人、DeepSeek BYOK 决策、规则引擎、并发控制与公开行动解读；无需 Key 可玩。",
  applicationName: "Poker AI V3.2",
  category: "games",
  keywords: [
    "德州扑克",
    "本地德州扑克",
    "单机德州扑克",
    "德州扑克与 AI",
    "AI 德州扑克",
    "德州扑克 AI",
    "DeepSeek 德州扑克",
    "浏览器德州扑克",
    "无限注德州扑克",
    "Next.js",
    "TypeScript",
  ],
  openGraph: {
    title: "Poker AI V3.2 · 本地德州扑克与 AI 五人桌",
    description:
      "五人桌无限注德州扑克与四名 AI 机器人；无需 Key 可玩，可选 DeepSeek BYOK 智能决策。",
    type: "website",
    locale: "zh_CN",
  },
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
