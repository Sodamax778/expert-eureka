"use client";

import { builtInFonts, type FontOption } from "./font-catalog";

const WEREAD_KEY_STORAGE = "shubing-weread-skill-key";
const LEGACY_WEREAD_KEY_STORAGE = ["xiao", "wen-weread-skill-key"].join("");
const FONT_DATABASE = "shubing-local-assets";
const LEGACY_FONT_DATABASE = ["xiao", "wen-local-assets"].join("");
const FONT_STORE = "fonts";
const FONT_DATABASE_VERSION = 1;
export const maxLocalFontFileSize = 24 * 1024 * 1024;

type StoredFont = {
  id: string;
  key: string;
  name: string;
  fileName: string;
  mime: string;
  bytes: ArrayBuffer;
  uploadedAt: string;
};

export type TransientFontPayload = {
  key: string;
  name: string;
  fileName: string;
  mime: string;
  dataBase64: string;
};

const allowedExtensions = new Set([".ttf", ".otf", ".woff", ".woff2"]);
const registeredFontKeys = new Set<string>();

function extensionOf(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function hasValidFontSignature(bytes: Uint8Array, extension: string) {
  const signature = String.fromCharCode(...bytes.slice(0, 4));
  const hasTrueTypeOutline =
    (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) ||
    signature === "true";
  if (extension === ".woff2") return signature === "wOF2";
  if (extension === ".woff") return signature === "wOFF";
  if (extension === ".otf") return signature === "OTTO" || hasTrueTypeOutline;
  return hasTrueTypeOutline;
}

function openFontDatabase(databaseName = FONT_DATABASE) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("当前浏览器不支持本地字体存储。"));
      return;
    }
    const request = window.indexedDB.open(databaseName, FONT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(FONT_STORE)) {
        database.createObjectStore(FONT_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地字体库。"));
  });
}

async function runFontTransaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
  databaseName = FONT_DATABASE
) {
  const database = await openFontDatabase(databaseName);
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(FONT_STORE, mode);
    const request = action(transaction.objectStore(FONT_STORE));
    let result: T;
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error || new Error("本地字体操作失败。"));
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("本地字体操作失败。"));
    };
  });
}

let legacyFontMigration: Promise<void> | undefined;

function migrateLegacyFonts() {
  if (legacyFontMigration) return legacyFontMigration;
  legacyFontMigration = (async () => {
    const indexedDBWithDatabases = window.indexedDB as IDBFactory & {
      databases?: () => Promise<Array<{ name?: string }>>;
    };
    const databases = await indexedDBWithDatabases.databases?.();
    if (databases && !databases.some((database) => database.name === LEGACY_FONT_DATABASE)) return;
    const legacyFonts = await runFontTransaction<StoredFont[]>(
      "readonly",
      (store) => store.getAll(),
      LEGACY_FONT_DATABASE
    );
    await Promise.all(
      legacyFonts.map((font) =>
        runFontTransaction<IDBValidKey>("readwrite", (store) => store.put(font))
      )
    );
  })().catch(() => undefined);
  return legacyFontMigration;
}

function localFontFamily(key: string) {
  return `ShubingLocal-${key.replace(/^custom:/, "")}`;
}

function toFontOption(font: StoredFont): FontOption {
  return {
    key: font.key,
    name: font.name,
    category: "custom",
    cssFamily: `"${localFontFamily(font.key)}","Microsoft YaHei",sans-serif`,
    custom: true
  };
}

async function registerFontFace(font: StoredFont) {
  if (registeredFontKeys.has(font.key) || typeof FontFace === "undefined") return;
  const face = new FontFace(localFontFamily(font.key), font.bytes);
  await face.load();
  document.fonts.add(face);
  registeredFontKeys.add(font.key);
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return window.btoa(binary);
}

export function getWereadSkillKey() {
  const currentKey = window.localStorage.getItem(WEREAD_KEY_STORAGE)?.trim();
  if (currentKey) return currentKey;
  const legacyKey = window.localStorage.getItem(LEGACY_WEREAD_KEY_STORAGE)?.trim() || "";
  if (legacyKey) {
    window.localStorage.setItem(WEREAD_KEY_STORAGE, legacyKey);
    window.localStorage.removeItem(LEGACY_WEREAD_KEY_STORAGE);
  }
  return legacyKey;
}

export function setWereadSkillKey(skillKey: string) {
  window.localStorage.setItem(WEREAD_KEY_STORAGE, skillKey.trim());
  window.localStorage.removeItem(LEGACY_WEREAD_KEY_STORAGE);
  window.dispatchEvent(new Event("weread-connection-changed"));
}

export function clearWereadSkillKey() {
  window.localStorage.removeItem(WEREAD_KEY_STORAGE);
  window.localStorage.removeItem(LEGACY_WEREAD_KEY_STORAGE);
  window.dispatchEvent(new Event("weread-connection-changed"));
}

export function wereadKeyHint(skillKey: string) {
  if (!skillKey) return "";
  return `${skillKey.slice(0, 8)}...${skillKey.slice(-4)}`;
}

export function wereadAuthorizationHeaders(skillKey = getWereadSkillKey()): Record<string, string> {
  return skillKey ? { Authorization: `Bearer ${skillKey}` } : {};
}

export async function listLocalFontOptions() {
  try {
    await migrateLegacyFonts();
    const customFonts = await runFontTransaction<StoredFont[]>("readonly", (store) => store.getAll());
    customFonts.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    await Promise.all(customFonts.map((font) => registerFontFace(font).catch(() => undefined)));
    return [...builtInFonts, ...customFonts.map(toFontOption)];
  } catch {
    return builtInFonts;
  }
}

export async function saveLocalFont(file: File) {
  const extension = extensionOf(file.name);
  if (!allowedExtensions.has(extension)) {
    throw new Error("仅支持 TTF、OTF、WOFF 或 WOFF2 字体文件。");
  }
  if (file.size <= 0 || file.size > maxLocalFontFileSize) {
    throw new Error("字体文件需小于 24 MB。");
  }
  const bytes = await file.arrayBuffer();
  if (!hasValidFontSignature(new Uint8Array(bytes), extension)) {
    throw new Error("字体文件格式与扩展名不匹配。");
  }
  const id = window.crypto.randomUUID();
  const font: StoredFont = {
    id,
    key: `custom:${id}`,
    name: file.name.slice(0, -extension.length).slice(0, 40) || "自定义字体",
    fileName: file.name,
    mime: file.type || "application/octet-stream",
    bytes,
    uploadedAt: new Date().toISOString()
  };
  await runFontTransaction<IDBValidKey>("readwrite", (store) => store.put(font));
  await registerFontFace(font);
  return toFontOption(font);
}

export async function getTransientFontPayload(fontKey: string): Promise<TransientFontPayload | undefined> {
  if (!fontKey.startsWith("custom:")) return undefined;
  await migrateLegacyFonts();
  const font = await runFontTransaction<StoredFont | undefined>("readonly", (store) => store.get(fontKey));
  if (!font) return undefined;
  return {
    key: font.key,
    name: font.name,
    fileName: font.fileName,
    mime: font.mime,
    dataBase64: arrayBufferToBase64(font.bytes)
  };
}
