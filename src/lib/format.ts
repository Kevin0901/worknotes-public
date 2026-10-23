// 時間格式化（固定使用台灣時區，伺服器與瀏覽器輸出一致，避免 hydration 不一致）
//
// 不直接用 Intl 的 format()：不同版本的 ICU 在日期與時間之間放的空白字元不同
// （例如 Node 24 是 U+2009 細空白、Chrome 是一般空白），伺服器與瀏覽器的文字就會不一致。
// 改用 formatToParts 取出數字，自己組成「YYYY/MM/DD HH:mm」。

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function taipeiParts(iso: string): Record<string, string> | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  if (p.hour === "24") p.hour = "00";
  return p;
}

export function formatDateTime(iso: string | null | undefined, withSeconds = false): string {
  const p = iso ? taipeiParts(iso) : null;
  if (!p) return "—";
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}${withSeconds ? `:${p.second}` : ""}`;
}

export function formatDate(iso: string | null | undefined): string {
  const p = iso ? taipeiParts(iso) : null;
  return p ? `${p.year}/${p.month}/${p.day}` : "—";
}

/** 將 Markdown 摘要成純文字 */
export function plainExcerpt(markdown: string, max = 120): string {
  const text = markdown
    .replace(/```[\s\S]*?(```|$)/g, " ") // 程式碼區塊（含被截斷、沒有結尾的區塊）
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)]]/g, "$1")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*\|?\s*-{3,}.*$/gm, "")
    .replace(/(\*\*|__|~~)/g, "")
    .replace(/\|/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max) + "…" : text;
}
