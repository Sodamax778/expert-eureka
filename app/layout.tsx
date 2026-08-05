import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "小文 AI 微信读书壁纸助手",
  description: "用微信读书数据生成适配 BOOX 墨水屏的简约壁纸。"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
