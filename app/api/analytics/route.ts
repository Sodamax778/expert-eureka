import { NextRequest, NextResponse } from "next/server";
import { isAnonymousEventName } from "@/lib/analytics-events";
import {
  incrementAnonymousCounter,
  readAnonymousCounters
} from "@/lib/anonymous-analytics-store";
import { enforceSameOrigin, enforceRateLimit, errorJson, RequestError } from "@/lib/request-security";
import { authorized } from "@/lib/app-analytics";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache"
};

export async function POST(request: NextRequest) {
  try {
    enforceSameOrigin(request);
    enforceRateLimit(request, "web-analytics", 60, 60000);
    const body = (await request.json()) as { event?: unknown };
    if (!isAnonymousEventName(body.event)) {
      throw new RequestError("未知的匿名计数事件。", 400);
    }
    await incrementAnonymousCounter(body.event);
    return NextResponse.json({ ok: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorJson(error, "匿名计数失败");
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), process.env.ANALYTICS_ADMIN_TOKEN)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  try {
    const requestedDays = Number(request.nextUrl.searchParams.get("days") || 30);
    const days = Number.isFinite(requestedDays)
      ? Math.min(90, Math.max(1, Math.floor(requestedDays)))
      : 30;
    const result = await readAnonymousCounters(days);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return errorJson(error, "读取匿名计数失败");
  }
}
