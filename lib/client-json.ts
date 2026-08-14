"use client";

export async function readJsonResponse<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.text();
  if (!body.trim()) {
    throw new Error(`${fallback}：服务未返回数据，请稍后重试。`);
  }

  try {
    return JSON.parse(body) as T;
  } catch {
    const returnedHtml = /^\s*(?:<!doctype\s+html|<html\b)/i.test(body);
    throw new Error(
      returnedHtml
        ? `${fallback}：服务暂时返回了异常页面，请刷新后重试。`
        : `${fallback}：服务返回的数据格式异常，请稍后重试。`
    );
  }
}
