import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customDeviceKey, getDevice } from "./devices";
import { getMockWereadSnapshot, type WereadSnapshot } from "./mock-weread";
import { getMockBooxSnapshot } from "./mock-boox";
import { getBookshelfSnapshot, getMonthlyReceiptSnapshot, getReadingCardDetails, getWeeklyReceiptSnapshot } from "./weread";
import { resolveSvgFont, type TransientFontPayload } from "./custom-fonts";
import { readingCalendarLimits, weeklyReceiptLimits } from "./layout-limits";

type GenerateInput = {
  templateKey: string;
  deviceKey: string;
  orientation: "portrait" | "landscape";
  variant?: string;
  customTitle?: string;
  customDescription?: string;
  shuffleSeed?: number;
  dataMode?: "mock" | "boox" | "weread";
  customWidth?: number;
  customHeight?: number;
  shelfCapacity?: 10;
  shelfFontScale?: number;
  bookFilter?: "all" | "finished";
  upperShelfDecoration?: "cat" | "globe" | "frame" | "pencil-cup";
  lowerShelfDecoration?: "cat" | "globe" | "frame" | "pencil-cup";
  receiptStoreName?: string;
  receiptStoreSubtitle?: string;
  receiptShippingDevice?: string;
  receiptExcerpts?: string[];
  receiptDeviceNumber?: string;
  receiptOrderTime?: string;
  receiptBuyer?: string;
  showBarcode?: boolean;
  receiptNote?: string;
  showReceiptNote?: boolean;
  showBooxStamp?: boolean;
  selectedWeek?: string;
  selectedMonth?: string;
  calendarNote?: string;
  calendarName?: string;
  showCalendarStickers?: boolean;
  readingCardRating?: number;
  overallRating?: string;
  fontKey?: string;
  skillKey?: string;
  transientFont?: TransientFontPayload;
};

type BookshelfBook = {
  bookId?: string;
  title: string;
  author: string;
  coverUrl: string;
  finished?: boolean;
  mediaType?: string;
};

type WallpaperSnapshot = WereadSnapshot & {
  source: "mock" | "boox" | "weread";
};

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function ellipsize(value: string, maxCharacters: number) {
  const characters = Array.from(value.trim());
  if (characters.length <= maxCharacters) return characters.join("");
  return `${characters.slice(0, Math.max(1, maxCharacters - 3)).join("")}...`;
}

function ellipsizeBookTitle(value: string, maxCharacters: number) {
  const characters = Array.from(value.trim());
  if (characters.length <= maxCharacters) return characters.join("");
  return `${characters.slice(0, Math.max(1, maxCharacters - 1)).join("")}...`;
}

