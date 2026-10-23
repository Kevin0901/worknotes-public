// 行事曆的日期工具（前後端共用）。一律以台灣時間（UTC+8）計算日期。

export const TZ = "Asia/Taipei";
export const TZ_OFFSET = "+08:00";

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export interface TaipeiParts {
  dateKey: string; // YYYY-MM-DD
  time: string; // HH:mm
}

export function taipeiParts(iso: string | Date): TaipeiParts {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = Object.fromEntries(partsFmt.formatToParts(d).map((x) => [x.type, x.value]));
  const hour = p.hour === "24" ? "00" : p.hour;
  return { dateKey: `${p.year}-${p.month}-${p.day}`, time: `${hour}:${p.minute}` };
}

export function todayKey(): string {
  return taipeiParts(new Date()).dateKey;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** YYYY-MM-DD（加上 HH:mm）→ 台灣時間的 Date */
export function taipeiDate(dateKey: string, time = "00:00"): Date {
  return new Date(`${dateKey}T${time}:00${TZ_OFFSET}`);
}

export function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay(); // 0 = 星期日
}

export function monthKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** 月曆格子：從該月第一天所在週的星期日開始，共 6 週 */
export function monthGrid(month: string): string[] {
  const first = `${month}-01`;
  const start = addDays(first, -dayOfWeek(first));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return `${y}/${m}/${d}（${WEEKDAYS[dayOfWeek(dateKey)]}）`;
}

export const CALENDAR_COLORS: { key: string; label: string; value: string }[] = [
  { key: "green", label: "綠", value: "#3d8b1f" },
  { key: "blue", label: "藍", value: "#2f6fd6" },
  { key: "purple", label: "紫", value: "#8a4fd1" },
  { key: "orange", label: "橘", value: "#d9822b" },
  { key: "red", label: "紅", value: "#d1453b" },
  { key: "gray", label: "灰", value: "#7a7974" },
];

export function colorValue(key: string | null | undefined): string {
  return CALENDAR_COLORS.find((c) => c.key === key)?.value ?? CALENDAR_COLORS[0].value;
}
