export const anonymousEventNames = [
  "page_open",
  "weread_connected",
  "preview_generated",
  "image_downloaded"
] as const;

export type AnonymousEventName = (typeof anonymousEventNames)[number];

export const anonymousEventLabels: Record<AnonymousEventName, string> = {
  page_open: "页面打开",
  weread_connected: "微信读书连接成功",
  preview_generated: "预览生成成功",
  image_downloaded: "图片下载"
};

export function isAnonymousEventName(value: unknown): value is AnonymousEventName {
  return typeof value === "string" && anonymousEventNames.includes(value as AnonymousEventName);
}
