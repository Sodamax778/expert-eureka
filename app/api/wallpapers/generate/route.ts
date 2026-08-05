import { NextRequest } from "next/server";
import { generateWallpaper } from "@/lib/wallpaper";
import type { TransientFontPayload } from "@/lib/custom-fonts";
import {
  enforceRateLimit,
  enforceSameOrigin,
  errorJson,
  getWereadSkillKeyFromRequest,
  privateJson
} from "@/lib/request-security";

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request, "wallpaper-generate", 45, 60_000);
    // API 只负责接收模板参数；数据源选择、归一化和渲染统一由 generateWallpaper 处理。
    const body = (await request.json()) as {
      templateKey?: string;
      deviceKey?: string;
      orientation?: "portrait" | "landscape";
      variant?: string;
      customTitle?: string;
      customDescription?: string;
      shuffleSeed?: number;
      dataMode?: "mock" | "boox" | "weread";
      customWidth?: number;
      customHeight?: number;
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
      selectedMonth?: string;
      calendarNote?: string;
      calendarName?: string;
      showCalendarStickers?: boolean;
      readingCardRating?: number;
      overallRating?: string;
      fontKey?: string;
      transientFont?: TransientFontPayload;
    };

    const dataMode = body.dataMode || "boox";
    const skillKey = dataMode === "weread" ? getWereadSkillKeyFromRequest(request) : undefined;

    const result = await generateWallpaper({
      templateKey: body.templateKey || "monthly_receipt",
      deviceKey: body.deviceKey || "leaf5",
      orientation: "portrait",
      variant: body.variant,
      customTitle: body.customTitle,
      customDescription: body.customDescription,
      shuffleSeed: body.shuffleSeed || 0,
      dataMode,
      customWidth: body.customWidth,
      customHeight: body.customHeight,
      shelfCapacity: 10,
      shelfFontScale: body.shelfFontScale,
      bookFilter: body.bookFilter,
      upperShelfDecoration: body.upperShelfDecoration,
      lowerShelfDecoration: body.lowerShelfDecoration,
      receiptStoreName: body.receiptStoreName,
      receiptStoreSubtitle: body.receiptStoreSubtitle,
      receiptShippingDevice: body.receiptShippingDevice,
      receiptExcerpts: body.receiptExcerpts,
      receiptDeviceNumber: body.receiptDeviceNumber,
      receiptOrderTime: body.receiptOrderTime,
      receiptBuyer: body.receiptBuyer,
      showBarcode: body.showBarcode,
      receiptNote: body.receiptNote,
      showReceiptNote: body.showReceiptNote,
      showBooxStamp: body.showBooxStamp,
      selectedMonth: body.selectedMonth,
      calendarNote: body.calendarNote,
      calendarName: body.calendarName,
      showCalendarStickers: body.showCalendarStickers,
      readingCardRating: body.readingCardRating,
      overallRating: body.overallRating,
      fontKey: body.fontKey,
      skillKey,
      transientFont: body.transientFont
    });

    return privateJson(result);
  } catch (error) {
    return errorJson(error, "生成图片失败");
  }
}
