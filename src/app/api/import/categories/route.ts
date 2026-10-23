import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { importCategories, type ImportCategoryInput } from "@/lib/notes";
import { optionalUuid } from "@/lib/validate";
import { loadWorkspace, resolveSpace } from "@/lib/workspace";

/** 匯入第一步：建立分類結構 */
export const POST = route(async (req: NextRequest) => {
  await requireApiEditor();
  const ws = await loadWorkspace();
  const body = await readJson(req, 500_000);
  const parentId = optionalUuid(body.parentId, "上層分類") ?? null;
  if (!Array.isArray(body.categories) || body.categories.length > 1000) throw new HttpError(400, "分類資料格式錯誤（上限 1000 個）");
  const list: ImportCategoryInput[] = body.categories.map((c: Record<string, unknown>) => {
    const key = typeof c.key === "string" ? c.key.slice(0, 1000) : "";
    const name = typeof c.name === "string" ? c.name.trim().slice(0, 80) : "";
    const parentKey = typeof c.parentKey === "string" ? c.parentKey.slice(0, 1000) : null;
    if (!key || !name) throw new HttpError(400, "分類資料格式錯誤");
    return { key, name, parentKey };
  });
  return json({ map: await importCategories(ws, parentId, resolveSpace(ws, body.space), list) });
});
