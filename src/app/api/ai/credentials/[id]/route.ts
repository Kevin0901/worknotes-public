import type { NextRequest } from "next/server";
import { requireAiViewer, requireUserId } from "@/lib/ai/api";
import { deleteCredential } from "@/lib/ai/credentials";
import { HttpError, isUuid, json, route } from "@/lib/http";
import { logEvent } from "@/lib/logs";

type Ctx = { params: Promise<{ id: string }> };

/** 立即永久刪除一把金鑰 */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const { viewer, userId } = await requireAiViewer();
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await deleteCredential(requireUserId(userId), id))) throw new HttpError(404, "找不到這把金鑰");
  await logEvent({ event: "ai_key_delete", path: "/ai/keys", method: "DELETE", detail: id }, viewer);
  return json({ ok: true });
});
