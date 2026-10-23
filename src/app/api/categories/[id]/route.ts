import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { HttpError, isUuid, json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { deleteCategory, moveCategory, updateCategory } from "@/lib/notes";
import { directionValue, iconValue, optionalUuid, visibilityValue } from "@/lib/validate";
import { loadWorkspace, resolveSpace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到分類");
  return id;
}

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const id = await idFrom(ctx);
  const body = await readJson(req);
  const move = directionValue(body.move);
  if (move) {
    await moveCategory(ws, id, move);
    return json({ ok: true });
  }
  if (body.applyToChildren !== undefined && typeof body.applyToChildren !== "boolean") {
    throw new HttpError(400, "欄位格式錯誤：applyToChildren");
  }
  const category = await updateCategory(ws, id, {
    name: str(body.name, "分類名稱", { max: 80 }) || undefined,
    icon: iconValue(body.icon),
    parentId: optionalUuid(body.parentId, "上層分類"),
    spaceUserId: body.space === undefined ? undefined : resolveSpace(ws, body.space),
    visibility: visibilityValue(body.visibility),
    applyToChildren: body.applyToChildren === true,
  });
  await logEvent({ event: "category_update", path: `/c/${id}`, method: "PATCH", detail: category.name }, viewer);
  return json({ category });
});

export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const id = await idFrom(ctx);
  const { category, trashed } = await deleteCategory(ws, id);
  await logEvent(
    { event: "category_delete", path: `/c/${id}`, method: "DELETE", detail: `${category.name}（${trashed} 篇筆記移至垃圾桶）` },
    viewer,
  );
  return json({ ok: true, trashed });
});
