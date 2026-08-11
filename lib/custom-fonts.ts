import subsetFont from "subset-font";
import { builtInFonts, defaultFontKey } from "./font-catalog";

export const maxFontFileSize = 24 * 1024 * 1024;

export type TransientFontPayload = {
  key: string;
  name: string;
  fileName: string;
  mime: string;
  dataBase64: string;
};

const allowedExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function hasValidSignature(bytes: Uint8Array, extension: string) {
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  const hasTrueTypeOutline =
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
    signature === "true";
  if (extension === ".woff2") return signature === "wOF2";
  if (extension === ".woff") return signature === "wOFF";
  if (extension === ".otf") return signature === "OTTO" || hasTrueTypeOutline;
  return hasTrueTypeOutline;
}

function decodeTransientFont(fontKey: string, payload: TransientFontPayload | undefined) {
  if (!payload || payload.key !== fontKey || !fontKey.startsWith("custom:")) return null;
  const extension = extensionOf(payload.fileName);
  if (!allowedExtensions.has(extension) || !payload.dataBase64) return null;
  const estimatedSize = Math.floor((payload.dataBase64.length * 3) / 4);
  if (estimatedSize <= 0 || estimatedSize > maxFontFileSize + 3) {
    throw new Error("字体文件需小于 24 MB。");
  }
  const bytes = Buffer.from(payload.dataBase64, "base64");
  if (bytes.byteLength <= 0 || bytes.byteLength > maxFontFileSize || !hasValidSignature(bytes, extension)) {
    throw new Error("字体文件无效或格式不受支持。");
  }
  return bytes;
}

export async function resolveSvgFont(
  fontKey: string | undefined,
  svgText: string,
  transientFont?: TransientFontPayload
) {
  const builtIn =
    builtInFonts.find((font) => font.key === fontKey) ||
    builtInFonts.find((font) => font.key === defaultFontKey)!;
  if (!fontKey?.startsWith("custom:")) return { cssFamily: builtIn.cssFamily, fontFace: "" };

  const fontBytes = decodeTransientFont(fontKey, transientFont);
  if (!fontBytes) return { cssFamily: builtIn.cssFamily, fontFace: "" };

  const glyphs = Array.from(new Set(svgText)).sort().join("") || "薯饼";
  const subset = await subsetFont(fontBytes, glyphs, { targetFormat: "woff2" });
  const family = "ShubingTransientFont";
  const dataUrl = `data:font/woff2;base64,${subset.toString("base64")}`;
  return {
    cssFamily: `"${family}","Microsoft YaHei",sans-serif`,
    fontFace: `@font-face{font-family:"${family}";src:url("${dataUrl}");font-style:normal;font-weight:100 900;font-display:block;}`
  };
}
