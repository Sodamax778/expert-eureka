"use client";

import { useEffect, useRef, useState } from "react";
import { downloadImageAsJpeg } from "@/lib/download-jpeg";
import { builtInFonts, defaultFontKey, type FontOption } from "@/lib/font-catalog";
import {
  getTransientFontPayload,
  getWereadSkillKey,
  listLocalFontOptions,
  wereadAuthorizationHeaders
} from "@/lib/browser-storage";
import type { TemplateKey } from "@/lib/templates";
import { readingCalendarLimits, weeklyReceiptLimits } from "@/lib/layout-limits";
import { readJsonResponse } from "@/lib/client-json";
import { applyLocalFontToSvgPreview, revokeLocalFontPreview } from "@/lib/local-font-preview";

type Scene = {
  key: TemplateKey;
  title: string;
  desc: string;
  tone: string;
  badge?: string;
  source?: string;
};

type GenerateResponse = {
  imageUrl: string;
  width: number;
  height: number;
  dataSource?: "mock" | "weread";
  coverCount?: number;
  receiptExcerpts?: string[];
  mode: "template";
};

type DeviceFrameTone = "black" | "white";

type WeeklyPeriodOption = {
  value: string;
  label: string;
  disabled: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const calendarMonths2026 = Array.from({ length: 12 }, (_, index) => ({
  value: `2026-${String(index + 1).padStart(2, "0")}`,
  label: `2026 年 ${index + 1} 月`
}));

function defaultCalendarMonth() {
  const current = new Date();
  return current.getFullYear() === 2026
    ? `2026-${String(current.getMonth() + 1).padStart(2, "0")}`
    : "2026-01";
}

function chinaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function dateKey(timestamp: number) {
  const date = new Date(timestamp);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function currentMonthWeeklyPeriods(): WeeklyPeriodOption[] {
  const today = chinaDateParts();
  const todayTimestamp = Date.UTC(today.year, today.month - 1, today.day);
  const todayWeekday = new Date(todayTimestamp).getUTCDay() || 7;
  const currentWeekStart = todayTimestamp - (todayWeekday - 1) * DAY_MS;
  const monthStart = Date.UTC(today.year, today.month - 1, 1);
  const monthEnd = Date.UTC(today.year, today.month, 0);
  const firstWeekday = new Date(monthStart).getUTCDay() || 7;
  const firstWeekStart = monthStart - (firstWeekday - 1) * DAY_MS;
  const periods: WeeklyPeriodOption[] = [];

  for (let start = firstWeekStart; start <= monthEnd; start += 7 * DAY_MS) {
    const end = start + 6 * DAY_MS;
    const startDate = new Date(start);
    const endDate = new Date(end);
    periods.push({
      value: dateKey(start),
      label: `第 ${periods.length + 1} 周 · ${startDate.getUTCMonth() + 1}月${startDate.getUTCDate()}日—${endDate.getUTCMonth() + 1}月${endDate.getUTCDate()}日`,
      disabled: start > currentWeekStart
    });
  }

  return periods;
}

function defaultWeeklyPeriod() {
  const today = chinaDateParts();
  const todayTimestamp = Date.UTC(today.year, today.month - 1, today.day);
  const weekday = new Date(todayTimestamp).getUTCDay() || 7;
  return dateKey(todayTimestamp - (weekday - 1) * DAY_MS);
}

function fitInputText(value: string, maxCharacters: number) {
  const characters = Array.from(value.trim());
  if (characters.length <= maxCharacters) return characters.join("");
  return `${characters.slice(0, Math.max(1, maxCharacters - 3)).join("")}...`;
}

function ScenePreview({ scene }: { scene: Scene }) {
  if (scene.tone === "calendar") {
    return (
      <img
        alt="本月阅读记录预览"
        className="leaf5-home-preview monthly-calendar-card-image"
        src="/assets/monthly-calendar-card-preview.jpg"
      />
    );
  }

  if (scene.tone === "receipt") {
    return (
      <img
        alt="每周购物小票预览"
        className="leaf5-home-preview weekly-receipt-card-image"
        src="/assets/weekly-receipt-card-preview.jpg"
      />
    );
  }

  return (
    <div className="device-mock">
      <div className="device-page">
        <strong>{scene.title}</strong>
        <br />
        <br />
        READING
        <br />
        *** RECEIPT ***
        <br />
        <br />
        阅读天数 ........ 18 天
        <br />
        阅读时长 ........ 1260 分
        <br />
        摘录数量 ........ 42 条
      </div>
    </div>
  );
}

function sceneSubtitle(key: TemplateKey) {
  if (key === "weekly_receipt") return "本周阅读记录 / 小票海报";
  if (key === "reading_calendar") return "每天读的书，在月历上连成线";
  return "阅读数据 / 墨水屏壁纸";
}

function OptionSwitch({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="option-switch-row">
      <span>{label}</span>
      <button
        aria-checked={checked}
        className={checked ? "switch-control active" : "switch-control"}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span />
      </button>
    </div>
  );
}

export function SceneOutputs({
  scenes,
  preferredFontKey = defaultFontKey,
  fontLibraryVersion = 0
}: {
  scenes: Scene[];
  preferredFontKey?: string;
  fontLibraryVersion?: number;
}) {
  const deviceKey = "leaf5";
  const orientation = "portrait" as const;
  const [selected, setSelected] = useState<Scene | null>(null);
  const [deviceFrameTone, setDeviceFrameTone] = useState<DeviceFrameTone>("black");
  const [receiptStoreName, setReceiptStoreName] = useState("购物小票");
  const [receiptStoreSubtitle, setReceiptStoreSubtitle] = useState("McDonald's");
  const [receiptShippingDevice, setReceiptShippingDevice] = useState("文石 Leaf5+");
  const [receiptBuyer, setReceiptBuyer] = useState("薯饼贩麦机");
  const [receiptExcerpts, setReceiptExcerpts] = useState<string[] | null>(null);
  const [receiptExcerptsOpen, setReceiptExcerptsOpen] = useState(false);
  const [showBarcode, setShowBarcode] = useState(true);
  const [showReceiptNote, setShowReceiptNote] = useState(true);
  const [receiptNote, setReceiptNote] = useState("本周大脑进货完成");
  const [showBooxStamp, setShowBooxStamp] = useState(true);
  const [weeklyPeriodOptions] = useState(currentMonthWeeklyPeriods);
  const [selectedWeek, setSelectedWeek] = useState(defaultWeeklyPeriod);
  const [selectedMonth, setSelectedMonth] = useState(defaultCalendarMonth);
  const [calendarNote, setCalendarNote] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [showCalendarStickers, setShowCalendarStickers] = useState(true);
  const [fontOptions, setFontOptions] = useState<FontOption[]>(builtInFonts);
  const [fontKey, setFontKey] = useState(preferredFontKey);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [status, setStatus] = useState("选择场景后会自动生成预览。");
  const [busy, setBusy] = useState(false);
  // 选项连续变化会产生并发请求，只允许最后一次请求更新预览，防止旧响应覆盖新配置。
  const generationId = useRef(0);
  const generationAbort = useRef<AbortController | null>(null);
  const previewObjectUrl = useRef<string | null>(null);

  function openScene(scene: Scene) {
    if (scene.key === "weekly_receipt") {
      setReceiptExcerpts(null);
      setReceiptExcerptsOpen(false);
    }
    setResult(null);
    setStatus("正在准备场景数据...");
    setSelected(scene);
  }

  async function generatePreview(scene: Scene) {
    const requestId = ++generationId.current;
    generationAbort.current?.abort();
    const controller = new AbortController();
    generationAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 55_000);
    setBusy(true);
    setStatus("正在读取数据并刷新预览...");
    try {
      const savedSkillKey = getWereadSkillKey();
      if (!savedSkillKey) {
        throw new Error("请先在首页装载微信读书 Skill Key。");
      }
      let selectedFontKey = fontKey;
      const transientFont = await getTransientFontPayload(selectedFontKey);
      if (selectedFontKey.startsWith("custom:") && !transientFont) {
        selectedFontKey = defaultFontKey;
        setFontKey(defaultFontKey);
      }
      const variant = scene.key === "reading_calendar" ? "doodle" : "classic";
      const requestHeaders: Record<string, string> = { "Content-Type": "application/json" };
      Object.assign(requestHeaders, wereadAuthorizationHeaders(savedSkillKey));
      const response = await fetch("/api/wallpapers/generate", {
        method: "POST",
        cache: "no-store",
        headers: requestHeaders,
        signal: controller.signal,
        body: JSON.stringify({
          templateKey: scene.key,
          deviceKey,
          orientation,
          dataMode: "weread",
          variant,
          receiptStoreName,
          receiptStoreSubtitle,
          receiptShippingDevice,
          receiptExcerpts: receiptExcerpts ?? undefined,
          receiptBuyer,
          showBarcode,
          receiptNote,
          showReceiptNote,
          showBooxStamp,
          selectedWeek,
          selectedMonth,
          calendarNote,
          calendarName,
          showCalendarStickers,
          // 自定义字体只在浏览器本地注入，避免将十几 MB 的字体上传到云函数。
          fontKey: transientFont ? defaultFontKey : selectedFontKey
        })
      });
      const data = await readJsonResponse<GenerateResponse & { error?: string }>(
        response,
        "生成预览失败"
      );
      if (!response.ok) {
        throw new Error(data.error || "生成预览失败");
      }
      if (requestId !== generationId.current) return;
      const previewImageUrl = applyLocalFontToSvgPreview(data.imageUrl, transientFont);
      revokeLocalFontPreview(previewObjectUrl.current);
      previewObjectUrl.current = previewImageUrl.startsWith("blob:") ? previewImageUrl : null;
      setResult({ ...data, imageUrl: previewImageUrl });
      const returnedExcerpts = data.receiptExcerpts;
      if (scene.key === "weekly_receipt" && Array.isArray(returnedExcerpts)) {
        setReceiptExcerpts(
          (current) =>
            current ??
            returnedExcerpts
              .slice(0, 5)
              .map((excerpt: unknown) =>
                fitInputText(String(excerpt ?? ""), weeklyReceiptLimits.excerpt)
              )
        );
      }
      const dataText =
        data.dataSource === "weread" ? "已使用微信读书真实数据" : "当前使用示例数据";
      const calendarText =
        scene.key === "reading_calendar" && data.dataSource === "weread"
          ? "；日期与时长为真实数据，逐日书名无法确认时按当月已识别书目及各书时长分配，并保证每本至少出现一次"
          : "";
      const receiptText =
        scene.key === "weekly_receipt" && data.dataSource === "weread"
          ? "；书名、作者、最新划线与阅读进度来自微信读书，未查询到划线时保持空白"
          : "";
      setStatus(`${dataText}${calendarText}${receiptText}；场景占位已重新渲染。`);
    } catch (error) {
      if (requestId !== generationId.current) return;
      setStatus(
        error instanceof Error && error.name === "AbortError"
          ? "预览生成超时，请点击刷新预览重试。"
          : error instanceof Error
            ? error.message
            : "生成预览失败"
      );
    } finally {
      window.clearTimeout(timeout);
      if (generationAbort.current === controller) generationAbort.current = null;
      if (requestId === generationId.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!selected) return;
    // 首次打开立即生成；后续输入短暂防抖，减少文本输入和切换选项时的重复请求。
    const timer = window.setTimeout(() => generatePreview(selected), result ? 220 : 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selected,
    receiptStoreName,
    receiptStoreSubtitle,
    receiptShippingDevice,
    receiptBuyer,
    receiptExcerpts,
    showBarcode,
    showReceiptNote,
    receiptNote,
    showBooxStamp,
    selectedWeek,
    selectedMonth,
    calendarNote,
    calendarName,
    showCalendarStickers,
    fontKey,
    previewRevision
  ]);

  useEffect(() => {
    let cancelled = false;
    listLocalFontOptions()
      .then((availableFonts) => {
        if (cancelled) return;
        setFontOptions(availableFonts);
        setFontKey(
          availableFonts.some((font) => font.key === preferredFontKey)
            ? preferredFontKey
            : defaultFontKey
        );
      })
      .catch(() => {
        if (cancelled) return;
        setFontOptions(builtInFonts);
        setFontKey(defaultFontKey);
      });
    return () => {
      cancelled = true;
    };
  }, [fontLibraryVersion, preferredFontKey]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [selected]);

  useEffect(() => {
    if (selected) return;
    revokeLocalFontPreview(previewObjectUrl.current);
    previewObjectUrl.current = null;
    setResult(null);
  }, [selected]);

  useEffect(
    () => () => {
      revokeLocalFontPreview(previewObjectUrl.current);
    },
    []
  );

  async function downloadResult() {
    if (!result || !selected) return;
    setStatus("正在准备 JPG 图片...");
    try {
      await downloadImageAsJpeg({
        imageUrl: result.imageUrl,
        width: result.width,
        height: result.height,
        filename: `max-${selected.key}-${result.width}x${result.height}.jpg`
      });
      setStatus("JPG 图片已下载。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "JPG 图片下载失败");
    }
  }

  function renderFontControl() {
    return (
      <label className="config-block" htmlFor="modal-font">
        <span className="label">字体</span>
        <select className="select" id="modal-font" value={fontKey} onChange={(event) => setFontKey(event.target.value)}>
          <optgroup label="系统字体">
            {fontOptions.filter((font) => !font.custom).map((font) => (
              <option key={font.key} value={font.key}>{font.name}</option>
            ))}
          </optgroup>
          {fontOptions.some((font) => font.custom) ? (
            <optgroup label="用户导入">
              {fontOptions.filter((font) => font.custom).map((font) => (
                <option key={font.key} value={font.key}>{font.name}</option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </label>
    );
  }

  function updateReceiptExcerpt(index: number, value: string) {
    setReceiptExcerpts((current) => {
      const next = Array.from({ length: 5 }, (_, itemIndex) => current?.[itemIndex] || "");
      next[index] = value;
      return next;
    });
  }

  function renderSceneFields(scene: Scene) {
    if (scene.key === "weekly_receipt") {
      const loadedExcerptCount = receiptExcerpts?.filter((excerpt) => excerpt.trim()).length ?? 0;
      return (
        <>
          <label className="config-block" htmlFor="receipt-week-period">
            <span className="label">周期</span>
            <select
              className="select"
              id="receipt-week-period"
              value={selectedWeek}
              onChange={(event) => {
                setSelectedWeek(event.target.value);
                setReceiptExcerpts(null);
              }}
            >
              {weeklyPeriodOptions.map((period) => (
                <option disabled={period.disabled} key={period.value} value={period.value}>
                  {period.label}
                </option>
              ))}
            </select>
          </label>
          <label className="config-block" htmlFor="receipt-store-name">
            <span className="label">商店名称</span>
            <input className="input receipt-store-name-input" id="receipt-store-name" maxLength={weeklyReceiptLimits.storeName} placeholder="购物小票" value={receiptStoreName} onChange={(event) => setReceiptStoreName(event.target.value)} />
            <small className="field-counter">{Array.from(receiptStoreName).length}/{weeklyReceiptLimits.storeName}</small>
          </label>
          <label className="config-block" htmlFor="receipt-store-subtitle">
            <span className="label">商店副标题</span>
            <input className="input" id="receipt-store-subtitle" maxLength={weeklyReceiptLimits.storeSubtitle} placeholder="McDonald's" value={receiptStoreSubtitle} onChange={(event) => setReceiptStoreSubtitle(event.target.value)} />
            <small className="field-counter">{Array.from(receiptStoreSubtitle).length}/{weeklyReceiptLimits.storeSubtitle}</small>
          </label>
          <label className="config-block" htmlFor="receipt-shipping-device">
            <span className="label">出货设备</span>
            <input className="input" id="receipt-shipping-device" maxLength={weeklyReceiptLimits.shippingDevice} placeholder="文石 Leaf5+" value={receiptShippingDevice} onChange={(event) => setReceiptShippingDevice(event.target.value)} />
            <small className="field-counter">{Array.from(receiptShippingDevice).length}/{weeklyReceiptLimits.shippingDevice}</small>
          </label>
          <label className="config-block" htmlFor="receipt-buyer">
            <span className="label">采购员</span>
            <input className="input" id="receipt-buyer" maxLength={weeklyReceiptLimits.buyer} value={receiptBuyer} onChange={(event) => setReceiptBuyer(event.target.value)} />
            <small className="field-counter">{Array.from(receiptBuyer).length}/{weeklyReceiptLimits.buyer}</small>
          </label>
          <div className="receipt-excerpts-disclosure">
            <button
              aria-expanded={receiptExcerptsOpen}
              className="receipt-excerpts-toggle"
              onClick={() => setReceiptExcerptsOpen((current) => !current)}
              type="button"
            >
              <span>最新划线（可选修改）</span>
              <small>
                {receiptExcerpts === null
                  ? "正在查询最新划线"
                  : `${loadedExcerptCount}/5 条已获取；空白项可手动填写`}
              </small>
            </button>
            {receiptExcerptsOpen ? (
              <div className="receipt-excerpts">
                {Array.from({ length: 5 }, (_, index) => (
                  <label className="config-block" htmlFor={`receipt-excerpt-${index + 1}`} key={index}>
                    <span className="label">书{index + 1}划线</span>
                    <textarea
                      className="textarea receipt-excerpt"
                      id={`receipt-excerpt-${index + 1}`}
                      maxLength={weeklyReceiptLimits.excerpt}
                      placeholder="未查询到划线，可手动输入"
                      value={receiptExcerpts?.[index] || ""}
                      onChange={(event) => updateReceiptExcerpt(index, event.target.value)}
                    />
                    <small className="field-counter">{Array.from(receiptExcerpts?.[index] || "").length}/{weeklyReceiptLimits.excerpt}</small>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <div className="config-switches">
            <OptionSwitch checked={showReceiptNote} label="小票备注" onChange={setShowReceiptNote} />
            {showReceiptNote ? (
              <div className="config-block compact-counter-field">
                <input className="input compact-input" maxLength={weeklyReceiptLimits.note} placeholder="输入小票备注" value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} />
                <small className="field-counter">{Array.from(receiptNote).length}/{weeklyReceiptLimits.note}</small>
              </div>
            ) : null}
            <OptionSwitch checked={showBarcode} label="条形码" onChange={setShowBarcode} />
            <OptionSwitch checked={showBooxStamp} label="贴贴纸" onChange={setShowBooxStamp} />
          </div>
        </>
      );
    }

    if (scene.key === "reading_calendar") {
      return (
        <>
          <label className="config-block" htmlFor="calendar-month">
            <span className="label">月份</span>
            <select className="select" id="calendar-month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {calendarMonths2026.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="config-block" htmlFor="calendar-note">
            <span className="label">月记</span>
            <input className="input" id="calendar-note" maxLength={readingCalendarLimits.note} placeholder="输入本月月记" value={calendarNote} onChange={(event) => setCalendarNote(event.target.value)} />
            <small className="field-counter">{Array.from(calendarNote).length}/{readingCalendarLimits.note}</small>
          </label>
          <label className="config-block" htmlFor="calendar-name">
            <span className="label">名称</span>
            <input className="input" id="calendar-name" maxLength={readingCalendarLimits.name} placeholder="输入名称" value={calendarName} onChange={(event) => setCalendarName(event.target.value)} />
            <small className="field-counter">{Array.from(calendarName).length}/{readingCalendarLimits.name}</small>
          </label>
          <div className="config-switches">
            <OptionSwitch checked={showCalendarStickers} label="贴纸" onChange={setShowCalendarStickers} />
          </div>
        </>
      );
    }

    return null;
  }

  return (
    <>
      <div className="scenes-grid">
        {scenes.map((scene) => (
          <button className="scene-card scene-button" data-template-key={scene.key} key={scene.key} onClick={() => openScene(scene)} type="button">
            <div className={`scene-art ${scene.tone}`}>
              <ScenePreview scene={scene} />
            </div>
            <div className="scene-card-copy">
              <div>
                <h3>{scene.title}</h3>
                <p>{scene.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.title} 生成弹窗`}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelected(null);
          }}
        >
          <div className="scene-modal scene-workbench">
            <aside className="modal-side">
              <div className="modal-head">
                <div>
                  <h2>{selected.title}</h2>
                  <p>{sceneSubtitle(selected.key)}</p>
                </div>
              </div>

              <div className="modal-config scene-editor">
                <div className="single-source-note" aria-label="当前数据源为微信读书">
                  <span className="single-source-dot" aria-hidden="true" />
                  <strong>微信读书真实数据</strong>
                  <small>WEREAD SKILL</small>
                </div>

                <label className="config-block" htmlFor="modal-device">
                  <span className="label">墨水屏设备</span>
                  <select className="select" defaultValue="leaf5" id="modal-device">
                    <option value="leaf5">文石 Leaf 系列</option>
                  </select>
                </label>

                {renderFontControl()}

                {renderSceneFields(selected)}

              </div>
            </aside>

            <section className="modal-preview">
              <div className="preview-stage">
                <button
                  aria-label={`当前为${deviceFrameTone === "black" ? "黑色" : "白色"}设备边框，点击切换`}
                  className={`leaf-device-preview ${orientation} ${deviceFrameTone}`}
                  onClick={() => setDeviceFrameTone((current) => current === "black" ? "white" : "black")}
                  title="切换黑色或白色设备边框"
                  type="button"
                >
                  <div className="leaf-device-screen">
                    {result ? (
                      <img className="leaf-screen-image" src={result.imageUrl} alt={`${selected.title} 预览`} />
                    ) : (
                      <div className="modal-loading">{busy ? "正在生成预览..." : "预览会显示在这里"}</div>
                    )}
                  </div>
                  <img
                    aria-hidden="true"
                    className="leaf-device-frame"
                    src={deviceFrameTone === "black" ? "/assets/boox-leaf-frame.png" : "/assets/boox-leaf-frame-white.png"}
                    alt=""
                  />
                </button>
              </div>
              <button className="button secondary refresh-preview" disabled={busy} onClick={() => setPreviewRevision((value) => value + 1)} type="button">
                {busy ? "正在刷新" : "刷新预览"}
              </button>
              <div className="modal-footer">
                <div className="modal-actions">
                  <button className="button dark download-button" disabled={!result || busy} onClick={downloadResult} type="button">下载图片</button>
                </div>
                <p className="hint preview-status">{status}</p>
              </div>
            </section>
          </div>
        </div>
      ) : null}
    </>
  );
}
