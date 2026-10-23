import type { NextRequest } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { exportData } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

/** 匯出資料（分頁）：?category=<id>（省略代表全部看得到的內容）&offset=0&limit=200 */
export const GET = route(async (req: NextRequest) => {
  const viewer = await requireApiViewer();
  const ws = await loadWorkspace();
  const p = req.nextUrl.searchParams;
  const category = p.get("category");
  if (category && !isUuid(category)) throw new HttpError(404, "找不到分類");
  const offset = Math.max(0, Number(p.get("offset")) || 0);
  const limit = Math.min(Math.max(Number(p.get("limit")) || 200, 1), 500);
  const data = await exportData(ws, category, offset, limit);
  if (offset === 0) {
    await logEvent({ event: "notes_export", path: "/transfer", method: "GET", detail: `${category ? "分類" : "全部"}，${data.total} 篇` }, viewer);
  }
  return json(data);
});
