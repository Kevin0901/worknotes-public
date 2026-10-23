import type { NextRequest } from "next/server";
import { requireAiViewer, requireUserId } from "@/lib/ai/api";
import { sanitizeSources } from "@/lib/ai/chat";
import { appendMessage, assertConversation } from "@/lib/ai/conversations";
import { isValidModelId } from "@/lib/ai/providers";
import { HttpError, isUuid, json, readJson, route, str } from "@/lib/http";

/** 瀏覽器直連第二步：保存本機模型的回答（只能寫入自己的對話） */
export const POST = route(async (req: NextRequest) => {
  const { userId } = await requireAiViewer();
  const uid = requireUserId(userId);
  const body = await readJson(req, 400_000);
  if (!isUuid(body.conversationId)) throw new HttpError(400, "對話參數錯誤");
  await assertConversation(uid, body.conversationId);
  const content = str(body.content, "回答", { max: 200_000, trim: false }) ?? "";
  const note = str(body.note, "附註", { max: 300 });
  if (!content.trim() && !note) throw new HttpError(400, "回答是空的");
  const messageId = await appendMessage(body.conversationId, {
    role: "assistant",
    content: content + (note ? `\n\n（${note}）` : ""),
    sources: sanitizeSources(body.sources),
    provider: "custom",
    model: isValidModelId(body.model) ? body.model : undefined,
  });
  return json({ messageId });
});
