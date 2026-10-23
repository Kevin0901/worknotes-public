import type { NextRequest } from "next/server";
import { requireApiViewer } from "@/lib/auth";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { listRevisions } from "@/lib/notes";
import { loadWorkspace } from "@/lib/workspace";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  await requireApiViewer();
  const ws = await loadWorkspace();
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到筆記");
  return json({ revisions: await listRevisions(ws, id) });
});
