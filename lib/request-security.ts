import { NextResponse } from "next/server";
import { isValidWereadSkillKey } from "./weread";

type RateRecord = {
  count: number;
  expiresAt: number;
};

const rateRecords = new Map<string, RateRecord>();

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

function requestIp(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const expectedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try {
    if (!expectedHost || new URL(origin).host !== expectedHost) {
      throw new RequestError("请求来源无效。", 403);
    }
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("请求来源无效。", 403);
  }
}

export function enforceRateLimit(
  request: Request,
  scope: string,
  limit = 40,
  windowMs = 60_000
) {
  const now = Date.now();
  const key = `${scope}:${requestIp(request)}`;
  const current = rateRecords.get(key);
  if (!current || current.expiresAt <= now) {
    rateRecords.set(key, { count: 1, expiresAt: now + windowMs });
  } else {
    current.count += 1;
    if (current.count > limit) {
      throw new RequestError("请求过于频繁，请稍后再试。", 429);
    }
  }

  if (rateRecords.size > 2_000) {
    for (const [recordKey, record] of rateRecords) {
      if (record.expiresAt <= now) rateRecords.delete(recordKey);
    }
  }
}

export function getWereadSkillKeyFromRequest(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const skillKey = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!isValidWereadSkillKey(skillKey)) {
    throw new RequestError("请先在当前浏览器装载有效的微信读书 Skill Key。", 401);
  }
  return skillKey;
}

export function privateJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Vary", "Authorization");
  return NextResponse.json(body, { ...init, headers });
}

export function errorJson(error: unknown, fallback: string) {
  if (error instanceof RequestError) {
    return privateJson({ ok: false, error: error.message }, { status: error.status });
  }
  return privateJson(
    { ok: false, error: error instanceof Error ? error.message : fallback },
    { status: 500 }
  );
}
