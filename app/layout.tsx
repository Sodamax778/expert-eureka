import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "薯饼壁纸实验室",
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
