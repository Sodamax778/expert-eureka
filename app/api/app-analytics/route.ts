import { NextRequest, NextResponse } from "next/server";
import { getStore } from "@edgeone/pages-blob";
import { authorized, eventKey, parseBatch, summarize } from "@/lib/app-analytics";
import { readAnonymousCounters } from "@/lib/anonymous-analytics-store";
import { enforceRateLimit } from "@/lib/request-security";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: NextRequest) {
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (!salt || salt.length < 32) return NextResponse.json({ error: "Analytics not configured" }, { status: 503, headers });
  let validBatch = false;
  try {
    enforceRateLimit(request, "app-analytics", 30, 60000);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "JSON required" }, { status: 415, headers });
    const reader = request.body?.getReader(); if (!reader) throw new Error("Empty body");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 16000) { await reader.cancel(); return NextResponse.json({ error: "Too large" }, { status: 413, headers }); } chunks.push(chunk.value); }
    const batch = parseBatch(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    validBatch = true;
    const store = getStore("shubing-app-analytics");
    // Stable event keys make retried uploads idempotent, without read/modify/write counters.
    await Promise.all(batch.events.map(event => store.setJSON(eventKey(batch, event, salt), { at: event.at })));
    return NextResponse.json({ accepted: batch.events.map(e => e.id) }, { headers });
  } catch (error) {
    const status = error instanceof Error && "status" in error && error.status === 429 ? 429 : validBatch ? 503 : 400;
    return NextResponse.json({ error: status === 429 ? "Rate limited" : "Invalid or unavailable analytics" }, { status, headers });
  }
}
export async function GET(request: NextRequest) {
  if (!authorized(request.headers.get("authorization"), process.env.ANALYTICS_ADMIN_TOKEN)) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers });
  try {
    enforceRateLimit(request, "app-analytics-read", 6, 60000);
    const days = Math.max(1, Math.min(90, Math.floor(Number(request.nextUrl.searchParams.get("days")) || 30)));
    const store = getStore("shubing-app-analytics"), keys: string[] = [];
    const start = new Date(Date.now() + 8 * 3600000 - (days - 1) * 86400000).toISOString().slice(0, 10);
    // List month prefixes to avoid reading older months; scan keys only, not per-event bodies.
    const months = new Set(Array.from({ length: days }, (_, n) => new Date(Date.now() + 8 * 3600000 - n * 86400000).toISOString().slice(0, 7)));
    for (const month of months) {
      let cursor: string | undefined;
      do { const page = await store.list({ prefix: "events-v1/" + month, paginate: false, cursor, consistency: "strong" }); keys.push(...page.blobs.map(b => b.key).filter(k => k.split("/")[1] >= start)); cursor = page.cursor; if (keys.length > 100000) return NextResponse.json({ error: "Too much data; choose fewer days" }, { status: 413, headers }); } while (cursor);
    }
    const web = await readAnonymousCounters(days);
    return NextResponse.json({ app: summarize(keys, days), web, historicalWebNote: "网页仅有事件次数；未记录去重用户标识，不能换算成历史人数。统计部署前无数据。" }, { headers });
  } catch { return NextResponse.json({ error: "Statistics unavailable" }, { status: 503, headers }); }
}
