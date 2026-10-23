import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { restoreRevision } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string; revId: string }> };

/** 將筆記還原成指定版本（還原前的內容也會留下一個版本） */
export const POST = route(async (_req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const { id, revId } = await ctx.params;
  if (!isUuid(id) || !/^\d{1,18}$/.test(revId)) throw new HttpError(404, "找不到這個版本");
  const note = await restoreRevision(ws, id, revId);
  await logEvent({ event: "revision_restore", path: `/n/${id}`, method: "POST", detail: note.title }, viewer);
  return json({ note });
});
