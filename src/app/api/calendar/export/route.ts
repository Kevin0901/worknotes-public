import type { NextRequest } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { listRange, listTasks } from "@/lib/calendar";
import { DATE_RE, addDays, taipeiParts, todayKey } from "@/lib/calendar-utils";
import { HttpError, route } from "@/lib/http";
import type { CalendarItem } from "@/lib/types";

const icsEscape = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsUtc = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsDate = (iso: string) => taipeiParts(iso).dateKey.replace(/-/g, "");

/** 每行最多 75 bytes（RFC 5545），以 UTF-8 計算避免切斷中文字 */
function fold(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function toIcs(items: CalendarItem[], host: string): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WorkNotes//Calendar//ZH-TW", "CALSCALE:GREGORIAN", "X-WR-TIMEZONE:Asia/Taipei"];
  const stamp = icsUtc(new Date().toISOString());
  for (const it of items) {
    if (!it.startsAt) continue;
    lines.push("BEGIN:VEVENT", `UID:${it.id}@${host}`, `DTSTAMP:${stamp}`);
    if (it.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(it.startsAt)}`);
      const lastDay = taipeiParts(it.endsAt ?? it.startsAt).dateKey;
      lines.push(`DTEND;VALUE=DATE:${addDays(lastDay, 1).replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${icsUtc(it.startsAt)}`);
      lines.push(`DTEND:${icsUtc(it.endsAt ?? new Date(new Date(it.startsAt).getTime() + 3600_000).toISOString())}`);
    }
    const prefix = it.kind === "task" ? (it.status === "done" ? "[已完成] " : "[待辦] ") : "";
    lines.push(fold(`SUMMARY:${icsEscape(prefix + it.title)}`));
    if (it.location) lines.push(fold(`LOCATION:${icsEscape(it.location)}`));
    if (it.description) lines.push(fold(`DESCRIPTION:${icsEscape(it.description)}`));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function csvCell(v: string | null | undefined): string {
  const s = v ?? "";
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** 欄位設計方便匯入 Notion 資料庫（Name、Date…） */
function toCsv(items: CalendarItem[]): string {
  const header = ["Name", "Type", "Date", "Start time", "End date", "End time", "All day", "Status", "Location", "Description"];
  const rows = items.map((it) => {
    const s = it.startsAt ? taipeiParts(it.startsAt) : null;
    const e = it.endsAt ? taipeiParts(it.endsAt) : null;
    return [
      it.title,
      it.kind === "task" ? "待辦" : "行程",
      s?.dateKey ?? "",
      it.allDay || !s ? "" : s.time,
      e?.dateKey ?? "",
      it.allDay || !e ? "" : e.time,
      it.allDay ? "Yes" : "No",
      it.kind === "task" ? ({ todo: "待辦", doing: "進行中", done: "完成" } as const)[it.status] : "",
      it.location ?? "",
      it.description,
    ].map(csvCell).join(",");
  });
  return "\uFEFF" + [header.map(csvCell).join(","), ...rows].join("\r\n");
}

/** ?format=ics|csv&from=YYYY-MM-DD&to=YYYY-MM-DD（預設：今天前 30 天到後 365 天） */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireApiViewer();
  const p = req.nextUrl.searchParams;
  const format = p.get("format") === "csv" ? "csv" : "ics";
  const today = todayKey();
  const from = p.get("from") ?? addDays(today, -30);
  const to = p.get("to") ?? addDays(today, 365);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new HttpError(400, "日期格式錯誤");
  const ranged = await listRange(viewer, from, addDays(to, 1));
  const undated = format === "csv" ? (await listTasks(viewer)).filter((t) => !t.startsAt) : [];
  const items = [...ranged, ...undated];
  const host = req.headers.get("host") ?? "worknotes";
  const body = format === "ics" ? toIcs(items, host) : toCsv(items);
  const filename = `calendar_${from}_${to}.${format}`;
  return new Response(body, {
    headers: {
      "Content-Type": format === "ics" ? "text/calendar; charset=utf-8" : "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
