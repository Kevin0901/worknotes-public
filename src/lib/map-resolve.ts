import "server-only";
import { isShortMapLink } from "./map";

/** 只允許在 Google 地圖相關網域之間轉址，避免被拿來存取其他網站（SSRF） */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.com.tw",
  "www.google.com.tw",
  "maps.google.com.tw",
]);

const allowed = (u: URL) => u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname);

/**
 * 展開 Google 地圖分享短網址（maps.app.goo.gl），回傳最後的完整網址；
 * 每一次轉址都必須留在允許的網域內，否則停止。展開失敗回傳 null。
 */
export async function resolveShortMapLink(input: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (!isShortMapLink(input)) return null;
  let current = new URL(input);
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetchImpl(current, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; WorkNotes/1.0)", "accept-language": "zh-TW,zh;q=0.9" },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) break;
    let next = new URL(location, current);
    // 歐盟地區可能先轉到同意頁面，真正的網址在 continue 參數
    if (next.protocol === "https:" && next.hostname === "consent.google.com") {
      const cont = next.searchParams.get("continue");
      if (!cont) break;
      next = new URL(cont);
    }
    if (!allowed(next)) break;
    current = next;
    if (!isShortMapLink(current.toString())) return current.toString();
  }
  return isShortMapLink(current.toString()) ? null : current.toString();
}
