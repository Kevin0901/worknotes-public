import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { HttpError, isUuid, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { importNotes, type ImportNoteInput } from "@/lib/notes";
import { tagsValue } from "@/lib/validate";
import { loadWorkspace } from "@/lib/workspace";

/** 匯入第二步：分批寫入筆記（每批最多 100 篇） */
export const POST = route(async (req: NextRequest) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const body = await readJson(req, 4_000_000);
  if (!Array.isArray(body.notes) || body.notes.length === 0 || body.notes.length > 100) {
    throw new HttpError(400, "每批需有 1～100 篇筆記");
  }
  const list: ImportNoteInput[] = body.notes.map((n: Record<string, unknown>) => {
    const title = typeof n.title === "string" ? n.title.trim().slice(0, 200) : "";
    const content = typeof n.content === "string" ? n.content : "";
    if (content.length > 500_000) throw new HttpError(413, `筆記「${title}」內容太長（上限 50 萬字）`);
    if (!isUuid(n.categoryId)) throw new HttpError(400, "匯入的筆記必須指定分類");
    return { categoryId: n.categoryId, title: title || "未命名筆記", content, tags: tagsValue(n.tags) ?? [] };
  });
  const count = await importNotes(ws, list);
  if (body.last === true) {
    const source = typeof body.source === "string" ? body.source.slice(0, 120) : "";
    const total = Number(body.total) || count;
    await logEvent({ event: "notes_import", path: "/transfer", method: "POST", detail: `${source}，共 ${total} 篇` }, viewer);
  }
  return json({ ok: true, count });
});