function weeklyDurationLabel(value: number | undefined) {
  const minutes = Math.max(0, Math.round(value || 0));
  if (minutes === 0) return "0分钟";
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours}小时${remainingMinutes}分钟` : `${minutes}分钟`;
}

function dailyDurationLabel(item: WereadSnapshot["dailyReading"][number]) {
  const seconds = Math.max(
    0,
    Math.round(
      typeof item.readingSeconds === "number"
        ? item.readingSeconds
        : (item.readingMinutes || 0) * 60
    )
  );
  return `${Math.round(seconds / 60)}m`;
}

function clampDimension(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(300, Math.min(4000, Math.round(value as number)));
}

function getTargetSize(input: GenerateInput) {
  const base =
    input.deviceKey === customDeviceKey
      ? {
          key: customDeviceKey,
          name: "自定义分辨率",
          inch: "Custom",
          width: clampDimension(input.customWidth, 1264),
          height: clampDimension(input.customHeight, 1680)
        }
      : getDevice(input.deviceKey);

  if (input.orientation === "landscape") {
    return { width: base.height, height: base.width, device: base };
  }
  return { width: base.width, height: base.height, device: base };
}

function templateTitle(templateKey: string) {
  if (templateKey === "bookshelf_wall") return "书柜墙";
  if (templateKey === "cover_collage") return "封面拼贴";
  if (templateKey === "weekly_receipt") return "每周购物小票";
  if (templateKey === "monthly_receipt") return "本月阅读小票";
  if (templateKey === "reading_calendar") return "本月阅读记录";
  if (templateKey === "annotations_card") return "我的读书卡";
  if (templateKey === "yearly_receipt") return "年度阅读小票";
  if (templateKey === "copywriting_wallpaper") return "文案壁纸";
  return "阅读壁纸";
}

function splitText(text: string, maxLength: number, maxLines = 3) {
  const out: string[] = [];
  let current = "";
  const closingPunctuation = "，。！？；：、）】》”’";
  for (const char of text) {
    if ((current + char).length > maxLength) {
      if (closingPunctuation.includes(char) && current) {
        out.push(current + char);
        current = "";
      } else {
        out.push(current);
        current = char;
      }
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out.slice(0, maxLines);
}

function rotateBySeed<T>(items: T[], seed = 0) {
  if (items.length === 0) return items;
  const offset = Math.abs(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function shelfDecorationSvg(
  decoration: GenerateInput["upperShelfDecoration"],
  x: number,
  baseline: number,
  size: number
) {
  const transform = `translate(${Math.round(x)} ${Math.round(baseline)}) scale(${(size / 100).toFixed(3)})`;
  if (decoration === "globe") {
    return `
      <g transform="${transform}" aria-label="地球仪摆件">
        <circle class="decorLine" cx="50" cy="-58" r="31"/>
        <path class="decorFine" d="M36-84c8 8 5 15-2 22s-6 17 3 25M61-82c-3 9 3 15 11 20s8 13 1 21M22-58c17-6 37-5 56 1M30-40c13 4 28 5 42 1"/>
        <path class="decorLine" d="M18-59c0-24 15-42 36-45M82-59c0 25-15 43-36 46M50-27v12M34-15h32M27-8h46"/>
        <path class="decorFine" d="M71-94l6-6M76-99l4 4"/>
      </g>
    `;
  }
  if (decoration === "frame") {
    return `
      <g transform="${transform}" aria-label="画框摆件">
        <rect class="decorLine" x="12" y="-82" width="72" height="66"/>
        <rect class="decorFine" x="20" y="-74" width="56" height="50"/>
        <path class="decorFine" d="M23-29l15-17 11 10 10-15 14 22M55-63c0 5-4 8-8 8s-8-3-8-8 4-8 8-8 8 3 8 8z"/>
        <path class="decorLine" d="M84-70l9 53M73-16h22"/>
      </g>
    `;
  }
  if (decoration === "pencil-cup") {
    return `
      <g transform="${transform}" aria-label="笔筒摆件">
        <path class="decorLine" d="M25-54h50L70-7H30z"/>
        <path class="decorFine" d="M29-45h42M36-53l-7-40 7-5 9 42M48-54l4-48 7 1 1 47M61-54l17-38 6 5-13 35M31-91l5-7 2 8M52-102l4-7 3 8M78-92l7-5-1 10"/>
        <path class="hatch" d="M36-39l-3 22M44-39l-2 27M54-39l-1 27M64-39l-3 22"/>
      </g>
    `;
  }
  return `
    <g transform="${transform}" aria-label="猫摆件">
      <path class="decorLine" d="M28-62l5-24 15 12 17-11 4 25c12 12 15 28 10 45H26c-6-18-4-35 2-47z"/>
      <path class="decorFine" d="M39-55l7 2M62-53l7-2M49-45l5 4 5-5M45-36c5 5 12 5 17 0M35-46L15-50M35-39L13-38M67-46l20-7M68-39l22-1"/>
      <path class="decorLine" d="M77-42c19 7 18 27 4 34M19-8h69M35-16c8-8 12-20 11-34"/>
      <path class="hatch" d="M30-25l8 4M67-28l7-4M72-19l6-3"/>
    </g>
  `;
}

async function imageUrlToDataUri(url: string) {
  if (!url) return "";
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 Shubing Weread Wallpaper"
      }
    });
    if (!response.ok) return "";
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 1_800_000) return "";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

function dataSourceLabel(source: "mock" | "boox" | "weread") {
  if (source === "weread") return "微信读书真实数据";
  if (source === "boox") return "文石模拟数据";
  return "本地示例数据";
}

const cachedLocalImageData = new Map<string, string>();

function localImageData(filename: string, mimeType: "image/jpeg" | "image/png") {
  const cacheKey = `${mimeType}:${filename}`;
  const cached = cachedLocalImageData.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const source = readFileSync(join(process.cwd(), "public", "assets", filename));
    const dataUrl = `data:${mimeType};base64,${source.toString("base64")}`;
    cachedLocalImageData.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    cachedLocalImageData.set(cacheKey, "");
    return "";
  }
}

function weeklyReceiptTexture() {
  return localImageData("weekly-receipt-paper-texture.jpg", "image/jpeg");
}

function resolveWeeklyReceiptExcerpts(input: GenerateInput, snapshot: WallpaperSnapshot) {
  const customExcerpts = Array.isArray(input.receiptExcerpts) ? input.receiptExcerpts : null;
  return Array.from({ length: 5 }, (_, index) =>
    (customExcerpts ? customExcerpts[index] || "" : snapshot.topBookDetails[index]?.summary || "").trim().slice(0, 120)
  );
}

function weeklyTableReceiptTemplate(
  input: GenerateInput,
  width: number,
  height: number,
  snapshot: WallpaperSnapshot
) {
  const margin = Math.round(width * 0.052);
  const paper = "#ffffff";
  const paperTexture = weeklyReceiptTexture();
  const fontTitle = Math.max(56, Math.round(width * 0.086));
  const fontItem = Math.max(28, Math.round(width * 0.038));
  const fontBody = Math.max(18, Math.round(width * 0.024));
  const fontSmall = Math.max(15, Math.round(width * 0.019));
  const storeName = input.receiptStoreName?.trim() || "文石";
  const storeSubtitle = input.receiptStoreSubtitle?.trim() || "McDonald's";
  const shippingDevice = input.receiptShippingDevice?.trim() || "文石 Leaf5";
  const buyer = input.receiptBuyer?.trim() || "麦旋风";
  const receiptNote = input.receiptNote?.trim() || "本周大脑进货完成";
  const showReceiptNote = input.showReceiptNote !== false;
  const printDate = new Date().toISOString().slice(0, 10);
  const details = snapshot.topBookDetails.length
    ? snapshot.topBookDetails.slice(0, 5)
    : snapshot.topBooks.slice(0, 5).map((title) => ({ title, author: "作者未知", readingMinutes: 0, progress: 0 }));
  const items = Array.from({ length: 5 }, (_, index) => details[index] || { title: "", author: "", readingMinutes: 0, progress: 0 });
  const excerpts = resolveWeeklyReceiptExcerpts(input, snapshot);
  const listTop = Math.round(height * 0.255);
  const listBottom = Math.round(height * 0.8);
  const rowHeight = (listBottom - listTop) / 5;
  const totalHours = Math.floor(snapshot.readingMinutes / 60);
  const totalMinutes = snapshot.readingMinutes % 60;
  const displayStoreName = ellipsize(storeName, weeklyReceiptLimits.storeName);
  const displayStoreSubtitle = ellipsize(storeSubtitle, weeklyReceiptLimits.storeSubtitle);
  const displayShippingDevice = ellipsize(shippingDevice, weeklyReceiptLimits.shippingDevice);
  const displayBuyer = ellipsize(buyer, weeklyReceiptLimits.buyer);
  const itemRows = items
    .map((book, index) => {
      const y = listTop + index * rowHeight;
      const excerpt = excerpts[index]
        ? ellipsize(excerpts[index], weeklyReceiptLimits.excerpt)
        : "";
      const readingMinutes =
        typeof book.readingMinutes === "number"
          ? book.readingMinutes
          : 0;
      const duration = book.title ? weeklyDurationLabel(readingMinutes) : "";
      const progress = Math.max(0, Math.min(100, Math.round(book.progress || 0)));
      const displayTitle = ellipsizeBookTitle(book.title, weeklyReceiptLimits.bookTitle);
      return `
        <text x="${margin}" y="${y + fontItem}" class="itemTitle">NO.${index + 1}　${escapeXml(displayTitle)}</text>
        <text x="${Math.round(width * 0.73)}" y="${y + fontItem * 0.94}" class="author" text-anchor="middle">${escapeXml((book.author || "").slice(0, 18))}</text>
        <text x="${width - margin}" y="${y + fontItem * 0.94}" class="duration" text-anchor="end">${duration}</text>
        ${excerpt ? `<text x="${margin}" y="${y + fontItem * 1.72}" class="excerpt">摘：${escapeXml(excerpt)}</text>` : ""}
        ${book.title ? `<text x="${margin}" y="${y + fontItem * 2.32}" class="progress">进度：${progress}%</text>` : ""}
      `;
    })
    .join("");

  const barcodeAsset = localImageData("weekly-receipt-barcode-clean.png", "image/png");
  const barcode = input.showBarcode === false || !barcodeAsset
    ? ""
    : `<image id="weekly-receipt-barcode" href="${barcodeAsset}" x="${margin}" y="${Math.round(height * 0.895)}" width="${Math.round(width * 0.371)}" height="${Math.round(height * 0.085)}" preserveAspectRatio="none"/>`;
  const stickerAsset = localImageData("weekly-receipt-stickers-clean.png", "image/png");
  const stickerWidth = Math.round(width * 0.43);
  const stickers = input.showBooxStamp === false || !stickerAsset
    ? ""
    : `<image id="weekly-receipt-stickers" href="${stickerAsset}" x="${width - margin - stickerWidth}" y="${Math.round(height * 0.902)}" width="${stickerWidth}" height="${Math.round(height * 0.075)}" preserveAspectRatio="xMaxYMid meet"/>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .bg{fill:${paper}}
        .title{font:800 ${fontTitle}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:#050505}
        .metaStrong{font:800 ${Math.round(fontBody * 1.2)}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:#111}
        .meta{font:600 ${fontBody}px "Songti SC","Microsoft YaHei",serif;fill:#222}
        .header{font:650 ${fontSmall}px "Songti SC","Microsoft YaHei",serif;fill:#333}
        .itemTitle{font:800 ${fontItem}px Georgia,"Songti SC","Microsoft YaHei",serif;fill:#050505}
        .author{font:650 ${fontSmall}px Georgia,"Times New Roman","Microsoft YaHei",serif;fill:#222}
        .duration{font:650 ${fontSmall}px "Songti SC","Microsoft YaHei",serif;fill:#222}
        .excerpt{font:500 ${fontSmall}px "Songti SC","Microsoft YaHei",serif;fill:#333}
        .progress{font:700 ${fontSmall}px "Songti SC","Microsoft YaHei",serif;fill:#333}
        .storeSubtitle{font:800 ${Math.round(fontItem * 1.02)}px Georgia,"Times New Roman","Songti SC",serif;fill:#111}
        .total{font:900 ${Math.round(fontBody * 1.85)}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:#111}
        .note{font:800 ${Math.round(fontBody * 1.26)}px "Songti SC","Microsoft YaHei",serif;fill:#222}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      ${paperTexture ? `<image href="${paperTexture}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity=".34"/>` : ""}
      <text x="${width - margin}" y="${Math.round(height * 0.092)}" class="title" text-anchor="end">${escapeXml(displayStoreName)}</text>
      <text x="${width - margin}" y="${Math.round(height * 0.143)}" class="storeSubtitle" text-anchor="end">${escapeXml(displayStoreSubtitle)}</text>
      <text x="${margin}" y="${Math.round(height * 0.062)}" class="meta">打印时间：${printDate}</text>
      <text x="${margin}" y="${Math.round(height * 0.101)}" class="meta">出货设备：${escapeXml(displayShippingDevice)}</text>
      <text x="${margin}" y="${Math.round(height * 0.14)}" class="meta">采购员：${escapeXml(displayBuyer)}</text>
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.18)}" y2="${Math.round(height * 0.18)}" stroke="#111" stroke-width="3"/>
      <text x="${margin}" y="${Math.round(height * 0.218)}" class="header">货品名称</text>
      <text x="${Math.round(width * 0.73)}" y="${Math.round(height * 0.218)}" class="header" text-anchor="middle">厂家</text>
      <text x="${width - margin}" y="${Math.round(height * 0.218)}" class="header" text-anchor="end">数量</text>
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.23)}" y2="${Math.round(height * 0.23)}" stroke="#111" stroke-opacity=".42" stroke-width="2"/>
      ${itemRows}
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.825)}" y2="${Math.round(height * 0.825)}" stroke="#111" stroke-width="3"/>
      ${showReceiptNote ? `<text x="${margin}" y="${Math.round(height * 0.865)}" class="note">备注：${escapeXml(ellipsize(receiptNote, weeklyReceiptLimits.note))}</text>` : ""}
      <text x="${width - margin}" y="${Math.round(height * 0.865)}" class="total" text-anchor="end">账单合计：${totalHours}小时${totalMinutes}分钟</text>
      ${barcode}
      ${stickers}
    </svg>
  `;
}

function receiptTemplate(
  input: GenerateInput,
  width: number,
  height: number,
  snapshot: WallpaperSnapshot
) {
  if (input.templateKey === "weekly_receipt") return weeklyTableReceiptTemplate(input, width, height, snapshot);
  const margin = Math.round(width * 0.09);
  const titleY = Math.round(height * 0.13);
  const rowStart = Math.round(height * 0.37);
  const rowGap = Math.round(height * 0.052);
  const fontTitle = Math.max(34, Math.round(width * 0.064));
  const fontBody = Math.max(22, Math.round(width * 0.032));
  const fontSmall = Math.max(18, Math.round(width * 0.022));
  const title = templateTitle(input.templateKey);
  const period = input.receiptOrderTime?.trim() || (input.templateKey === "yearly_receipt" ? snapshot.year : snapshot.month);
  const periodPrefix = input.templateKey === "weekly_receipt" ? "本周" : input.templateKey === "yearly_receipt" ? "年度" : "本月";
  const deviceNumber = input.receiptDeviceNumber?.trim() || "BOOX-001";
  const buyer = input.receiptBuyer?.trim() || "薯饼";
  const receiptNote = input.receiptNote?.trim() || "本周大脑进货完成";
  const showReceiptNote = input.showReceiptNote !== false;
  const isMinimal = input.variant === "minimal";
  const rows = [
    [`${periodPrefix}阅读天数`, `${snapshot.readingDays} 天`],
    [`${periodPrefix}阅读时长`, `${snapshot.readingMinutes} 分钟`],
    [`${periodPrefix}书籍`, `${snapshot.bookCount} 本`],
    [`${periodPrefix}摘录`, `${snapshot.noteCount} 条`]
  ];

  const rowSvg = rows
    .map(
      ([label, value], index) => `
        <text x="${margin}" y="${rowStart + index * rowGap}" class="body">${escapeXml(label)}</text>
        <text x="${width - margin}" y="${rowStart + index * rowGap}" class="body strong" text-anchor="end">${escapeXml(value)}</text>
        <line x1="${margin}" x2="${width - margin}" y1="${rowStart + index * rowGap + rowGap * 0.34}" y2="${rowStart + index * rowGap + rowGap * 0.34}" class="hairline"/>
      `
    )
    .join("");

  const topBooks = (snapshot.topBooks.length ? snapshot.topBooks : ["从书里挑一句话留给今天"])
    .slice(0, 3)
    .map((book, index) => `<text x="${margin}" y="${Math.round(height * 0.65) + index * fontSmall * 1.55}" class="quote">${String(index + 1).padStart(2, "0")}  ${escapeXml(book)}</text>`)
    .join("");
  const barcode = input.showBarcode === false
    ? ""
    : Array.from({ length: 34 }, (_, index) => {
        const unit = Math.max(3, Math.round(width * 0.004));
        const barWidth = unit * (index % 5 === 0 ? 3 : index % 3 === 0 ? 2 : 1);
        const x = margin + index * unit * 2;
        return `<rect x="${x}" y="${Math.round(height * 0.79)}" width="${barWidth}" height="${Math.round(height * 0.055)}" fill="#111"/>`;
      }).join("");
  const stamp = input.showBooxStamp === false
    ? ""
    : `<g transform="translate(${Math.round(width * 0.75)} ${Math.round(height * 0.8)}) rotate(-8)">
         <circle r="${Math.round(width * 0.075)}" fill="none" stroke="#555" stroke-width="4"/>
         <text y="${Math.round(fontSmall * 0.32)}" class="stamp" text-anchor="middle">BOOX</text>
       </g>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .bg{fill:${isMinimal ? "#ffffff" : "#f7f7f2"}}
        .ink{fill:#111}
        .muted{fill:#555}
        .hairline{stroke:#111;stroke-opacity:${isMinimal ? ".28" : ".16"};stroke-width:2}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
        .title{font:800 ${fontTitle}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
        .body{font:650 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#171717}
        .strong{font-weight:800}
        .quote{font:600 ${fontSmall}px ui-monospace,SFMono-Regular,Menlo,Consolas,"Microsoft YaHei",monospace;fill:#333}
        .stamp{font:800 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      <rect x="${Math.round(width * 0.045)}" y="${Math.round(height * 0.035)}" width="${Math.round(width * 0.91)}" height="${Math.round(height * 0.93)}" rx="${isMinimal ? 0 : Math.round(width * 0.018)}" fill="none" stroke="#111" stroke-opacity=".18" stroke-width="2"/>
      <text x="${margin}" y="${Math.round(height * 0.075)}" class="small muted">薯饼 / READING STORE</text>
      <text x="${margin}" y="${titleY}" class="title ink">${escapeXml(title)}</text>
      <text x="${margin}" y="${Math.round(height * 0.185)}" class="small muted">*** BRAIN SHOPPING RECEIPT ***</text>
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.22)}" y2="${Math.round(height * 0.22)}" class="hairline"/>
      <text x="${margin}" y="${Math.round(height * 0.265)}" class="small muted">设备编号  ${escapeXml(deviceNumber)}</text>
      <text x="${margin}" y="${Math.round(height * 0.302)}" class="small muted">订单时间  ${escapeXml(period)}</text>
      <text x="${margin}" y="${Math.round(height * 0.339)}" class="small muted">采购员    ${escapeXml(buyer)}</text>
      ${rowSvg}
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.61)}" y2="${Math.round(height * 0.61)}" class="hairline"/>
      ${topBooks}
      ${barcode}
      ${stamp}
      ${showReceiptNote ? `<text x="${margin}" y="${Math.round(height * 0.885)}" class="small muted">备注：${escapeXml(receiptNote)}</text>` : ""}
      <text x="${margin}" y="${Math.round(height * 0.93)}" class="small muted">${dataSourceLabel(snapshot.source)}</text>
      <text x="${width - margin}" y="${Math.round(height * 0.93)}" class="small muted" text-anchor="end">THANK YOU FOR READING</text>
    </svg>
  `;
}

async function coverTemplate(
  width: number,
  height: number,
  snapshot: WallpaperSnapshot,
  books: BookshelfBook[],
  input: GenerateInput
) {
  const fontTitle = Math.max(34, Math.round(width * 0.06));
  const fontSmall = Math.max(18, Math.round(width * 0.022));
  const isShelf = input.templateKey === "bookshelf_wall";
  const isGrid = input.variant === "grid";
  const customTitle = input.customTitle?.trim() || (isShelf ? "我的书柜" : "封面拼贴");
  const fallbackBooks = snapshot.topBooks.map((title) => ({ title, author: "", coverUrl: "", finished: false }));
  const filteredBooks = input.bookFilter === "finished" ? books.filter((book) => book.finished) : books;
  const sourceBooks = rotateBySeed(
    filteredBooks.length ? filteredBooks : books.length ? [] : fallbackBooks,
    input.shuffleSeed
  );
  const visibleCount = isShelf ? 10 : 9;
  const visibleBooks = Array.from(
    { length: visibleCount },
    (_, index) => sourceBooks[index] || { title: "", author: "", coverUrl: "", finished: false }
  );
  const embeddedBooks = isShelf
    ? visibleBooks
    : await Promise.all(
        visibleBooks.map(async (book) => ({
          ...book,
          coverUrl: await imageUrlToDataUri(book.coverUrl)
        }))
  );

  if (isShelf) {
    const rowCount = 2;
    const booksPerShelf = 5;
    const shelfGap = Math.max(12, Math.round(height * 0.018));
    const shelfTop = Math.round(height * 0.18);
    const shelfAreaHeight = Math.round(height * 0.72);
    const shelfHeight = Math.floor((shelfAreaHeight - shelfGap * (rowCount - 1)) / rowCount);
    const shelfX = Math.round(width * 0.055);
    const shelfWidth = Math.round(width * 0.89);
    const bookAreaWidth = Math.round(width * 0.48);
    const spineGap = Math.max(3, Math.round(width * 0.004));
    const spineW = Math.max(9, Math.min(Math.round(width * 0.045), Math.floor((bookAreaWidth - spineGap * (booksPerShelf - 1)) / booksPerShelf)));
    const shelfFontScale = Math.max(50, Math.min(100, Math.round(input.shelfFontScale ?? 80))) / 100;
    const spineFontLimit = Math.max(8, Math.floor(spineW * 0.62));
    const desiredSpineFontSize = Math.max(8, Math.floor(spineFontLimit * shelfFontScale));
    const stackBookHeight = Math.max(18, Math.round(shelfHeight * 0.105));
    const boardHeight = Math.max(8, Math.round(height * 0.008));
    const lineWidth = Math.max(3, Math.round(width * 0.003));
    const fineLineWidth = Math.max(1.5, width * 0.00135);
    const titleSize = Math.max(34, Math.round(width * 0.055));
    const descriptionSize = Math.max(18, Math.round(width * 0.022));
    const customDescription = input.customDescription?.trim() || "my book";
    const shelves = Array.from({ length: rowCount }, (_, row) => {
      const y = shelfTop + row * (shelfHeight + shelfGap);
      const rowBooks = embeddedBooks.slice(row * booksPerShelf, row * booksPerShelf + booksPerShelf);
      const booksSvg = rowBooks
        .map((book, index) => {
                const rawTitle = book.title?.trim() || "";
                if (index >= 3) {
                  const stackW = Math.round(width * 0.19);
                  const stackH = stackBookHeight;
                  const stackX = Math.round(width * 0.34);
                  const stackY = y + shelfHeight - (5 - index) * (stackH + spineGap);
                  const actualStackW = stackW - (index % 2) * Math.round(width * 0.015);
                  const stackFontLimit = Math.max(8, Math.min(
                    Math.floor(stackH * 0.48),
                    Math.floor((actualStackW * 0.78) / Math.max(rawTitle.length, 1))
                  ));
                  const stackFontSize = Math.max(8, Math.floor(stackFontLimit * shelfFontScale));
                  const stackTextPadding = Math.max(4, Math.round(actualStackW * 0.07));
                  const stackTitleLimit = Math.max(
                    1,
                    Math.floor((actualStackW - stackTextPadding * 2) / Math.max(stackFontSize * 0.72, 1))
                  );
                  const title = escapeXml(rawTitle.slice(0, stackTitleLimit));
                  return `
                    <g>
                      <clipPath id="stack-title-${row}-${index}">
                        <rect x="${stackX + stackTextPadding}" y="${stackY + 2}" width="${actualStackW - stackTextPadding * 2}" height="${stackH - 4}"/>
                      </clipPath>
                      <rect class="bookShape" x="${stackX}" y="${stackY}" width="${actualStackW}" height="${stackH}" rx="${Math.max(2, Math.round(stackH * 0.14))}"/>
                      <path class="pageLine" d="M${stackX + Math.round(stackW * 0.08)} ${stackY + stackH * 0.32}h${Math.round(stackW * 0.74)}M${stackX + Math.round(stackW * 0.08)} ${stackY + stackH * 0.66}h${Math.round(stackW * 0.68)}"/>
                      ${title ? `<text x="${stackX + stackTextPadding}" y="${stackY + stackH * 0.7}" class="stackText" clip-path="url(#stack-title-${row}-${index})" style="font-size:${stackFontSize}px">${title}</text>` : ""}
                    </g>
                  `;
                }
                const x = Math.round(width * 0.075) + index * (spineW + spineGap);
                const h = Math.round(shelfHeight * (0.58 + ((index + row) % 3) * 0.09));
                const bookTop = y + shelfHeight - h;
                const textPaddingY = Math.max(5, Math.round(spineW * 0.34));
                const textHeight = Math.max(1, h - textPaddingY * 2);
                const spineFontSize = Math.max(8, Math.min(
                  desiredSpineFontSize,
                  Math.floor(textHeight / Math.max(Math.min(rawTitle.length, 8), 1))
                ));
                const titleLimit = Math.max(1, Math.floor(textHeight / Math.max(spineFontSize * 1.08, 1)));
                const title = escapeXml(rawTitle.slice(0, titleLimit));
                return `
                  <g>
                    <clipPath id="spine-title-${row}-${index}">
                      <rect x="${x + 2}" y="${bookTop + textPaddingY}" width="${Math.max(1, spineW - 4)}" height="${textHeight}"/>
                    </clipPath>
                    <rect class="bookShape" x="${x}" y="${bookTop}" width="${spineW}" height="${h}" rx="${Math.max(2, Math.round(spineW * 0.08))}"/>
                    <path class="pageLine" d="M${x + spineW * 0.22} ${bookTop + Math.round(spineW * 0.35)}h${spineW * 0.56}M${x + spineW * 0.22} ${y + shelfHeight - Math.round(spineW * 0.28)}h${spineW * 0.56}"/>
                    ${title ? `<text x="${x + spineW / 2}" y="${bookTop + textPaddingY}" class="spineText" clip-path="url(#spine-title-${row}-${index})" style="font-size:${spineFontSize}px" writing-mode="vertical-rl" text-orientation="upright">${title}</text>` : ""}
                  </g>
                `;
        })
        .join("");
      const decoration = row === 0 ? input.upperShelfDecoration || "cat" : input.lowerShelfDecoration || "globe";
      const decor = shelfDecorationSvg(
        decoration,
        width * 0.72,
        y + shelfHeight,
        Math.min(shelfHeight * 0.62, width * 0.15)
      );
      return `
        <g>
          ${booksSvg}
          ${decor}
          <rect class="shelfBoard" x="${shelfX}" y="${y + shelfHeight}" width="${shelfWidth}" height="${boardHeight}"/>
          <path class="hatch" d="M${shelfX + Math.round(shelfWidth * 0.04)} ${y + shelfHeight + boardHeight * 0.55}h${Math.round(shelfWidth * 0.2)}M${shelfX + Math.round(shelfWidth * 0.62)} ${y + shelfHeight + boardHeight * 0.55}h${Math.round(shelfWidth * 0.13)}"/>
        </g>
      `;
    });

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <style>
          .title{font:800 ${titleSize}px Georgia,"Times New Roman","Microsoft YaHei",serif;fill:#111}
          .description{font:500 ${descriptionSize}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#333}
          .spineText{font-weight:650;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111;text-anchor:start;dominant-baseline:central}
          .stackText{font-weight:650;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
          .frame,.shelfBoard,.bookShape,.decorLine,.decorFine,.pageLine,.hatch{vector-effect:non-scaling-stroke}
          .frame,.shelfBoard,.decorLine{fill:#fff;stroke:#111;stroke-width:${lineWidth};stroke-linecap:round;stroke-linejoin:round}
          .bookShape{fill:#fff;stroke:#111;stroke-width:${Math.max(2, lineWidth * 0.72)};stroke-linecap:round;stroke-linejoin:round}
          .decorFine,.pageLine{fill:none;stroke:#111;stroke-width:${fineLineWidth};stroke-linecap:round;stroke-linejoin:round}
          .hatch{fill:none;stroke:#111;stroke-width:${Math.max(1, fineLineWidth * 0.72)};stroke-linecap:round;opacity:.72}
        </style>
        <rect width="100%" height="100%" fill="#fbfbf8"/>
        <rect class="frame" x="${Math.round(width * 0.025)}" y="${Math.round(height * 0.022)}" width="${Math.round(width * 0.95)}" height="${Math.round(height * 0.95)}"/>
        <text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.075)}" class="title" text-anchor="middle">${escapeXml(customTitle)}</text>
        <text x="${Math.round(width * 0.5)}" y="${Math.round(height * 0.115)}" class="description" text-anchor="middle">${escapeXml(customDescription)}</text>
        ${shelves.join("")}
      </svg>
    `;
  }

  const coverW = isGrid ? Math.round(width * 0.24) : Math.round(width * 0.28);
  const coverH = isGrid ? Math.round(height * 0.17) : Math.round(height * 0.2);
  const gap = isGrid ? Math.round(width * 0.035) : Math.round(width * 0.012);
  const startX = isGrid ? Math.round(width * 0.08) : Math.round(width * 0.04);
  const startY = isGrid ? Math.round(height * 0.22) : Math.round(height * 0.17);
  const covers = embeddedBooks
    .slice(0, 9)
    .map((book, index) => {
      const col = index % 3;
      const row = Math.floor(index / 3);
      const collageShiftX = isGrid ? 0 : index % 2 === 0 ? -Math.round(width * 0.016) : Math.round(width * 0.018);
      const collageShiftY = isGrid ? 0 : index % 3 === 0 ? Math.round(height * 0.018) : -Math.round(height * 0.01);
      const x = startX + col * (coverW + gap) + collageShiftX;
      const y = startY + row * (coverH + gap) + collageShiftY;
      const image = book.coverUrl
        ? `<image href="${escapeXml(book.coverUrl)}" x="0" y="0" width="${coverW}" height="${coverH}" preserveAspectRatio="xMidYMid slice"/>`
        : `<rect width="${coverW}" height="${coverH}" fill="${index % 2 === 0 ? "#e8e8e2" : "#c9c9c3"}"/>`;
      const rotate = isGrid ? 0 : index % 2 === 0 ? -8 : 7;
      return `
        <g transform="translate(${x} ${y}) rotate(${rotate} ${coverW / 2} ${coverH / 2})">
          <clipPath id="cover-${index}"><rect width="${coverW}" height="${coverH}" rx="${Math.round(width * 0.015)}"/></clipPath>
          <g clip-path="url(#cover-${index})">${image}</g>
          <rect width="${coverW}" height="${coverH}" rx="${Math.round(width * 0.015)}" fill="none" stroke="#111" stroke-opacity=".12" stroke-width="2"/>
          <rect x="0" y="${Math.round(coverH * 0.64)}" width="${coverW}" height="${Math.round(coverH * 0.36)}" fill="#f7f7f2" fill-opacity=".82"/>
          <text x="${Math.round(coverW * 0.12)}" y="${Math.round(coverH * 0.82)}" class="cover-title">${escapeXml(book.title.slice(0, 8))}</text>
        </g>
      `;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .bg{fill:#f7f7f2}
        .title{font:800 ${fontTitle}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
        .cover-title{font:700 ${Math.max(18, Math.round(width * 0.026))}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.1)}" class="small">薯饼 / WEREAD</text>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.16)}" class="title">${escapeXml(customTitle)}</text>
      ${covers}
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.92)}" class="small">数据来源：${dataSourceLabel(snapshot.source)}</text>
    </svg>
  `;
}

function calendarTemplate(
  input: GenerateInput,
  width: number,
  height: number,
  snapshot: WallpaperSnapshot
) {
  const monthLabel = input.selectedMonth && /^\d{4}-\d{2}$/.test(input.selectedMonth) ? input.selectedMonth : snapshot.month;
  const [year, month] = monthLabel.split("-").map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = firstDay.getDay();
  const isCute = input.variant === "cute";
  const margin = Math.round(width * 0.045);
  const gridWidth = width - margin * 2;
  const cellWidth = gridWidth / 7;
  const calendarTop = Math.round(height * 0.205);
  const weekdayHeight = Math.round(height * 0.052);
  const gridTop = calendarTop + weekdayHeight;
  const footerTop = Math.round(height * 0.895);
  const rowCount = Math.ceil((startWeekday + daysInMonth) / 7);
  const rowHeight = (footerTop - gridTop) / rowCount;
  const dateHeaderHeight = Math.min(Math.round(rowHeight * 0.3), Math.round(height * 0.041));
  const barGap = Math.max(4, Math.round(height * 0.004));
  const barHeight = Math.min(Math.round(height * 0.029), Math.floor((rowHeight - dateHeaderHeight - barGap * 2) / 3));
  const fontTitle = Math.max(46, Math.round(width * 0.074));
  const fontBody = Math.max(18, Math.round(width * 0.021));
  const fontSmall = Math.max(15, Math.round(width * 0.016));
  const seed = input.shuffleSeed || 0;
  const fallbackDayPattern = [1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 25, 26, 27, 28, 29, 30, 31, 9, 10, 16, 17, 21, 22, 23, 24, 3];
  const realDailyReading = monthLabel === snapshot.month ? snapshot.dailyReading.filter((item) => item.day <= daysInMonth) : [];
  const activeDays = Array.from(
    new Set(
      (realDailyReading.length
        ? realDailyReading.map((item) => item.day)
        : fallbackDayPattern.slice(0, Math.min(snapshot.readingDays, daysInMonth)))
        .filter((day) => day >= 1 && day <= daysInMonth)
    )
  ).sort((a, b) => a - b);
  const durationByDay = new Map(realDailyReading.map((item) => [item.day, dailyDurationLabel(item)]));
  const bookTitles = (snapshot.topBooks.length ? snapshot.topBooks : ["正在阅读", "本月书单", "随手翻阅"]).slice(0, 5);
  const cutePalette = ["#f3c8d8", "#d8ebc9", "#cbd9f3", "#f6e3a6", "#ded0ec"];
  const simplePalette = ["#171717", "#555", "#8b8b87", "#bdbdb7", "#deded8"];
  const palette = isCute ? cutePalette : simplePalette;

  const runs: number[][] = [];
  activeDays.forEach((day) => {
    const currentRun = runs[runs.length - 1];
    if (currentRun && day === currentRun[currentRun.length - 1] + 1) currentRun.push(day);
    else runs.push([day]);
  });

  type ReadingSpan = { title: string; startDay: number; endDay: number; colorIndex: number; progress: number };
  const readingSpans: ReadingSpan[] = [];
  let bookCursor = seed % bookTitles.length;
  runs.forEach((run, runIndex) => {
    let offset = 0;
    while (offset < run.length) {
      const chunkLength = Math.min(run.length - offset, 2 + ((run[offset] + bookCursor + seed) % 3));
      const chunk = run.slice(offset, offset + chunkLength);
      readingSpans.push({
        title: bookTitles[bookCursor % bookTitles.length],
        startDay: chunk[0],
        endDay: chunk[chunk.length - 1],
        colorIndex: bookCursor % palette.length,
        progress: 15 + ((chunk[chunk.length - 1] * 7 + bookCursor * 13) % 81)
      });
      if (chunk.length >= 2 && (runIndex + bookCursor + seed) % 2 === 1 && bookTitles.length > 1) {
        const extraBook = (bookCursor + 1) % bookTitles.length;
        readingSpans.push({
          title: bookTitles[extraBook],
          startDay: chunk[chunk.length - 1],
          endDay: chunk[chunk.length - 1],
          colorIndex: extraBook % palette.length,
          progress: 10 + ((chunk[chunk.length - 1] * 9 + extraBook * 11) % 70)
        });
      }
      offset += chunkLength;
      bookCursor += 1;
    }
  });

  type SpanSegment = ReadingSpan & { row: number; segmentStart: number; segmentEnd: number; track: number; id: number };
  const rawSegments: Omit<SpanSegment, "track" | "id">[] = [];
  readingSpans.forEach((span) => {
    let segmentStart = span.startDay;
    while (segmentStart <= span.endDay) {
      const position = startWeekday + segmentStart - 1;
      const row = Math.floor(position / 7);
      const daysUntilWeekEnd = 6 - (position % 7);
      const segmentEnd = Math.min(span.endDay, segmentStart + daysUntilWeekEnd);
      rawSegments.push({ ...span, row, segmentStart, segmentEnd });
      segmentStart = segmentEnd + 1;
    }
  });

  const occupiedTracks = new Map<number, Array<Array<[number, number]>>>();
  const segments: SpanSegment[] = rawSegments
    .sort((a, b) => a.row - b.row || a.segmentStart - b.segmentStart || b.segmentEnd - a.segmentEnd)
    .map((segment, id) => {
      const rowTracks = occupiedTracks.get(segment.row) || [[], [], []];
      let track = rowTracks.findIndex((ranges) => ranges.every(([start, end]) => segment.segmentEnd < start || segment.segmentStart > end));
      if (track < 0) track = 2;
      rowTracks[track].push([segment.segmentStart, segment.segmentEnd]);
      occupiedTracks.set(segment.row, rowTracks);
      return { ...segment, track, id };
    });

  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"]
    .map(
      (label, index) =>
        `<text x="${margin + index * cellWidth + cellWidth / 2}" y="${calendarTop + weekdayHeight * 0.64}" class="weekday" text-anchor="middle">${label}</text>`
    )
    .join("");

  const dayCells = Array.from({ length: daysInMonth }, (_, dayIndex) => {
    const day = dayIndex + 1;
    const position = startWeekday + dayIndex;
    const col = position % 7;
    const row = Math.floor(position / 7);
    const x = margin + col * cellWidth;
    const y = gridTop + row * rowHeight;
    const duration = durationByDay.get(day);
    return `
      <rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${col === 0 || col === 6 ? (isCute ? "#fcfbf7" : "#f8f8f5") : "#fff"}" stroke="#111" stroke-opacity=".12"/>
      <text x="${x + Math.round(cellWidth * 0.1)}" y="${y + dateHeaderHeight * 0.64}" class="day">${day}</text>
      ${duration ? `<text x="${x + cellWidth - Math.round(cellWidth * 0.1)}" y="${y + dateHeaderHeight * 0.62}" class="minutes" text-anchor="end">${duration}</text>` : ""}
    `;
  }).join("");

  const spanBars = segments
    .map((segment) => {
      const startPosition = startWeekday + segment.segmentStart - 1;
      const startCol = startPosition % 7;
      const dayLength = segment.segmentEnd - segment.segmentStart + 1;
      const x = margin + startCol * cellWidth + Math.round(cellWidth * 0.035);
      const y = gridTop + segment.row * rowHeight + dateHeaderHeight + segment.track * (barHeight + barGap);
      const spanWidth = dayLength * cellWidth - Math.round(cellWidth * 0.07);
      const color = palette[segment.colorIndex % palette.length];
      const textFill = !isCute && segment.colorIndex < 3 ? "#fff" : "#222";
      const titleLimit = Math.max(3, Math.floor(spanWidth / Math.max(fontSmall * 0.9, 12)));
      const progressText = segment.segmentEnd === segment.endDay ? ` ${segment.progress}%` : "";
      const label = `${segment.segmentStart > segment.startDay ? "↳ " : ""}${segment.title}${progressText}`.slice(0, titleLimit);
      return `
        <clipPath id="calendar-bar-${segment.id}"><rect x="${x}" y="${y}" width="${spanWidth}" height="${barHeight}" rx="${isCute ? 10 : 3}"/></clipPath>
        <rect x="${x}" y="${y}" width="${spanWidth}" height="${barHeight}" rx="${isCute ? 10 : 3}" fill="${color}"/>
        <text x="${x + Math.round(cellWidth * 0.055)}" y="${y + barHeight * 0.66}" class="barText" fill="${textFill}" clip-path="url(#calendar-bar-${segment.id})">${escapeXml(label)}</text>
      `;
    })
    .join("");

  const legend = bookTitles
    .map(
      (title, index) => `
        <circle cx="${Math.round(width * 0.52)}" cy="${Math.round(height * 0.075) + index * Math.round(height * 0.026)}" r="${Math.max(7, Math.round(width * 0.007))}" fill="${palette[index % palette.length]}" stroke="#111" stroke-opacity=".12"/>
        <text x="${Math.round(width * 0.54)}" y="${Math.round(height * 0.08) + index * Math.round(height * 0.026)}" class="legend">${escapeXml(title.slice(0, 14))}</text>
      `
    )
    .join("");
  const sourceNote = snapshot.source === "weread" ? "日期与时长来自微信读书，连续条带仅表示发生阅读" : "本地示例排布";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .bg{fill:${isCute ? "#f7f5ef" : "#efefeb"}}
        .monthTitle{font:850 ${fontTitle}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .year{font:700 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#666}
        .legend{font:650 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#333}
        .weekday{font:750 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
        .day{font:800 ${Math.max(20, Math.round(width * 0.025))}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#222}
        .minutes{font:650 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#888}
        .barText{font:700 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
        .body{font:750 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#666}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      <text x="${margin}" y="${Math.round(height * 0.085)}" class="monthTitle">${month}月</text>
      <text x="${margin}" y="${Math.round(height * 0.125)}" class="year">${year} · READING CALENDAR</text>
      ${legend}
      <rect x="${margin}" y="${calendarTop}" width="${gridWidth}" height="${weekdayHeight}" fill="#fff" stroke="#111" stroke-opacity=".16"/>
      ${weekdayLabels}
      ${dayCells}
      ${spanBars}
      <text x="${margin}" y="${Math.round(height * 0.94)}" class="body">阅读 ${snapshot.readingDays} 天 · ${snapshot.readingMinutes} 分钟 · ${snapshot.bookCount} 本书</text>
      <text x="${width - margin}" y="${Math.round(height * 0.94)}" class="small" text-anchor="end">${dataSourceLabel(snapshot.source)}</text>
      <text x="${margin}" y="${Math.round(height * 0.975)}" class="small">${sourceNote}</text>
    </svg>
  `;
}

function readingCalendarTemplate(
  input: GenerateInput,
  width: number,
  height: number,
  snapshot: WallpaperSnapshot
) {
  const monthLabel =
    input.selectedMonth && /^2026-(0[1-9]|1[0-2])$/.test(input.selectedMonth)
      ? input.selectedMonth
      : snapshot.month;
  const [year, month] = monthLabel.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startWeekday = new Date(year, month - 1, 1).getDay();
  const rowCount = Math.ceil((startWeekday + daysInMonth) / 7);
  const isDoodle = input.variant !== "minimal";
  const isPortrait = height >= width;
  const shortSide = Math.min(width, height);
  const margin = Math.round(width * (isPortrait ? 0.052 : 0.04));
  const gridWidth = width - margin * 2;
  const cellWidth = gridWidth / 7;
  const calendarTop = Math.round(height * (isPortrait ? 0.17 : 0.19));
  const weekdayHeight = Math.round(height * 0.045);
  const gridTop = calendarTop + weekdayHeight;
  const gridBottom = Math.round(height * (isPortrait ? 0.82 : 0.8));
  const rowHeight = (gridBottom - gridTop) / rowCount;
  const dateHeaderHeight = Math.min(Math.round(rowHeight * 0.32), Math.round(height * 0.037));
  const barGap = Math.max(3, Math.round(height * 0.003));
  const barHeight = Math.max(
    16,
    Math.min(Math.round(height * 0.025), Math.floor((rowHeight - dateHeaderHeight - barGap * 2) / 3))
  );
  const fontTitle = Math.max(40, Math.round(shortSide * 0.055));
  const fontBody = Math.max(18, Math.round(shortSide * 0.021));
  const fontSmall = Math.max(14, Math.round(shortSide * 0.0155));
  const dayFont = Math.max(18, Math.round(shortSide * 0.023));
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  const calendarNote = input.calendarNote?.trim() || "";
  const calendarName = input.calendarName?.trim() || "";
  const showStickers = input.showCalendarStickers !== false;
  const seed = input.shuffleSeed || 0;
  const fallbackDayPattern = [
    1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 18, 19, 20, 25, 26, 27, 28, 29, 30, 31, 9, 10,
    16, 17, 21, 22, 23, 24, 3
  ];
  const realDailyReading =
    monthLabel === snapshot.month
      ? snapshot.dailyReading.filter((item) => item.day <= daysInMonth)
      : [];
  const fallbackDays =
    snapshot.source === "weread"
      ? []
      : fallbackDayPattern.slice(0, Math.min(snapshot.readingDays, daysInMonth));
  const activeDays = Array.from(
    new Set(
      (realDailyReading.length ? realDailyReading.map((item) => item.day) : fallbackDays).filter(
        (day) => day >= 1 && day <= daysInMonth
      )
    )
  ).sort((a, b) => a - b);
  const durationByDay = new Map(realDailyReading.map((item) => [item.day, dailyDurationLabel(item)]));
  const bookTitles = Array.from(
    new Set(
      (snapshot.topBooks.length ? snapshot.topBooks : ["正在阅读", "本月书单", "随手翻阅"])
        .map((title) => title.trim())
        .filter(Boolean)
    )
  );
  const palette = ["#161616", "#555", "#919191", "#c6c6c2", "#e4e4df"];

  type ReadingSpan = {
    title: string;
    startDay: number;
    endDay: number;
    colorIndex: number;
  };
  const groupContiguousDays = (days: number[]) => {
    const runs: number[][] = [];
    Array.from(new Set(days))
      .sort((a, b) => a - b)
      .forEach((day) => {
        const currentRun = runs[runs.length - 1];
        if (currentRun && day === currentRun[currentRun.length - 1] + 1) currentRun.push(day);
        else runs.push([day]);
      });
    return runs;
  };

  const readingSpans: ReadingSpan[] = [];
  const scheduledDaysByBook = new Map<string, number[]>();
  realDailyReading.forEach((item) => {
    item.books?.forEach((title) => {
      const days = scheduledDaysByBook.get(title) || [];
      days.push(item.day);
      scheduledDaysByBook.set(title, days);
    });
  });

  if (snapshot.source === "weread") {
    const explicitTitlesByDay = new Map<number, string[]>();
    realDailyReading.forEach((item) => {
      const titles = Array.from(
        new Set(item.books?.map((title) => title.trim()).filter(Boolean) || [])
      );
      if (titles.length) explicitTitlesByDay.set(item.day, titles);
    });
    const inferredDaysByBook = new Map<string, number[]>();

    explicitTitlesByDay.forEach((titles, day) => {
      titles.forEach((title) => {
        const days = inferredDaysByBook.get(title) || [];
        days.push(day);
        inferredDaysByBook.set(title, days);
      });
    });

    const unknownDays = activeDays.filter((day) => !explicitTitlesByDay.has(day));
    const rankedBooks = bookTitles.map((title, index) => {
      const detail = snapshot.topBookDetails.find((book) => book.title.trim() === title);
      return {
        title,
        rank: index,
        weight: Math.max(1, detail?.readingMinutes || bookTitles.length - index)
      };
    });
    const assignedCounts = new Map(
      rankedBooks.map(({ title }) => [title, inferredDaysByBook.get(title)?.length || 0])
    );
    const inferredUnknownDays = new Set<number>();

    // 月度接口能提供全部书目，但不能确认每天对应哪本书。先把尚未出现的每本书
    // 分配到未确认日期；日期少于书目时允许同一天出现多本，确保没有书目被遗漏。
    const missingBooks = rankedBooks.filter(
      ({ title }) => (assignedCounts.get(title) || 0) === 0
    );
    const candidateDays =
      unknownDays.length >= missingBooks.length ? unknownDays : activeDays;
    missingBooks.forEach(({ title }, index) => {
      const day = candidateDays[index % candidateDays.length];
      if (!day) return;
      const days = inferredDaysByBook.get(title) || [];
      days.push(day);
      inferredDaysByBook.set(title, days);
      assignedCounts.set(title, (assignedCounts.get(title) || 0) + 1);
      if (unknownDays.includes(day)) inferredUnknownDays.add(day);
    });

    unknownDays
      .filter((day) => !inferredUnknownDays.has(day))
      .forEach((day) => {
        if (!rankedBooks.length) return;
        const nextBook = rankedBooks.reduce((best, candidate) => {
          const candidateCount = assignedCounts.get(candidate.title) || 0;
          const bestCount = assignedCounts.get(best.title) || 0;
          const candidateScore = candidate.weight / (candidateCount + 1);
          const bestScore = best.weight / (bestCount + 1);
          return candidateScore > bestScore ||
            (candidateScore === bestScore && candidate.rank < best.rank)
            ? candidate
            : best;
        });
        const days = inferredDaysByBook.get(nextBook.title) || [];
        days.push(day);
        inferredDaysByBook.set(nextBook.title, days);
        assignedCounts.set(nextBook.title, (assignedCounts.get(nextBook.title) || 0) + 1);
      });

    let inferredBookIndex = 0;
    inferredDaysByBook.forEach((days, title) => {
      const rankedIndex = bookTitles.indexOf(title);
      const colorIndex = rankedIndex >= 0 ? rankedIndex : inferredBookIndex;
      groupContiguousDays(days).forEach((run) => {
        readingSpans.push({
          title,
          startDay: run[0],
          endDay: run[run.length - 1],
          colorIndex: colorIndex % palette.length
        });
      });
      inferredBookIndex += 1;
    });
  } else if (scheduledDaysByBook.size > 0) {
    scheduledDaysByBook.forEach((days, title) => {
      const colorIndex = Math.max(0, bookTitles.indexOf(title)) % palette.length;
      groupContiguousDays(days).forEach((run) => {
        readingSpans.push({
          title,
          startDay: run[0],
          endDay: run[run.length - 1],
          colorIndex
        });
      });
    });
  } else {
    let bookCursor = bookTitles.length ? seed % bookTitles.length : 0;
    groupContiguousDays(activeDays).forEach((run) => {
      let offset = 0;
      while (offset < run.length) {
        const chunkLength = Math.min(run.length - offset, 2 + ((run[offset] + bookCursor + seed) % 5));
        const chunk = run.slice(offset, offset + chunkLength);
        readingSpans.push({
          title: bookTitles[bookCursor % bookTitles.length],
          startDay: chunk[0],
          endDay: chunk[chunk.length - 1],
          colorIndex: bookCursor % palette.length
        });
        if (chunk.length >= 3 && (bookCursor + seed) % 3 === 1 && bookTitles.length > 1) {
          const extraBook = (bookCursor + 1) % bookTitles.length;
          readingSpans.push({
            title: bookTitles[extraBook],
            startDay: chunk[chunk.length - 1],
            endDay: chunk[chunk.length - 1],
            colorIndex: extraBook % palette.length
          });
        }
        offset += chunkLength;
        bookCursor += 1;
      }
    });
  }

  type SpanSegment = ReadingSpan & {
    row: number;
    segmentStart: number;
    segmentEnd: number;
    track: number;
    id: number;
  };
  const rawSegments: Omit<SpanSegment, "track" | "id">[] = [];
  readingSpans.forEach((span) => {
    let segmentStart = span.startDay;
    while (segmentStart <= span.endDay) {
      const position = startWeekday + segmentStart - 1;
      const row = Math.floor(position / 7);
      const daysUntilWeekEnd = 6 - (position % 7);
      const segmentEnd = Math.min(span.endDay, segmentStart + daysUntilWeekEnd);
      rawSegments.push({ ...span, row, segmentStart, segmentEnd });
      segmentStart = segmentEnd + 1;
    }
  });

  const occupiedTracks = new Map<number, Array<Array<[number, number]>>>();
  const segments: SpanSegment[] = rawSegments
    .sort((a, b) => a.row - b.row || a.segmentStart - b.segmentStart || b.segmentEnd - a.segmentEnd)
    .map((segment, id) => {
      const rowTracks = occupiedTracks.get(segment.row) || [[], [], []];
      let track = rowTracks.findIndex((ranges) =>
        ranges.every(
          ([start, end]) => segment.segmentEnd < start || segment.segmentStart > end
        )
      );
      if (track < 0) track = 2;
      rowTracks[track].push([segment.segmentStart, segment.segmentEnd]);
      occupiedTracks.set(segment.row, rowTracks);
      return { ...segment, track, id };
    });

  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"]
    .map(
      (label, index) =>
        `<text x="${margin + index * cellWidth + cellWidth / 2}" y="${calendarTop + weekdayHeight * 0.64}" class="weekday" text-anchor="middle">${label}</text>`
    )
    .join("");

  const cells = Array.from({ length: rowCount * 7 }, (_, position) => {
    const day = position - startWeekday + 1;
    const col = position % 7;
    const row = Math.floor(position / 7);
    const x = margin + col * cellWidth;
    const y = gridTop + row * rowHeight;
    const jitter = (salt: number, amplitude: number) => {
      const value = (position * 37 + salt * 19 + seed * 13 + month * 7) % 17;
      return ((value - 8) / 8) * amplitude;
    };
    const duration = day >= 1 && day <= daysInMonth ? durationByDay.get(day) : undefined;
    const dayLabel =
      day >= 1 && day <= daysInMonth
        ? `
          <text x="${x + Math.round(cellWidth * 0.1)}" y="${y + dateHeaderHeight * 0.68}" class="day">${day}</text>
          ${duration ? `<text x="${x + cellWidth - Math.round(cellWidth * 0.09)}" y="${y + dateHeaderHeight * 0.65}" class="minutes" text-anchor="end">${duration}</text>` : ""}
        `
        : "";
    const cellShape = isDoodle
      ? (() => {
          const left = x + 1 + jitter(1, 2.2);
          const top = y + 3 + jitter(2, 2.2);
          const bottom = y + rowHeight - 6 + jitter(3, 2.8);
          const right = x + cellWidth - 7 + jitter(4, 3);
          const corner = Math.max(5, Math.min(11, rowHeight * 0.12));
          const controlY = y + rowHeight * 0.53 + jitter(5, 4);
          const bottomControlY = bottom + jitter(6, 2.4);
          const echo =
            position % 4 === 0
              ? `<path d="M ${left + 2.2} ${top + rowHeight * 0.2} C ${left + 0.6} ${controlY} ${left + 2.8} ${bottom - corner} ${left + corner + 1} ${bottom + 1.8} Q ${x + cellWidth * 0.56} ${bottomControlY + 1.3} ${right - cellWidth * 0.13} ${bottom + 1.2}" class="roughEcho"/>`
              : "";
          return `
            <path d="M ${left} ${top} C ${left + jitter(7, 1.8)} ${controlY} ${left - jitter(8, 1.4)} ${bottom - corner} ${left + corner} ${bottom} Q ${x + cellWidth * 0.55} ${bottomControlY} ${right} ${bottom + jitter(9, 1.6)}" class="handCell"/>
            ${echo}
          `;
        })()
      : `<rect x="${x}" y="${y}" width="${cellWidth}" height="${rowHeight}" fill="${col === 0 || col === 6 ? "#f7f7f4" : "#fff"}" class="cell"/>`;
    return `
      ${cellShape}
      ${dayLabel}
    `;
  }).join("");

  const spanBars = segments
    .map((segment) => {
      const startPosition = startWeekday + segment.segmentStart - 1;
      const startCol = startPosition % 7;
      const dayLength = segment.segmentEnd - segment.segmentStart + 1;
      const x = margin + startCol * cellWidth + Math.round(cellWidth * 0.035);
      const y =
        gridTop +
        segment.row * rowHeight +
        dateHeaderHeight +
        segment.track * (barHeight + barGap);
      const spanWidth = dayLength * cellWidth - Math.round(cellWidth * 0.07);
      const color = palette[segment.colorIndex % palette.length];
      const textFill = segment.colorIndex < 3 ? "#fff" : "#111";
      const titleLimit = Math.max(3, Math.floor(spanWidth / Math.max(fontSmall * 0.92, 12)));
      const label = `${segment.segmentStart > segment.startDay ? "↪ " : ""}${segment.title}`.slice(
        0,
        titleLimit
      );
      const shape = isDoodle
        ? `<path d="M ${x + 1} ${y + 1} L ${x + spanWidth - 2} ${y} L ${x + spanWidth} ${y + barHeight - 2} L ${x + 2} ${y + barHeight} Z" fill="${color}" class="doodleBar"/>`
        : `<rect x="${x}" y="${y}" width="${spanWidth}" height="${barHeight}" rx="2" fill="${color}"/>`;
      const hatch =
        isDoodle && segment.colorIndex >= 3
          ? `<path d="M ${x + 5} ${y + barHeight - 3} l ${Math.min(20, spanWidth * 0.13)} ${-Math.min(10, barHeight * 0.45)} M ${x + 15} ${y + barHeight - 2} l ${Math.min(22, spanWidth * 0.14)} ${-Math.min(11, barHeight * 0.5)}" class="hatch"/>`
          : "";
      return `
        <clipPath id="calendar-bar-${segment.id}"><rect x="${x}" y="${y}" width="${spanWidth}" height="${barHeight}"/></clipPath>
        ${shape}
        ${hatch}
        <text x="${x + Math.round(cellWidth * 0.055)}" y="${y + barHeight * 0.68}" class="barText" fill="${textFill}" clip-path="url(#calendar-bar-${segment.id})">${escapeXml(label)}</text>
      `;
    })
    .join("");

  const headerStickerAsset = localImageData("calendar-top-right-clean.png", "image/png");
  const headerStickerWidth = Math.round(width * (isPortrait ? 0.34 : 0.24));
  const headerStickerHeight = Math.round(headerStickerWidth * (543 / 906));
  const headerSticker = headerStickerAsset
    ? `<image id="calendar-top-right-sticker" href="${headerStickerAsset}" x="${width - margin - headerStickerWidth}" y="${Math.round(height * 0.012)}" width="${headerStickerWidth}" height="${headerStickerHeight}" preserveAspectRatio="xMaxYMin meet"/>`
    : "";
  const bottomStickerAsset = localImageData("calendar-bottom-cats-clean.png", "image/png");
  const bottomStickerWidth = Math.round(gridWidth * (isPortrait ? 0.836 : 0.72));
  const bottomStickerHeight = Math.round(bottomStickerWidth * (90 / 1399));
  const bottomSticker = bottomStickerAsset
    ? `<image id="calendar-bottom-sticker" href="${bottomStickerAsset}" x="${margin + Math.round(gridWidth * 0.02)}" y="${Math.round(height * (isPortrait ? 0.932 : 0.925))}" width="${bottomStickerWidth}" height="${bottomStickerHeight}" preserveAspectRatio="xMinYMid meet"/>`
    : "";
  const stickers =
    showStickers
      ? `<g id="calendar-stickers">${headerSticker}${bottomSticker}</g>`
      : "";

  const noteLineStart = margin + Math.round(shortSide * 0.06);
  const noteLineEnd = Math.min(
    width - margin - (showStickers ? headerStickerWidth : 0) - 12,
    noteLineStart + Math.round(width * 0.31)
  );
  const totalHours = Math.floor(snapshot.readingMinutes / 60);
  const remainingMinutes = snapshot.readingMinutes % 60;
  const timeLabel =
    totalHours > 0 ? `${totalHours}小时${remainingMinutes}分钟` : `${remainingMinutes}分钟`;
  const statistics = `阅读${snapshot.readingDays}天 · ${timeLabel} · ${snapshot.bookCount}本书`;
  const sourceLabel =
    snapshot.source === "weread" ? "微信读书" : snapshot.source === "boox" ? "文石阅读" : "示例数据";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="3" seed="${month + 9}"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
        <filter id="gridWobble" x="-4%" y="-4%" width="108%" height="108%">
          <feTurbulence type="fractalNoise" baseFrequency=".018 .065" numOctaves="1" seed="${month + seed + 23}" result="gridNoise"/>
          <feDisplacementMap in="SourceGraphic" in2="gridNoise" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      <style>
        .bg{fill:#fff}
        .monthTitle{font:850 ${fontTitle}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .note{font:650 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#222}
        .weekday{font:750 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .day{font:800 ${dayFont}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .minutes{font:650 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
        .barText{font:700 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
        .body{font:750 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#111}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
        .cell{stroke:#111;stroke-width:${isDoodle ? 1.7 : 1.25}}
        .frame{fill:#fff;stroke:#111;stroke-width:${isDoodle ? 2.8 : 1.5}}
        .weekdayRule{fill:none;stroke:#111;stroke-width:2.4;stroke-linecap:round;filter:url(#gridWobble);opacity:.86}
        .handCell{fill:none;stroke:#111;stroke-width:2.15;stroke-linecap:round;stroke-linejoin:round;filter:url(#gridWobble);opacity:.82}
        .roughEcho{fill:none;stroke:#111;stroke-width:.7;stroke-linecap:round;opacity:.32}
        .doodleBar{stroke:#111;stroke-width:1.1;stroke-linejoin:round}
        .stickerBold{fill:#fff;stroke:#111;stroke-width:4.1;stroke-linecap:round;stroke-linejoin:round}
        .stickerFine{fill:none;stroke:#111;stroke-width:2.1;stroke-linecap:round;stroke-linejoin:round}
        .hatch{fill:none;stroke:#111;stroke-width:1.35;stroke-linecap:round}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      ${isDoodle ? `<rect width="100%" height="100%" filter="url(#paperNoise)" opacity=".035"/>` : ""}
      <text x="${margin}" y="${Math.round(height * 0.075)}" class="monthTitle">${month}月 · ${monthNames[month - 1]} ${year}</text>
      <text x="${margin}" y="${Math.round(height * 0.122)}" class="note">月记</text>
      <line x1="${noteLineStart}" y1="${Math.round(height * 0.126)}" x2="${noteLineEnd}" y2="${Math.round(height * 0.126)}" stroke="#111" stroke-width="${isDoodle ? 1.8 : 1.2}"/>
      ${calendarNote ? `<text x="${noteLineStart + 8}" y="${Math.round(height * 0.119)}" class="note">${escapeXml(ellipsize(calendarNote, readingCalendarLimits.note))}</text>` : ""}
      ${
        isDoodle
          ? `<path d="M ${margin + 2} ${calendarTop + weekdayHeight - 2} Q ${width * 0.49} ${calendarTop + weekdayHeight + 1} ${width - margin - 2} ${calendarTop + weekdayHeight - 1}" class="weekdayRule"/>`
          : `<rect x="${margin}" y="${calendarTop}" width="${gridWidth}" height="${weekdayHeight}" class="frame"/>`
      }
      ${weekdayLabels}
      ${cells}
      ${spanBars}
      ${stickers}
      <line x1="${margin}" y1="${Math.round(height * 0.865)}" x2="${width - margin}" y2="${Math.round(height * 0.865)}" stroke="#111" stroke-width="${isDoodle ? 2.4 : 1.3}"/>
      <text x="${margin}" y="${Math.round(height * 0.902)}" class="body">${statistics}</text>
      ${calendarName ? `<text x="${width - margin}" y="${Math.round(height * 0.902)}" class="body" text-anchor="end">${escapeXml(ellipsize(calendarName, readingCalendarLimits.name))}</text>` : ""}
      <text x="${width - margin}" y="${Math.round(height * 0.973)}" class="small" text-anchor="end">${sourceLabel}</text>
    </svg>
  `;
}

async function readingCardTemplate(
  width: number,
  height: number,
  snapshot: WallpaperSnapshot,
  books: BookshelfBook[],
  input: GenerateInput
) {
  const margin = Math.round(width * 0.045);
  const contentWidth = width - margin * 2;
  const fontTitle = Math.max(48, Math.round(width * 0.085));
  const fontBody = Math.max(19, Math.round(width * 0.024));
  const fontSmall = Math.max(15, Math.round(width * 0.017));
  const fallbackCardBooks = snapshot.topBookDetails.length
    ? snapshot.topBookDetails.map((book) => ({ ...book, coverUrl: "", mediaType: "电子书" }))
    : (snapshot.topBooks.length ? snapshot.topBooks : ["置身事内"]).map((title, index) => ({
        title,
        author: ["兰小欢", "刘擎", "埃里克·乔根森"][index] || "作者未知",
        coverUrl: "",
        mediaType: "电子书"
      }));
  const book = rotateBySeed(books.length ? books : fallbackCardBooks, input.shuffleSeed)[0];
  const wereadDetails =
    snapshot.source === "weread" && input.skillKey && book.bookId
      ? await getReadingCardDetails(input.skillKey, book.bookId).catch(() => null)
      : null;
  const isMinimal = input.variant === "minimal";
  const coverUrl = await imageUrlToDataUri(book.coverUrl);
  const ink = isMinimal ? "#111" : "#0e526d";
  const paper = isMinimal ? "#fff" : "#fbfaf6";
  const topY = Math.round(height * 0.145);
  const topHeight = Math.round(height * 0.31);
  const sectionGap = Math.round(height * 0.018);
  const columnGap = Math.round(width * 0.025);
  const leftWidth = Math.round(contentWidth * 0.57);
  const coverX = margin + leftWidth + columnGap;
  const coverY = topY;
  const coverWidth = width - margin - coverX;
  const coverHeight = topHeight;
  const metaRowHeight = Math.round(topHeight * 0.155);
  const metaGap = Math.round(height * 0.006);
  const labelWidth = Math.round(leftWidth * 0.22);
  const ratingY = topY + (metaRowHeight + metaGap) * 3 + Math.round(height * 0.006);
  const ratingHeight = topY + topHeight - ratingY;
  const summaryY = topY + topHeight + sectionGap;
  const summaryHeight = Math.round(height * 0.165);
  const excerptY = summaryY + summaryHeight + sectionGap;
  const excerptHeight = height - excerptY - Math.round(height * 0.045);
  const sectionHeadHeight = Math.round(height * 0.038);
  const pageColumnWidth = Math.round(contentWidth * 0.14);
  const rating = input.overallRating?.trim() || snapshot.quote || "从最近读过的书里，留一句话给今天。";
  const ratingLines = splitText(rating, width < 900 ? 13 : 18, 4)
    .map(
      (line, index) =>
        `<text x="${margin + Math.round(leftWidth * 0.06)}" y="${ratingY + sectionHeadHeight + Math.round(fontBody * 1.35) + index * Math.round(fontBody * 1.38)}" class="handText">${escapeXml(line)}</text>`
    )
    .join("");
  const matchingSnapshotBook = snapshot.topBookDetails.find((item) => item.title === book.title);
  const summary =
    wereadDetails?.summary ||
    matchingSnapshotBook?.summary ||
    `《${book.title}》来自当前书架。本月累计阅读 ${snapshot.readingMinutes} 分钟、${snapshot.readingDays} 天。`;
  const summaryLines = splitText(summary, width < 900 ? 24 : 34, 4)
    .map(
      (line, index) =>
        `<text x="${margin + Math.round(contentWidth * 0.035)}" y="${summaryY + sectionHeadHeight + Math.round(fontBody * 1.45) + index * Math.round(fontBody * 1.45)}" class="handText">${escapeXml(line)}</text>`
    )
    .join("");
  const excerpt = wereadDetails?.excerpt || (snapshot.source === "weread" ? "" : snapshot.quote);
  const excerptLines = splitText(excerpt, width < 900 ? 20 : 29, 7)
    .map(
      (line, index) =>
        `<text x="${margin + Math.round(contentWidth * 0.035)}" y="${excerptY + sectionHeadHeight + Math.round(fontBody * 1.55) + index * Math.round(fontBody * 1.52)}" class="handText">${escapeXml(line)}</text>`
    )
    .join("");
  const metadata = [
    ["书名", book.title],
    ["作者", book.author || "作者未知"],
    ["类型", book.mediaType || "电子书"]
  ]
    .map(([label, value], index) => {
      const y = topY + index * (metaRowHeight + metaGap);
      return `
        <rect x="${margin}" y="${y}" width="${leftWidth}" height="${metaRowHeight}" rx="${Math.round(metaRowHeight * 0.18)}" class="fieldBox"/>
        <rect x="${margin}" y="${y}" width="${labelWidth}" height="${metaRowHeight}" rx="${Math.round(metaRowHeight * 0.16)}" fill="${ink}"/>
        <text x="${margin + labelWidth / 2}" y="${y + metaRowHeight * 0.66}" class="fieldLabel" text-anchor="middle">${label}</text>
        <text x="${margin + labelWidth + Math.round(leftWidth * 0.035)}" y="${y + metaRowHeight * 0.66}" class="fieldValue">${escapeXml(value.slice(0, 18))}</text>
      `;
    })
    .join("");
  const cover = coverUrl
    ? `<image href="${escapeXml(coverUrl)}" x="${coverX}" y="${coverY}" width="${coverWidth}" height="${coverHeight}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="${coverX}" y="${coverY}" width="${coverWidth}" height="${coverHeight}" fill="url(#hatch)"/>
       <text x="${coverX + coverWidth / 2}" y="${coverY + coverHeight * 0.5}" class="coverMark" text-anchor="middle">${escapeXml(book.title.slice(0, 1))}</text>
       <text x="${coverX + coverWidth / 2}" y="${coverY + coverHeight * 0.62}" class="coverHint" text-anchor="middle">书封面</text>`;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <pattern id="hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
          <rect width="18" height="18" fill="${paper}"/>
          <line x1="0" y1="0" x2="0" y2="18" stroke="${ink}" stroke-opacity=".11" stroke-width="3"/>
        </pattern>
        <pattern id="paperGrid" width="34" height="34" patternUnits="userSpaceOnUse">
          <rect width="34" height="34" fill="${paper}"/>
          <path d="M 34 0 L 0 0 0 34" fill="none" stroke="${ink}" stroke-opacity=".12" stroke-width="1.5"/>
        </pattern>
      </defs>
      <style>
        .bg{fill:${paper}}
        .cardTitle{font:800 ${fontTitle}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:${ink}}
        .sectionLabel{font:700 ${fontBody}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:${ink}}
        .fieldLabel{font:700 ${fontBody}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:#fff}
        .fieldValue{font:650 ${fontBody}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#222}
        .handText{font:500 ${fontBody}px "Kaiti SC",KaiTi,"Songti SC","Microsoft YaHei",serif;fill:#26363d}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#5e6a70}
        .stars{font:500 ${Math.max(32, Math.round(width * 0.043))}px Georgia,"Times New Roman",serif;fill:#d49a73}
        .coverMark{font:800 ${Math.max(52, Math.round(width * 0.13))}px "Songti SC",serif;fill:${ink};fill-opacity:.45}
        .coverHint{font:650 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:${ink};fill-opacity:.55}
        .fieldBox{fill:${paper};stroke:${ink};stroke-width:2.5}
        .sectionBox{fill:url(#paperGrid);stroke:${ink};stroke-width:2.5}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      <text x="${width / 2}" y="${Math.round(height * 0.085)}" class="cardTitle" text-anchor="middle">阅读记录卡</text>
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.112)}" y2="${Math.round(height * 0.112)}" stroke="${ink}" stroke-width="${Math.max(4, Math.round(width * 0.006))}" stroke-linecap="round"/>
      ${metadata}
      <rect x="${margin}" y="${ratingY}" width="${leftWidth}" height="${ratingHeight}" rx="${Math.round(width * 0.018)}" class="sectionBox"/>
      <rect x="${margin}" y="${ratingY}" width="${leftWidth}" height="${sectionHeadHeight}" rx="${Math.round(width * 0.018)}" fill="${paper}" fill-opacity=".9"/>
      <text x="${margin + leftWidth / 2}" y="${ratingY + sectionHeadHeight * 0.68}" class="sectionLabel" text-anchor="middle">整体评价</text>
      ${ratingLines}
      <text x="${margin + Math.round(leftWidth * 0.05)}" y="${ratingY + ratingHeight - Math.round(height * 0.018)}" class="stars">☆ ☆ ☆ ☆ ☆</text>
      <clipPath id="reading-card-cover"><rect x="${coverX}" y="${coverY}" width="${coverWidth}" height="${coverHeight}" rx="${Math.round(width * 0.012)}"/></clipPath>
      <g clip-path="url(#reading-card-cover)">${cover}</g>
      <rect x="${coverX}" y="${coverY}" width="${coverWidth}" height="${coverHeight}" rx="${Math.round(width * 0.012)}" fill="none" stroke="${ink}" stroke-width="2.5"/>
      <rect x="${margin}" y="${summaryY}" width="${contentWidth}" height="${summaryHeight}" rx="${Math.round(width * 0.018)}" class="sectionBox"/>
      <rect x="${margin}" y="${summaryY}" width="${contentWidth}" height="${sectionHeadHeight}" rx="${Math.round(width * 0.018)}" fill="${paper}" fill-opacity=".9"/>
      <text x="${margin + Math.round(contentWidth * 0.035)}" y="${summaryY + sectionHeadHeight * 0.68}" class="sectionLabel">内容概要</text>
      ${summaryLines}
      <rect x="${margin}" y="${excerptY}" width="${contentWidth}" height="${excerptHeight}" rx="${Math.round(width * 0.018)}" class="sectionBox"/>
      <rect x="${margin}" y="${excerptY}" width="${contentWidth}" height="${sectionHeadHeight}" rx="${Math.round(width * 0.018)}" fill="${paper}" fill-opacity=".9"/>
      <line x1="${width - margin - pageColumnWidth}" x2="${width - margin - pageColumnWidth}" y1="${excerptY}" y2="${excerptY + excerptHeight}" stroke="${ink}" stroke-width="2.5"/>
      <text x="${margin + Math.round(contentWidth * 0.035)}" y="${excerptY + sectionHeadHeight * 0.68}" class="sectionLabel">心动片段</text>
      <text x="${width - margin - pageColumnWidth / 2}" y="${excerptY + sectionHeadHeight * 0.68}" class="sectionLabel" text-anchor="middle">页码</text>
      ${excerptLines}
      <text x="${width - margin - pageColumnWidth / 2}" y="${excerptY + sectionHeadHeight + Math.round(fontBody * 1.65)}" class="handText" text-anchor="middle">${snapshot.source === "weread" ? "--" : "P.128"}</text>
      <text x="${margin + Math.round(contentWidth * 0.035)}" y="${excerptY + excerptHeight - Math.round(height * 0.018)}" class="small">${dataSourceLabel(snapshot.source)} · ${escapeXml(snapshot.month)}</text>
    </svg>
  `;
}

async function doodleReadingCardTemplate(
  width: number,
  height: number,
  snapshot: WallpaperSnapshot,
  books: BookshelfBook[],
  input: GenerateInput
) {
  const margin = Math.round(width * 0.052);
  const contentWidth = width - margin * 2;
  const shortSide = Math.min(width, height);
  const isCute = input.variant !== "minimal";
  const fontTitle = Math.max(44, Math.round(shortSide * 0.066));
  const fontBody = Math.max(19, Math.round(shortSide * 0.022));
  const fontSmall = Math.max(14, Math.round(shortSide * 0.018));
  const fontSection = Math.max(22, Math.round(shortSide * 0.027));
  const fallbackCardBooks = snapshot.topBookDetails.length
    ? snapshot.topBookDetails.map((book) => ({ ...book, coverUrl: "", mediaType: "电子书" }))
    : (snapshot.topBooks.length ? snapshot.topBooks : ["置身事内"]).map((title, index) => ({
        title,
        author: ["兰小欢", "刘擎", "埃里克·乔根森"][index] || "作者未知",
        coverUrl: "",
        mediaType: "电子书"
      }));
  const book = rotateBySeed(books.length ? books : fallbackCardBooks, input.shuffleSeed)[0];
  const wereadDetails =
    snapshot.source === "weread" && input.skillKey && book.bookId
      ? await getReadingCardDetails(input.skillKey, book.bookId).catch(() => null)
      : null;
  const coverUrl = await imageUrlToDataUri(book.coverUrl);
  const matchingSnapshotBook = snapshot.topBookDetails.find((item) => item.title === book.title);
  const progress =
    wereadDetails?.progress ??
    (snapshot.source === "weread" ? 0 : book.finished ? 100 : 68);
  const fallbackMinutes =
    matchingSnapshotBook?.readingMinutes ||
    Math.max(0, Math.round(snapshot.readingMinutes / Math.max(1, snapshot.bookCount)));
  const readingSeconds =
    wereadDetails?.readingSeconds ??
    (snapshot.source === "weread" ? 0 : fallbackMinutes * 60);
  const readingHours = Math.floor(readingSeconds / 3600);
  const readingMinutes = Math.round((readingSeconds % 3600) / 60);
  const readingTimeLabel =
    readingSeconds <= 0
      ? "--"
      : readingHours > 0
        ? `${readingHours}小时${readingMinutes}分钟`
        : `${readingMinutes}分钟`;
  const score = Math.max(1, Math.min(5, Math.round(input.readingCardRating || 3)));
  const overallRating =
    input.overallRating?.trim() ||
    snapshot.quote ||
    "从最近读过的书里，留一句话给今天。";
  const fallbackNotes =
    snapshot.source === "weread"
      ? []
      : [
          {
            thought: "读到这里时，重新理解了选择与行动的关系。",
            quote: snapshot.quote || "真正重要的改变，往往从一次认真阅读开始。",
            chapter: "第七章"
          },
          {
            thought: "把复杂问题放回真实情境中再看。",
            quote: matchingSnapshotBook?.summary || "阅读让经验被重新组织，也让问题逐渐清晰。",
            chapter: "第九章"
          }
        ];
  const noteSlots = Array.from(
    { length: 2 },
    (_, index) => wereadDetails?.notes[index] || fallbackNotes[index] || { thought: "", quote: "", chapter: "" }
  );

  const headerLineY = Math.round(height * 0.105);
  const mainY = Math.round(height * 0.135);
  const mainHeight = Math.round(height * 0.31);
  const leftWidth = Math.round(contentWidth * 0.55);
  const columnGap = Math.round(width * 0.03);
  const coverX = margin + leftWidth + columnGap;
  const coverY = mainY + Math.round(mainHeight * 0.02);
  const coverWidth = width - margin - coverX;
  const coverHeight = Math.round(mainHeight * 0.96);
  const evaluationY = Math.round(height * 0.485);
  const evaluationHeight = Math.round(height * 0.145);
  const notesY = Math.round(height * 0.655);
  const notesHeight = height - notesY - Math.round(height * 0.05);
  const sectionPadding = Math.round(contentWidth * 0.03);
  const chapterColumnWidth = Math.round(contentWidth * 0.18);
  const chapterX = width - margin - chapterColumnWidth;

  const dashedLine = (x1: number, y: number, x2: number) =>
    `<path d="M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + (isCute ? 1.5 : 0)} ${x2} ${y}" class="dashLine"/>`;
  const roughFrame = (x: number, y: number, frameWidth: number, frameHeight: number, radius: number) => {
    if (!isCute) {
      return `<rect x="${x}" y="${y}" width="${frameWidth}" height="${frameHeight}" rx="${radius}" class="cleanFrame"/>`;
    }
    return `
      <path d="M ${x + radius} ${y + 1}
        Q ${x + frameWidth * 0.52} ${y - 2} ${x + frameWidth - radius} ${y + 2}
        Q ${x + frameWidth + 2} ${y + 4} ${x + frameWidth - 1} ${y + radius}
        L ${x + frameWidth + 1} ${y + frameHeight - radius}
        Q ${x + frameWidth} ${y + frameHeight + 2} ${x + frameWidth - radius} ${y + frameHeight - 1}
        Q ${x + frameWidth * 0.46} ${y + frameHeight + 2} ${x + radius} ${y + frameHeight}
        Q ${x - 2} ${y + frameHeight - 4} ${x + 1} ${y + frameHeight - radius}
        L ${x - 1} ${y + radius}
        Q ${x} ${y + 2} ${x + radius} ${y + 1}Z" class="roughFrame"/>
    `;
  };
  const starPath = (cx: number, cy: number, outerRadius: number) => {
    const points = Array.from({ length: 10 }, (_, index) => {
      const radius = index % 2 === 0 ? outerRadius : outerRadius * 0.45;
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      return `${cx + Math.cos(angle) * radius},${cy + Math.sin(angle) * radius}`;
    });
    return points.join(" ");
  };
  const stars = Array.from({ length: 5 }, (_, index) => {
    const radius = Math.min(leftWidth * 0.047, mainHeight * 0.055);
    const cx = margin + leftWidth * 0.34 + index * radius * 2.35;
    const cy = mainY + mainHeight * 0.9;
    return `<polygon points="${starPath(cx, cy, radius)}" class="${index < score ? "starFilled" : "starEmpty"}"/>`;
  }).join("");

  const metadataRows = [
    ["书名", book.title || "未命名书籍"],
    ["作者", book.author || "作者未知"],
    ["进度", `${progress}%`],
    ["阅读时长", readingTimeLabel]
  ]
    .map(([label, value], index) => {
      const y = mainY + mainHeight * (0.12 + index * 0.18);
      const lineStart = margin + leftWidth * (label === "阅读时长" ? 0.38 : 0.27);
      const valueLimit = label === "书名" || label === "作者" ? 16 : 12;
      return `
        <text x="${margin}" y="${y}" class="metaLabel">${label}</text>
        ${dashedLine(lineStart, y + fontSmall * 0.18, margin + leftWidth)}
        <text x="${lineStart + Math.round(fontSmall * 0.7)}" y="${y - fontSmall * 0.18}" class="metaValue">${escapeXml(value.slice(0, valueLimit))}</text>
      `;
    })
    .join("");

  const evaluationLines = splitText(overallRating, width < 900 ? 21 : 31, 4)
    .map(
      (line, index) =>
        `<text x="${margin + sectionPadding}" y="${evaluationY + fontSection * 2.15 + index * fontBody * 1.35}" class="bodyText">${escapeXml(line)}</text>`
    )
    .join("");

  const noteMarkup = noteSlots
    .map((note, index) => {
      const notesHeaderHeight = Math.round(notesHeight * 0.16);
      const slotHeight = (notesHeight - notesHeaderHeight) / 2;
      const slotY = notesY + notesHeaderHeight + index * slotHeight;
      const textX = margin + sectionPadding + Math.round(contentWidth * 0.06);
      const lineEnd = chapterX - Math.round(contentWidth * 0.025);
      const thoughtLines = splitText(note.thought, width < 900 ? 17 : 25, 1);
      const quoteLines = splitText(note.quote, width < 900 ? 20 : 30, 2);
      const thoughtY = slotY + slotHeight * 0.28;
      const quoteY = slotY + slotHeight * 0.58;
      const chapterLines = splitText(note.chapter, 10, 2);
      return `
        <g>
          <g transform="translate(${margin + sectionPadding} ${slotY + slotHeight * 0.13}) scale(${Math.min(shortSide * 0.00045, 0.65)})">
            <path d="M4 14 Q21 6 40 16 L40 48 Q22 39 4 47Z M40 16 Q59 6 76 14 L76 47 Q58 39 40 48Z M40 16 L40 48" class="iconFine"/>
            <path d="M10 20 Q22 15 34 21 M10 28 Q22 23 34 29 M47 21 Q59 15 70 20 M47 29 Q59 23 70 28" class="iconFine thin"/>
          </g>
          <text x="${textX}" y="${thoughtY}" class="noteLabel">想法：</text>
          ${dashedLine(textX + fontBody * 3.2, thoughtY + fontSmall * 0.15, lineEnd)}
          ${thoughtLines.map((line) => `<text x="${textX + fontBody * 3.4}" y="${thoughtY - fontSmall * 0.2}" class="noteValue">${escapeXml(line)}</text>`).join("")}
          <text x="${textX}" y="${quoteY}" class="noteLabel">引用：</text>
          ${quoteLines
            .map((line, lineIndex) => {
              const y = quoteY + lineIndex * fontBody * 1.45;
              return `${dashedLine(textX + fontBody * 3.2, y + fontSmall * 0.15, lineEnd)}
                <text x="${textX + fontBody * 3.4}" y="${y - fontSmall * 0.2}" class="noteValue">${escapeXml(line)}</text>`;
            })
            .join("")}
          ${
            quoteLines.length === 0
              ? `${dashedLine(textX + fontBody * 3.2, quoteY + fontSmall * 0.15, lineEnd)}
                 ${dashedLine(textX + fontBody * 3.2, quoteY + fontBody * 1.45 + fontSmall * 0.15, lineEnd)}`
              : quoteLines.length === 1
                ? dashedLine(textX + fontBody * 3.2, quoteY + fontBody * 1.45 + fontSmall * 0.15, lineEnd)
                : ""
          }
          ${chapterLines.map((line, lineIndex) => `<text x="${chapterX + chapterColumnWidth / 2}" y="${slotY + slotHeight * (0.42 + lineIndex * 0.2)}" class="chapterValue" text-anchor="middle">${escapeXml(line)}</text>`).join("")}
        </g>
      `;
    })
    .join("");

  const cover = coverUrl
    ? `<image href="${escapeXml(coverUrl)}" x="${coverX + 3}" y="${coverY + 3}" width="${coverWidth - 6}" height="${coverHeight - 6}" preserveAspectRatio="xMidYMid slice" filter="url(#grayCover)"/>`
    : `
      <g transform="translate(${coverX + coverWidth * 0.23} ${coverY + coverHeight * 0.17}) scale(${Math.min(coverWidth, coverHeight) / 175})">
        <path d="M23 58 Q17 37 32 26 L31 12 L45 25 Q60 20 73 27 L88 13 L86 37 Q99 51 90 72 Q79 91 57 89 Q35 90 23 72Z" class="iconBold"/>
        <path d="M40 48 q4 4 8 0 M67 48 q4 4 8 0 M53 58 q5 5 10 0 M27 61 L10 58 M84 61 L102 57" class="iconFine"/>
        <path d="M19 72 Q41 62 58 78 Q75 62 96 72 L91 108 Q75 98 58 112 Q40 98 24 108Z M58 78 L58 112" class="iconBold"/>
        <path d="M31 78 Q43 73 52 82 M65 82 Q76 73 87 79" class="iconFine thin"/>
      </g>
      <text x="${coverX + coverWidth / 2}" y="${coverY + coverHeight * 0.83}" class="coverHint" text-anchor="middle">封面</text>
    `;

  const headerBookIcon = `
    <g transform="translate(${margin + contentWidth * 0.13} ${height * 0.025}) scale(${Math.min(shortSide * 0.00068, 0.88)})">
      <path d="M3 16 Q25 5 49 18 L49 72 Q26 60 3 70Z M49 18 Q73 5 96 16 L96 70 Q73 60 49 72Z M49 18 L49 72" class="iconBold"/>
      <path d="M13 25 Q28 17 40 24 M13 36 Q28 28 40 35 M58 24 Q74 17 87 25 M58 35 Q74 28 87 36" class="iconFine thin"/>
    </g>
  `;
  const headerCatIcon = isCute
    ? `
      <g transform="translate(${width - margin - shortSide * 0.12} ${height * 0.027}) scale(${Math.min(shortSide * 0.00062, 0.78)})">
        <path d="M16 48 Q11 27 27 19 L26 5 L40 17 Q53 13 65 18 L79 6 L78 27 Q91 38 84 57 Q74 72 51 72 Q28 73 16 57Z" class="iconBold"/>
        <path d="M32 38 q4 4 8 0 M59 38 q4 4 8 0 M46 47 q5 5 10 0 M20 49 L3 46 M80 49 L98 45 M21 56 L5 60 M79 56 L95 62" class="iconFine"/>
      </g>
    `
    : "";
  const tape = isCute
    ? `<path d="M ${coverX - 12} ${coverY + 22} L ${coverX + coverWidth * 0.16} ${coverY - 20} L ${coverX + coverWidth * 0.22} ${coverY + 10} L ${coverX + 6} ${coverY + 52} Z" class="tape"/>`
    : "";
  const pencil = `
    <g transform="translate(${width - margin - sectionPadding - shortSide * 0.075} ${evaluationY + evaluationHeight - shortSide * 0.078}) rotate(-48) scale(${Math.min(shortSide * 0.00048, 0.62)})">
      <path d="M12 10 H84 V31 H12Z M84 10 L99 20.5 L84 31Z M12 10 L3 20.5 L12 31Z M24 10 V31 M77 10 V31" class="iconBold"/>
      <path d="M28 16 H73" class="iconFine thin"/>
    </g>
  `;
  const bookStack = isCute
    ? `
      <g transform="translate(${width - margin - chapterColumnWidth * 0.76} ${notesY + notesHeight * 0.79}) scale(${Math.min(shortSide * 0.00058, 0.75)})">
        <path d="M7 65 L78 65 L89 79 L14 79Z M17 46 L91 46 L82 63 L7 63Z M9 27 L77 27 L89 44 L16 44Z" class="iconBold"/>
        <path d="M21 32 H70 M22 51 H78 M21 70 H75" class="iconFine thin"/>
        <path d="M49 26 Q45 12 53 6 Q59 14 54 26 M52 16 Q65 9 70 17 Q61 24 53 22" class="iconFine"/>
      </g>
    `
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="paperNoise" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".78" numOctaves="3" seed="31"/>
          <feColorMatrix type="saturate" values="0"/>
        </filter>
        <filter id="grayCover">
          <feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.08" intercept=".02"/>
            <feFuncG type="linear" slope="1.08" intercept=".02"/>
            <feFuncB type="linear" slope="1.08" intercept=".02"/>
          </feComponentTransfer>
        </filter>
        <clipPath id="cardCoverClip">
          <rect x="${coverX + 3}" y="${coverY + 3}" width="${coverWidth - 6}" height="${coverHeight - 6}" rx="${Math.round(shortSide * 0.018)}"/>
        </clipPath>
      </defs>
      <style>
        .bg{fill:#fff}
        .title{font:800 ${fontTitle}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .metaLabel{font:700 ${fontSection}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .metaValue{font:650 ${fontBody}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .sectionTitle{font:700 ${fontSection}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .bodyText{font:500 ${fontBody}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .noteLabel{font:700 ${fontBody}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .noteValue{font:500 ${fontSmall}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .chapterValue{font:650 ${fontSmall}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
        .coverHint{font:700 ${fontSection}px "Kaiti SC",KaiTi,"Microsoft YaHei",sans-serif;fill:#111}
        .roughFrame{fill:none;stroke:#111;stroke-width:${Math.max(3, shortSide * 0.004)};stroke-linecap:round;stroke-linejoin:round}
        .cleanFrame{fill:none;stroke:#111;stroke-width:${Math.max(2, shortSide * 0.0022)}}
        .dashLine{fill:none;stroke:#111;stroke-width:${isCute ? 2.4 : 1.6};stroke-linecap:round;stroke-dasharray:${Math.round(shortSide * 0.01)} ${Math.round(shortSide * 0.009)}}
        .iconBold{fill:#fff;stroke:#111;stroke-width:4.4;stroke-linecap:round;stroke-linejoin:round}
        .iconFine{fill:none;stroke:#111;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
        .iconFine.thin{stroke-width:1.7}
        .starFilled{fill:#111;stroke:#111;stroke-width:2;stroke-linejoin:round}
        .starEmpty{fill:#fff;stroke:#111;stroke-width:2.5;stroke-linejoin:round}
        .tape{fill:#fff;stroke:#111;stroke-width:2.5;stroke-linejoin:round}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      ${isCute ? `<rect width="100%" height="100%" filter="url(#paperNoise)" opacity=".035"/>` : ""}
      ${headerBookIcon}
      <text x="${width / 2}" y="${Math.round(height * 0.075)}" class="title" text-anchor="middle">阅读记录卡</text>
      ${headerCatIcon}
      <path d="M ${margin} ${headerLineY} Q ${width / 2} ${headerLineY + (isCute ? 3 : 0)} ${width - margin} ${headerLineY}" fill="none" stroke="#111" stroke-width="${Math.max(3, shortSide * 0.0042)}" stroke-linecap="round"/>
      ${metadataRows}
      <text x="${margin}" y="${mainY + mainHeight * 0.91}" class="metaLabel">评分</text>
      ${stars}
      <g clip-path="url(#cardCoverClip)">${cover}</g>
      ${roughFrame(coverX, coverY, coverWidth, coverHeight, Math.round(shortSide * 0.022))}
      ${tape}
      ${roughFrame(margin, evaluationY, contentWidth, evaluationHeight, Math.round(shortSide * 0.022))}
      <text x="${margin + sectionPadding}" y="${evaluationY + fontSection * 1.25}" class="sectionTitle">整体评价</text>
      ${evaluationLines}
      ${pencil}
      ${roughFrame(margin, notesY, contentWidth, notesHeight, Math.round(shortSide * 0.022))}
      <text x="${margin + sectionPadding}" y="${notesY + fontSection * 1.35}" class="sectionTitle">划线笔记</text>
      <line x1="${chapterX}" x2="${chapterX}" y1="${notesY + notesHeight * 0.08}" y2="${notesY + notesHeight * 0.92}" stroke="#111" stroke-width="${Math.max(2, shortSide * 0.0025)}" stroke-linecap="round"/>
      <text x="${chapterX + chapterColumnWidth / 2}" y="${notesY + fontSection * 1.35}" class="sectionTitle" text-anchor="middle">章节</text>
      ${noteMarkup}
      ${bookStack}
    </svg>
  `;
}

function copywritingTemplate(input: GenerateInput, width: number, height: number) {
  const margin = Math.round(width * 0.1);
  const fontTitle = Math.max(42, Math.round(width * 0.07));
  const fontSmall = Math.max(18, Math.round(width * 0.022));
  const text = input.customTitle?.trim() || "慢慢读，世界会自己展开。";
  const lines = splitText(text, 12, 5)
    .map((line, index) => `<text x="${margin}" y="${Math.round(height * 0.36) + index * fontTitle * 1.25}" class="title">${escapeXml(line)}</text>`)
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <style>
        .bg{fill:#f7f7f2}
        .title{font:700 ${fontTitle}px Georgia,"Times New Roman","Microsoft YaHei",serif;fill:#111}
        .small{font:600 ${fontSmall}px -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;fill:#555}
      </style>
      <rect width="100%" height="100%" class="bg"/>
      <text x="${margin}" y="${Math.round(height * 0.11)}" class="small">薯饼 / COPY WALLPAPER</text>
      <line x1="${margin}" x2="${width - margin}" y1="${Math.round(height * 0.2)}" y2="${Math.round(height * 0.2)}" stroke="#111" stroke-opacity=".18" stroke-width="2"/>
      ${lines}
      <text x="${margin}" y="${Math.round(height * 0.91)}" class="small">无需数据源 · 用户输入</text>
    </svg>
  `;
}

export async function generateWallpaper(input: GenerateInput) {
  // 所有平台先归一化为 WallpaperSnapshot，模板不直接读取文石或微信读书原始响应。
  const selectedDataMode = input.dataMode || "boox";
  if (selectedDataMode === "weread" && !input.skillKey) {
    throw new Error("请先在当前浏览器装载微信读书 Skill Key。");
  }
  const requestedCalendarMonth =
    input.templateKey === "reading_calendar" &&
    input.selectedMonth &&
    /^2026-(0[1-9]|1[0-2])$/.test(input.selectedMonth)
      ? input.selectedMonth
      : undefined;
  const requestedWeek =
    input.templateKey === "weekly_receipt" &&
    input.selectedWeek &&
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(input.selectedWeek)
      ? input.selectedWeek
      : undefined;
  const booxSnapshot = getMockBooxSnapshot();
  const snapshot =
    selectedDataMode === "boox"
      ? {
          ...booxSnapshot,
          ...(requestedCalendarMonth
            ? { month: requestedCalendarMonth, year: requestedCalendarMonth.slice(0, 4) }
            : {}),
          source: "boox" as const
        }
      : selectedDataMode === "mock"
      ? { ...getMockWereadSnapshot(), source: "mock" as const }
      : input.templateKey === "weekly_receipt"
        ? await getWeeklyReceiptSnapshot(input.skillKey!, requestedWeek)
        : await getMonthlyReceiptSnapshot(input.skillKey!, requestedCalendarMonth);
  // 只有需要真实封面/书目信息的模板才额外请求书架，降低网关调用次数和生成延迟。
  const needsShelf = input.templateKey === "bookshelf_wall" || input.templateKey === "cover_collage" || input.templateKey === "annotations_card";
  const shelf =
    selectedDataMode === "mock" || selectedDataMode === "boox" || !needsShelf
      ? null
      : await getBookshelfSnapshot(input.skillKey!);
  const { width, height } = getTargetSize(input);
  let svg: string;

  if (input.templateKey === "bookshelf_wall" || input.templateKey === "cover_collage") {
    svg = await coverTemplate(width, height, snapshot, shelf?.books.slice(0, 24) || [], input);
  } else if (input.templateKey === "reading_calendar") {
    svg = readingCalendarTemplate(input, width, height, snapshot);
  } else if (input.templateKey === "annotations_card") {
    svg = await doodleReadingCardTemplate(width, height, snapshot, shelf?.books.slice(0, 24) || [], input);
  } else if (input.templateKey === "copywriting_wallpaper") {
    svg = copywritingTemplate(input, width, height);
  } else {
    svg = receiptTemplate(input, width, height, snapshot);
  }

  const visibleText = svg
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
  const selectedFont = await resolveSvgFont(input.fontKey, visibleText, input.transientFont);
  // 字体覆盖放在模板样式末尾；自定义字体会同时注入仅含当前文字的 @font-face 子集。
  svg = svg.replace(
    "</style>",
    `${selectedFont.fontFace}\ntext{font-family:${selectedFont.cssFamily}!important}\n</style>`
  );

  return {
    imageUrl: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    width,
    height,
    dataSource: snapshot.source,
    coverCount: shelf?.books.filter((book) => Boolean(book.coverUrl)).length || 0,
    receiptExcerpts: input.templateKey === "weekly_receipt" ? resolveWeeklyReceiptExcerpts(input, snapshot) : undefined,
    mode: "template" as const
  };
}
