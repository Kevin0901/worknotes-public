import type { NextRequest } from "next/server";
import { requireApiEditor, requireApiViewer } from "@/lib/auth";
import { HttpError, isUuid, json, readJson, route, str } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { getNote, moveNote, purgeNote, trashNote, updateNote } from "@/lib/notes";
import { directionValue, iconValue, optionalUuid, tagsValue, visibilityValue } from "@/lib/validate";
import { loadWorkspace, resolveSpace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到筆記");
  return id;
}

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  await requireApiViewer();
  const ws = await loadWorkspace();
  const note = await getNote(ws, await idFrom(ctx));
  if (!note || note.deletedAt) throw new HttpError(404, "找不到筆記");
  return json({ note });
});

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const id = await idFrom(ctx);
  const body = await readJson(req, 2_000_000);
  const move = directionValue(body.move);
  if (move) {
    await moveNote(ws, id, move);
    return json({ ok: true });
  }
  if (body.pinned !== undefined && typeof body.pinned !== "boolean") throw new HttpError(400, "欄位格式錯誤：pinned");
  const title = str(body.title, "標題", { max: 200 });
  const note = await updateNote(
    ws,
    id,
    {
      title: title === undefined ? undefined : title || "未命名筆記",
      icon: iconValue(body.icon),
      content: str(body.content, "內容", { max: 500_000, trim: false }),
      tags: tagsValue(body.tags),
      categoryId: optionalUuid(body.categoryId, "分類"),
      spaceUserId: body.space === undefined ? undefined : resolveSpace(ws, body.space),
      pinned: body.pinned as boolean | undefined,
      visibility: visibilityValue(body.visibility),
    },
    typeof body.baseUpdatedAt === "string" ? body.baseUpdatedAt : undefined,
  );
  await logEvent({ event: "note_update", path: `/n/${id}`, method: "PATCH", detail: note.title }, viewer);
  return json({ note });
});

/** 預設移到垃圾桶；?permanent=1 則從垃圾桶永久刪除 */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const id = await idFrom(ctx);
  if (req.nextUrl.searchParams.get("permanent") === "1") {
    const note = await purgeNote(ws, id);
    await logEvent({ event: "note_purge", path: `/n/${id}`, method: "DELETE", detail: note.title }, viewer);
    return json({ ok: true });
  }
  const note = await trashNote(ws, id);
  await logEvent({ event: "note_delete", path: `/n/${id}`, method: "DELETE", detail: note.title }, viewer);
  return json({ ok: true });
});
