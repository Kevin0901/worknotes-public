// 將 User-Agent 簡化成「瀏覽器 / 作業系統」

export function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "—";
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows NT/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /CrOS/.test(ua)
            ? "ChromeOS"
            : /Linux/.test(ua)
              ? "Linux"
              : "其他";
  const browser = / Line\//.test(ua)
    ? "LINE"
    : /Edg\//.test(ua)
      ? "Edge"
      : /OPR\//.test(ua)
        ? "Opera"
        : /SamsungBrowser/.test(ua)
          ? "Samsung"
          : /Firefox\/|FxiOS/.test(ua)
            ? "Firefox"
            : /Chrome\/|CriOS/.test(ua)
              ? "Chrome"
              : /Safari\//.test(ua)
                ? "Safari"
                : /curl|wget|python|bot|spider|crawl/i.test(ua)
                  ? "程式／機器人"
                  : "其他";
  return `${browser} / ${os}`;
}
