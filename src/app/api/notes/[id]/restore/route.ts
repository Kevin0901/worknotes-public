import type { NextRequest } from "next/server";
import { requireApiEditor } from "@/lib/auth";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";
import { restoreNote } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (_req: NextRequest, ctx: Ctx) => {
  const viewer = await requireApiEditor();
  const ws = await loadWorkspace();
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到筆記");
  const note = await restoreNote(ws, id);
  await logEvent({ event: "note_restore", path: `/n/${id}`, method: "POST", detail: note.title }, viewer);
  return json({ note });
});
