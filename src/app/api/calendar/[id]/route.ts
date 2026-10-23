import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { canModify, deleteItem, getItem, setTaskStatus, updateItem } from "@/lib/calendar";
import { parseItemInput } from "@/lib/calendar-input";
import { HttpError, isUuid, json, readJson, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const viewer = await requireApiEditor();
  const { id } = await ctx.params;
  const item = isUuid(id) ? await getItem(id, viewer) : null;
  if (!item) throw new HttpError(404, "找不到這個項目");
  if (!canModify(item, viewer)) throw new HttpError(403, "這是別人的私人項目，無法修改");
  return { viewer, item };
}

/** 完整更新，或只傳 { status } 切換待辦狀態 */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { viewer, item } = await load(ctx);
  const body = await readJson(req, 100_000);
  const keys = Object.keys(body);
  let updated;
  if (keys.length === 1 && keys[0] === "status") {
    const status = body.status === "doing" || body.status === "done" ? body.status : "todo";
    updated = await setTaskStatus(item.id, status, viewer.actor);
  } else {
    updated = await updateItem(item.id, parseItemInput(body), viewer.actor);
  }
  await logEvent({ event: "calendar_update", path: "/calendar", method: "PATCH", detail: updated.title }, viewer);
  return json({ item: updated });
});

export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const { viewer, item } = await load(ctx);
  await deleteItem(item.id);
  await logEvent({ event: "calendar_delete", path: "/calendar", method: "DELETE", detail: item.title }, viewer);
  return json({ ok: true });
});
