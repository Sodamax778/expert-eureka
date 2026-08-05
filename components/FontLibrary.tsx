"use client";

import { useEffect, useRef, useState } from "react";
import { builtInFonts, type FontOption } from "@/lib/font-catalog";
import { listLocalFontOptions, saveLocalFont } from "@/lib/browser-storage";

export function FontLibrary({
  selectedFontKey,
  onSelect,
  onLibraryChange
}: {
  selectedFontKey: string;
  onSelect: (fontKey: string) => void;
  onLibraryChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [fonts, setFonts] = useState<FontOption[]>(builtInFonts);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshFonts() {
    setFonts(await listLocalFontOptions());
  }

  useEffect(() => {
    if (open) refreshFonts().catch(() => setStatus("字体列表读取失败。"));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  async function uploadFont(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setStatus("正在导入字体...");
    try {
      const font = await saveLocalFont(file);
      await refreshFonts();
      onSelect(font.key);
      onLibraryChange();
      setStatus(`已保存到当前浏览器并选中：${font.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "字体导入失败。");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const filteredFonts = fonts.filter((font) => font.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="font-library-control" ref={rootRef}>
      <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((value) => !value)} type="button">
        字体列表
      </button>
      {open ? (
        <div className="font-library-popover" role="dialog" aria-label="字体列表">
          <div className="font-library-head">
            <div>
              <strong>字体列表</strong>
              <small>选择默认字体或导入本地字体</small>
            </div>
            <button className="font-refresh" onClick={() => refreshFonts()} type="button">刷新</button>
          </div>
          <div className="font-library-actions">
            <input
              aria-label="搜索字体"
              className="input"
              placeholder="搜索字体名称"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="button secondary" disabled={uploading} onClick={() => fileRef.current?.click()} type="button">
              {uploading ? "导入中" : "导入字体"}
            </button>
            <input
              ref={fileRef}
              className="visually-hidden"
              type="file"
              accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
              onChange={(event) => uploadFont(event.target.files?.[0])}
            />
          </div>
          <div className="font-option-list">
            {filteredFonts.map((font) => (
              <button
                className={font.key === selectedFontKey ? "font-option active" : "font-option"}
                key={font.key}
                onClick={() => {
                  onSelect(font.key);
                  onLibraryChange();
                  setOpen(false);
                }}
                style={{ fontFamily: font.cssFamily }}
                type="button"
              >
                <span>
                  <strong>{font.name}</strong>
                  <small>{font.custom ? "用户导入" : "系统字体"}</small>
                </span>
                {font.key === selectedFontKey ? <em>已选</em> : null}
              </button>
            ))}
            {filteredFonts.length === 0 ? <p className="font-empty">没有匹配的字体。</p> : null}
          </div>
          <p className="font-library-status">{status || "字体只保存在当前浏览器。支持 TTF、OTF、WOFF、WOFF2，单个文件不超过 24 MB。"}</p>
        </div>
      ) : null}
    </div>
  );
}
