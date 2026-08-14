"use client";

import type { TransientFontPayload } from "./browser-storage";

const SVG_DATA_PREFIX = "data:image/svg+xml;utf8,";

function fontMime(fileName: string) {
  const extension = fileName.slice(fileName.lastIndexOf(".")).toLowerCase();
  if (extension === ".otf") return "font/otf";
  if (extension === ".woff") return "font/woff";
  if (extension === ".woff2") return "font/woff2";
  return "font/ttf";
}

export function applyLocalFontToSvgPreview(
  imageUrl: string,
  font: TransientFontPayload | undefined
) {
  if (!font || !imageUrl.startsWith(SVG_DATA_PREFIX)) return imageUrl;

  const svg = decodeURIComponent(imageUrl.slice(SVG_DATA_PREFIX.length));
  const fontFamily = "ShubingBrowserPreviewFont";
  const fontCss = `@font-face{font-family:"${fontFamily}";src:url("data:${fontMime(font.fileName)};base64,${font.dataBase64}");font-style:normal;font-weight:100 900;font-display:block}text{font-family:"${fontFamily}","Microsoft YaHei",sans-serif!important}`;
  const styledSvg = svg.includes("</style>")
    ? svg.replace("</style>", `${fontCss}</style>`)
    : svg.replace("</svg>", `<style>${fontCss}</style></svg>`);

  return URL.createObjectURL(new Blob([styledSvg], { type: "image/svg+xml;charset=utf-8" }));
}

export function revokeLocalFontPreview(imageUrl: string | null | undefined) {
  if (imageUrl?.startsWith("blob:")) URL.revokeObjectURL(imageUrl);
}
