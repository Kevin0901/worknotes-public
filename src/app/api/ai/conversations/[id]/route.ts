import type { NextRequest } from "next/server";
import { requireAiViewer, requireUserId } from "@/lib/ai/api";
import { deleteConversation, getConversation, renameConversation } from "@/lib/ai/conversations";
import { HttpError, isUuid, json, readJson, route, str } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "找不到這段對話");
  return id;
}

export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const { userId } = await requireAiViewer();
  return json(await getConversation(requireUserId(userId), await idFrom(ctx)));
});

export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { userId } = await requireAiViewer();
  const body = await readJson(req, 10_000);
  const title = str(body.title, "標題", { max: 80, required: true })!;
  await renameConversation(requireUserId(userId), await idFrom(ctx), title);
  return json({ ok: true });
});

export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  const { userId } = await requireAiViewer();
  await deleteConversation(requireUserId(userId), await idFrom(ctx));
  return json({ ok: true });
});
