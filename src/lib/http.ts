import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { DatabaseNotConfiguredError } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** 包裝 Route Handler：統一錯誤格式，非 GET 請求一律檢查來源避免 CSRF */
export function route<C>(fn: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (err instanceof DatabaseNotConfiguredError) return json({ error: err.message }, 503);
      console.error("[api]", req.method, req.nextUrl.pathname, err);
      return json({ error: "伺服器發生錯誤，請稍後再試" }, 500);
    }
  };
}

export function assertSameOrigin(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* ignore */
    }
    if (!host || originHost !== host) throw new HttpError(403, "來源不符，請重新整理頁面後再試");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new HttpError(403, "來源不符，請重新整理頁面後再試");
  }
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest, maxBytes = 1_000_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "資料太大");
  try {
    const data = JSON.parse(text || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error();
    return data as T;
  } catch {
    throw new HttpError(400, "資料格式錯誤");
  }
}

export function str(value: unknown, field: string, { max = 200, required = false, trim = true } = {}): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new HttpError(400, `缺少欄位：${field}`);
    return undefined;
  }
  if (typeof value !== "string") throw new HttpError(400, `欄位格式錯誤：${field}`);
  const v = trim ? value.trim() : value;
  if (required && !v) throw new HttpError(400, `${field} 不可空白`);
  if (v.length > max) throw new HttpError(400, `${field} 太長（上限 ${max} 字）`);
  return v;
}
