import "server-only";

export interface RequestInfo {
  ip: string | null;
  country: string | null;
  city: string | null;
  userAgent: string | null;
}

function decode(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** 從請求標頭取得訪客 IP、地區（Vercel 會提供 x-vercel-ip-* 標頭）與瀏覽器資訊 */
export function requestInfo(headers: Headers): RequestInfo {
  const forwarded = headers.get("x-forwarded-for");
  const ip =
    headers.get("x-real-ip") ||
    (forwarded ? forwarded.split(",")[0]?.trim() : null) ||
    headers.get("x-vercel-forwarded-for") ||
    null;
  return {
    ip,
    country: headers.get("x-vercel-ip-country"),
    city: decode(headers.get("x-vercel-ip-city")),
    userAgent: headers.get("user-agent")?.slice(0, 400) ?? null,
  };
}
