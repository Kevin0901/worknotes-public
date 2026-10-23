import type { NextRequest } from "next/server";
import { requireApiAdmin } from "@/lib/auth";
import { route } from "@/lib/http";
import { eventLabel } from "@/lib/events";
import { queryLogs } from "@/lib/logs";
import { formatDateTime } from "@/lib/format";

function csvCell(value: string | null | undefined): string {
  const v = value ?? "";
  // 防止 CSV 公式注入
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** 依目前篩選條件匯出 CSV（最多 5000 筆） */
export const GET = route(async (req: NextRequest) => {
  await requireApiAdmin();
  const p = req.nextUrl.searchParams;
  const { rows } = await queryLogs({
    event: p.get("event") || undefined,
    q: p.get("q") || undefined,
    from: p.get("from") || undefined,
    to: p.get("to") || undefined,
    page: 1,
    pageSize: 5000,
  });
  const header = ["時間(台灣)", "事件", "事件代碼", "身分", "類型", "IP", "國家", "城市", "方法", "路徑", "詳細", "User-Agent"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        formatDateTime(r.createdAt, true), eventLabel(r.event), r.event, r.actor, r.actorType, r.ip,
        r.country, r.city, r.method, r.path, r.detail, r.userAgent,
      ].map(csvCell).join(","),
    );
  }
  const filename = `access-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
